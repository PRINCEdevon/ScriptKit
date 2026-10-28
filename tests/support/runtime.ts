/**
 * Runs Apps Script code against the fakes in fake-google.ts, the way Apps Script runs it.
 *
 * Apps Script evaluates the whole script afresh for every call (a menu click, a web request,
 * a trigger), so each App.call gets a new global scope: in-memory state such as the settings
 * cache starts empty, while the fake spreadsheet, Drive, mail and triggers persist.
 *
 * runBoth runs one scenario against the original legacy/Code.gs and against the bundle built
 * from src/, so tests can check that the build behaves exactly like the original.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { vi } from 'vitest';
import { build } from '../../scripts/build.js';
import { clearSettingsCache } from '../../src/config.js';
import { FakeBlob, FakeGoogle, type Cell, type FakeSheet } from './fake-google.js';

export interface Implementation {
  name: string;
  script: vm.Script;
}

const legacy: Implementation = {
  name: 'legacy/Code.gs',
  script: new vm.Script(readFileSync(new URL('../../legacy/Code.gs', import.meta.url), 'utf8'), {
    filename: 'legacy/Code.gs',
  }),
};

let bundle: Promise<Implementation> | undefined;

/** The bundle built from src/, built once per test file. */
function bundleImplementation(): Promise<Implementation> {
  bundle ??= (async () => {
    const dir = mkdtempSync(join(tmpdir(), 'scriptkit-runtime-'));
    try {
      await build({ outdir: dir });
      const code = readFileSync(join(dir, 'Code.js'), 'utf8');
      return { name: 'dist/Code.js', script: new vm.Script(code, { filename: 'dist/Code.js' }) };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  })();
  return bundle;
}

/** Replaces Date so that `new Date()` and `Date.now()` return a fixed time. */
function fixedClock(now: number): string {
  return `(() => {
    const RealDate = Date;
    globalThis.Date = class Date extends RealDate {
      constructor(...args) { super(...(args.length ? args : [${now}])); }
      static now() { return ${now}; }
    };
  })();`;
}

/** Round-trips through JSON: dates become ISO strings and values from the script's realm become plain data. */
export function json<T>(value: T): T {
  // JSON.stringify(undefined) is undefined, which JSON.parse cannot read.
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

/** A tab of the fake spreadsheet, edited by column heading the way a person would edit it. */
export class Table {
  constructor(private readonly sheet: FakeSheet) {}

  headers(): string[] {
    const width = Math.max(this.sheet.getLastColumn(), 1);
    return (this.sheet.getRange(1, 1, 1, width).getValues()[0] ?? []).map(String);
  }

  records(): Record<string, Cell>[] {
    const headers = this.headers();
    const last = this.sheet.getLastRow();
    if (last < 2) return [];
    return this.sheet
      .getRange(2, 1, last - 1, headers.length)
      .getValues()
      .map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ''])));
  }

  append(record: Record<string, Cell>) {
    this.write(this.sheet.getLastRow() + 1, record);
  }

  update(where: Record<string, Cell>, changes: Record<string, Cell>) {
    const index = this.records().findIndex((record) =>
      Object.entries(where).every(([heading, value]) => record[heading] === value),
    );
    if (index < 0)
      throw new Error(`No row in ${this.sheet.getName()} matches ${JSON.stringify(where)}`);
    this.write(index + 2, changes);
  }

  private write(row: number, record: Record<string, Cell>) {
    const headers = this.headers();
    for (const [heading, value] of Object.entries(record)) {
      const column = headers.indexOf(heading) + 1;
      if (!column) throw new Error(`${this.sheet.getName()} has no column "${heading}"`);
      this.sheet.getRange(row, column).setValue(value);
    }
  }
}

const WEB_ENTRYPOINTS = ['doGet', 'doPost'];

export class App {
  readonly google = new FakeGoogle();
  /** The current time inside the script, as an ISO 8601 string. */
  now = '2026-11-20T09:00:00+02:00';

  constructor(private readonly implementation: Implementation) {}

  /** Calls an entrypoint in a fresh global scope, as Apps Script does. */
  call(name: string, ...args: unknown[]): unknown {
    // The Sheet's UI is only available to menus and the editor, not to web requests or triggers.
    this.google.ui.available = !WEB_ENTRYPOINTS.includes(name) && !name.startsWith('auto');
    const context = vm.createContext(this.google.globals());
    vm.runInContext(fixedClock(Date.parse(this.now)), context);
    this.implementation.script.runInContext(context);
    const entrypoint: unknown = vm.runInContext(name, context);
    if (typeof entrypoint !== 'function') throw new Error(`${name} is not a function`);
    return entrypoint(...args);
  }

