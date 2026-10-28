/**
 * Emails: reminders on the due day, the Tuesday digests for mentors and the programme manager,
 * and the programme manager's replies to teams. Every email goes through sendMail, which
 * applies test mode (the send_all_emails_to setting) so that a test Sheet never emails anyone
 * else.
 */
import { money, reportName, settings } from '../shared/settings.js';
import {
  currentWeek,
  dayKey,
  longDate,
  rangeLabel,
  readWeeks,
  today,
  type Week,
} from '../shared/dates.js';
import { readReports } from '../reports/reports.js';
import { readTable, setCells, toast } from '../shared/sheets.js';
import { allTeams, isDemo, trackOf } from '../shared/teams.js';
import type { Report, Row } from '../shared/types.js';
import { listOf, toNumber } from '../shared/utils.js';

/**
 * Sends one email from the programme. In test mode it goes only to the test address, marked
 * [TEST], with a first line saying who it would have gone to.
 */
export function sendMail(to: string, cc: string, subject: string, body: string): void {
  const config = settings();
  const options: GoogleAppsScript.Mail.MailAdvancedParameters = {
    name: String(config.programme_name || 'Mashauri Revenue Accelerator'),
  };
  const redirect = String(config.send_all_emails_to || '').trim();
  if (redirect) {
    body =
      '[TEST: this email would have gone to ' +
      to +
      (cc ? ', copied to ' + cc : '') +
      ']\n\n' +
      body;
    subject = '[TEST] ' + subject;
    to = redirect;
    cc = '';
  }
  if (cc) options.cc = cc;
  if (config.contact_email) options.replyTo = String(config.contact_email);
  MailApp.sendEmail(to, subject, body, options);
}

/** One line saying where emails from this Sheet will go, for confirmation boxes. */
export function emailDestination(): string {
  const redirect = String(settings().send_all_emails_to || '').trim();
  return redirect
    ? 'TEST MODE: every email goes to ' + redirect + ' only.'
    : 'Emails go to the real addresses in the Teams tab.';
}

/**
 * Safety: while a pretend date is set, the automatic emails only run if every email is
 * redirected to a test address.
 */
export function autoEmailsBlocked(): boolean {
  const config = settings();
  if (
    String(config.pretend_today || '').trim() &&
    !String(config.send_all_emails_to || '').trim()
  ) {
    Logger.log('Automatic emails skipped: pretend_today is set and send_all_emails_to is empty.');
    return true;
  }
  return false;
}

/* ------------------------------- Reminders ------------------------------- */

/** Time-driven trigger, daily at 14:00: reminds teams that have not reported, on the due day only. */
export function autoMondayReminder(): void {
  const config = settings();
  if (String(config.reminders_on).toLowerCase() !== 'yes' || autoEmailsBlocked()) return;
  const current = currentWeek(readWeeks(), today());
  if (!current || dayKey(current.due) !== today()) return;
  sendReminders(current);
}

/**
 * The teams that have not yet sent this week's report and can be emailed (with founder
 * emails and a report link). Demo and stopped teams are left out.
 */
export function teamsMissing(current: Week): Row[] {
  const reports = readReports();
  return allTeams().filter((team) => {
    if (!team.team_name || String(team.status).toLowerCase() === 'stopped' || isDemo(team)) {
      return false;
    }
    if (reports.find((r) => r.team_id === team.team_id && r.week === current.week)) return false;
    return listOf(team.founder_emails).length && team.report_link;
  });
}

/** Emails each missing team its report link. Returns how many were sent. */
export function sendReminders(current: Week): number {
  const config = settings();
  const due = dayKey(current.due) === today();
  const when = due ? 'today' : 'on ' + longDate(current.due);
  const teams = teamsMissing(current);
  teams.forEach((team) => {
    sendMail(
      listOf(team.founder_emails).join(','),
      '',
      'Your ' + reportName() + ' is due ' + when,
      'Hello ' +
        team.team_name +
        ',\n\nYour report for week ' +
        current.week +
        ' (' +
        rangeLabel(current.covers_start, current.covers_end) +
        ') is due ' +
        when +
        '. It takes about seven minutes:\n' +
        team.report_link +
        '\n\n' +
        config.signoff,
    );
  });
  return teams.length;
}

