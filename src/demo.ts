/**
 * Demo data: seven made-up teams and sixteen reports over three weeks, recorded through the
 * normal report code so that the feedback, history and scoreboard can be tried. Demo teams have
 * IDs starting with DEMO; removing the demo data deletes every row with such an ID.
 */
import { appendTableRow, setSetting } from './config.js';
import { dayKey, parseDay, readWeeks, type Week } from './dates.js';
import type { PipelineEntry } from './pipeline.js';
import { recordReport, refreshReportLog, type CheckedReport } from './reports.js';
import { readTable, setCells, toast } from './sheets.js';
import { allTeams, createLinks } from './teams.js';
import type { Row } from './types.js';
import { toNumber } from './utils.js';

/** Menu: adds the demo data and sets pretend_today to the day week 3 opens. */
export function menuAddDemo(): void {
  const result = addDemo();
  toast(
    'Demo data added. The system now pretends today is ' +
      result.pretend +
      '. Open a demo team\'s "Report link" from the Teams tab to try the page.',
  );
}

/** Menu: removes the demo data and clears pretend_today. */
export function menuRemoveDemo(): void {
  removeDemo();
  setSetting('pretend_today', '');
  toast('Demo data removed, and the date is back to today.');
}

const answers = (
  by: string,
  revenue: number,
  customers: number,
  asked: number,
  yes: number,
  no: number,
  notYet: number,
  goalAsks: number,
  goalRevenue: number,
  said: string,
  call?: string,
) =>
  ({
    submitted_by: by,
    revenue,
    new_customers: customers,
    asked,
    yes,
    no,
    not_yet: notYet,
    goal_asks: goalAsks,
    goal_revenue: goalRevenue,
    customers_said: said,
    changing: '',
    goal_text: '',
    blocker: '',
    asked_names: '',
    wants_reply: 'No',
    mentor_call: call || 'Yes',
    mentor_note: '',
  }) as CheckedReport;

