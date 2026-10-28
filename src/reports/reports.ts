/**
 * Monday reports: reading them, checking a submission, recording it with its pipeline and
 * feedback, corrections, and the Report log tab. Each report is one row of the Reports tab.
 */
import { appendTableRow } from '../shared/settings.js';
import { currentWeek, dayKey, readWeeks, today, type Week } from '../shared/dates.js';
import { saveProof } from './proof-files.js';
import { buildFeedback, type Answers, type FeedbackItem } from '../feedback/rules.js';
import { STAGE_NAMES, pipelineProgress, type PipelineEntry } from '../shared/pipeline.js';
import { totals } from '../feedback/scoreboard.js';
import { readRows, readTable, spreadsheet } from '../shared/sheets.js';
import { allTeams, teamByToken, trackOf } from '../shared/teams.js';
import type { Report, Row, Track } from '../shared/types.js';
import { clean, listOf, parseNumber, toNumber } from '../shared/utils.js';

export const LOG_TAB = 'Report log';

/** A request from the report page: `report` and friends for a submission, `week` and `note` for a correction. */
export interface ReportBody {
  action?: unknown;
  t?: unknown;
  report?: Record<string, unknown>;
  pipeline?: unknown;
  files?: unknown;
  week?: unknown;
  note?: unknown;
  submitted_by?: unknown;
}

/** What doPost answers. */
export type Outcome = { ok: true } | { ok: false; error: string; message: string };

const NUMBER_FIELDS = [
  'week',
  'revenue',
  'new_customers',
  'asked',
  'yes',
  'no',
  'not_yet',
  'goal_asks',
  'goal_revenue',
];

/** Every report, with its numbers parsed and its team ID as text. */
export function readReports(): Report[] {
  return readTable('reports').rows.map((row) => {
    NUMBER_FIELDS.forEach((field) => {
      row[field] = toNumber(row[field]);
    });
    row.team_id = String(row.team_id);
    return row as Report;
  });
}

export function byWeek(a: { week: number }, b: { week: number }): number {
  return a.week - b.week;
}

/** The last report before `week`, from reports sorted by week. */
export function lastBefore<T extends { week: number }>(reports: T[], week: number): T | null {
  let previous: T | null = null;
  reports.forEach((report) => {
    if (report.week < week) previous = report;
  });
  return previous;
}

/** A submission's answers after checking: text cleaned, numbers parsed and rounded. */
export type CheckedReport = Answers & {
  submitted_by: string;
  customers_said: string;
  changing: string;
  goal_text: string;
  blocker: string;
  asked_names: string;
  wants_reply: 'Yes' | 'No';
  mentor_note: string;
};

/**
 * Checks a submission. Returns the first problem as a message for the team, or the cleaned
 * report and pipeline. Counts are rounded to whole numbers and money to cents.
 */
export function validateReport(
  team: Row,
  body: ReportBody,
): { error: string } | { report: CheckedReport; pipeline: PipelineEntry[] } {
  const r: Record<string, unknown> = body.report || {};
  const track = trackOf(team);
  const out: Record<string, unknown> = {};
  const founders = listOf(team.founders);
  out.submitted_by = clean(r.submitted_by, 120);
  if (!out.submitted_by) return { error: 'Please say who is filling in the report.' };
  if (founders.length && founders.indexOf(out.submitted_by as string) < 0) {
    return { error: 'Please choose your name from the list.' };
  }

  const numbers = ['revenue', 'asked', 'yes', 'no', 'not_yet', 'goal_asks', 'goal_revenue'];
  if (track === 'Direct') numbers.push('new_customers');
  for (const field of numbers) {
    const value = parseNumber(r[field]);
    if (value === null || value < 0) {
      return { error: 'Please enter a number (zero or more) for every number question.' };
    }
    out[field] =
      field === 'revenue' || field === 'goal_revenue'
        ? Math.round(value * 100) / 100
        : Math.round(value);
  }
  if (track !== 'Direct') out.new_customers = 0;
  const count = (field: string) => out[field] as number;
  if (count('yes') + count('no') + count('not_yet') !== count('asked')) {
    return {
      error:
        'In question 2, "said yes", "said no" and "not yet" must add up to the number you asked.',
    };
  }

  out.customers_said = clean(r.customers_said, 2000);
  if (!out.customers_said) {
    return { error: 'Please tell us the most important thing customers told you (question 3).' };
  }
  out.changing = clean(r.changing, 2000);
  out.goal_text = clean(r.goal_text, 500);
  out.blocker = clean(r.blocker, 2000);
  out.asked_names = clean(r.asked_names, 2000);
  out.wants_reply = r.wants_reply ? 'Yes' : 'No';
  out.mentor_call = r.mentor_call === 'Yes' ? 'Yes' : r.mentor_call === 'No' ? 'No' : '';
  if (!out.mentor_call) return { error: 'Please answer the mentor call question (question 6).' };
  out.mentor_note = clean(r.mentor_note, 1000);

  const pipeline: PipelineEntry[] = [];
  if (track === 'Organisation') {
    const rows: Record<string, unknown>[] = Array.isArray(body.pipeline) ? body.pipeline : [];
    if (rows.length > 60) return { error: 'Please list no more than 60 potential customers.' };
    // A plain object, as in the original (docs/known-issues.md).
    const seen: Record<string, unknown> = {};
    for (const row of rows) {
      const organisation = clean((row as Record<string, unknown>).organisation, 120);
      const stage = parseNumber(row.stage);
      if (!organisation) continue;
      if (stage === null || stage < 0 || stage > 5) {
        return { error: 'Please choose a stage for ' + organisation + '.' };
      }
      const key = organisation.toLowerCase();
      if (seen[key]) return { error: organisation + ' is listed twice.' };
      seen[key] = true;
      pipeline.push({ organisation, stage: Math.round(stage), note: clean(row.note, 300) });
    }
  }
  const files: Record<string, unknown>[] = Array.isArray(body.files) ? body.files : [];
  if (files.length > 5) return { error: 'Please add no more than five proof files at a time.' };
  for (const file of files) {
    // About 5.6 MB once decoded; see docs/known-issues.md.
    if (!file || !file.data || String(file.data).length > 7500000) {
      return { error: 'Each proof file must be smaller than 5 MB.' };
    }
  }
  return { report: out as CheckedReport, pipeline };
}

