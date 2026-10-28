/**
 * Dates and the reporting schedule. Days are compared as "yyyy-MM-dd" strings in the
 * programme's time zone (the time_zone setting), and the pretend_today setting can stand in for
 * today while testing.
 */
import { DEFAULT_TZ, settings } from './settings.js';
import { readTable } from './sheets.js';
import type { Row } from './types.js';
import { toNumber } from './utils.js';

/** A row of the Weeks tab, with its week number as a number. */
export interface Week extends Row {
  week: number;
}

/** True for Date objects, including ones made in another script scope (instanceof is not). */
function isDate(value: unknown): value is Date {
  return Object.prototype.toString.call(value) === '[object Date]';
}

/** The programme's time zone from Settings, or the default if it is not a valid zone name. */
export function timeZone(): string {
  const zone = String(settings().time_zone || '').trim();
  return /^[A-Za-z_]+\/[A-Za-z_\-/]+$|^UTC$/.test(zone) ? zone : DEFAULT_TZ;
}

/** Today as "yyyy-MM-dd" in the programme's time zone, or the pretend_today setting if set. */
export function today(): string {
  const pretend = settings().pretend_today;
  if (pretend) {
    const day = dayKey(pretend);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  }
  return Utilities.formatDate(new Date(), timeZone(), 'yyyy-MM-dd');
}

/** A date cell (or typed date) as "yyyy-MM-dd"; text is cut to its first ten characters. */
export function dayKey(value: unknown): string {
  if (!value) return '';
  if (isDate(value)) return Utilities.formatDate(value, timeZone(), 'yyyy-MM-dd');
  return String(value).trim().slice(0, 10);
}

/**
 * "yyyy-MM-dd" as a Date at noon in the script's time zone. Noon keeps the same calendar day
 * when the date is shown in a nearby time zone.
 */
export function parseDay(day: string): Date {
  const [year, month, date] = day.split('-');
  return new Date(Number(year), Number(month) - 1, Number(date), 12);
}

/** [year, month, day] as a Date at noon (see parseDay). */
export function noonDate([year, month, day]: [number, number, number]): Date {
  return new Date(year, month - 1, day, 12);
}

export function asDate(value: unknown): Date {
  return isDate(value) ? value : parseDay(dayKey(value));
}

/** For example "Monday 7 December". */
export function longDate(value: unknown): string {
  return value ? Utilities.formatDate(asDate(value), timeZone(), 'EEEE d MMMM') : '';
}

/** For example "1 to 6 December", or "28 December to 3 January". */
export function rangeLabel(from: unknown, to: unknown): string {
  const start = asDate(from);
  const end = asDate(to);
  const zone = timeZone();
  const sameMonth =
    Utilities.formatDate(start, zone, 'MM') === Utilities.formatDate(end, zone, 'MM');
  return (
    Utilities.formatDate(start, zone, sameMonth ? 'd' : 'd MMMM') +
    ' to ' +
    Utilities.formatDate(end, zone, 'd MMMM')
  );
}

/** A timestamp for people, for example "10:15 on Monday 7 December". */
export function stampLabel(value: unknown): string {
  if (isDate(value)) return Utilities.formatDate(value, timeZone(), "HH:mm 'on' EEEE d MMMM");
  return String(value || '');
}

/** The Weeks tab: weeks with a number and an opening date, in order. */
export function readWeeks(): Week[] {
  return readTable('weeks')
    .rows.map((row) => {
      row.week = toNumber(row.week);
      return row as Week;
    })
    .filter((week) => week.week > 0 && week.opens)
    .sort((a, b) => a.week - b.week);
}

/**
 * The week whose report is open: the last week that has opened by `today`. It stays open after
 * the final week, until another week is added (docs/known-issues.md).
 */
export function currentWeek(weeks: Week[], today: string): Week | null {
  let current: Week | null = null;
  for (const week of weeks) {
    if (dayKey(week.opens) <= today) current = week;
  }
  return current;
}

/** When the week 6 checkpoint starts, for example "Monday 18 January". */
export function checkpointLabel(weeks: Week[]): string {
  const week6 = weeks.find((week) => week.week === 6);
  return week6 ? longDate(week6.covers_start) : 'week 6';
}
