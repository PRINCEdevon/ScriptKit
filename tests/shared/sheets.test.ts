import { describe, expect, it } from 'vitest';
import {
  TABS,
  appendRow,
  mapTable,
  readRows,
  readTable,
  safeValue,
  setCells,
  spreadsheet,
} from '../../src/shared/sheets.js';
import { FakeGoogle } from '../support/fake-google.js';
import { json, loadLegacy, useFakeGoogle } from '../support/runtime.js';
import { seedTab, seedValues, tabValues } from '../support/seed.js';

const reportsHeadings = TABS.reports.cols.map(([, heading]) => heading);

describe('TABS', () => {
  it('is the legacy spreadsheet schema, unchanged', () => {
    expect(TABS).toEqual(json(loadLegacy(new FakeGoogle()).get('TABS')));
  });
});

describe('mapTable', () => {
  it('maps columns by heading, including older headings, and skips empty rows', () => {
    const values = [
      ['Team', 'Money received (R)', 'Unknown column', ' Week '],
      ['Alpha', 300, 'ignored', 1],
      ['', '', '', ''],
      ['', false, '', ''],
      ['Beta', 0, '', 2],
    ];
    expect(mapTable(TABS.reports, values)).toEqual({
      headers: ['Team', 'Money received (R)', 'Unknown column', 'Week'],
      col: { team_name: 1, revenue: 2, week: 4 },
      rows: [
        { _row: 2, team_name: 'Alpha', revenue: 300, week: 1 },
        { _row: 5, team_name: 'Beta', revenue: 0, week: 2 },
      ],
    });
  });

  it('handles a tab with only a header row, or nothing at all', () => {
    expect(mapTable(TABS.teams, [['Team name']]).rows).toEqual([]);
    expect(mapTable(TABS.teams, [])).toEqual({ headers: [], col: {}, rows: [] });
  });
});

describe('reading tabs', () => {
  it('reads a tab exactly as the legacy table_ does', () => {
    const google = useFakeGoogle();
    seedValues(google, 'Reports', [
      [...reportsHeadings.slice(0, 5), 'Notes', 'Money received (R)'],
      [1, 'Alpha', 'Direct', new Date('2026-12-07T08:00:00Z'), 'No', 'x', '1,500'],
      [false, '', '', '', '', '', ''],
      [2, 'Beta', 'Direct', '', 'Yes', '', 0],
    ]);
    const legacy = loadLegacy(google);
    const { headers, col, rows, def } = readTable('reports');
    const original = legacy.call('table_', 'reports') as Record<string, unknown>;
    expect(json({ headers, col, rows, def })).toEqual(
      json({
        headers: original.headers,
        col: original.col,
        rows: original.rows,
        def: original.def,
      }),
    );
  });

  it('turns Pipeline week and stage into numbers, as the legacy tableRows_ does', () => {
    const google = useFakeGoogle();
    seedTab(google, 'pipeline', [
      { week: '2', team_id: 'T01', organisation: 'Clinic', stage: '3' },
      { week: 'two', team_id: 'T01', organisation: 'School', stage: '' },
    ]);
    expect(readRows('pipeline').map((r) => [r.week, r.stage])).toEqual([
      [2, 3],
      [0, 0],
    ]);
    expect(json(readRows('pipeline'))).toEqual(
      json(loadLegacy(google).call('tableRows_', 'pipeline')),
    );
  });

  it('reports a missing tab with the same message as before', () => {
    const google = useFakeGoogle();
    const message = 'The "Teams" tab is missing. Run "Set up or repair the sheet".';
    expect(() => readTable('teams')).toThrow(message);
    expect(() => loadLegacy(google).call('table_', 'teams')).toThrow(message);
  });

  it('opens the spreadsheet recorded by setup, or else the active one', () => {
    const google = useFakeGoogle();
    expect(spreadsheet().getId()).toBe('spreadsheet-1');
    google.scriptProperties.set('SHEET_ID', 'another-sheet');
    expect(() => spreadsheet()).toThrow('No spreadsheet with ID another-sheet');
  });
});

describe('writing tabs', () => {
  /** Runs the same writes through the typed module and the legacy script, on twin fakes. */
  function twins(seed: (google: FakeGoogle) => void) {
    const typed = useFakeGoogle();
    const original = new FakeGoogle();
    seed(typed);
    seed(original);
    return { typed, original, legacy: loadLegacy(original) };
  }

  it('appends after the last row with data, stores formulas as text and adds tick boxes', () => {
    const { typed, original, legacy } = twins((google) => {
      const sheet = seedTab(google, 'reports', [{ week: 1, team_name: 'Alpha' }]);
      sheet.maxRows = 3;
    });
    const rows = [
      { week: 2, team_name: 'Beta', customers_said: '=HYPERLINK("x")', unknown_field: 'ignored' },
      { week: 2, team_name: 'Gamma', blocker: '-not a formula?', revenue: 12.5 },
      { week: 3, team_name: '@Delta', submitted_at: new Date('2026-12-08T09:00:00Z') },
    ];
    rows.forEach((row) => appendRow('reports', row));
    rows.forEach((row) => legacy.call('appendRow_', 'reports', row));
    expect(tabValues(typed, 'Reports')).toEqual(tabValues(original, 'Reports'));
    const values = tabValues(typed, 'Reports').values;
    expect(values).toHaveLength(5);
    expect(values[2]?.[TABS.reports.cols.findIndex(([f]) => f === 'customers_said')]).toBe(
      '=HYPERLINK("x")',
    );
    expect(tabValues(typed, 'Reports').maxRows).toBe(53);
  });

  it('writes single cells by field name, as the legacy setCells_ does', () => {
    const { typed, original, legacy } = twins((google) => {
      seedTab(google, 'teams', [{ team_name: 'Alpha' }, { team_name: 'Beta' }]);
    });
    const changes = { status: 'Stopped', notes: '+44 20', no_such_field: 'x' };
    setCells(readTable('teams'), 3, changes);
    legacy.call('setCells_', legacy.call('table_', 'teams'), 3, changes);
    expect(tabValues(typed, 'Teams')).toEqual(tabValues(original, 'Teams'));
  });

  it('marks only text that could start a formula', () => {
    expect(safeValue('=1+1')).toBe("'=1+1");
    expect(safeValue('+27 82')).toBe("'+27 82");
    expect(safeValue('-')).toBe("'-");
    expect(safeValue('@team')).toBe("'@team");
    expect(safeValue('fine')).toBe('fine');
    expect(safeValue(-5)).toBe(-5);
  });
});
