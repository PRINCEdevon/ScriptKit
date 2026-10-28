// Emails run against fake MailApp only: nothing here can send a real email.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  autoDigests,
  autoMondayReminder,
  digestBlock,
  emailDestination,
  menuDigestsNow,
  menuRemindersNow,
  menuSendReplies,
  sendMail,
} from '../../src/email/email.js';
import { TABS } from '../../src/shared/sheets.js';
import type { Cell, Report, Row } from '../../src/shared/types.js';
import { FakeGoogle } from '../support/fake-google.js';
import { json, loadLegacy } from '../support/runtime.js';
import { tabValues } from '../support/seed.js';
import { twins } from '../support/twins.js';

afterEach(() => {
  vi.useRealTimers();
});

const DUE_DAY = '2026-12-07T14:00:00+02:00'; // week 1 is due on Monday 7 December
const TUESDAY = '2026-12-08T07:00:00+02:00';
const BEFORE_START = '2026-11-20T09:00:00+02:00';

function setSetting(google: FakeGoogle, key: string, value: Cell) {
  const sheet = google.spreadsheet.getSheetByName('Settings');
  sheet?.getRange(sheet.getLastRow() + 1, 1, 1, 2).setValues([[key, value]]);
}

function addReport(google: FakeGoogle, fields: Record<string, Cell>) {
  const sheet = google.spreadsheet.getSheetByName('Reports');
  const cols = TABS.reports.cols.map(([field]) => field);
  sheet
    ?.getRange(sheet.getLastRow() + 1, 1, 1, cols.length)
    .setValues([cols.map((f) => fields[f] ?? '')]);
}

const REPORTS: Record<string, Cell>[] = [
  {
    week: 1,
    team_id: 'T01',
    team_name: 'Alpha',
    late: 'Yes',
    revenue: 1250.5,
    new_customers: 2,
    asked: 6,
    yes: 2,
    no: 2,
    not_yet: 2,
    goal_asks: 10,
    goal_revenue: 500,
    goal_text: 'Ask salons',
    customers_said: 'Pay monthly.',
    changing: 'Invoices',
    blocker: 'Need an intro',
    wants_reply: 'Yes',
    mentor_call: 'Yes',
    mentor_note: 'Practised',
    flags: 'Late',
  },
  {
    week: 1,
    team_id: 'T03',
    team_name: 'Gamma',
    late: 'No',
    revenue: 0,
    asked: 3,
    yes: 1,
    no: 1,
    not_yet: 1,
    orgs_moved: 2,
    goal_asks: 5,
    goal_revenue: 0,
    customers_said: 'Pilot first.',
    mentor_call: 'No',
  },
  {
    week: 1,
    team_id: 104,
    team_name: 'Delta',
    late: 'No',
    revenue: 0,
    asked: 1,
    yes: 1,
    no: 0,
    not_yet: 0,
    customers_said: 'Stopped team.',
    mentor_call: 'Yes',
  },
];

/**
 * Runs `scenario` once against the typed modules and once against legacy/Code.gs, on twin
 * fakes holding the same programme, and returns everything each run produced.
 */
function compare(
  now: string,
  setup: (google: FakeGoogle) => void,
  typed: () => unknown,
  legacyCall: (legacy: ReturnType<typeof loadLegacy>) => unknown,
  buttons: string[] = [],
) {
  const fakes = twins(now);
  for (const google of [fakes.typed, fakes.original]) {
    setup(google);
    google.ui.buttons.push(...buttons);
  }
  const results = {
    typed: json(typed() ?? null),
    original: json(legacyCall(loadLegacy(fakes.original, now)) ?? null),
  };
  const observe = (google: FakeGoogle, result: unknown) =>
    json({
      result,
      mail: google.mail,
      dialogs: google.ui.dialogs,
      toasts: google.toasts,
      logs: google.logs,
      reports: tabValues(google, 'Reports').values,
    });
  const typedRun = observe(fakes.typed, results.typed);
  expect(typedRun).toEqual(observe(fakes.original, results.original));
  return typedRun;
}

