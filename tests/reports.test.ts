import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSettingsCache } from '../src/config.js';
import { readWeeks, type Week } from '../src/dates.js';
import {
  readReports,
  recordReport,
  refreshReportLog,
  submitCorrection,
  submitReport,
  validateReport,
  type CheckedReport,
  type ReportBody,
} from '../src/reports.js';
import type { Cell, Row } from '../src/types.js';
import { FakeGoogle } from './support/fake-google.js';
import { json, loadLegacy, outcome, useFakeGoogle } from './support/runtime.js';
import { CODES, expectSameTabs, twins } from './support/twins.js';
import { seedTab, tabValues } from './support/seed.js';

afterEach(() => {
  vi.useRealTimers();
});

const answers = (fields: Record<string, unknown> = {}) => ({
  submitted_by: 'Ana One',
  revenue: '300',
  new_customers: '2',
  asked: '6',
  yes: '2',
  no: '2',
  not_yet: '2',
  goal_asks: '10',
  goal_revenue: '500',
  customers_said: 'They want to pay monthly.',
  changing: '',
  goal_text: '',
  blocker: '',
  asked_names: '',
  wants_reply: false,
  mentor_call: 'Yes',
  mentor_note: '',
  ...fields,
});

describe('reading reports', () => {
  it('parses numbers and turns team IDs into text, like the legacy reportsAll_', () => {
    const google = useFakeGoogle();
    seedTab(google, 'reports', [
      { week: '2', team_id: 104, revenue: 'R 1,500', asked: '', yes: 3 },
      { week: 1, team_id: 'T01', revenue: 99.5, goal_revenue: 'abc' },
    ]);
    const reports = readReports();
    expect(json(reports)).toEqual(json(loadLegacy(google).call('reportsAll_')));
    expect(reports[0]).toMatchObject({ week: 2, team_id: '104', revenue: 1500, asked: 0, yes: 3 });
  });
});