/** Menu (Testing): sends this week's reminders now, after showing who will get them. */
export function menuRemindersNow(): void {
  const ui = SpreadsheetApp.getUi();
  const current = currentWeek(readWeeks(), today());
  if (!current) {
    ui.alert('No week is open yet (today counts as ' + today() + ').');
    return;
  }
  const teams = teamsMissing(current);
  if (!teams.length) {
    ui.alert(
      'Every team has sent its week ' + current.week + ' report, so there is nobody to remind.',
    );
    return;
  }
  const ok = ui.alert(
    'Send reminders now',
    'This sends the week ' +
      current.week +
      ' reminder to the ' +
      teams.length +
      (teams.length === 1 ? ' team' : ' teams') +
      ' that have not reported:\n\n' +
      teams.map((team) => '• ' + team.team_name).join('\n') +
      '\n\n' +
      emailDestination() +
      '\n\nContinue?',
    ui.ButtonSet.YES_NO,
  );
  if (ok !== ui.Button.YES) return;
  const sent = sendReminders(current);
  toast(sent + (sent === 1 ? ' reminder sent.' : ' reminders sent.'));
}

/* -------------------------------- Digests -------------------------------- */

/**
 * Time-driven trigger, Tuesdays at 07:00: digests for the open week. It does not check whether
 * that week's digest was already sent (docs/known-issues.md).
 */
export function autoDigests(): void {
  const config = settings();
  if (String(config.digests_on).toLowerCase() !== 'yes' || autoEmailsBlocked()) return;
  const current = currentWeek(readWeeks(), today());
  if (!current) return;
  sendDigests(current);
}

/**
 * Emails each mentor the week's reports from their teams, and the programme manager a summary
 * of every team. Demo and stopped teams are left out.
 */
export function sendDigests(current: Week): { mentors: number; summary: boolean } {
  const config = settings();
  const reports = readReports();
  const teams = allTeams().filter(
    (team) => String(team.status).toLowerCase() !== 'stopped' && !isDemo(team) && team.team_name,
  );
  // A plain object, as in the original, so mentors are emailed in the same order.
  const byMentor: Record<string, string[]> = {};
  const summary: string[] = [];
  teams.forEach((team) => {
    const report =
      reports.find((r) => r.team_id === team.team_id && r.week === current.week) ?? null;
    const text = digestBlock(team, report);
    summary.push(text);
    const mentor = String(team.mentor_email || '').trim();
    if (mentor) (byMentor[mentor] = byMentor[mentor] || []).push(text);
  });
  Object.keys(byMentor).forEach((mentor) => {
    const blocks = byMentor[mentor] as string[];
    sendMail(
      mentor,
      '',
      reportName() +
        ', week ' +
        current.week +
        ': Monday reports from your ' +
        (blocks.length === 1 ? 'team' : 'teams'),
      'Hello,\n\nHere is what your team sent for week ' +
        current.week +
        ' (' +
        rangeLabel(current.covers_start, current.covers_end) +
        ').\n\n' +
        blocks.join('\n\n') +
        '\n\nThank you for coaching them.\n' +
        config.signoff,
    );
  });
  if (config.admin_email && summary.length) {
    sendMail(
      String(config.admin_email),
      '',
      reportName() + ', week ' + current.week + ': summary of Monday reports',
      summary.join('\n\n') +
        '\n\nOpen the Reports tab and use "Revenue Accelerator > Show this week\'s reports" to reply.',
    );
  }
  return {
    mentors: Object.keys(byMentor).length,
    summary: !!(config.admin_email && summary.length),
  };
}

