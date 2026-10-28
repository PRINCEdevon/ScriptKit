/**
 * In-memory fakes of the Google Apps Script services the Revenue Accelerator uses.
 *
 * They implement only what the application calls. Every fake object throws on any other
 * property, so a missing piece fails loudly instead of being turned into a generic error by the
 * application's own error handling.
 *
 * Fidelity limits: cell values are stored as written, except that a leading apostrophe marks
 * text as it does in Sheets (so "2026-12-07" stays a string rather than becoming a date).
 * Formatting and data validation are accepted and ignored. Nothing here talks to Google.
 */
import { createHash } from 'node:crypto';

export type Cell = string | number | boolean | Date;

/** Wraps a fake so that reading a property it does not implement throws. */
function strict<T extends object>(target: T, label: string): T {
  return new Proxy(target, {
    get(object, key, receiver) {
      if (typeof key === 'symbol' || key in object) return Reflect.get(object, key, receiver);
      if (key === 'then' || key === 'toJSON') return undefined;
      throw new Error(`Fake Apps Script: ${label}.${key} is not implemented`);
    },
  });
}

function isEmpty(value: unknown): boolean {
  return value === '' || value === null || value === undefined;
}

function iterator<T>(items: T[], label: string) {
  let next = 0;
  return strict(
    {
      hasNext: () => next < items.length,
      next: () => {
        const item = items[next++];
        if (item === undefined) throw new Error(`${label}: no more items`);
        return item;
      },
    },
    label,
  );
}

/* ------------------------------- Sheets ------------------------------- */

export class FakeRange {
  constructor(
    readonly sheet: FakeSheet,
    readonly row: number,
    readonly column: number,
    readonly numRows: number,
    readonly numColumns: number,
  ) {}

  getValues(): Cell[][] {
    return Array.from({ length: this.numRows }, (_, r) =>
      Array.from({ length: this.numColumns }, (_, c) =>
        this.sheet.cell(this.row + r, this.column + c),
      ),
    );
  }

  getValue(): Cell {
    return this.sheet.cell(this.row, this.column);
  }

  setValues(data: unknown[][]) {
    if (data.length !== this.numRows || data.some((row) => row.length !== this.numColumns)) {
      throw new Error(
        `The data has ${data.length} rows of ${data[0]?.length ?? 0} but the range is ` +
          `${this.numRows} by ${this.numColumns}.`,
      );
    }
    data.forEach((row, r) =>
      row.forEach((value, c) => this.sheet.write(this.row + r, this.column + c, value)),
    );
    return this;
  }

  setValue(value: unknown) {
    return this.setValues(
      Array.from({ length: this.numRows }, () => Array(this.numColumns).fill(value)),
    );
  }

  clearContent() {
    return this.setValue('');
  }

  createFilter() {
    if (this.sheet.filter) throw new Error('This sheet already has a filter.');
    this.sheet.filter = strict(new FakeFilter(this.sheet), 'Filter');
    return this.sheet.filter;
  }

  /** For example "rows 2-1000 of column 3". */
  private where(): string {
    const last = (start: number, count: number) => start + count - 1;
    return (
      `rows ${this.row}-${last(this.row, this.numRows)} of column ` +
      (this.numColumns === 1 ? this.column : `${this.column}-${last(this.column, this.numColumns)}`)
    );
  }

  // Drop-downs, tick boxes and text wrapping are recorded (sheet.formats) but not applied.
  clearDataValidations() {
    this.sheet.formats.push(`no validation: ${this.where()}`);
    return this;
  }
  setDataValidation(rule: unknown) {
    this.sheet.formats.push(`validation ${JSON.stringify(rule)}: ${this.where()}`);
    return this;
  }
  setFontWeight() {
    return this;
  }
  setFontSize() {
    return this;
  }
  setBackground() {
    return this;
  }
  setWrap(wrap: boolean) {
    if (wrap) this.sheet.formats.push(`wrap: ${this.where()}`);
    return this;
  }
  setVerticalAlignment() {
    return this;
  }
  setNumberFormat() {
    return this;
  }
  setNote() {
    return this;
  }
}

export class FakeFilter {
  criteria: Record<number, unknown> = {};

  constructor(readonly sheet: FakeSheet) {}

  setColumnFilterCriteria(column: number, criteria: unknown) {
    this.criteria[column] = criteria;
    return this;
  }

  remove() {
    this.sheet.filter = null;
  }
}