describe('validating a submission', () => {
  const direct: Row = { _row: 2, track: 'Direct', founders: 'Ana One, Ben Two' };
  const organisation: Row = { _row: 3, track: 'Organisation', founders: '' };
  const big = 'x'.repeat(7500001);
  const pipeline = (...rows: unknown[]) => ({
    report: answers({ submitted_by: 'Dev' }),
    pipeline: rows,
  });
  const cases: [Row, unknown][] = [
    [direct, { report: answers() }],
    [direct, {}],
    [direct, { report: answers({ submitted_by: '' }) }],
    [direct, { report: answers({ submitted_by: 'Someone Else' }) }],
    [organisation, { report: answers({ submitted_by: 'Anyone at all' }) }],
    [direct, { report: answers({ revenue: '' }) }],
    [direct, { report: answers({ asked: '-1' }) }],
    [direct, { report: answers({ new_customers: 'two' }) }],
    [organisation, { report: answers({ new_customers: 'two' }) }],
    [
      direct,
      { report: answers({ asked: '6.4', yes: '2.4', no: '2', not_yet: '2', revenue: '199.999' }) },
    ],
    [direct, { report: answers({ asked: '7' }) }],
    [direct, { report: answers({ customers_said: '   ' }) }],
    [direct, { report: answers({ mentor_call: 'yes' }) }],
    [
      direct,
      { report: answers({ mentor_call: 'No', wants_reply: 'on', mentor_note: 'n'.repeat(1200) }) },
    ],
    [
      organisation,
      pipeline(
        { organisation: 'Clinic', stage: '2', note: 'First call' },
        { organisation: ' ', stage: 'x' },
      ),
    ],
    [organisation, pipeline({ organisation: 'Clinic', stage: '6' })],
    [organisation, pipeline({ organisation: 'Clinic', stage: '-1' })],
    [organisation, pipeline({ organisation: 'Clinic', stage: '' })],
    [organisation, pipeline({ organisation: 'Clinic', stage: '2.6' })],
    [
      organisation,
      pipeline({ organisation: 'Clinic', stage: 1 }, { organisation: 'CLINIC', stage: 2 }),
    ],
    [organisation, pipeline({ organisation: 'constructor', stage: 1 })],
    [organisation, pipeline(null)],
    [
      organisation,
      pipeline(...Array.from({ length: 61 }, (_, i) => ({ organisation: `Org ${i}`, stage: 1 }))),
    ],
    [organisation, { report: answers({ submitted_by: 'Dev' }), pipeline: 'not a list' }],
    [direct, { report: answers(), files: [{ data: 'aGk=' }, {}, null] }],
    [direct, { report: answers(), files: [{ data: big }] }],
    [direct, { report: answers(), files: Array.from({ length: 6 }, () => ({ data: 'aGk=' })) }],
    [direct, { report: answers(), files: 'not a list' }],
  ];

  it('gives the same result or error as the legacy validate_ in every case', () => {
    const legacy = loadLegacy(new FakeGoogle());
    for (const [team, body] of cases) {
      const label = JSON.stringify(body).slice(0, 120);
      expect(
        outcome(() => validateReport(team, body as ReportBody)),
        label,
      ).toEqual(outcome(() => legacy.call('validate_', team, body)));
    }
  });

  it('cleans and rounds answers', () => {
    const result = validateReport(direct, cases[9]?.[1] as ReportBody);
    expect(result).toMatchObject({ report: { asked: 6, yes: 2, revenue: 200 }, pipeline: [] });
    const many = validateReport(
      organisation,
      pipeline({ organisation: '  Clinic ', stage: '2.6', note: 'n' }),
    );
    expect(many).toMatchObject({ pipeline: [{ organisation: 'Clinic', stage: 3, note: 'n' }] });
  });

  it('reports an organisation named "constructor" as listed twice (docs/known-issues.md)', () => {
    expect(
      validateReport(organisation, pipeline({ organisation: 'constructor', stage: 1 })),
    ).toEqual({
      error: 'constructor is listed twice.',
    });
  });
});

