import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkSetup,
  menuCreateLinks,
  menuEmailLinks,
  menuRefreshLog,
  menuShowAll,
  menuShowThisWeek,
  onOpen,
} from '../src/admin.js';
import { FakeBlob, type FakeGoogle } from './support/fake-google.js';
import { loadLegacy, stateOf } from './support/runtime.js';
import { twins } from './support/twins.js';

afterEach(() => {
  vi.useRealTimers();
});

const BEFORE_START = '2026-11-20T09:00:00+02:00';
const WEEK_ONE = '2026-12-06T18:00:00+02:00';

function setSettings(google: FakeGoogle, settings: Record<string, string>) {
  const sheet = google.spreadsheet.getSheetByName('Settings');
  for (const [key, value] of Object.entries(settings)) {
    sheet?.getRange(sheet.getLastRow() + 1, 1, 1, 2).setValues([[key, value]]);
  }
}

/** Runs the same steps through the typed modules and the original, and compares everything. */
function compare(
  now: string,
  setup: (google: FakeGoogle) => void,
  steps: [() => unknown, string][],
) {
  const { typed, original } = twins(now);
  setup(typed);
  setup(original);
  const legacy = loadLegacy(original, now);
  for (const [step, name] of steps) {
    expect(step() ?? null, name).toEqual(legacy.call(name) ?? null);
  }
  const state = stateOf(typed);
  expect(state).toEqual(stateOf(original));
  return state;
}

describe('the menu', () => {
  it('is built exactly as the original builds it', () => {
    const state = compare(BEFORE_START, () => undefined, [[onOpen, 'onOpen']]);
    expect(state.menus[0]?.title).toBe('Revenue Accelerator');
  });

  it.each([
    ['before any week opens', BEFORE_START],
    ['while week 1 is open', WEEK_ONE],
  ])('filters the Reports tab like the original %s', (_name, now) => {
    const state = compare(now, () => undefined, [
      [menuShowThisWeek, 'menuShowThisWeek'],
      [menuShowThisWeek, 'menuShowThisWeek'],
      [menuShowAll, 'menuShowAll'],
      [menuShowThisWeek, 'menuShowThisWeek'],
    ]);
    expect(state.activeSheet).toBe('Reports');
  });

  it('rebuilds and shows the Report log like the original', () => {
    const state = compare(WEEK_ONE, () => undefined, [[menuRefreshLog, 'menuRefreshLog']]);
    expect(state.activeSheet).toBe('Report log');
  });

  it('creates and updates links like the original', () => {
    const state = compare(
      WEEK_ONE,
      (google) => {
        const teams = google.spreadsheet.getSheetByName('Teams');
        teams?.getRange(7, 2).setValue('Zeta');
        teams?.getRange(8, 2).setValue('Eta');
      },
      [
        [menuCreateLinks, 'menuCreateLinks'],
        [menuCreateLinks, 'menuCreateLinks'],
      ],
    );
    // Every seeded link pointed at another address; Zeta and Eta get new codes.
    expect(state.toasts).toEqual([
      '2 new team links created. 5 existing links updated to the address in Settings.',
      'Every team already has an up-to-date link.',
    ]);
  });
});

describe('emailing team links', () => {
  it.each([
    ['when confirmed', {}, ['YES']],
    ['when cancelled', {}, ['NO']],
    ['in test mode', { send_all_emails_to: 'inbox@example.com' }, ['YES', 'YES']],
  ])('works like the original %s', (_name, settings, buttons) => {
    const state = compare(
      WEEK_ONE,
      (google) => {
        setSettings(google, settings);
        google.ui.buttons.push(...buttons);
      },
      [
        [menuEmailLinks, 'menuEmailLinks'],
        [menuEmailLinks, 'menuEmailLinks'],
      ],
    );
    if (_name === 'when confirmed') {
      // Delta is stopped and Epsilon has no address; the second run finds nobody waiting.
      expect(state.mail.map((m: { to: string }) => m.to)).toEqual([
        'ana@example.com,ben@example.com',
        'cleo@example.com',
        'dev@example.com',
      ]);
      expect(state.dialogs.at(-1)?.message).toMatch(/^There are no teams waiting for their link/);
    }
  });
});

describe('the permissions check', () => {
  const template = (google: FakeGoogle) =>
    google.drive.addFile(
      'ura-test-report TEMPLATE.html',
      google.folder,
      new FakeBlob(
        new Uint8Array(Buffer.from('<html>')),
        'text/html',
        'ura-test-report TEMPLATE.html',
      ),
    );

  it.each([
    ['with the page template', (google: FakeGoogle) => template(google)],
    ['without the page template', () => undefined],
    [
      'on a pretend date in test mode',
      (google: FakeGoogle) =>
        setSettings(google, {
          pretend_today: '2026-12-07',
          send_all_emails_to: 'inbox@example.com',
        }),
    ],
    [
      'without a Teams tab',
      (google: FakeGoogle) =>
        google.spreadsheet.deleteSheet(google.spreadsheet.getSheetByName('Teams') as never),
    ],
    [
      'from the script editor',
      (google: FakeGoogle) => {
        google.ui.available = false;
      },
    ],
  ])('reports like the original %s', (_name, setup) => {
    const state = compare(WEEK_ONE, setup, [[checkSetup, 'checkSetup']]);
    expect(state.logs[0]).toMatch(/^(Everything is in place|Something is missing)/);
  });
});