export class FakeSheet {
  values: Cell[][] = [];
  maxRows = 1000;
  maxColumns = 26;
  frozenRows = 0;
  /** Formatting applied, in order (see FakeRange). */
  formats: string[] = [];
  hiddenColumns: number[] = [];
  filter: FakeFilter | null = null;

  constructor(
    readonly spreadsheet: FakeSpreadsheet,
    readonly name: string,
  ) {}

  cell(row: number, column: number): Cell {
    return this.values[row - 1]?.[column - 1] ?? '';
  }

  write(row: number, column: number, value: unknown) {
    let cell = value === null || value === undefined ? '' : value;
    if (typeof cell === 'string' && cell.startsWith("'")) cell = cell.slice(1);
    (this.values[row - 1] ??= [])[column - 1] = cell as Cell;
  }

  getName() {
    return this.name;
  }

  getLastRow() {
    for (let row = this.values.length; row >= 1; row--) {
      if (this.values[row - 1]?.some((value) => !isEmpty(value))) return row;
    }
    return 0;
  }

  getLastColumn() {
    let last = 0;
    for (const row of this.values) {
      row?.forEach((value, i) => {
        if (!isEmpty(value)) last = Math.max(last, i + 1);
      });
    }
    return last;
  }

  getMaxRows() {
    return this.maxRows;
  }

  getMaxColumns() {
    return this.maxColumns;
  }

  getRange(row: number, column: number, numRows = 1, numColumns = 1) {
    if (numRows < 1 || numColumns < 1) throw new Error('A range must have at least one cell.');
    if (row < 1 || column < 1 || row + numRows - 1 > this.maxRows) {
      throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
    }
    if (column + numColumns - 1 > this.maxColumns) {
      throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
    }
    return strict(new FakeRange(this, row, column, numRows, numColumns), 'Range');
  }

  getDataRange() {
    return this.getRange(1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1));
  }

  insertRowsAfter(after: number, howMany: number) {
    this.values.splice(after, 0, ...Array.from({ length: howMany }, (): Cell[] => []));
    this.maxRows += howMany;
    return this;
  }

  insertColumnsAfter(after: number, howMany: number) {
    for (const row of this.values) {
      if (row && row.length > after) row.splice(after, 0, ...Array<Cell>(howMany).fill(''));
    }
    this.maxColumns += howMany;
    return this;
  }

  deleteRow(row: number) {
    if (row < 1 || row > this.maxRows) throw new Error('Those rows are out of bounds.');
    this.values.splice(row - 1, 1);
    this.maxRows -= 1;
    return this;
  }

  clearContents() {
    this.values = [];
    return this;
  }

  setFrozenRows(rows: number) {
    this.frozenRows = rows;
  }

  hideColumns(column: number, howMany = 1) {
    for (let i = 0; i < howMany; i++) this.hiddenColumns.push(column + i);
  }

  getFilter() {
    return this.filter;
  }

  activate() {
    this.spreadsheet.activeSheet = this;
    return this;
  }

  setColumnWidth() {
    return this;
  }
}

export class FakeSpreadsheet {
  sheets: FakeSheet[] = [];
  activeSheet: FakeSheet | null = null;
  timeZone = 'Etc/UTC';

  constructor(
    readonly id: string,
    readonly name: string,
    private readonly google: FakeGoogle,
  ) {
    this.insertSheet('Sheet1');
  }

  getId() {
    return this.id;
  }

  getName() {
    return this.name;
  }

  getSheetByName(name: string) {
    return this.sheets.find((sheet) => sheet.name === name) ?? null;
  }

  getSheets() {
    return [...this.sheets];
  }

  insertSheet(name: string, index?: number) {
    if (this.getSheetByName(name))
      throw new Error(`A sheet with the name "${name}" already exists.`);
    const sheet = strict(new FakeSheet(this, name), 'Sheet');
    this.sheets.splice(index ?? this.sheets.length, 0, sheet);
    this.activeSheet = sheet;
    return sheet;
  }

  deleteSheet(sheet: FakeSheet) {
    this.sheets = this.sheets.filter((s) => s !== sheet);
  }

  setActiveSheet(sheet: FakeSheet) {
    this.activeSheet = sheet;
    return sheet;
  }

  setSpreadsheetTimeZone(timeZone: string) {
    this.timeZone = timeZone;
  }

  toast(message: unknown) {
    this.google.toasts.push(String(message));
  }
}

/* ----------------------------- Spreadsheet UI ----------------------------- */

const BUTTON = { OK: 'OK', CANCEL: 'CANCEL', YES: 'YES', NO: 'NO', CLOSE: 'CLOSE' };
const BUTTON_SET = {
  OK: 'OK',
  OK_CANCEL: 'OK_CANCEL',
  YES_NO: 'YES_NO',
  YES_NO_CANCEL: 'YES_NO_CANCEL',
};