describe('recording reports', () => {
  const checked = (fields: Record<string, unknown>) =>
    ({ ...validReport, ...fields }) as unknown as CheckedReport;
  const validReport = {
    submitted_by: 'Ana One',
    revenue: 300,
    asked: 6,
    yes: 2,
    no: 2,
    not_yet: 2,
    goal_asks: 10,
    goal_revenue: 500,
    new_customers: 2,
    customers_said: 'Monthly, please.',
    changing: '',
    goal_text: '',
    blocker: '',
    asked_names: '',
    wants_reply: 'No',
    mentor_call: 'Yes',
    mentor_note: '',
  };
  const stage = (organisation: string, n: number) => ({ organisation, stage: n, note: '' });

  it('writes the same rows and feedback as the legacy recordReport_ over four weeks', () => {
    const { typed, original, legacy } = twins('2027-01-11T09:00:00+02:00');
    const teams = (google: FakeGoogle) => {
      const sheet = google.spreadsheet.getSheetByName('Teams');
      return sheet?.getDataRange().getValues() ?? [];
    };
    expect(teams(typed)).toEqual(teams(original));
    const team = (i: number) => {
      const legacyTeams = legacy.call('teamsAll_') as Row[];
      return json(legacyTeams[i]) as Row;
    };
    const weeks: Week[] = readWeeks();
    const plan: [number, number, Record<string, unknown>, ReturnType<typeof stage>[]][] = [
      [0, 1, {}, []],
      [
        1,
        1,
        { submitted_by: 'Cleo', asked: 3, yes: 0, no: 1, not_yet: 2, revenue: 0, new_customers: 0 },
        [],
      ],
      [
        2,
        1,
        {
          submitted_by: 'Dev Four',
          revenue: 0,
          new_customers: 0,
          asked: 3,
          yes: 1,
          no: 1,
          not_yet: 1,
        },
        [stage('Clinic A', 1), stage('School B', 2)],
      ],
      [3, 1, { submitted_by: 'Finn Six', revenue: 0, new_customers: 0 }, [stage('Depot D', 2)]],
      [0, 2, { revenue: 0, asked: 4, yes: 0, no: 3, not_yet: 1, mentor_call: 'No' }, []],
      [
        2,
        2,
        {
          submitted_by: 'Dev Four',
          revenue: 0,
          new_customers: 0,
          asked: 4,
          yes: 2,
          no: 1,
          not_yet: 1,
        },
        [stage('clinic a', 2), stage('School B', 2), stage('Library C', 1)],
      ],
      [3, 2, { submitted_by: 'Finn Six', revenue: 0, new_customers: 0 }, [stage('Depot D', 3)]],
      [
        2,
        3,
        {
          submitted_by: 'Dev Four',
          revenue: 0,
          new_customers: 0,
          asked: 5,
          yes: 0,
          no: 4,
          not_yet: 1,
        },
        [stage('Clinic A', 2), stage('School B', 2), stage('Library C', 0)],
      ],
      [0, 3, { revenue: 250, asked: 8, yes: 4, no: 2, not_yet: 2, mentor_call: 'No' }, []],
      [1, 4, { submitted_by: 'Cleo', revenue: 1200.5, asked: 5, yes: 5, no: 0, not_yet: 0 }, []],
    ];
    for (const [i, n, fields, pipeline] of plan) {
      const current = weeks.find((w) => w.week === n) as Week;
      const when = new Date(`2026-12-${String(n + 5).padStart(2, '0')}T08:00:00Z`);
      const late = n === 3;
      const proof = n === 1 ? ['https://drive.example/proof'] : null;
      const report = checked(fields);
      expect(
        json(recordReport(team(i), current, weeks, report, pipeline, proof, when, late)),
        `${i}/${n}`,
      ).toEqual(
        json(
          legacy.call(
            'recordReport_',
            team(i),
            json(current),
            weeks,
            report,
            pipeline,
            proof,
            when,
            late,
          ),
        ),
      );
    }
    expectSameTabs(typed, original);
    const reports = readReports();
    expect(reports).toHaveLength(10);
    expect(reports.find((r) => r.team_name === 'Gamma' && r.week === 3)?.flags).toContain(
      'Stuck potential customer',
    );
  });
});

