import { describe, expect, it } from 'vitest';
import type { Week } from '../../src/shared/dates.js';
import { latestSnapshot } from '../../src/shared/pipeline.js';
import { scoreboard, totals } from '../../src/feedback/scoreboard.js';
import type { Report, Row } from '../../src/shared/types.js';
import { FakeGoogle } from '../support/fake-google.js';
import { json, loadLegacy, useFakeGoogle } from '../support/runtime.js';

/** A programme filled with the legacy demo data: 7 teams and 16 reports over three weeks. */
function demoProgramme() {
  const google = useFakeGoogle();
  const legacy = loadLegacy(google);
  legacy.call('setup');
  legacy.call('addDemo_');
  // A stopped team (the laundry service) is left off the scoreboard.
  const teams = google.spreadsheet.getSheetByName('Teams');
  teams?.getRange(6, 4).setValue('Stopped');
  return {
    legacy,
    weeks: json(legacy.call('weeks_')) as Week[],
    reports: json(legacy.call('reportsAll_')) as Report[],
  };
}

describe('scoreboard', () => {
  it.each([1, 2, 3])('for week %i matches the original, ranked by activity and by money', (n) => {
    const { legacy, weeks, reports } = demoProgramme();
    const week = weeks.find((w) => w.week === n) as Week;
    for (const current of [week, { ...week, scoreboard: 'Revenue' }]) {
      for (const me of ['DEMO1', 'DEMO2', 'nobody']) {
        expect(json(scoreboard(current, weeks, reports, me))).toEqual(
          json(legacy.call('scoreboard_', current, weeks, reports, me, '2026-12-20')),
        );
      }
    }
  });

  it('ranks the teams that reported first by activity, and everyone by money from week 6', () => {
    const { weeks, reports } = demoProgramme();
    const week3 = weeks.find((w) => w.week === 3) as Week;
    const byActivity = scoreboard(week3, weeks, reports, 'DEMO1');
    expect(byActivity.phase).toBe('Activity');
    expect(byActivity.direct.map((row) => [row.team, row.reported, row.asked])).toEqual([
      ['Demo team: hair products', true, 22],
      ['Demo team: tutoring', true, 11],
      ['Demo Direct team', false, null],
    ]);
    expect(byActivity.direct.find((row) => row.you)?.team).toBe('Demo Direct team');
    const byMoney = scoreboard({ ...week3, scoreboard: 'Revenue' }, weeks, reports, 'DEMO1');
    expect(byMoney.direct.map((row) => [row.team, row.revenueTotal])).toEqual([
      ['Demo team: hair products', 1950],
      ['Demo Direct team', 700],
      ['Demo team: tutoring', 550],
    ]);
    expect(byMoney.organisation.map((row) => [row.team, row.furthest])).toEqual([
      ['Demo team: school software', '4 Decision-maker agreed'],
      ['Demo Organisation team', '3 Price or proposal sent'],
      ['Demo team: clinic booking', '3 Price or proposal sent'],
    ]);
  });
});

describe('totals', () => {
  it('add up reports to the given week, like the original', () => {
    const legacy = loadLegacy(new FakeGoogle());
    const reports = [
      { week: 1, revenue: 200, new_customers: 1, asked: 6, yes: 1 },
      { week: 2, revenue: 0.1, new_customers: 0, asked: 4, yes: 0 },
      { week: 3, revenue: 0.2, new_customers: 2, asked: 9, yes: 3 },
    ] as Report[];
    for (const upTo of [0, 1, 2, 3, 999]) {
      expect(totals(reports, upTo)).toEqual(json(legacy.call('totals_', reports, upTo)));
    }
    expect(totals(reports, 2)).toEqual({
      revenue: 200.1,
      customers: 1,
      asked: 10,
      yes: 1,
      reportsSent: 2,
      weeksOpened: 2,
    });
  });
});

describe('latestSnapshot', () => {
  it('returns every row of the latest earlier week, like the original', () => {
    const legacy = loadLegacy(new FakeGoogle());
    const rows = [
      { _row: 2, week: 1, organisation: 'A' },
      { _row: 3, week: 3, organisation: 'A' },
      { _row: 4, week: 3, organisation: 'B' },
      { _row: 5, week: 2, organisation: 'C' },
    ] as Row[];
    for (const before of [0, 1, 2, 3, 4, 99]) {
      expect(latestSnapshot(rows, before)).toEqual(
        json(legacy.call('latestSnapshot_', rows, before)),
      );
    }
    expect(latestSnapshot(rows, 3).map((r) => r.organisation)).toEqual(['C']);
    expect(latestSnapshot(rows, 1)).toEqual([]);
  });
});