export interface MenuItem {
  label?: string;
  handler?: string;
  separator?: true;
  submenu?: Menu;
}
export interface Menu {
  title: string;
  items: MenuItem[];
}
export interface Dialog {
  type: 'alert' | 'prompt';
  title: string;
  message: string;
}

function createUi(google: FakeGoogle) {
  const answer = (buttons: unknown) =>
    google.ui.buttons.shift() ??
    (buttons === BUTTON_SET.YES_NO || buttons === BUTTON_SET.YES_NO_CANCEL
      ? BUTTON.YES
      : BUTTON.OK);

  function createMenu(title: string) {
    const menu: Menu = { title, items: [] };
    const builder = strict(
      {
        menu,
        addItem(label: string, handler: string) {
          menu.items.push({ label, handler });
          return builder;
        },
        addSeparator() {
          menu.items.push({ separator: true });
          return builder;
        },
        addSubMenu(sub: { menu: Menu }) {
          menu.items.push({ submenu: sub.menu });
          return builder;
        },
        addToUi() {
          google.ui.menus.push(menu);
        },
      },
      'Menu',
    );
    return builder;
  }

  return strict(
    {
      Button: BUTTON,
      ButtonSet: BUTTON_SET,
      createMenu,
      alert(...args: unknown[]) {
        // alert(message), alert(message, buttons) or alert(title, message, buttons)
        const [title, message, buttons] =
          args.length >= 3 ? args : args.length === 2 ? ['', args[0], args[1]] : ['', args[0]];
        google.ui.dialogs.push({ type: 'alert', title: String(title), message: String(message) });
        return answer(buttons);
      },
      prompt(title: unknown, message: unknown, buttons: unknown) {
        google.ui.dialogs.push({ type: 'prompt', title: String(title), message: String(message) });
        const button = answer(buttons);
        const text = google.ui.responses.shift() ?? '';
        return strict(
          { getSelectedButton: () => button, getResponseText: () => text },
          'PromptResponse',
        );
      },
    },
    'Ui',
  );
}

/* --------------------------------- Drive --------------------------------- */

export class FakeBlob {
  constructor(
    readonly bytes: Uint8Array,
    readonly contentType: string,
    readonly name: string,
  ) {}

  getBytes() {
    return Array.from(this.bytes);
  }

  getDataAsString() {
    return Buffer.from(this.bytes).toString('utf8');
  }

  getContentType() {
    return this.contentType;
  }

  getName() {
    return this.name;
  }
}

export class FakeFile {
  trashed = false;

  constructor(
    readonly id: string,
    readonly name: string,
    readonly parent: FakeFolder,
    readonly blob: FakeBlob | null,
  ) {}

  getId() {
    return this.id;
  }

  getName() {
    return this.name;
  }

  getUrl() {
    return `https://drive.example/file/${this.id}`;
  }

  getBlob() {
    if (!this.blob) throw new Error(`${this.name} has no content in the fake Drive.`);
    return this.blob;
  }

  getParents() {
    return iterator([this.parent], 'FolderIterator');
  }

  setTrashed(trashed: boolean) {
    this.trashed = trashed;
    return this;
  }
}

export class FakeFolder {
  constructor(
    readonly drive: FakeDrive,
    readonly id: string,
    readonly name: string,
    readonly parent: FakeFolder | null,
  ) {}

  getId() {
    return this.id;
  }

  getName() {
    return this.name;
  }

  getFoldersByName(name: string) {
    const found = this.drive.folders.filter((f) => f.parent === this && f.name === name);
    return iterator(found, 'FolderIterator');
  }

  createFolder(name: string) {
    return this.drive.addFolder(name, this);
  }

  getFilesByName(name: string) {
    const found = this.drive.files.filter(
      (f) => f.parent === this && f.name === name && !f.trashed,
    );
    return iterator(found, 'FileIterator');
  }

  createFile(blob: FakeBlob) {
    return this.drive.addFile(blob.getName(), this, blob);
  }

  /** Path from the root, for snapshots. */
  path(): string {
    return this.parent ? `${this.parent.path()}/${this.name}` : this.name;
  }
}

export class FakeDrive {
  folders: FakeFolder[] = [];
  files: FakeFile[] = [];
  readonly root: FakeFolder;
  private count = 0;

  constructor() {
    this.root = this.addFolder('My Drive', null);
  }

