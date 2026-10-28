import { afterEach, describe, expect, it, vi } from 'vitest';
import { addDemo, menuAddDemo, menuRemoveDemo, removeDemo } from '../../src/admin/demo.js';
import type { FakeGoogle } from '../support/fake-google.js';
import { loadLegacy, outcome, stateOf } from '../support/runtime.js';
import { twins } from '../support/twins.js';

afterEach(() => {
  vi.useRealTimers();
});

const NOW = '2026-11-20T09:00:00+02:00';

/** Runs the same steps through the typed modules and the original, and compares everything. */
function compare(setup: (google: FakeGoogle) => void, steps: [() => unknown, string][]) {
  const { typed, original } = twins(NOW);
  setup(typed);
  setup(original);
  const legacy = loadLegacy(original, NOW);
  for (const [step, name] of steps) {
    expect(outcome(step), name).toEqual(outcome(() => legacy.call(name)));
  }
  const state = stateOf(typed);
  expect(state).toEqual(stateOf(original));
  return state;
}

const tab = (state: ReturnType<typeof stateOf>, name: string) =>
  state.sheets.find((sheet: { name: string }) => sheet.name === name)?.values ?? [];

describe('demo data', () => {
  it('is added, replaced and removed exactly as the original does', () => {
    const state = compare(
      () => undefined,
      [
        [menuAddDemo, 'menuAddDemo'],
        [addDemo, 'addDemo_'],
      ],
    );
    expect(tab(state, 'Reports')).toHaveLength(17);
    expect(tab(state, 'Teams')).toHaveLength(13); // the 5 programme teams and 7 demo teams
    expect(state.toasts[0]).toBe(
      'Demo data added. The system now pretends today is 2026-12-20. Open a demo team\'s "Report link" from the Teams tab to try the page.',
    );
  });

  it('leaves the real teams and their reports when it is removed', () => {
    const state = compare(
      (google) => {
        const reports = google.spreadsheet.getSheetByName('Reports');
        reports?.getRange(2, 1, 1, 31).setValues([[1, 'Alpha', ...Array(28).fill(''), 'T01']]);
      },
      [
        [addDemo, 'addDemo_'],
        [menuRemoveDemo, 'menuRemoveDemo'],
        [removeDemo, 'removeDemo_'],
      ],
    );
    expect(tab(state, 'Reports')).toHaveLength(2);
    expect(tab(state, 'Teams')).toHaveLength(6);
    expect(state.toasts).toEqual(['Demo data removed, and the date is back to today.']);
  });

  it('fails like the original when the schedule has no week 3', () => {
    compare(
      (google) => google.spreadsheet.getSheetByName('Weeks')?.deleteRow(4),
      [[addDemo, 'addDemo_']],
    );
  });
});
