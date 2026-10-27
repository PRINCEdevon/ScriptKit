// Baseline behaviour of emails and scheduled jobs, run against both legacy/Code.gs and the
// bundle. No real email is sent: MailApp is a fake that records messages.
import { describe, expect, it } from 'vitest';
import type { SentMail } from '../support/fake-google.js';
import {
  WEEK1_DUE,
  WEEK1_OPEN,
  WEEK1_TUESDAY,
  codeOf,
  startProgramme,
  submission,
} from '../support/programme.js';
import { runBoth } from '../support/runtime.js';

const envelope = ({ to, cc, subject }: SentMail) => ({ to, cc, subject });

describe('emails and scheduled jobs', () => {
  it('sends links, reminders, digests and replies to the right people', async () => {
    const { legacy, bundle } = await runBoth((app) => {
      startProgramme(app);
      app.call('menuEmailLinks');
      const links = app.google.mail.length;

      app.now = WEEK1_OPEN;
      app.post(
        submission(codeOf(app, 'Alpha'), { blocker: 'Need an introduction.', wants_reply: true }),
      );
      app.post(submission(codeOf(app, 'Delta'), { submitted_by: 'Finn Six', new_customers: '' }));

      app.now = WEEK1_DUE;
      app.call('autoMondayReminder');
      const reminders = app.google.mail.length - links;

      app.now = WEEK1_TUESDAY;
      app.call('autoDigests');

      app
        .table('Reports')
        .update({ Team: 'Alpha' }, { 'Your reply': 'A good start.', 'Send reply': true });
      app.call('menuSendReplies');
      app.call('menuSendReplies');
      // Delta has no founder emails (see docs/known-issues.md).
      app
        .table('Reports')
        .update({ Team: 'Delta' }, { 'Your reply': 'Keep going.', 'Send reply': true });
      app.call('menuSendReplies');

      return {
        links,
        reminders,
        snapshot: app.snapshot(),
        view: app.get(codeOf(app, 'Alpha')),
      };
    });

    expect(bundle).toEqual(legacy);

    const mail = legacy.snapshot.mail.map(envelope);
    expect(legacy.links).toBe(3);
    expect(mail.slice(0, 3)).toEqual([
      {
        to: 'ana@example.com,ben@example.com',
        cc: '',
        subject: 'Your URA report link: USSAVI Revenue Accelerator',
      },
      {
        to: 'cleo@example.com',
        cc: '',
        subject: 'Your URA report link: USSAVI Revenue Accelerator',
      },
      {
        to: 'dev@example.com',
        cc: '',
        subject: 'Your URA report link: USSAVI Revenue Accelerator',
      },
    ]);
    expect(legacy.reminders).toBe(2);
    expect(mail.slice(3, 5)).toEqual([
      { to: 'cleo@example.com', cc: '', subject: 'Your URA report is due today' },
      { to: 'dev@example.com', cc: '', subject: 'Your URA report is due today' },
    ]);
    expect(mail.slice(5, 8)).toEqual([
      {
        to: 'mentor1@example.com',
        cc: '',
        subject: 'URA report, week 1: Monday reports from your teams',
      },
      {
        to: 'mentor2@example.com',
        cc: '',
        subject: 'URA report, week 1: Monday reports from your teams',
      },
      { to: expect.any(String), cc: '', subject: 'URA report, week 1: summary of Monday reports' },
    ]);
    expect(mail.slice(8)).toEqual([
      {
        to: 'ana@example.com,ben@example.com',
        cc: 'mentor1@example.com',
        subject: 'URA report, week 1: a reply from Simon',
      },
    ]);
    expect(legacy.snapshot.mail[6]?.body).toContain('== Delta (Organisation) ==');
    // Current behaviour, recorded in docs/known-issues.md: the reply to Delta is counted as
    // sent although Delta has no email addresses.
    expect(legacy.snapshot.toasts.slice(-3)).toEqual([
      '1 reply sent.',
      'No ticked replies to send. Tick "Send reply" next to a reply first.',
      '1 reply sent.',
    ]);
    expect(legacy.view).toMatchObject({ history: [{ week: 1, reply: 'A good start.' }] });
  });

  it('holds back automatic emails on a pretend date unless test mode redirects them', async () => {
    const { legacy, bundle } = await runBoth((app) => {
      startProgramme(app);
      app.setting('pretend_today', '2026-12-07');
      app.call('autoMondayReminder');
      app.call('autoDigests');
      const heldBack = app.google.mail.length;

      app.setting('send_all_emails_to', 'inbox@example.com');
      app.call('autoMondayReminder');
      app.google.ui.buttons.push('NO');
      app.call('menuDigestsNow');
      app.call('menuRemindersNow');
      return { heldBack, snapshot: app.snapshot() };
    });

    expect(bundle).toEqual(legacy);
    expect(legacy.heldBack).toBe(0);
    expect(legacy.snapshot.logs).toEqual([
      'Automatic emails skipped: pretend_today is set and send_all_emails_to is empty.',
      'Automatic emails skipped: pretend_today is set and send_all_emails_to is empty.',
    ]);
    const mail = legacy.snapshot.mail;
    expect(mail).toHaveLength(6);
    expect(new Set(mail.map((m) => m.to))).toEqual(new Set(['inbox@example.com']));
    expect(mail[0]?.subject).toBe('[TEST] Your URA report is due today');
    expect(mail[0]?.body).toMatch(
      /^\[TEST: this email would have gone to ana@example.com,ben@example.com\]/,
    );
    expect(legacy.snapshot.dialogs.map((d) => d.title)).toEqual([
      'Send Tuesday digests now',
      'Send reminders now',
    ]);
    expect(legacy.snapshot.dialogs[1]?.message).toContain(
      'TEST MODE: every email goes to inbox@example.com only.',
    );
  });

  it('turns the automatic email triggers on and off', async () => {
    const { legacy, bundle } = await runBoth((app) => {
      startProgramme(app);
      app.call('menuEmailsOn');
      app.call('menuEmailsOn');
      const on = app.snapshot().triggers;
      app.call('menuEmailsOff');
      return { on, off: app.snapshot().triggers };
    });

    expect(bundle).toEqual(legacy);
    expect(legacy.on).toEqual([
      { handler: 'autoMondayReminder', everyDays: 1, atHour: 14, timeZone: 'Africa/Johannesburg' },
      { handler: 'autoDigests', weekDay: 'TUESDAY', atHour: 7, timeZone: 'Africa/Johannesburg' },
      { handler: 'autoDaily', everyDays: 1, atHour: 5, timeZone: 'Africa/Johannesburg' },
    ]);
    expect(legacy.off).toEqual([]);
  });

  // Desired behaviour once the issues in docs/known-issues.md are fixed in separate PRs.
  it.todo('sends each week’s Tuesday digest only once');
  it.todo('does not mark a reply as sent when the team has no email addresses');
});