  addFolder(name: string, parent: FakeFolder | null) {
    const folder = strict(new FakeFolder(this, `folder-${++this.count}`, name, parent), 'Folder');
    this.folders.push(folder);
    return folder;
  }

  addFile(name: string, parent: FakeFolder, blob: FakeBlob | null, id = `file-${++this.count}`) {
    const file = strict(new FakeFile(id, name, parent, blob), 'File');
    this.files.push(file);
    return file;
  }
}

/* ------------------------------- Utilities ------------------------------- */

/** Utilities.formatDate for the Java date patterns the application uses. */
export function formatDate(date: Date, timeZone: string, pattern: string): string {
  const parts: Record<string, string> = {};
  const options: Intl.DateTimeFormatOptions = {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'long',
  };
  for (const part of new Intl.DateTimeFormat('en-GB', options).formatToParts(date)) {
    parts[part.type] = part.value;
  }
  const monthName = new Intl.DateTimeFormat('en-GB', { timeZone, month: 'long' }).format(date);
  const number = (key: string) => String(Number(parts[key]));
  return pattern.replace(/'([^']*)'|y+|M+|d+|H+|m+|s+|E+/g, (token: string, literal?: string) => {
    if (literal !== undefined) return literal;
    const long = token.length >= 4;
    const padded = token.length === 2;
    switch (token[0]) {
      case 'y':
        return parts.year ?? '';
      case 'M':
        return long ? monthName : padded ? (parts.month ?? '') : number('month');
      case 'd':
        return padded ? (parts.day ?? '') : number('day');
      case 'H':
        return padded ? (parts.hour ?? '') : number('hour');
      case 'm':
        return parts.minute ?? '';
      case 's':
        return parts.second ?? '';
      default:
        return long ? (parts.weekday ?? '') : (parts.weekday ?? '').slice(0, 3);
    }
  });
}

function bytesOf(data: unknown): Uint8Array {
  if (typeof data === 'string') return new Uint8Array(Buffer.from(data, 'utf8'));
  if (Array.isArray(data)) return Uint8Array.from(data.map((b: number) => b & 0xff));
  throw new Error('Fake Apps Script: Utilities.newBlob only supports strings and byte arrays');
}

/* --------------------------------- Mail --------------------------------- */

export interface SentMail {
  to: string;
  cc: string;
  subject: string;
  body: string;
  name: string;
  replyTo: string;
}

/* ------------------------------- Triggers ------------------------------- */

export interface TriggerSpec {
  handler: string;
  everyDays?: number;
  weekDay?: string;
  atHour?: number;
  timeZone?: string;
}

const WEEK_DAY = Object.fromEntries(
  ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'].map((d) => [d, d]),
);

/* ------------------------------- All services ------------------------------- */

export class FakeGoogle {
  readonly drive = new FakeDrive();
  readonly folder: FakeFolder;
  readonly spreadsheet: FakeSpreadsheet;
  readonly scriptProperties = new Map<string, string>();
  readonly mail: SentMail[] = [];
  triggers: { spec: TriggerSpec }[] = [];
  readonly toasts: string[] = [];
  readonly logs: string[] = [];
  readonly ui = {
    /** Whether SpreadsheetApp.getUi() works: yes for menus and the editor, not for web requests or triggers. */
    available: true,
    menus: [] as Menu[],
    dialogs: [] as Dialog[],
    /** Buttons to press in upcoming alerts and prompts (default: Yes or OK). */
    buttons: [] as string[],
    /** Text to type into upcoming prompts. */
    responses: [] as string[],
  };
  private uuidCount = 0;
  private triggerCount = 0;

  constructor() {
    this.folder = this.drive.addFolder('Programme', this.drive.root);
    this.spreadsheet = strict(
      new FakeSpreadsheet('spreadsheet-1', 'Monday reports', this),
      'Spreadsheet',
    );
    this.drive.addFile(this.spreadsheet.name, this.folder, null, this.spreadsheet.id);
  }

