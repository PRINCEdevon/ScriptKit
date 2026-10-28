/**
 * Running totals and the cohort scoreboard on the report page. The Weeks tab's "Scoreboard
 * shows" column decides the ranking: by activity (asks, stage moves) or by money received.
 */
import type { Week } from '../shared/dates.js';
import { STAGE_NAMES, latestSnapshot } from '../shared/pipeline.js';
import { readRows } from '../shared/sheets.js';
import { allTeams, trackOf } from '../shared/teams.js';
import type { Report } from '../shared/types.js';
import { toNumber } from '../shared/utils.js';

export interface Totals {
  revenue: number;
  customers: number;
  asked: number;
  yes: number;
  reportsSent: number;
  weeksOpened: number;
}

/** A team's totals over its reports up to and including `upToWeek`. */
export function totals(reports: Report[], upToWeek: number): Totals {
  const sum: Totals = {
    revenue: 0,
    customers: 0,
    asked: 0,
    yes: 0,
    reportsSent: 0,
    weeksOpened: upToWeek,
  };
  reports.forEach((report) => {
    if (report.week > upToWeek) return;
    sum.revenue += report.revenue;
    sum.customers += report.new_customers;
    sum.asked += report.asked;
    sum.yes += report.yes;
    sum.reportsSent += 1;
  });
  return sum;
}

export interface ScoreboardRow {
  team: unknown;
  you: boolean;
  reported: boolean;
  sent: number;
  due: number;
  asked: number | null;
  yes: number | null;
  moved: number | null;
  furthest: string;
  furthestN: number;
  signed: number;
  revenueWeek: number | null;
  revenueLast: number | null;
  revenueTotal: number;
  customersTotal: number;
}

export interface Scoreboard {
  week: number;
  phase: string;
  direct: ScoreboardRow[];
  organisation: ScoreboardRow[];
}

/**
 * Every active team's row for week `current`, per track. Until a team reports, it sorts below
 * the teams that have, unless the week ranks by money.
 */
export function scoreboard(
  current: Week,
  weeks: Week[],
  reports: Report[],
  myTeamId: unknown,
): Scoreboard {
  const phase = String(current.scoreboard || 'Activity');
  const teams = allTeams().filter(
    (team) => String(team.status).toLowerCase() !== 'stopped' && team.team_name,
  );
  const pipeline = readRows('pipeline');
  const dueSoFar = weeks.filter((week) => week.week <= current.week).length;
  const board: Scoreboard = { week: current.week, phase, direct: [], organisation: [] };
  teams.forEach((team) => {
    const mine = reports.filter((r) => r.team_id === team.team_id && r.week <= current.week);
    const thisWeek = mine.find((r) => r.week === current.week);
    const lastWeek = mine.find((r) => r.week === current.week - 1);
    const sum = totals(mine, current.week);
    const snapshot = latestSnapshot(
      pipeline.filter((row) => row.team_id === team.team_id),
      current.week + 1,
    );
    let furthest = 0;
    let signed = 0;
    snapshot.forEach((row) => {
      const stage = row.stage as number;
      if (stage > furthest) furthest = stage;
      if (stage === 5) signed++;
    });
    const row: ScoreboardRow = {
      team: team.team_name,
      you: team.team_id === myTeamId,
      reported: !!thisWeek,
      sent: mine.length,
      due: dueSoFar,
      asked: thisWeek ? thisWeek.asked : null,
      yes: thisWeek ? thisWeek.yes : null,
      moved: thisWeek ? toNumber(thisWeek.orgs_moved) : null,
      furthest: STAGE_NAMES[furthest] || '',
      furthestN: furthest,
      signed,
      revenueWeek: thisWeek ? thisWeek.revenue : null,
      revenueLast: lastWeek ? lastWeek.revenue : null,
      revenueTotal: sum.revenue,
      customersTotal: sum.customers,
    };
    (trackOf(team) === 'Direct' ? board.direct : board.organisation).push(row);
  });
  // Arithmetic on null counts it as 0, as the original's comparisons did.
  const n = (value: number | null) => value ?? 0;
  const byMoney = phase.toLowerCase() === 'revenue';
  board.direct.sort((a, b) => {
    if (a.reported !== b.reported && !byMoney) return a.reported ? -1 : 1;
    return byMoney
      ? b.revenueTotal - a.revenueTotal || b.customersTotal - a.customersTotal
      : n(b.asked) - n(a.asked) || n(b.yes) - n(a.yes);
  });
  board.organisation.sort((a, b) => {
    if (a.reported !== b.reported && !byMoney) return a.reported ? -1 : 1;
    return byMoney
      ? b.signed - a.signed || b.revenueTotal - a.revenueTotal || b.furthestN - a.furthestN
      : n(b.moved) - n(a.moved) || b.furthestN - a.furthestN;
  });
  return board;
}
