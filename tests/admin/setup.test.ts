import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSettingsCache } from '../../src/shared/settings.js';
import { TABS } from '../../src/shared/sheets.js';
import { DEFAULT_WEEKS, OLD_DEFAULTS, OLD_RULE_TEXT, setup } from '../../src/admin/setup.js';
import type { Cell } from '../../src/shared/types.js';
import { FakeGoogle } from '../support/fake-google.js';
import { json, loadLegacy, outcome, stateOf, useFakeGoogle } from '../support/runtime.js';
import { seedValues } from '../support/seed.js';

afterEach(() => {
  vi.useRealTimers();
});

const NOW = '2026-11-20T09:00:00+02:00';

/** The typed setup and the original on twin fakes, each prepared the same way first. */
function compareSetup(prepare: (google: FakeGoogle) => void, runs = 1) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  const typed = useFakeGoogle();
  const original = new FakeGoogle();
  prepare(typed);
  prepare(original);
  let result: ReturnType<typeof outcome> = { value: undefined };
  for (let i = 0; i < runs; i++) {
    clearSettingsCache(); // each menu click is a fresh run
    result = outcome(setup);
    expect(result, `run ${i + 1}`).toEqual(outcome(() => loadLegacy(original, NOW).call('setup')));
    expect(stateOf(typed), `run ${i + 1}`).toEqual(stateOf(original));
  }
  return { ...stateOf(typed), result };
}

const headings = (key: keyof typeof TABS) => TABS[key].cols.map(([, heading]) => heading);

describe('setup', () => {
  it('uses the legacy schedule and upgrade lists, unchanged', () => {
    const legacy = loadLegacy(new FakeGoogle());
    expect(DEFAULT_WEEKS).toEqual(json(legacy.get('DEFAULT_WEEKS')));
    expect(OLD_DEFAULTS).toEqual(json(legacy.get('OLD_DEFAULTS')));
    expect(OLD_RULE_TEXT).toEqual(json(legacy.get('OLD_RULE_TEXT')));
  });

  it('creates a new Sheet exactly as the original does, and changes nothing when run again', () => {
    const state = compareSetup(() => undefined, 2);
    expect(state.sheets.map((sheet: { name: string }) => sheet.name)).toEqual([
      'Start here',
      'Settings',
      'Teams',
      'Weeks',
      'Reports',
      'Pipeline',
      'Corrections',
      'Feedback rules',
      'Report log',
    ]);
    expect(state.activeSheet).toBe('Teams');
  });

  it('repairs an old, untidy Sheet exactly as the original does', () => {
    const state = compareSetup((google) => {
      // 1002 rows: removing the two repeated settings below leaves exactly 1000, where the
      // original and the fixed setup format the same rows (see the next tests).
      const settingsTab = seedValues(google, 'Settings', [
        ['Setting', 'Value'],
        ['programme_name', 'Mashauri Revenue Accelerator'],
        ['report_page_url', 'https://tools.mashauri.org/revenue-report.html'],
        ['short_name', ''],
        ['short_name', 'URA'],
        ['currency_symbol', '₹'],
        ['currency_symbol', 'R'],
      ]);
      settingsTab.maxRows = 1002;
      // Reports with an older heading and missing columns, and two real reports.
      const reports: Cell[][] = [
        ['Week', 'Team', 'Money received (R)', 'Send reply', 'Team ID'],
        [1, 'Alpha', 300, true, 'T01'],
        [1, 'Beta', 0, '', 'T02'],
      ];
      seedValues(google, 'Reports', reports);
      const rules = headings('rules');
      seedValues(google, 'Feedback rules', [
        rules,
        [
          'org_no_moves',
          'Organisation',
          'Yes',
          'warn',
          'None of your organisations moved forward a stage this week.',
          'Pick one.',
          'No stage moves',
          'No organisation moved forward.',
        ],
        [
          'org_stuck',
          'Organisation',
          'Yes',
          'warn',
          'Edited headline',
          'Edited detail',
          'Stuck organisation',
          'An organisation has not moved in three reports.',
        ],
        ['late', 'Both', 'No', 'info', 'My own wording', '', 'Late', ''],
      ]);
      seedValues(google, 'Teams', [
        headings('teams'),
        [
          '',
          'Alpha',
          'Direct',
          '',
          'Ana',
          'ana@example.com',
          '',
          '',
          '',
          'https://old.example.com?t=x',
          '',
          '',
        ],
      ]);
    });
    expect(state.toasts.at(-1)).toMatch(
      /^The sheet is ready\. Settings updated to the new defaults: programme_name, report_page_url\./,
    );
    const settings =
      state.sheets.find((s: { name: string }) => s.name === 'Settings')?.values ?? [];
    expect(settings.filter((row: Cell[]) => row[0] === 'short_name')).toEqual([
      ['short_name', 'URA', expect.any(String)],
    ]);
    expect(settings.filter((row: Cell[]) => row[0] === 'currency_symbol')).toEqual([
      ['currency_symbol', '₹', expect.any(String)],
    ]);
  });

  /** Runs the fixed setup and the original on twin fakes, where they are expected to differ. */
  function setupAfter(prepare: (google: FakeGoogle) => void) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(NOW));
    const typed = useFakeGoogle();
    const original = new FakeGoogle();
    prepare(typed);
    prepare(original);
    return {
      typed: { result: outcome(setup), formats: formatsOf(typed, 'Teams') },
      original: { result: outcome(() => loadLegacy(original, NOW).call('setup')) },
    };
  }

  const formatsOf = (google: FakeGoogle, tab: string) =>
    google.spreadsheet.getSheetByName(tab)?.formats ?? [];

  const teamsWithRows = (rows: number) => (google: FakeGoogle) => {
    seedValues(google, 'Teams', [headings('teams'), ['T01', 'Alpha'], ['T02', 'Beta']]);
    const teams = google.spreadsheet.getSheetByName('Teams');
    if (teams) teams.maxRows = rows;
  };

  it('works once rows have been deleted from a tab, where the original failed', () => {
    // For example after "Remove demo data", which deletes rows from the Teams tab.
    const run = setupAfter(teamsWithRows(993));
    expect(run.original.result).toEqual({
      error: 'The coordinates of the range are outside the dimensions of the sheet.',
    });
    expect(run.typed.result).toEqual({ value: undefined });
    expect(run.typed.formats.filter((f) => f.startsWith('validation'))).toEqual([
      'validation {"list":["Direct","Organisation"],"allowInvalid":false}: rows 2-993 of column 3',
      'validation {"list":["Active","Stopped"],"allowInvalid":false}: rows 2-993 of column 4',
    ]);
  });

  it('gives every row a drop-down on a tab that has grown past 1000 rows', () => {
    const run = setupAfter(teamsWithRows(1500));
    expect(run.typed.formats.filter((f) => f.startsWith('validation'))).toEqual([
      'validation {"list":["Direct","Organisation"],"allowInvalid":false}: rows 2-1500 of column 3',
      'validation {"list":["Active","Stopped"],"allowInvalid":false}: rows 2-1500 of column 4',
    ]);
  });

  it('works on a Sheet whose blank first tab has been renamed or filled in', () => {
    compareSetup((google) => {
      google.spreadsheet.getSheetByName('Sheet1')?.getRange(1, 1).setValue('notes');
    });
  });
});