  /** The Apps Script globals, to install in a script's global scope. */
  globals(): Record<string, unknown> {
    const ui = createUi(this);
    return {
      SpreadsheetApp: strict(
        {
          getActiveSpreadsheet: () => this.spreadsheet,
          openById: (id: string) => {
            if (id !== this.spreadsheet.id) throw new Error(`No spreadsheet with ID ${id}`);
            return this.spreadsheet;
          },
          getUi: () => {
            if (!this.ui.available)
              throw new Error('Cannot call SpreadsheetApp.getUi() from this context.');
            return ui;
          },
          newDataValidation: () => {
            const builder = strict(
              {
                rule: {} as Record<string, unknown>,
                requireValueInList: (values: string[]) => ((builder.rule.list = values), builder),
                requireCheckbox: () => ((builder.rule.checkbox = true), builder),
                setAllowInvalid: (allow: boolean) => ((builder.rule.allowInvalid = allow), builder),
                build: () => builder.rule,
              },
              'DataValidationBuilder',
            );
            return builder;
          },
          newFilterCriteria: () => {
            const criteria: Record<string, unknown> = {};
            const builder = strict(
              {
                whenNumberEqualTo: (n: number) => {
                  criteria.whenNumberEqualTo = n;
                  return builder;
                },
                build: () => criteria,
              },
              'FilterCriteriaBuilder',
            );
            return builder;
          },
        },
        'SpreadsheetApp',
      ),
      DriveApp: strict(
        {
          getFileById: (id: string) => {
            const file = this.drive.files.find((f) => f.id === id);
            if (!file) throw new Error(`No item with the given ID could be found: ${id}`);
            return file;
          },
          getFolderById: (id: string) => {
            const folder = this.drive.folders.find((f) => f.id === id);
            if (!folder) throw new Error(`No item with the given ID could be found: ${id}`);
            return folder;
          },
          getRootFolder: () => this.drive.root,
        },
        'DriveApp',
      ),
      MailApp: strict(
        {
          sendEmail: (
            to: string,
            subject: string,
            body: string,
            options: Partial<SentMail> = {},
          ) => {
            this.mail.push({
              to,
              cc: options.cc ?? '',
              subject,
              body,
              name: options.name ?? '',
              replyTo: options.replyTo ?? '',
            });
          },
          getRemainingDailyQuota: () => 100,
        },
        'MailApp',
      ),
      ScriptApp: strict(
        {
          WeekDay: WEEK_DAY,
          newTrigger: (handler: string) => {
            const spec: TriggerSpec = { handler };
            const clock = strict(
              {
                everyDays: (n: number) => ((spec.everyDays = n), clock),
                onWeekDay: (day: string) => ((spec.weekDay = day), clock),
                atHour: (hour: number) => ((spec.atHour = hour), clock),
                inTimezone: (timeZone: string) => ((spec.timeZone = timeZone), clock),
                create: () => {
                  const id = `trigger-${++this.triggerCount}`;
                  const trigger = strict(
                    { spec, getHandlerFunction: () => handler, getUniqueId: () => id },
                    'Trigger',
                  );
                  this.triggers.push(trigger);
                  return trigger;
                },
              },
              'ClockTriggerBuilder',
            );
            return strict({ timeBased: () => clock }, 'TriggerBuilder');
          },
          getProjectTriggers: () => [...this.triggers],
          deleteTrigger: (trigger: { spec: TriggerSpec }) => {
            this.triggers = this.triggers.filter((t) => t !== trigger);
          },
        },
        'ScriptApp',
      ),
      PropertiesService: strict(
        {
          getScriptProperties: () => {
            const properties = strict(
              {
                getProperty: (key: string) => this.scriptProperties.get(key) ?? null,
                setProperty: (key: string, value: unknown) => {
                  this.scriptProperties.set(key, String(value));
                  return properties;
                },
              },
              'Properties',
            );
            return properties;
          },
        },
        'PropertiesService',
      ),
      LockService: strict(
        {
          getScriptLock: () =>
            strict({ waitLock: () => undefined, releaseLock: () => undefined }, 'Lock'),
        },
        'LockService',
      ),
      Utilities: strict(
        {
          formatDate,
          getUuid: () => {
            const hex = createHash('sha256').update(String(++this.uuidCount)).digest('hex');
            return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
          },
          base64Decode: (data: string) => Array.from(Buffer.from(data, 'base64')),
          newBlob: (data: unknown, contentType = 'application/octet-stream', name = '') =>
            strict(new FakeBlob(bytesOf(data), contentType, name), 'Blob'),
        },
        'Utilities',
      ),
      ContentService: strict(
        {
          MimeType: { JSON: 'JSON', TEXT: 'TEXT' },
          createTextOutput: (content = '') => {
            const output = strict(
              {
                content,
                mimeType: 'TEXT',
                setMimeType: (mimeType: string) => ((output.mimeType = mimeType), output),
                getContent: () => output.content,
              },
              'TextOutput',
            );
            return output;
          },
        },
        'ContentService',
      ),
      Logger: strict(
        {
          log: (message: unknown) => {
            this.logs.push(String(message));
          },
        },
        'Logger',
      ),
    };
  }
}
