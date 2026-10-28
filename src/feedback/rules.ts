/**
 * Instant feedback: the notes a team sees straight after sending a report. Each rule in the
 * Feedback rules tab names a check below; the tab holds the wording, tone and flag, and its
 * order is the priority order. The checks and their thresholds are unchanged from the original.
 */
import { money, settings } from '../shared/settings.js';
import { checkpointLabel, type Week } from '../shared/dates.js';
import { STAGE_NAMES } from '../shared/pipeline.js';
import type { Totals } from './scoreboard.js';
import { readRows } from '../shared/sheets.js';
import type { Cell, Report, Row, Track } from '../shared/types.js';
import { median, toNumber } from '../shared/utils.js';

/**
 * Default Feedback rules tab, in priority order:
 * [rule, track, on, tone, headline, detail, flag for the programme manager, when it shows].
 */
export const DEFAULT_RULES: [
  id: string,
  track: string,
  on: string,
  tone: string,
  lead: string,
  detail: string,
  flag: string,
  when: string,
][] = [
  [
    'late',
    'Both',
    'Yes',
    'info',
    'This report was sent after the Monday deadline.',
    'It still counts, but it is marked as late.',
    'Late',
    'The report arrived after the due date.',
  ],
  [
    'no_asks',
    'Both',
    'Yes',
    'warn',
    'You did not ask anyone to buy this week.',
    'Conversations without a request to pay do not move your number. Next week, end every conversation by asking.',
    'No asks',
    'Nobody was asked to buy (or, on the Organisation track, to take the next step).',
  ],
  [
    'first_money',
    'Both',
    'Yes',
    'good',
    'Your first money from a customer: {revenue}.',
    'Keep proof of every payment. It is your evidence at the week 6 checkpoint.',
    '',
    'The team received money for the first time.',
  ],
  [
    'asks_change',
    'Both',
    'Yes',
    'info',
    'You {asked_phrase}, {change_phrase}.',
    '{goal_phrase}',
    'Asks down',
    "Compares this week's asks with last week's, and with last week's goal. Turns amber when asks fell.",
  ],
  [
    'money_goal',
    'Both',
    'Yes',
    'info',
    'You received {revenue} against a goal of {goal_revenue}.',
    '{total_phrase}',
    'Money goal missed',
    'Last week the team set a money goal.',
  ],
  [
    'all_no',
    'Both',
    'Yes',
    'warn',
    'Nobody said yes from {asked} asks.',
    'Change one thing next week: the price, the offer, or who you ask. Then tell us what you changed.',
    'No yeses',
    'Five or more asks and no yes.',
  ],
  [
    'not_yet_high',
    'Both',
    'Yes',
    'warn',
    '{not_yet} of your {asked} said "not yet".',
    'Go back to each of them this week and ask for a small deposit or a date to decide, so that "not yet" becomes a yes or a no.',
    '',
    'Three or more "not yet" answers, and at least as many as the yeses.',
  ],
  [
    'org_moves',
    'Organisation',
    'Yes',
    'good',
    '{moved} {moved_noun} moved forward a stage this week.',
    '{added_phrase}',
    '',
    'At least one potential customer moved forward.',
  ],
  [
    'org_no_moves',
    'Organisation',
    'Yes',
    'warn',
    'None of your potential customers moved forward a stage this week.',
    'Pick the one closest to a decision and ask for the next step this week.',
    'No stage moves',
    'No potential customer moved forward.',
  ],
  [
    'org_stuck',
    'Organisation',
    'Yes',
    'warn',
    '{stuck_org} has been at "{stuck_stage}" for three reports in a row.',
    'Who approves the spending there, and have you met them?',
    'Stuck potential customer',
    'A potential customer has not moved in three reports.',
  ],
  [
    'money_flat',
    'Both',
    'Yes',
    'warn',
    'No money came in for two weeks running.',
    'What will you change this week to get the next payment?',
    'No money 2 weeks',
    'No money this week or last week, after earlier payments.',
  ],
  [
    'growth',
    'Both',
    'Yes',
    'info',
    'Money received was {growth_word} {growth_pct}% on last week.',
    'From week 6 the scoreboard ranks teams by money received.',
    'Money down',
    "From week 6, when last week's money was above zero.",
  ],
  [
    'checkpoint_direct_none',
    'Direct',
    'Yes',
    'calendar',
    'The week 6 checkpoint starts on {checkpoint_date}, and you do not have a paying customer yet.',
    'Every conversation from now on should end with a request to pay. A paid pre-order or deposit counts.',
    'No payment yet',
    'Weeks 3 to 5, Direct track, no money received so far.',
  ],
  [
    'checkpoint_direct_ok',
    'Direct',
    'Yes',
    'calendar',
    'The week 6 checkpoint starts on {checkpoint_date}.',
    'You already have paying customers. Make sure you have proof of every payment ready.',
    '',
    'Weeks 3 to 5, Direct track, money already received.',
  ],
  [
    'checkpoint_org_none',
    'Organisation',
    'Yes',
    'calendar',
    'The week 6 checkpoint starts on {checkpoint_date}.',
    'You will need a paid pilot or a signed letter of intent. Your furthest potential customer is at "{furthest_stage_name}".',
    'No pilot or letter yet',
    'Weeks 3 to 5, Organisation track, nothing signed or paid yet.',
  ],
  [
    'checkpoint_org_ok',
    'Organisation',
    'Yes',
    'calendar',
    'The week 6 checkpoint starts on {checkpoint_date}.',
    'You already have a potential customer that has signed or paid. Keep the signed letter or proof of payment ready.',
    '',
    'Weeks 3 to 5, Organisation track, something signed or paid.',
  ],
  [
    'price_test',
    'Direct',
    'Yes',
    'info',
    '{yes} of the {asked} people you asked said yes.',
    'When half or more say yes, your price may be too low. Try a higher price with the next few people.',
    '',
    'Five or more asks and at least half said yes.',
  ],
  [
    'no_mentor',
    'Both',
    'Yes',
    'warn',
    'Two reports in a row without a mentor call.',
    'Book one this week. Practising your sales conversation is what the calls are for.',
    'No mentor call',
    'No mentor call this week or last week.',
  ],
  [
    'cohort_direct',
    'Direct',
    'Yes',
    'compare',
    'The middle Direct-track team asked {median_asked} people to buy this week.',
    'You asked {asked}.',
    '',
    'Enough Direct-track teams have reported this week to compare.',
  ],
  [
    'cohort_org',
    'Organisation',
    'Yes',
    'compare',
    'The middle Organisation-track team moved {median_moved} potential customers forward this week.',
    'You moved {moved}.',
    '',
    'Enough Organisation-track teams have reported this week to compare.',
  ],
];

