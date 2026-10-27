// Triggers run against fake ScriptApp only: nothing here creates a real trigger.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { autoDaily, menuEmailsOff, menuEmailsOn } from '../src/triggers.js';
import type { FakeGoogle } from './support/fake-google.js';
import { json, loadLegacy } from './support/runtime.js';
import { tabValues } from './support/seed.js';
import { twins } from './support/twins.js';

afterEach(() => {
  vi.useRealTimers();
});

const NOW = '2026-12-08T09:00:00+02:00';

/** Adds a trigger that belongs to something else, which turning emails off must leave alone. */
function addOtherTrigger(google: FakeGoogle) {
  const { ScriptApp } = google.globals() as {
    ScriptApp: {
      newTrigger(name: string): { timeBased(): { everyDays(n: number): { create(): void } } };
    };
  };
  ScriptApp.newTrigger('somethingElse').timeBased().everyDays(7).create();
}

function state(google: FakeGoogle) {
  return json({ triggers: google.triggers.map((t) => t.spec), toasts: google.toasts });
}

describe('automatic email triggers', () => {
  it.each([[{}], [{ time_zone: 'Asia/Kolkata' }], [{ time_zone: 'Not/A Zone' }]])(
    'are turned on and off exactly as the original does (%j)',
    (settings) => {
      const { typed, original } = twins(NOW);
      for (const google of [typed, original]) {
        addOtherTrigger(google);
        const sheet = google.spreadsheet.getSheetByName('Settings');
        for (const [key, value] of Object.entries(settings)) {
          sheet?.getRange(sheet.getLastRow() + 1, 1, 1, 2).setValues([[key, value]]);
        }
      }
      const legacy = loadLegacy(original, NOW);
      const steps: [() => void, string][] = [
        [menuEmailsOn, 'menuEmailsOn'],
        [menuEmailsOn, 'menuEmailsOn'],
        [menuEmailsOff, 'menuEmailsOff'],
        [menuEmailsOn, 'menuEmailsOn'],
      ];
      for (const [step, name] of steps) {
        step();
        legacy.call(name);
        expect(state(typed), name).toEqual(state(original));
      }
      const zone =
        'time_zone' in settings && settings.time_zone === 'Asia/Kolkata'
          ? 'Asia/Kolkata'
          : 'Africa/Johannesburg';
      expect(state(typed).triggers).toEqual([
        { handler: 'somethingElse', everyDays: 7 },
        { handler: 'autoMondayReminder', everyDays: 1, atHour: 14, timeZone: zone },
        { handler: 'autoDigests', weekDay: 'TUESDAY', atHour: 7, timeZone: zone },
        { handler: 'autoDaily', everyDays: 1, atHour: 5, timeZone: zone },
      ]);
    },
  );

  it('rebuild the Report log every day, as the original autoDaily does', () => {
    const { typed, original } = twins(NOW);
    autoDaily();
    loadLegacy(original, NOW).call('autoDaily');
    expect(tabValues(typed, 'Report log')).toEqual(tabValues(original, 'Report log'));
    expect(tabValues(typed, 'Report log').values[0]?.slice(0, 4)).toEqual([
      'Team',
      'Track',
      'Status',
      'Week 1',
    ]);
  });
});