/**
 * Stores a checked report, its pipeline and its feedback, and returns the feedback. The demo
 * data records its reports through this too.
 */
export function recordReport(
  team: Row,
  current: Week,
  weeks: Week[],
  rep: CheckedReport,
  pipeline: PipelineEntry[],
  proofLinks: string[] | null,
  when: Date,
  late: boolean,
): FeedbackItem[] {
  const track = trackOf(team);
  const reports = readReports();
  const mine = reports.filter((r) => r.team_id === team.team_id).sort(byWeek);
  const prev = lastBefore(mine, current.week);
  const before = totals(
    mine.filter((r) => r.week < current.week),
    999,
  );
  const history = readRows('pipeline').filter((row) => row.team_id === team.team_id);
  const { moved, added, furthest, stuck } = pipelineProgress(
    pipeline,
    history,
    current.week,
    track,
  );

  // Cohort: reports already in for this week on the same track, plus this one. Keyed by a plain
  // object, as in the original, so a numeric team ID matches its text form.
  const trackOfTeam: Record<string, Track> = {};
  allTeams().forEach((t) => {
    trackOfTeam[t.team_id as string] = trackOf(t);
  });
  const cohort = reports.filter(
    (r) =>
      r.week === current.week && trackOfTeam[r.team_id] === track && r.team_id !== team.team_id,
  );

  const feedback = buildFeedback({
    track,
    week: current.week,
    weeks,
    rep,
    prev,
    before,
    moved,
    added,
    furthest,
    stuck,
    pipelineCount: pipeline.length,
    cohortAsked: cohort.map((r) => r.asked).concat([rep.asked]),
    cohortMoved: cohort.map((r) => r.orgs_moved as number).concat([moved]),
    late,
  });

  appendTableRow('reports', {
    week: current.week,
    team_name: team.team_name,
    track,
    submitted_at: when,
    late: late ? 'Yes' : 'No',
    submitted_by: rep.submitted_by,
    flags: feedback
      .filter((f) => f.flag)
      .map((f) => f.flag)
      .join(' · '),
    wants_reply: rep.wants_reply,
    reply: '',
    send_reply: false,
    reply_sent_at: '',
    revenue: rep.revenue,
    new_customers: rep.new_customers,
    asked: rep.asked,
    yes: rep.yes,
    no: rep.no,
    not_yet: rep.not_yet,
    orgs_moved: track === 'Organisation' ? moved : '',
    orgs_added: track === 'Organisation' ? added : '',
    customers_said: rep.customers_said,
    changing: rep.changing,
    goal_asks: rep.goal_asks,
    goal_revenue: rep.goal_revenue,
    goal_text: rep.goal_text,
    blocker: rep.blocker,
    mentor_call: rep.mentor_call,
    mentor_note: rep.mentor_note,
    asked_names: rep.asked_names,
    proof_links: (proofLinks || []).join('\n'),
    feedback_text: feedback.map((f) => f.lead + (f.detail ? ' ' + f.detail : '')).join('\n'),
    team_id: team.team_id,
    report_id: Utilities.getUuid().slice(0, 8),
    feedback_json: JSON.stringify(feedback),
  });
  pipeline.forEach((entry) => {
    appendTableRow('pipeline', {
      week: current.week,
      team_id: team.team_id,
      team_name: team.team_name,
      organisation: entry.organisation,
      stage: entry.stage,
      stage_name: STAGE_NAMES[entry.stage],
      note: entry.note,
      submitted_at: when,
    });
  });
  return feedback;
}