/** The validated answers of the report being sent (numbers already parsed). */
export interface Answers {
  revenue: number;
  new_customers: number;
  asked: number;
  yes: number;
  no: number;
  not_yet: number;
  goal_asks: number;
  goal_revenue: number;
  mentor_call: string;
  [field: string]: unknown;
}

/** Everything the rules look at, worked out when a report is recorded. */
export interface FeedbackContext {
  track: Track;
  week: number;
  weeks: Week[];
  rep: Answers;
  /** The team's previous report, if any (not necessarily last week's). */
  prev: Report | null;
  /** Totals over the team's earlier reports. */
  before: Totals;
  /** Organisations that moved forward a stage, were added, and the furthest stage reached. */
  moved: number;
  added: number;
  furthest: number;
  /** Organisations at the same stage for three reports in a row. */
  stuck: { organisation: string; stage: number }[];
  pipelineCount: number;
  /** This week's asks and stage moves of the teams on the same track, including this one. */
  cohortAsked: number[];
  cohortMoved: number[];
  late: boolean;
}

/** A shown note. Saved as JSON in the Reports tab, so the key order is part of the format. */
export interface FeedbackItem {
  id: Cell | undefined;
  tone: string;
  lead: string;
  detail: string;
  flag: string;
}

/** A rule applies when its check returns an object; `vars` fill its wording. */
export type RuleResult = { vars?: Record<string, unknown>; tone?: string; flag?: boolean } | null;
type RuleCheck = (c: FeedbackContext) => RuleResult;

