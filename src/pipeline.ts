/**
 * The Organisation track's sales pipeline: each report lists potential customers and the stage
 * each has reached. The Pipeline tab keeps one row per organisation per week (a snapshot).
 */
import type { Row, Track } from './types.js';

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

/** One potential customer in a submitted report (organisation names are already cleaned). */
export interface PipelineEntry {
  organisation: string;
  stage: number;
  note?: string;
}

/** A week's snapshot as lowercased organisation name → stage. */
export function snapshotFor(rows: Row[], week: number): Record<string, unknown> {
  const stages: Record<string, unknown> = {};
  rows.forEach((row) => {
    if (row.week === week) stages[String(row.organisation).toLowerCase()] = row.stage;
  });
  return stages;
}

export interface PipelineProgress {
  /** Organisations that moved to a later stage (not counting drops to stage 0). */
  moved: number;
  /** Organisations that were not in the previous snapshot. */
  added: number;
  /** The furthest stage any organisation has reached. */
  furthest: number;
  /** Organisations at the same stage (1 to 4) for three reports in a row. Organisation track only. */
  stuck: PipelineEntry[];
}

/**
 * How a report's pipeline compares with the team's earlier Pipeline rows (`history`, with
 * numeric weeks and stages). Organisations are matched by name, ignoring case.
 */
export function pipelineProgress(
  pipeline: PipelineEntry[],
  history: Row[],
  week: number,
  track: Track,
): PipelineProgress {
  // Plain objects and own-property checks, as in the original.
  const previous: Record<string, unknown> = {};
  latestSnapshot(history, week).forEach((row) => {
    previous[String(row.organisation).toLowerCase()] = row.stage;
  });
  let moved = 0;
  let added = 0;
  let furthest = 0;
  pipeline.forEach((entry) => {
    const key = entry.organisation.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(previous, key)) {
      if (entry.stage > (previous[key] as number) && entry.stage > 0) moved++;
    } else {
      added++;
    }
    if (entry.stage > furthest) furthest = entry.stage;
  });
  const stuck: PipelineEntry[] = [];
  if (track === 'Organisation') {
    const weeks = history.map((row) => row.week as number);
    const earlier = weeks
      .filter((w, i) => weeks.indexOf(w) === i)
      .filter((w) => w < week)
      .sort((a, b) => b - a);
    if (earlier.length >= 2) {
      const last = snapshotFor(history, earlier[0] as number);
      const before = snapshotFor(history, earlier[1] as number);
      pipeline.forEach((entry) => {
        const key = entry.organisation.toLowerCase();
        const stage = entry.stage;
        if (stage > 0 && stage < 5 && last[key] === stage && before[key] === stage)
          stuck.push(entry);
      });
    }
  }
  return { moved, added, furthest, stuck };
}