  /** Calls doGet or doPost with a raw event and returns the parsed JSON response. */
  request(name: 'doGet' | 'doPost', event: unknown): Record<string, unknown> {
    const output = this.call(name, event) as { getContent(): string };
    return JSON.parse(output.getContent()) as Record<string, unknown>;
  }

  /** GET request from the report page. */
  get(token: string): Record<string, unknown> {
    return this.request('doGet', { parameter: { action: 'get', t: token } });
  }

  /** POST request from the report page. */
  post(body: unknown): Record<string, unknown> {
    return this.request('doPost', { postData: { contents: JSON.stringify(body) } });
  }

  /** Adds a file to the Drive folder that holds the Sheet. */
  addFile(name: string, text: string, contentType = 'text/html') {
    const blob = new FakeBlob(new Uint8Array(Buffer.from(text, 'utf8')), contentType, name);
    this.google.drive.addFile(name, this.google.folder, blob);
  }

  table(name: string): Table {
    const sheet = this.google.spreadsheet.getSheetByName(name);
    if (!sheet) throw new Error(`No "${name}" tab`);
    return new Table(sheet);
  }

  /** Types a value into the Settings tab. */
  setting(key: string, value: Cell) {
    this.table('Settings').update({ Setting: key }, { Value: value });
  }

  /** Everything the script can change, as plain data. */
  snapshot() {
    return stateOf(this.google);
  }
}

/**
 * Runs a scenario against the original legacy/Code.gs and against the bundle, each with its own
 * fresh fakes, and returns both results as plain data.
 */
export async function runBoth<T>(scenario: (app: App) => T): Promise<{ legacy: T; bundle: T }> {
  return {
    legacy: json(scenario(new App(legacy))),
    bundle: json(scenario(new App(await bundleImplementation()))),
  };
}

/**
 * legacy/Code.gs loaded into one global scope over the given fakes, so a test can call its
 * private functions directly and compare them with the typed modules that replace them.
 * Like one Apps Script run: state such as the settings cache lasts until you load it again.
 */
export function loadLegacy(google: FakeGoogle, now = '2026-12-07T10:00:00+02:00') {
  const context = vm.createContext(google.globals());
  vm.runInContext(fixedClock(Date.parse(now)), context);
  legacy.script.runInContext(context);
  return {
    call(name: string, ...args: unknown[]): unknown {
      const fn: unknown = vm.runInContext(name, context);
      if (typeof fn !== 'function') throw new Error(`${name} is not a legacy function`);
      return fn(...args);
    },
    get(name: string): unknown {
      return vm.runInContext(name, context);
    },
  };
}

/**
 * Installs fresh fakes as the Apps Script globals, for tests that call src/ modules directly.
 * Vitest removes them after each test (unstubGlobals in vitest.config.ts).
 */
export function useFakeGoogle(): FakeGoogle {
  const google = new FakeGoogle();
  for (const [name, service] of Object.entries(google.globals())) vi.stubGlobal(name, service);
  // Each test is a fresh run: forget settings cached by an earlier one.
  clearSettingsCache();
  return google;
}

/** A function's result, or its error message, so that failures can be compared too. */
export function outcome(fn: () => unknown): { value: unknown } | { error: string } {
  try {
    return { value: json(fn()) };
  } catch (error) {
    return { error: String((error as Error).message) };
  }
}

/** Everything a script can change in a set of fakes, as plain data. */
export function stateOf(google: FakeGoogle) {
  const { spreadsheet, drive } = google;
  return json({
    sheets: spreadsheet.getSheets().map((sheet) => ({
      name: sheet.getName(),
      values: sheet.getDataRange().getValues(),
      frozenRows: sheet.frozenRows,
      hiddenColumns: sheet.hiddenColumns,
      formats: sheet.formats,
      filter: sheet.filter?.criteria ?? null,
    })),
    activeSheet: spreadsheet.activeSheet?.getName() ?? null,
    timeZone: spreadsheet.timeZone,
    scriptProperties: Object.fromEntries(google.scriptProperties),
    folders: drive.folders.map((folder) => folder.path()),
    files: drive.files
      .filter((file) => file.blob)
      .map((file) => ({
        path: `${file.parent.path()}/${file.name}`,
        contentType: file.blob?.contentType,
        text: file.blob?.getDataAsString(),
        trashed: file.trashed,
      })),
    mail: google.mail,
    triggers: google.triggers.map((trigger) => trigger.spec),
    menus: google.ui.menus,
    dialogs: google.ui.dialogs,
    toasts: google.toasts,
    logs: google.logs,
  });
}