function inRun(c: FeedbackContext): boolean {
  return c.week >= 3 && c.week <= 5;
}

/** The check behind each rule id (a plain object, looked up by id as in the original). */
export const RULE_CHECKS: Record<string, RuleCheck> = {
  late: (c) => (c.late ? {} : null),
  no_asks: (c) => (c.rep.asked === 0 ? {} : null),
  first_money: (c) => (c.rep.revenue > 0 && c.before.revenue === 0 ? {} : null),
  asks_change: (c) => {
    if (!c.prev || c.rep.asked === 0) return null;
    const d = c.rep.asked - c.prev.asked;
    const vars = {
      change_phrase:
        d > 0
          ? 'up from ' + c.prev.asked + ' last week'
          : d < 0
            ? 'down from ' + c.prev.asked + ' last week'
            : 'the same as last week',
      goal_phrase: '',
    };
    const tone = d > 0 ? 'up' : d < 0 ? 'warn' : 'info';
    if (c.prev.goal_asks > 0) {
      const short = c.prev.goal_asks - c.rep.asked;
      vars.goal_phrase =
        short <= 0
          ? 'You aimed for ' + c.prev.goal_asks + ', so you met your goal.'
          : 'You aimed for ' + c.prev.goal_asks + ', so you were ' + short + ' short.';
    }
    return { vars, tone, flag: d < 0 };
  },
  money_goal: (c) => {
    if (!c.prev || !(c.prev.goal_revenue > 0)) return null;
    if (c.rep.revenue > 0 && c.before.revenue === 0) return null; // first_money says it
    const met = c.rep.revenue >= c.prev.goal_revenue;
    return { tone: met ? 'good' : 'info', flag: !met };
  },
  all_no: (c) => (c.rep.asked >= 5 && c.rep.yes === 0 ? {} : null),
  not_yet_high: (c) => (c.rep.not_yet >= 3 && c.rep.not_yet >= c.rep.yes ? {} : null),
  org_moves: (c) => (c.moved > 0 ? {} : null),
  org_no_moves: (c) => (c.moved === 0 && c.pipelineCount > 0 ? {} : null),
  org_stuck: (c) => {
    const stuck = c.stuck[0];
    if (!stuck) return null;
    return { vars: { stuck_org: stuck.organisation, stuck_stage: STAGE_NAMES[stuck.stage] } };
  },
  money_flat: (c) =>
    c.week >= 2 && c.rep.revenue === 0 && c.prev && c.prev.revenue === 0 && c.before.revenue > 0
      ? {}
      : null,
  growth: (c) => {
    if (c.week < 6 || !c.prev || !(c.prev.revenue > 0)) return null;
    const pct = Math.round(((c.rep.revenue - c.prev.revenue) / c.prev.revenue) * 100);
    // No flag value here, so an unchanged week still shows the rule's flag (docs/known-issues.md).
    if (pct === 0) return { vars: { growth_word: 'unchanged at', growth_pct: 0 }, tone: 'info' };
    return {
      vars: { growth_word: pct > 0 ? 'up' : 'down', growth_pct: Math.abs(pct) },
      tone: pct > 0 ? 'up' : 'warn',
      flag: pct < 0,
    };
  },
  checkpoint_direct_none: (c) => (inRun(c) && c.before.revenue + c.rep.revenue === 0 ? {} : null),
  checkpoint_direct_ok: (c) => (inRun(c) && c.before.revenue + c.rep.revenue > 0 ? {} : null),
  checkpoint_org_none: (c) =>
    inRun(c) && c.furthest < 5 && c.before.revenue + c.rep.revenue === 0 ? {} : null,
  checkpoint_org_ok: (c) =>
    inRun(c) && (c.furthest >= 5 || c.before.revenue + c.rep.revenue > 0) ? {} : null,
  price_test: (c) => (c.rep.asked >= 5 && c.rep.yes * 2 >= c.rep.asked ? {} : null),
  no_mentor: (c) =>
    c.rep.mentor_call === 'No' && c.prev && c.prev.mentor_call === 'No' ? {} : null,
  cohort_direct: (c) => {
    if (c.cohortAsked.length < toNumber(settings().min_teams_for_comparison || 3)) return null;
    return { vars: { median_asked: median(c.cohortAsked) } };
  },
  cohort_org: (c) => {
    if (c.cohortMoved.length < toNumber(settings().min_teams_for_comparison || 3)) return null;
    return { vars: { median_moved: median(c.cohortMoved) } };
  },
};

