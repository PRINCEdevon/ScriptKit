/**
 * The web app the report page talks to (see web/README.md). GET returns everything a team's
 * page shows; POST takes a report or a correction. Every answer is JSON, and errors are
 * answered as { ok: false, error, message } rather than thrown.
 */
import { currency, settings, shortName } from '../shared/settings.js';
import {
  checkpointLabel,
  currentWeek,
  longDate,
  rangeLabel,
  readWeeks,
  stampLabel,
  today,
  type Week,
} from '../shared/dates.js';
import { STAGE_NAMES, latestSnapshot } from '../shared/pipeline.js';
import {
  byWeek,
  lastBefore,
  readReports,
  submitCorrection,
  submitReport,
  type ReportBody,
} from './reports.js';
import { scoreboard, totals } from '../feedback/scoreboard.js';
import { readRows } from '../shared/sheets.js';
import { teamByToken, trackOf } from '../shared/teams.js';
import { listOf, toNumber } from '../shared/utils.js';

type TextOutput = GoogleAppsScript.Content.TextOutput;

export function doGet(e?: GoogleAppsScript.Events.DoGet): TextOutput {
  try {
    const p = (e && e.parameter) || {};
    if (p.action === 'get') return json(teamView(String(p.t || '')));
    return json({ ok: false, error: 'unknown', message: 'Nothing to see here.' });
  } catch (err) {
    return json({ ok: false, error: 'server', message: errorMessage(err) });
  }
}

export function doPost(e?: GoogleAppsScript.Events.DoPost): TextOutput {
  try {
    const body: ReportBody = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action === 'submit') return json(submitReport(body));
    if (body.action === 'correct') return json(submitCorrection(body));
    return json({ ok: false, error: 'unknown', message: 'Unknown request.' });
  } catch (err) {
    return json({ ok: false, error: 'server', message: errorMessage(err) });
  }
}

function errorMessage(err: unknown): string {
  return String((err && (err as Error).message) || err);
}

function json(value: unknown): TextOutput {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function parseJson(text: unknown, fallback: unknown): unknown {
  try {
    return JSON.parse(String(text));
  } catch {
    return fallback;
  }
}

/** A reporting week as the page shows it. */
export function weekInfo(week: Week) {
  return {
    n: week.week,
    covers: rangeLabel(week.covers_start, week.covers_end),
    due: longDate(week.due),
    opens: longDate(week.opens),
    phase: String(week.scoreboard || 'Activity'),
  };
}

/**
 * Everything a team's page shows: its status this week (not_started, open, submitted or
 * stopped), last week's goals, its pipeline, totals, history with replies and corrections, and
 * the scoreboard. An unknown code gets { ok: false, error: 'link' }.
 */
export function teamView(token: string) {
  const config = settings();
  const team = teamByToken(token);
  if (!team) {
    return {
      ok: false,
      error: 'link',
      message: 'This link does not work.',
      contact: config.contact_email,
    };
  }

  const weeks = readWeeks();
  const day = today();
  const current = currentWeek(weeks, day);
  const reports = readReports();
  const mine = reports.filter((r) => r.team_id === team.team_id).sort(byWeek);
  const thisReport = current ? (mine.find((r) => r.week === current.week) ?? null) : null;

  let status = 'open';
  if (String(team.status).toLowerCase() === 'stopped') status = 'stopped';
  else if (!current) status = 'not_started';
  else if (thisReport) status = 'submitted';

  const beforeWeek = current ? current.week : 999;
  const prev = lastBefore(mine, beforeWeek);
  const history = readRows('pipeline').filter((row) => row.team_id === team.team_id);
  // Once this week's report is in, the page shows the pipeline it sent.
  const snapshotWeek = status === 'submitted' ? beforeWeek + 1 : beforeWeek;
  const snapshot = latestSnapshot(history, snapshotWeek).filter((row) => (row.stage as number) > 0);

  const corrections = readRows('corrections').filter((c) => c.team_id === team.team_id);
  const past = mine
    .slice()
    .reverse()
    .map((r) => ({
      week: r.week,
      late: r.late === 'Yes',
      asked: r.asked,
      yes: r.yes,
      no: r.no,
      not_yet: r.not_yet,
      revenue: r.revenue,
      new_customers: r.new_customers,
      moved: r.orgs_moved,
      reply: r.reply_sent_at ? String(r.reply || '') : '',
      corrections: corrections
        .filter((c) => toNumber(c.week) === r.week)
        .map((c) => String(c.note)),
    }));

  return {
    ok: true,
    programme: config.programme_name,
    shortName: shortName(),
    currency: currency(),
    contact: config.contact_email,
    team: { name: team.team_name, track: trackOf(team), founders: listOf(team.founders) },
    status,
    week: current ? weekInfo(current) : null,
    firstWeek: weeks.length ? weekInfo(weeks[0] as Week) : null,
    weeksTotal: weeks.length,
    checkpointDate: checkpointLabel(weeks),
    prev: prev
      ? {
          week: prev.week,
          asked: prev.asked,
          revenue: prev.revenue,
          goal_asks: prev.goal_asks,
          goal_revenue: prev.goal_revenue,
          goal_text: String(prev.goal_text || ''),
        }
      : null,
    pipeline: snapshot.map((row) => ({
      organisation: row.organisation,
      stage: row.stage,
      note: row.note,
    })),
    totals: totals(mine, current ? current.week : 0),
    thisReport: thisReport
      ? {
          submitted_at: stampLabel(thisReport.submitted_at),
          submitted_by: thisReport.submitted_by,
          late: thisReport.late === 'Yes',
          feedback: parseJson(thisReport.feedback_json, []),
        }
      : null,
    history: past,
    scoreboard: current ? scoreboard(current, weeks, reports, team.team_id) : null,
    stages: STAGE_NAMES,
  };
}