/** Replaces any demo data with a fresh copy. Returns the pretend date it sets. */
export function addDemo(): { pretend: string } {
  removeDemo();
  const demo: [id: string, name: string, track: string, founders: string][] = [
    ['DEMO1', 'Demo Direct team', 'Direct', 'Founder One, Founder Two'],
    ['DEMO2', 'Demo Organisation team', 'Organisation', 'Founder One, Founder Two, Founder Three'],
    ['DEMO3', 'Demo team: tutoring', 'Direct', 'A, B'],
    ['DEMO4', 'Demo team: hair products', 'Direct', 'A, B'],
    ['DEMO5', 'Demo team: laundry service', 'Direct', 'A, B'],
    ['DEMO6', 'Demo team: school software', 'Organisation', 'A, B'],
    ['DEMO7', 'Demo team: clinic booking', 'Organisation', 'A, B'],
  ];
  demo.forEach(([id, name, track, founders]) => {
    appendTableRow('teams', {
      team_id: id,
      team_name: name,
      track,
      status: 'Active',
      founders,
      notes: 'Demo data: remove with "Remove demo data".',
    });
  });
  createLinks();
  const weeks = readWeeks();
  const byId: Record<string, Row> = {};
  allTeams().forEach((team) => {
    byId[team.team_id as string] = team;
  });
  const plan: [
    id: string,
    week: number,
    report: CheckedReport,
    pipeline: [string, number, string][],
  ][] = [
    [
      'DEMO1',
      1,
      answers(
        'Founder One',
        200,
        1,
        6,
        1,
        3,
        2,
        10,
        400,
        'Salon owners like it but want to pay at month end.',
      ),
      [],
    ],
    [
      'DEMO1',
      2,
      answers('Founder Two', 500, 3, 9, 3, 2, 4, 15, 500, 'Two salons asked for a cheaper trial.'),
      [],
    ],
    [
      'DEMO3',
      1,
      answers('A', 0, 0, 8, 0, 6, 2, 12, 300, 'Parents want results before paying.', 'No'),
      [],
    ],
    [
      'DEMO3',
      2,
      answers('A', 300, 2, 12, 2, 7, 3, 15, 500, 'A free first session helped.', 'No'),
      [],
    ],
    [
      'DEMO4',
      1,
      answers('A', 450, 3, 10, 3, 5, 2, 15, 600, 'Price is fine; delivery is the issue.'),
      [],
    ],
    [
      'DEMO4',
      2,
      answers('A', 600, 4, 16, 4, 9, 3, 20, 800, 'Repeat buyers asked for bigger bottles.'),
      [],
    ],
    [
      'DEMO5',
      1,
      answers('A', 0, 0, 3, 0, 1, 2, 8, 200, 'Students do not trust a new service.'),
      [],
    ],
    [
      'DEMO2',
      1,
      answers('Founder One', 0, 0, 3, 1, 0, 2, 4, 0, 'Schools want to see it working first.'),
      [
        ['Secondary school, Soweto', 2, 'Demo to the deputy principal'],
        ['Private clinic, Braamfontein', 1, 'First meeting'],
        ['Municipal library service', 3, 'Proposal sent'],
      ],
    ],
    [
      'DEMO2',
      2,
      answers(
        'Founder Two',
        0,
        0,
        3,
        1,
        1,
        1,
        4,
        0,
        'The library needs approval from the budget committee.',
      ),
      [
        ['Secondary school, Soweto', 2, 'Waiting for a reply'],
        ['Private clinic, Braamfontein', 1, 'Second meeting booked'],
        ['Municipal library service', 3, 'Waiting for budget meeting'],
      ],
    ],
    [
      'DEMO6',
      1,
      answers('A', 0, 0, 4, 2, 1, 1, 5, 0, 'Principals like it; governing bodies decide.'),
      [
        ['School A', 2, ''],
        ['School B', 1, ''],
      ],
    ],
    [
      'DEMO6',
      2,
      answers('A', 0, 0, 5, 2, 2, 1, 5, 0, 'Governing body meets in January.'),
      [
        ['School A', 4, 'Head agreed'],
        ['School B', 2, ''],
        ['School C', 1, ''],
      ],
    ],
    [
      'DEMO7',
      1,
      answers('A', 0, 0, 2, 1, 0, 1, 4, 0, 'Clinics want a pilot.'),
      [['Clinic A', 1, '']],
    ],
    [
      'DEMO7',
      2,
      answers('A', 0, 0, 3, 1, 1, 1, 4, 0, 'Clinic A will try it for a month.'),
      [
        ['Clinic A', 3, 'Pilot price sent'],
        ['Clinic B', 1, ''],
      ],
    ],
    [
      'DEMO3',
      3,
      answers('A', 250, 1, 11, 1, 6, 4, 15, 500, 'Parents prefer weekly payments.', 'Yes'),
      [],
    ],
    ['DEMO4', 3, answers('A', 900, 5, 22, 5, 12, 5, 25, 1000, 'Hair salons want to stock it.'), []],
    [
      'DEMO6',
      3,
      answers('A', 0, 0, 4, 2, 1, 1, 5, 0, 'School A wants a letter template.'),
      [
        ['School A', 4, ''],
        ['School B', 3, 'Price sent'],
        ['School C', 2, ''],
      ],
    ],
  ];
  plan.forEach(([id, n, report, organisations]) => {
    const team = byId[id] as Row;
    // null rather than undefined when missing, so any error reads exactly as before.
    const week = (weeks.find((w) => w.week === n) ?? null) as Week;
    const pipeline: PipelineEntry[] = organisations.map(([organisation, stage, note]) => ({
      organisation,
      stage,
      note,
    }));
    const when = parseDay(dayKey(week.due));
    when.setHours(10, 15);
    recordReport(team, week, weeks, report, pipeline, [], when, false);
  });
  // One reply already sent, so the history shows how replies appear.
  const table = readTable('reports');
  const first = table.rows.find((r) => r.team_id === 'DEMO1' && toNumber(r.week) === 1);
  if (first) {
    setCells(table, first._row, {
      reply:
        'A real start: a paying customer in week 1. Next week, ask for payment in the first conversation, not the third.',
      reply_sent_at: new Date(),
    });
  }
  const week3 = (weeks.find((w) => w.week === 3) || weeks[weeks.length - 1]) as Week;
  const pretend = dayKey(week3.opens);
  setSetting('pretend_today', pretend);
  try {
    refreshReportLog();
  } catch {
    // The log is a convenience.
  }
  return { pretend };
}

/** Deletes every row whose team ID starts with DEMO from the Reports, Pipeline, Corrections and Teams tabs. */
export function removeDemo(): void {
  (['reports', 'pipeline', 'corrections', 'teams'] as const).forEach((key) => {
    const table = readTable(key);
    table.rows
      .filter((row) => /^DEMO/.test(String(row.team_id)))
      .map((row) => row._row)
      .sort((a, b) => b - a)
      .forEach((row) => table.sheet.deleteRow(row));
  });
  try {
    refreshReportLog();
  } catch {
    // The log is a convenience.
  }
}