describe('submissions and corrections', () => {
  const submit = (
    code: string,
    fields: Record<string, unknown> = {},
    extra: Record<string, unknown> = {},
  ) => ({ action: 'submit', t: code, report: answers(fields), ...extra }) as ReportBody;
  const steps: [string, ReportBody][] = [
    ['2026-12-05T12:00:00+02:00', submit(CODES.alpha)],
    ['2026-12-06T18:00:00+02:00', submit('short')],
    ['2026-12-06T18:00:00+02:00', submit('unknown-code-000000000000')],
    ['2026-12-06T18:00:00+02:00', submit(CODES.delta, { submitted_by: 'Finn Six' })],
    [
      '2026-12-06T18:00:00+02:00',
      submit(CODES.alpha, {}, { files: [{ name: 'r.png', type: 'image/png', data: 'aGk=' }] }),
    ],
    ['2026-12-06T18:00:00+02:00', submit(CODES.alpha)],
    ['2026-12-06T18:00:00+02:00', submit(CODES.beta, { submitted_by: 'Anyone', asked: '9' })],
    [
      '2026-12-07T23:30:00+02:00',
      submit(CODES.beta, {
        submitted_by: 'Anyone',
        asked: '0',
        yes: '0',
        no: '0',
        not_yet: '0',
        revenue: '0',
      }),
    ],
    [
      '2026-12-08T09:00:00+02:00',
      submit(
        CODES.gamma,
        { submitted_by: 'Dev Four', new_customers: '' },
        { pipeline: [{ organisation: 'Clinic A', stage: '1' }] },
      ),
    ],
    [
      '2026-12-08T09:00:00+02:00',
      {
        action: 'correct',
        t: CODES.alpha,
        week: '1',
        submitted_by: 'Ana One',
        note: 'Money was R350.',
      },
    ],
    [
      '2026-12-08T09:00:00+02:00',
      { action: 'correct', t: CODES.alpha, week: 2, note: 'No report that week.' },
    ],
    ['2026-12-08T09:00:00+02:00', { action: 'correct', t: CODES.alpha, week: 1, note: '  ' }],
    ['2026-12-08T09:00:00+02:00', { action: 'correct', t: 'nope', week: 1, note: 'x' }],
    [
      '2026-12-13T10:00:00+02:00',
      submit(CODES.alpha, { asked: '4', yes: '1', no: '2', not_yet: '1', revenue: '0' }),
    ],
  ];

  it('give the same answers and leave the same tabs and files as the originals', () => {
    const { typed, original } = twins(steps[0]?.[0] ?? '');
    for (const [now, body] of steps) {
      vi.setSystemTime(new Date(now));
      const legacy = loadLegacy(original, now); // a fresh run, as for each web request
      clearSettingsCache();
      const handler = body.action === 'correct' ? submitCorrection : submitReport;
      const legacyHandler = body.action === 'correct' ? 'submitCorrection_' : 'submitReport_';
      expect(
        outcome(() => handler(body)),
        `${now} ${JSON.stringify(body).slice(0, 60)}`,
      ).toEqual(outcome(() => legacy.call(legacyHandler, json(body))));
    }
    expectSameTabs(typed, original);
    expect(json(typed.drive.files.map((f) => f.name))).toEqual(
      json(original.drive.files.map((f) => f.name)),
    );
    const log = tabValues(typed, 'Report log').values;
    expect(log[0]).toEqual([
      'Team',
      'Track',
      'Status',
      'Week 1',
      'Week 2',
      'Week 3',
      'Week 4',
      'Sent',
      'Late',
      'Missing',
      'Mentor calls',
    ]);
    expect(log[1]).toEqual(['Alpha', 'Direct', 'Active', 'Sent', 'Sent', '', '', 2, 0, 0, 2]);
  });
});

describe('the Report log', () => {
  it.each(['2026-11-30', '2026-12-06', '2026-12-08', '2027-02-01'])(
    'on %s matches the legacy refreshReportLog_',
    (day) => {
      const now = `${day}T12:00:00+02:00`;
      const { typed, original, legacy } = twins(now);
      for (const google of [typed, original]) {
        const reports = google.spreadsheet.getSheetByName('Reports');
        const rows: Cell[][] = [
          [
            1,
            'Alpha',
            'Direct',
            '',
            'No',
            '',
            '',
            '',
            '',
            false,
            '',
            0,
            0,
            0,
            0,
            0,
            0,
            '',
            '',
            '',
            '',
            0,
            0,
            '',
            '',
            'Yes',
            '',
            '',
            '',
            '',
            'T01',
            'r1',
            '[]',
          ],
          [
            1,
            'Gamma',
            'Organisation',
            '',
            'Yes',
            '',
            '',
            '',
            '',
            false,
            '',
            0,
            0,
            0,
            0,
            0,
            0,
            '',
            '',
            '',
            '',
            0,
            0,
            '',
            '',
            'No',
            '',
            '',
            '',
            '',
            'T03',
            'r2',
            '[]',
          ],
        ];
        reports?.getRange(2, 1, rows.length, 33).setValues(rows);
      }
      refreshReportLog();
      legacy.call('refreshReportLog_');
      expect(tabValues(typed, 'Report log')).toEqual(tabValues(original, 'Report log'));
    },
  );
});
