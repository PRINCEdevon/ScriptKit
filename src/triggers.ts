/**
 * The three time-driven triggers behind "Turn on automatic emails". Apps Script stores them
 * with the handler's name, so these names must never change.
 */
import { timeZone } from './dates.js';
import { refreshReportLog } from './reports.js';
import { toast } from './sheets.js';

const HANDLERS = ['autoMondayReminder', 'autoDigests', 'autoDaily'];

/** Menu: creates the triggers, replacing any this user already has. */
export function menuEmailsOn(): void {
  removeTriggers();
  ScriptApp.newTrigger('autoMondayReminder')
    .timeBased()
    .everyDays(1)
    .atHour(14)
    .inTimezone(timeZone())
    .create();
  ScriptApp.newTrigger('autoDigests')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.TUESDAY)
    .atHour(7)
    .inTimezone(timeZone())
    .create();
  ScriptApp.newTrigger('autoDaily')
    .timeBased()
    .everyDays(1)
    .atHour(5)
    .inTimezone(timeZone())
    .create();
  toast(
    'Automatic emails are on: reminders on due days at 14:00, digests on Tuesdays at 07:00 (' +
      timeZone() +
      ' time).',
  );
}

/** Menu: removes the triggers. */
export function menuEmailsOff(): void {
  removeTriggers();
  toast('Automatic emails are off.');
}

/**
 * Deletes this user's automatic email triggers. Apps Script only lists the current user's
 * triggers, so another editor's stay in place (docs/known-issues.md).
 */
export function removeTriggers(): void {
  ScriptApp.getProjectTriggers().forEach((trigger) => {
    if (HANDLERS.indexOf(trigger.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(trigger);
  });
}

/** Time-driven trigger, daily at 05:00: rebuilds the Report log. */
export function autoDaily(): void {
  refreshReportLog();
}