const withReports = (google: FakeGoogle) => REPORTS.forEach((r) => addReport(google, r));

describe('sending email', () => {
  it.each([
    ['live', {}],
    ['test mode', { send_all_emails_to: ' inbox@example.com ' }],
    ['no programme name or contact', { programme_name: '', contact_email: '' }],
  ])('addresses, marks and signs mail like the original (%s)', (_name, settings) => {
    const setup = (google: FakeGoogle) =>
      Object.entries(settings).forEach(([key, value]) => setSetting(google, key, value));
    const mails: [string, string, string, string][] = [
      ['ana@example.com,ben@example.com', 'mentor1@example.com', 'Subject', 'Body'],
      ['cleo@example.com', '', 'No copy', 'Line 1\nLine 2'],
    ];
    const run = compare(
      DUE_DAY,
      setup,
      () => mails.forEach((mail) => sendMail(...mail)),
      (legacy) => mails.forEach((mail) => legacy.call('sendMail_', ...mail)),
    );
    expect(run.mail).toHaveLength(2);
    expect(emailDestination()).toBe(
      'send_all_emails_to' in settings
        ? 'TEST MODE: every email goes to inbox@example.com only.'
        : 'Emails go to the real addresses in the Teams tab.',
    );
  });
});

describe('reminders', () => {
  it.each([
    ['on the due day', DUE_DAY, {}],
    ['on another day', '2026-12-06T14:00:00+02:00', {}],
    ['when switched off', DUE_DAY, { reminders_on: 'No' }],
    ['on a pretend date without test mode', BEFORE_START, { pretend_today: '2026-12-07' }],
    [
      'on a pretend date in test mode',
      BEFORE_START,
      { pretend_today: '2026-12-07', send_all_emails_to: 'inbox@example.com' },
    ],
  ])('are sent like the original %s', (_name, now, settings) => {
    const run = compare(
      now,
      (google) => {
        withReports(google);
        Object.entries(settings).forEach(([key, value]) => setSetting(google, key, value));
      },
      () => autoMondayReminder(),
      (legacy) => legacy.call('autoMondayReminder'),
    );
    if (_name === 'on the due day') {
      // Alpha and Gamma reported; Delta is stopped; Epsilon has no email address.
      expect(run.mail.map((m: { to: string; subject: string }) => [m.to, m.subject])).toEqual([
        ['cleo@example.com', 'Your URA TEST report is due today'],
      ]);
    }
  });

  it.each([
    ['before any week opens', BEFORE_START, () => undefined, []],
    [
      'when everyone has reported',
      DUE_DAY,
      (g: FakeGoogle) => addReport(g, { week: 1, team_id: 'T02' }),
      [],
    ],
    ['when confirmed', DUE_DAY, () => undefined, ['YES']],
    ['when cancelled', DUE_DAY, () => undefined, ['NO']],
  ])('are sent from the menu like the original %s', (_name, now, extra, buttons) => {
    compare(
      now,
      (google) => {
        withReports(google);
        extra(google);
      },
      () => menuRemindersNow(),
      (legacy) => legacy.call('menuRemindersNow'),
      buttons,
    );
  });
});

