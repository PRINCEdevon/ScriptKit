/**
 * The Organisation track's sales pipeline: each report lists potential customers and the stage
 * each has reached. The Pipeline tab keeps one row per organisation per week (a snapshot).
 */
import type { Row } from './types.js';

/** Stage names by number; stage 0 means the organisation dropped out. */
export const STAGE_NAMES = [
  'Dropped',
  '1 First meeting',
  '2 Shown the product',
  '3 Price or proposal sent',
  '4 Decision-maker agreed',
  '5 Signed or paid',
];

/** The most recent snapshot before `beforeWeek`: every row of the latest earlier week. */
export function latestSnapshot<T extends Row>(rows: T[], beforeWeek: number): T[] {
  const weeks = rows.map((row) => row.week).filter((week) => (week as number) < beforeWeek);
  if (!weeks.length) return [];
  const latest = Math.max(...(weeks as number[]));
  return rows.filter((row) => row.week === latest);
}
