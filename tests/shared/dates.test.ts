import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkpointLabel,
  currentWeek,
  dayKey,
  longDate,
  noonDate,
  parseDay,
  rangeLabel,
  readWeeks,
  stampLabel,
  timeZone,
  today,
  type Week,
} from '../../src/shared/dates.js';
import { json, loadLegacy, useFakeGoogle } from '../support/runtime.js';
import { seedTab } from '../support/seed.js';

const NOW = '2026-12-07T23:30:00Z'; // already 8 December in Johannesburg

const noon = (day: string) => new Date(`${day}T10:00:00Z`); // noon in Johannesburg

afterEach(() => {
  vi.useRealTimers();
});

function withSettings(values: Record<string, unknown>) {
  const google = useFakeGoogle();
  seedTab(
    google,
    'settings',
    Object.entries(values).map(([key, value]) => ({ key, value: value as string })),
  );
  return { google, legacy: loadLegacy(google, NOW) };
}

describe('time zone', () => {
  it.each([
    ['Asia/Kolkata', 'Asia/Kolkata'],
    [' Europe/Madrid ', 'Europe/Madrid'],
    ['America/Argentina/Buenos_Aires', 'America/Argentina/Buenos_Aires'],
    ['UTC', 'UTC'],
    ['Etc/GMT+2', 'Africa/Johannesburg'],
    ['Johannesburg', 'Africa/Johannesburg'],
    ['', 'Africa/Johannesburg'],
  ])('reads %j as %j, like the legacy tz_', (setting, expected) => {
    const { legacy } = withSettings({ time_zone: setting });
    expect(timeZone()).toBe(expected);
    expect(legacy.call('tz_')).toBe(expected);
  });
});

describe('days', () => {
  const SAMPLES: unknown[] = [
    noon('2026-12-07'),
    new Date('2026-12-07T23:30:00Z'),
    '2026-12-07',
    ' 2026-12-07T10:00:00 ',
    'Monday',
    '',
    0,
    null,
    undefined,
  ];

  /** A function's result, or its error message, so that failures can be compared too. */
  const outcome = (fn: () => unknown) => {
    try {
      return { value: fn() };
    } catch (error) {
      return { error: String((error as Error).message) };
    }
  };

  it('give the same keys and labels as the legacy functions, in another time zone too', () => {
    for (const zone of ['Africa/Johannesburg', 'America/New_York']) {
      const { legacy } = withSettings({ time_zone: zone });
      for (const value of SAMPLES) {
        const label = `${zone}, ${String(value)}`;
        expect(dayKey(value), label).toBe(legacy.call('dstr_', value));
        expect(stampLabel(value), label).toBe(legacy.call('stampLabel_', value));
        expect(
          outcome(() => longDate(value)),
          label,
        ).toEqual(outcome(() => legacy.call('longDate_', value)));
        expect(
          outcome(() => rangeLabel(value, '2027-01-03')),
          label,
        ).toEqual(outcome(() => legacy.call('rangeLabel_', value, '2027-01-03')));
      }
    }
  });

  it('format dates for people', () => {
    useFakeGoogle();
    expect(dayKey(new Date('2026-12-07T23:30:00Z'))).toBe('2026-12-08');
    expect(longDate('2026-12-07')).toBe('Monday 7 December');
    expect(rangeLabel('2026-12-01', '2026-12-06')).toBe('1 to 6 December');
    expect(rangeLabel('2026-12-28', '2027-01-03')).toBe('28 December to 3 January');
    expect(stampLabel(new Date('2026-12-07T08:15:00Z'))).toBe('10:15 on Monday 7 December');
  });

  it('are created at noon in the script time zone', () => {
    expect(parseDay('2026-12-07').toISOString()).toBe('2026-12-07T10:00:00.000Z');
    expect(noonDate([2027, 1, 4]).toISOString()).toBe('2027-01-04T10:00:00.000Z');
    const legacy = loadLegacy(useFakeGoogle());
    expect(json(legacy.call('parseDay_', '2026-12-07'))).toBe('2026-12-07T10:00:00.000Z');
    expect(json(legacy.call('d_', [2027, 1, 4]))).toBe('2027-01-04T10:00:00.000Z');
  });
});

describe('today', () => {
  it.each([
    ['', '2026-12-08'],
    ['2026-12-20', '2026-12-20'],
    [noon('2027-01-11'), '2027-01-11'],
    ['20 December', '2026-12-08'],
  ])('with pretend_today %j is %j, like the legacy todayStr_', (pretend, expected) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(NOW));
    const { legacy } = withSettings({ pretend_today: pretend });
    expect(today()).toBe(expected);
    expect(legacy.call('todayStr_')).toBe(expected);
  });
});

describe('reporting weeks', () => {
  function seedWeeks() {
    const google = useFakeGoogle();
    seedTab(google, 'weeks', [
      { week: 2, opens: noon('2026-12-13'), due: noon('2026-12-14') },
      { week: '1', opens: noon('2026-12-06'), due: noon('2026-12-07') },
      { week: 0, opens: noon('2026-11-29') },
      { week: 3, opens: '' },
      { week: 'three', opens: noon('2026-12-20') },
      { week: 6, opens: '2027-01-24', covers_start: noon('2027-01-18') },
    ]);
    return { google, legacy: loadLegacy(google, NOW) };
  }

  it('reads numbered weeks with an opening date, in order, like the legacy weeks_', () => {
    const { legacy } = seedWeeks();
    const weeks = readWeeks();
    expect(weeks.map((w) => w.week)).toEqual([1, 2, 6]);
    expect(json(weeks)).toEqual(json(legacy.call('weeks_')));
  });

  it.each([
    ['2026-12-05', null],
    ['2026-12-06', 1],
    ['2026-12-12', 1],
    ['2026-12-13', 2],
    ['2027-01-24', 6],
    ['2027-12-31', 6], // stays open after the last week (docs/known-issues.md)
  ])('on %s is week %j', (day, expected) => {
    const { legacy } = seedWeeks();
    const weeks = readWeeks();
    expect(currentWeek(weeks, day)?.week ?? null).toBe(expected);
    const original = legacy.call('currentWeek_', legacy.call('weeks_'), day) as Week | null;
    expect(original?.week ?? null).toBe(expected);
  });

  it('labels the week 6 checkpoint, or says "week 6" without one', () => {
    const { legacy } = seedWeeks();
    expect(checkpointLabel(readWeeks())).toBe('Monday 18 January');
    expect(checkpointLabel(readWeeks().filter((w) => w.week !== 6))).toBe('week 6');
    expect(legacy.call('checkpointLabel_', legacy.call('weeks_'))).toBe('Monday 18 January');
  });
});