/** One team's part of a digest. */
export function digestBlock(team: Row, report: Report | null): string {
  const heading = '== ' + team.team_name + ' (' + trackOf(team) + ')';
  if (!report) return heading + ' ==\nNo report yet.';
  const lines = [heading + (report.late === 'Yes' ? ' – late' : '') + ' =='];
  lines.push(
    'Money received: ' +
      money(report.revenue) +
      (trackOf(team) === 'Direct'
        ? ' · new paying customers: ' + report.new_customers
        : ' · potential customers moved forward: ' + toNumber(report.orgs_moved)),
  );
  lines.push(
    'Asked: ' +
      report.asked +
      ' · yes ' +
      report.yes +
      ' · no ' +
      report.no +
      ' · not yet ' +
      report.not_yet,
  );
  lines.push('Customers said: ' + report.customers_said);
  if (report.changing) lines.push('Changing: ' + report.changing);
  lines.push(
    'Next week: ask ' +
      report.goal_asks +
      ', receive ' +
      money(report.goal_revenue) +
      (report.goal_text ? ' – ' + report.goal_text : ''),
  );
  if (report.blocker) {
    lines.push(
      'Blocker: ' + report.blocker + (report.wants_reply === 'Yes' ? ' (wants a reply)' : ''),
    );
  }
  lines.push(
    'Mentor call: ' + report.mentor_call + (report.mentor_note ? ' – ' + report.mentor_note : ''),
  );
  if (report.flags) lines.push('Flags: ' + report.flags);
  return lines.join('\n');
}

/** Menu (Testing): sends this week's digests now, after confirming. */
export function menuDigestsNow(): void {
  const ui = SpreadsheetApp.getUi();
  const current = currentWeek(readWeeks(), today());
  if (!current) {
    ui.alert('No week is open yet (today counts as ' + today() + ').');
    return;
  }
  const ok = ui.alert(
    'Send Tuesday digests now',
    'This sends the week ' +
      current.week +
      ' digest to every mentor in the Teams tab, and the summary to ' +
      (settings().admin_email || 'nobody (admin_email is empty)') +
      '.\n\n' +
      emailDestination() +
      '\n\nContinue?',
    ui.ButtonSet.YES_NO,
  );
  if (ok !== ui.Button.YES) return;
  const result = sendDigests(current);
  toast(
    result.mentors +
      ' mentor ' +
      (result.mentors === 1 ? 'digest' : 'digests') +
      (result.summary ? ' and your summary' : '') +
      ' sent.',
  );
}

/* -------------------------------- Replies -------------------------------- */

/**
 * Emails every reply ticked "Send reply" in the Reports tab that has not been sent yet, and
 * stamps it as sent. A team without founder emails gets no email, but its reply is still
 * stamped and counted (docs/known-issues.md). Returns how many were stamped.
 */
export function sendTickedReplies(): number {
  const table = readTable('reports');
  const config = settings();
  const teams = allTeams();
  let sent = 0;
  table.rows.forEach((row) => {
    if (row.send_reply !== true || !String(row.reply || '').trim() || row.reply_sent_at) return;
    const team = teams.find((t) => t.team_id === row.team_id);
    if (!team) return;
    const to = listOf(team.founder_emails).join(',');
    if (to) {
      const cc =
        String(config.cc_mentor_on_replies).toLowerCase() === 'yes'
          ? String(team.mentor_email || '')
          : '';
      sendMail(
        to,
        cc,
        reportName() + ', week ' + toNumber(row.week) + ': a reply from ' + config.signoff,
        'Hello ' +
          team.team_name +
          ',\n\n' +
          String(row.reply).trim() +
          '\n\nAll your reports and replies are here:\n' +
          team.report_link +
          '\n\n' +
          config.signoff,
      );
    }
    setCells(table, row._row, { reply_sent_at: new Date(), send_reply: false });
    sent++;
  });
  return sent;
}

/** Menu: Send ticked replies. */
export function menuSendReplies(): void {
  const sent = sendTickedReplies();
  toast(
    sent
      ? sent + (sent === 1 ? ' reply sent.' : ' replies sent.')
      : 'No ticked replies to send. Tick "Send reply" next to a reply first.',
  );
}