/**
 * Handles a submission from the report page: one report per team per week, while a week is
 * open. Holds the script lock so that two sends at once cannot both pass the duplicate check.
 */
export function submitReport(body: ReportBody): Outcome {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const team = teamByToken(String(body.t || ''));
    if (!team) return { ok: false, error: 'link', message: 'This link does not work.' };
    if (String(team.status).toLowerCase() === 'stopped') {
      return { ok: false, error: 'stopped', message: 'Your team is no longer reporting.' };
    }
    const weeks = readWeeks();
    const day = today();
    const current = currentWeek(weeks, day);
    if (!current) return { ok: false, error: 'closed', message: 'Reports are not open yet.' };
    const already = readReports().find(
      (r) => r.team_id === team.team_id && r.week === current.week,
    );
    if (already) {
      return {
        ok: false,
        error: 'duplicate',
        message:
          'Your team has already sent the report for week ' +
          current.week +
          '. Reload the page to see it.',
      };
    }

    const checked = validateReport(team, body);
    if ('error' in checked) return { ok: false, error: 'invalid', message: checked.error };

    // Files are saved before the rows are written, with no rollback (docs/known-issues.md).
    const proofLinks = saveProof(team, current.week, body.files || []);
    const late = day > dayKey(current.due);
    recordReport(
      team,
      current,
      weeks,
      checked.report,
      checked.pipeline,
      proofLinks,
      new Date(),
      late,
    );
    try {
      refreshReportLog();
    } catch {
      // The log is a convenience; never fail a submission over it.
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Adds a team's correction note to one of its reports. Unlike submissions it does not take
 * the script lock (docs/known-issues.md).
 */
export function submitCorrection(body: ReportBody): Outcome {
  const team = teamByToken(String(body.t || ''));
  if (!team) return { ok: false, error: 'link', message: 'This link does not work.' };
  const week = parseNumber(body.week);
  const note = clean(body.note, 1000);
  if (!note) return { ok: false, error: 'invalid', message: 'Please write the correction.' };
  const exists = readReports().find((r) => r.team_id === team.team_id && r.week === week);
  if (!exists) return { ok: false, error: 'invalid', message: 'There is no report for that week.' };
  appendTableRow('corrections', {
    submitted_at: new Date(),
    team_id: team.team_id,
    team_name: team.team_name,
    week,
    submitted_by: clean(body.submitted_by, 120),
    note,
  });
  return { ok: true };
}

/**
 * Rebuilds the Report log tab: one row per team, one column per week (Sent, Late, Missing or
 * Open), then counts. Runs after every report, daily, and from the menu.
 */
export function refreshReportLog(): void {
  const ss = spreadsheet();
  const sheet = ss.getSheetByName(LOG_TAB) || ss.insertSheet(LOG_TAB);
  const weeks = readWeeks();
  const day = today();
  const reports = readReports();
  const teams = allTeams().filter((team) => team.team_name);
  const header = ['Team', 'Track', 'Status'].concat(
    weeks.map((week) => 'Week ' + week.week),
    ['Sent', 'Late', 'Missing', 'Mentor calls'],
  );
  const rows = teams.map((team) => {
    let sent = 0;
    let late = 0;
    let missing = 0;
    let calls = 0;
    const cells = weeks.map((week) => {
      const report = reports.find((r) => r.team_id === team.team_id && r.week === week.week);
      if (report) {
        sent++;
        if (report.late === 'Yes') late++;
        if (report.mentor_call === 'Yes') calls++;
        return report.late === 'Yes' ? 'Late' : 'Sent';
      }
      if (dayKey(week.due) < day) {
        missing++;
        return 'Missing';
      }
      if (dayKey(week.opens) <= day) return 'Open';
      return '';
    });
    return [team.team_name, trackOf(team), team.status || 'Active'].concat(cells, [
      sent,
      late,
      missing,
      calls,
    ]);
  });
  sheet.clearContents();
  sheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
  if (rows.length) sheet.getRange(2, 1, rows.length, header.length).setValues(rows);
  sheet.setFrozenRows(1);
  sheet
    .getRange(1, 1, 1, 1)
    .setNote('Rebuilt automatically each day and after every report. Do not type in this tab.');
}
