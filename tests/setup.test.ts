import { afterEach, describe, expect, it, vi } from 'vitest';
import { TABS } from '../src/sheets.js';
import { DEFAULT_WEEKS, OLD_DEFAULTS, OLD_RULE_TEXT, setup } from '../src/setup.js';
import type { Cell } from '../src/types.js';
import { FakeGoogle } from './support/fake-google.js';
import { json, loadLegacy, outcome, stateOf, useFakeGoogle } from './support/runtime.js';
import { seedValues } from './support/seed.js';

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
    globalThis.SETTINGS_CACHE_ = null; // each menu click is a fresh run
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
      // More than 1000 rows, so that removing the repeated settings below does not trip the
      // known issue about deleted rows (pinned in its own test).
      const settingsTab = seedValues(google, 'Settings', [
        ['Setting', 'Value'],
        ['programme_name', 'Mashauri Revenue Accelerator'],
        ['report_page_url', 'https://tools.mashauri.org/revenue-report.html'],
        ['short_name', ''],
        ['short_name', 'URA'],
        ['currency_symbol', '₹'],
        ['currency_symbol', 'R'],
      ]);
      settingsTab.maxRows = 1100;
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

  it('fails like the original once rows have been deleted from a 1000-row tab (docs/known-issues.md)', () => {
    // For example after "Remove demo data", which deletes rows from the Teams tab.
    const { result } = compareSetup((google) => {
      seedValues(google, 'Teams', [headings('teams'), ['T01', 'Alpha'], ['T02', 'Beta']]);
      google.spreadsheet.getSheetByName('Teams')?.deleteRow(3);
    });
    expect(result).toEqual({
      error: 'The coordinates of the range are outside the dimensions of the sheet.',
    });
  });

  it('works on a Sheet whose blank first tab has been renamed or filled in', () => {
    compareSetup((google) => {
      google.spreadsheet.getSheetByName('Sheet1')?.getRange(1, 1).setValue('notes');
    });
  });
});
