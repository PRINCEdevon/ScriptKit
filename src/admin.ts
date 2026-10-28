/**
 * The Revenue Accelerator menu in the Sheet, and the menu items that are not part of another
 * feature: filtering the Reports tab, the Report log, team links and the permissions check.
 * The menu calls handlers by name, so every handler named here must be an entrypoint in main.ts.
 */
import { pageTemplateName, reportName, settings } from './config.js';
import { currentWeek, dayKey, longDate, readWeeks, today } from './dates.js';
import { parentFolder } from './drive.js';
import { emailDestination, sendMail } from './email.js';
import { LOG_TAB, refreshReportLog } from './reports.js';
import { readTable, setCells, spreadsheet, toast } from './sheets.js';
import { allTeams, createLinks, isDemo } from './teams.js';
import { listOf } from './utils.js';

/** Simple trigger: adds the Revenue Accelerator menu when the Sheet opens. */
export function onOpen(): void {
  SpreadsheetApp.getUi()
    .createMenu('Revenue Accelerator')
    .addItem("Show this week's reports", 'menuShowThisWeek')
    .addItem('Show all reports', 'menuShowAll')
    .addItem('Send ticked replies', 'menuSendReplies')
    .addItem('Refresh the report log', 'menuRefreshLog')
    .addSeparator()
    .addItem('Prepare the report page…', 'menuPreparePage')
    .addItem('Create missing team links', 'menuCreateLinks')
    .addItem('Email teams their links…', 'menuEmailLinks')
    .addSeparator()
    .addItem('Turn on automatic emails', 'menuEmailsOn')
    .addItem('Turn off automatic emails', 'menuEmailsOff')
    .addSeparator()
    .addItem('Add demo data', 'menuAddDemo')
    .addItem('Remove demo data', 'menuRemoveDemo')
    .addSubMenu(
      SpreadsheetApp.getUi()
        .createMenu('Testing')
        .addItem('Send reminders now…', 'menuRemindersNow')
        .addItem('Send Tuesday digests now…', 'menuDigestsNow'),
    )
    .addItem('Set up or repair the sheet', 'setup')
    .addItem('Check permissions', 'checkSetup')
    .addToUi();
}

/** Menu: filters the Reports tab to the open week. */
export function menuShowThisWeek(): void {
  const current = currentWeek(readWeeks(), today());
  const table = readTable('reports');
  const sheet = table.sheet;
  sheet.getFilter()?.remove();
  const range = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 2), sheet.getLastColumn());
  const filter = range.createFilter();
  if (current) {
    filter.setColumnFilterCriteria(
      table.col.week as number,
      SpreadsheetApp.newFilterCriteria().whenNumberEqualTo(current.week).build(),
    );
  }
  sheet.activate();
  toast(
    current
      ? 'Showing week ' +
          current.week +
          '. Type your reply in "Your reply", tick "Send reply", then use "Send ticked replies".'
      : 'No week is open yet.',
  );
}

/** Menu: removes the filter from the Reports tab. */
export function menuShowAll(): void {
  const sheet = readTable('reports').sheet;
  sheet.getFilter()?.remove();
  sheet.activate();
}

/** Menu: rebuilds the Report log and shows it. */
export function menuRefreshLog(): void {
  refreshReportLog();
  (spreadsheet().getSheetByName(LOG_TAB) as GoogleAppsScript.Spreadsheet.Sheet).activate();
}

/** Menu: gives new teams an ID and a private link, and updates links to the current address. */
export function menuCreateLinks(): void {
  const result = createLinks();
  const messages: string[] = [];
  if (result.made) {
    messages.push(
      result.made + ' new team ' + (result.made === 1 ? 'link' : 'links') + ' created.',
    );
  }
  if (result.changed) {
    messages.push(
      result.changed +
        ' existing ' +
        (result.changed === 1 ? 'link' : 'links') +
        ' updated to the address in Settings.',
    );
  }
  toast(messages.length ? messages.join(' ') : 'Every team already has an up-to-date link.');
}

/**
 * Menu: emails each team its private link, once. Teams whose "Link emailed at" is filled in
 * are skipped; in test mode the stamp is still written (docs/known-issues.md).
 */