/** Replaces each {name} with its value; unknown names are left as they are. */
export function fillTemplate(text: string, vars: Record<string, unknown>): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}

/** The feedback for a report, using the Feedback rules tab and the max_feedback_items setting. */
export function buildFeedback(c: FeedbackContext): FeedbackItem[] {
  const rules = readRows('rules');
  return feedbackFrom(c, rules, toNumber(settings().max_feedback_items) || 6);
}

/**
 * The feedback for a report: each rule that is on, matches the team's track and applies, in
 * the order of `rules`, up to `max` notes.
 */
export function feedbackFrom(c: FeedbackContext, rules: Row[], max: number): FeedbackItem[] {
  const totalRevenue = c.before.revenue + c.rep.revenue;
  const totalCustomers = c.before.customers + c.rep.new_customers;
  const asked = c.rep.asked;
  const base: Record<string, unknown> = {
    asked,
    yes: c.rep.yes,
    no: c.rep.no,
    not_yet: c.rep.not_yet,
    revenue: money(c.rep.revenue),
    new_customers: c.rep.new_customers,
    prev_asked: c.prev ? c.prev.asked : '',
    goal_asks: c.prev ? c.prev.goal_asks : '',
    goal_revenue: c.prev ? money(c.prev.goal_revenue) : '',
    total_revenue: money(totalRevenue),
    total_customers: totalCustomers,
    total_phrase:
      c.track === 'Direct'
        ? 'Your total so far is ' +
          money(totalRevenue) +
          ' from ' +
          totalCustomers +
          ' paying ' +
          (totalCustomers === 1 ? 'customer' : 'customers') +
          '.'
        : 'Your total so far is ' + money(totalRevenue) + '.',
    asked_phrase:
      c.track === 'Direct'
        ? 'asked ' + asked + ' ' + (asked === 1 ? 'person' : 'people') + ' to buy'
        : 'asked ' +
          asked +
          ' ' +
          (asked === 1 ? 'potential customer' : 'potential customers') +
          ' to take the next step',
    moved: c.moved,
    moved_noun: c.moved === 1 ? 'potential customer' : 'potential customers',
    added_phrase: c.added
      ? 'You also added ' +
        c.added +
        ' new ' +
        (c.added === 1 ? 'potential customer' : 'potential customers') +
        '.'
      : '',
    furthest_stage_name: STAGE_NAMES[c.furthest] || 'no potential customers yet',
    checkpoint_date: checkpointLabel(c.weeks),
    track: c.track,
  };
  const out: FeedbackItem[] = [];
  for (let i = 0; i < rules.length && out.length < max; i++) {
    const rule = rules[i] as Row;
    if (String(rule.on).toLowerCase() !== 'yes') continue;
    const track = String(rule.track || 'Both');
    if (track !== 'Both' && track !== c.track) continue;
    const check = RULE_CHECKS[String(rule.id)];
    if (!check) continue;
    const result = check(c);
    if (!result) continue;
    const vars = Object.assign({}, base, result.vars || {});
    const tone = result.tone || String(rule.tone || 'info');
    const lead = fillTemplate(String(rule.lead || ''), vars);
    const detail = fillTemplate(String(rule.detail || ''), vars);
    const showFlag = result.flag === undefined ? !!rule.flag : result.flag;
    out.push({ id: rule.id, tone, lead, detail, flag: showFlag ? String(rule.flag || '') : '' });
  }
  return out;
}