describe('digests', () => {
  it.each([
    ['as configured', TUESDAY, {}],
    ['without an admin address', TUESDAY, { admin_email: '' }],
    ['when switched off', TUESDAY, { digests_on: 'no' }],
    ['before any week opens', BEFORE_START, {}],
  ])('are sent like the original %s', (_name, now, settings) => {
    const run = compare(
      now,
      (google) => {
        withReports(google);
        Object.entries(settings).forEach(([key, value]) => setSetting(google, key, value));
      },
      () => autoDigests(),
      (legacy) => legacy.call('autoDigests'),
    );
    if (_name === 'as configured') {
      expect(run.mail.map((m: { to: string }) => m.to)).toEqual([
        'mentor1@example.com',
        'mentor2@example.com',
        expect.any(String),
      ]);
    }
  });

  it.each([[['YES']], [['NO']]])('are sent from the menu like the original (%j)', (buttons) => {
    compare(
      TUESDAY,
      withReports,
      () => menuDigestsNow(),
      (legacy) => legacy.call('menuDigestsNow'),
      buttons,
    );
  });

  it('describe each team like the legacy digestBlock_', () => {
    const legacy = loadLegacy(new FakeGoogle());
    const teams: Row[] = [
      { _row: 2, team_name: 'Alpha', track: 'Direct' },
      { _row: 3, team_name: 'Gamma', track: 'Organisation' },
    ];
    const reports = [
      null,
      ...REPORTS,
      {
        ...REPORTS[0],
        changing: '',
        blocker: 'Stuck',
        wants_reply: 'No',
        mentor_note: '',
        goal_text: '',
        flags: '',
      },
    ];
    for (const team of teams) {
      for (const report of reports) {
        expect(digestBlock(team, report as Report | null)).toBe(
          legacy.call('digestBlock_', team, report),
        );
      }
    }
    expect(digestBlock(teams[0] as Row, REPORTS[0] as unknown as Report)).toBe(
      [
        '== Alpha (Direct) – late ==',
        'Money received: R1,251 · new paying customers: 2',
        'Asked: 6 · yes 2 · no 2 · not yet 2',
        'Customers said: Pay monthly.',
        'Changing: Invoices',
        'Next week: ask 10, receive R500 – Ask salons',
        'Blocker: Need an intro (wants a reply)',
        'Mentor call: Yes – Practised',
        'Flags: Late',
      ].join('\n'),
    );
  });
});

describe('replies', () => {
  const tick = (google: FakeGoogle) => {
    withReports(google);
    const sheet = google.spreadsheet.getSheetByName('Reports');
    const col = (field: string) => TABS.reports.cols.findIndex(([f]) => f === field) + 1;
    const replies: [number, string, boolean, Cell][] = [
      [2, 'A good start.', true, ''],
      [3, '  ', true, ''],
      [4, 'Sent before.', true, '2026-12-01'],
    ];
    for (const [row, reply, send, sentAt] of replies) {
      sheet?.getRange(row, col('reply')).setValue(reply);
      sheet?.getRange(row, col('send_reply')).setValue(send);
      sheet?.getRange(row, col('reply_sent_at')).setValue(sentAt);
    }
    addReport(google, {
      week: 1,
      team_id: 'T05',
      team_name: 'Epsilon',
      reply: 'No address.',
      send_reply: true,
    });
    addReport(google, {
      week: 1,
      team_id: 'T02',
      team_name: 'Beta',
      reply: 'Not ticked.',
      send_reply: false,
    });
  };

  it.each([[{}], [{ cc_mentor_on_replies: 'No' }], [{ send_all_emails_to: 'inbox@example.com' }]])(
    'are sent and stamped like the original (%j)',
    (settings) => {
      const run = compare(
        TUESDAY,
        (google) => {
          tick(google);
          Object.entries(settings).forEach(([key, value]) => setSetting(google, key, value));
        },
        () => menuSendReplies(),
        (legacy) => legacy.call('menuSendReplies'),
      );
      // Alpha is emailed; Epsilon has no address but is still stamped (docs/known-issues.md).
      expect(run.mail).toHaveLength(1);
      expect(run.toasts).toEqual(['2 replies sent.']);
    },
  );

  it('say so when nothing is ticked, like the original', () => {
    const run = compare(
      TUESDAY,
      withReports,
      () => menuSendReplies(),
      (legacy) => legacy.call('menuSendReplies'),
    );
    expect(run.toasts).toEqual([
      'No ticked replies to send. Tick "Send reply" next to a reply first.',
    ]);
  });
});