export function menuEmailLinks(): void {
  createLinks();
  const ui = SpreadsheetApp.getUi();
  const config = settings();
  const table = readTable('teams');
  const targets = table.rows.filter(
    (team) =>
      team.team_name &&
      !isDemo(team) &&
      String(team.status).toLowerCase() !== 'stopped' &&
      listOf(team.founder_emails).length &&
      !team.link_sent_at,
  );
  if (!targets.length) {
    ui.alert(
      'There are no teams waiting for their link. (A team gets its link once; clear "Link emailed at" to send it again.)',
    );
    return;
  }
  const ok = ui.alert(
    'Email links',
    'This emails ' +
      targets.length +
      (targets.length === 1 ? ' team its' : ' teams their') +
      ' private report link:\n\n' +
      targets.map((team) => '• ' + team.team_name).join('\n') +
      '\n\n' +
      emailDestination() +
      '\n\nContinue?',
    ui.ButtonSet.YES_NO,
  );
  if (ok !== ui.Button.YES) return;
  const first = readWeeks()[0];
  targets.forEach((team) => {
    const names = listOf(team.founders).map((name) => name.split(' ')[0]);
    sendMail(
      listOf(team.founder_emails).join(','),
      '',
      'Your ' + reportName() + ' link: ' + config.programme_name,
      'Hello ' +
        (names.length ? names.join(', ') : team.team_name) +
        ',\n\n' +
        "This is your team's private link for the Monday report:\n" +
        team.report_link +
        '\n\n' +
        'Every Monday, one of you fills it in for the week before. It takes about seven minutes, and you get feedback straight away. ' +
        'Keep the link within your team: anyone who has it can report for you.\n\n' +
        (first
          ? 'Your first report opens on ' +
            longDate(first.opens) +
            ' and is due on ' +
            longDate(first.due) +
            '.\n\n'
          : '') +
        config.signoff,
    );
    setCells(table, team._row, { link_sent_at: new Date() });
  });
  toast('Links sent to ' + targets.length + (targets.length === 1 ? ' team.' : ' teams.'));
}

/**
 * Menu and script editor: checks that Google has given the script every permission it needs.
 * Running it from the editor makes Google ask for any that are missing.
 */
export function checkSetup(): string {
  const lines: string[] = [];
  let ok = true;
  const check = (label: string, fn: () => string) => {
    try {
      const extra = fn();
      lines.push('OK  ' + label + (extra ? ' (' + extra + ')' : ''));
    } catch (e) {
      ok = false;
      lines.push('NOT OK  ' + label + ': ' + ((e && (e as Error).message) || e));
    }
  };
  check(
    'Read and write this spreadsheet',
    () =>
      'Sheet "' + spreadsheet().getName() + '", ' + allTeams().length + ' teams in the Teams tab',
  );
  check('Use Google Drive (proof files, the report page)', () => {
    const folder = parentFolder();
    const found = folder.getFilesByName(pageTemplateName()).hasNext();
    return (
      'folder "' +
      folder.getName() +
      '"' +
      (found
        ? ', page template "' + pageTemplateName() + '" found'
        : ', page template "' + pageTemplateName() + '" NOT found')
    );
  });
  check('Send email', () => MailApp.getRemainingDailyQuota() + ' emails left today');
  check(
    'Run automatic emails',
    () => ScriptApp.getProjectTriggers().length + ' automatic jobs set',
  );
  const config = settings();
  lines.push('');
  lines.push(
    'This Sheet: ' +
      config.programme_name +
      ' (' +
      reportName() +
      '), page ' +
      config.report_page_url,
  );
  lines.push(emailDestination());
  if (String(config.pretend_today || '').trim()) {
    lines.push(
      'Pretend date is set to ' + dayKey(config.pretend_today) + '. Clear it before going live.',
    );
  }
  const message =
    (ok
      ? 'Everything is in place.'
      : 'Something is missing. Run checkSetup again and allow every permission Google asks for, ticking all the boxes if it shows a list.') +
    '\n\n' +
    lines.join('\n');
  Logger.log(message);
  try {
    SpreadsheetApp.getUi().alert(
      'Revenue Accelerator: permissions check',
      message,
      SpreadsheetApp.getUi().ButtonSet.OK,
    );
  } catch {
    // Run from the script editor: the message is in the log.
  }
  return message;
}
