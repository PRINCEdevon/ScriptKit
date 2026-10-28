import { describe, expect, it } from 'vitest';
import { clearSettingsCache } from '../../src/shared/settings.js';
import { readWeeks, type Week } from '../../src/shared/dates.js';
import {
  DEFAULT_RULES,
  RULE_CHECKS,
  buildFeedback,
  fillTemplate,
  type FeedbackContext,
} from '../../src/feedback/rules.js';
import { STAGE_NAMES } from '../../src/shared/pipeline.js';
import type { Report } from '../../src/shared/types.js';
import { FakeGoogle } from '../support/fake-google.js';
import { json, loadLegacy, useFakeGoogle } from '../support/runtime.js';
import { seedTab } from '../support/seed.js';

const RULE_FIELDS = ['id', 'track', 'on', 'tone', 'lead', 'detail', 'flag', 'when'] as const;
const defaultRuleRows = () =>
  DEFAULT_RULES.map((rule) => Object.fromEntries(RULE_FIELDS.map((f, i) => [f, rule[i] ?? ''])));

/** A small deterministic random number generator, so the generated cases never change. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function report(fields: Partial<Report>): Report {
  return {
    _row: 2,
    team_id: 'T01',
    week: 1,
    revenue: 0,
    new_customers: 0,
    asked: 0,
    yes: 0,
    no: 0,
    not_yet: 0,
    goal_asks: 0,
    goal_revenue: 0,
    mentor_call: 'Yes',
    ...fields,
  };
}

/**
 * Contexts that sit on the rules' boundaries: weeks either side of the checkpoint run and of
 * week 6, asks at 0 and 5, "not yet" at 3, yes at exactly half, stage 4 and 5, cohorts just
 * below and at the comparison threshold, and so on.
 */
function contexts(weeks: Week[]): FeedbackContext[] {
  const pick = random(2026);
  const one = <T>(values: readonly T[]): T => values[Math.floor(pick() * values.length)] as T;
  const answers = [
    [0, 0, 0, 0],
    [4, 2, 1, 1],
    [5, 0, 3, 2],
    [5, 0, 2, 3],
    [6, 3, 1, 2],
    [8, 1, 4, 3],
    [3, 3, 0, 0],
  ] as const;
  const previous = [
    null,
    report({ asked: 5, mentor_call: 'No' }),
    report({ asked: 4, goal_asks: 6, goal_revenue: 500, revenue: 300 }),
    report({ asked: 8, goal_asks: 4, goal_revenue: 300, revenue: 450.5, mentor_call: 'No' }),
    report({ asked: 5, goal_asks: 5, goal_revenue: 1000, revenue: 0 }),
  ];
  const cases: FeedbackContext[] = [];
  for (let i = 0; i < 400; i++) {
    const [asked, yes, no, notYet] = one(answers);
    cases.push({
      track: one(['Direct', 'Organisation'] as const),
      week: one([1, 2, 3, 5, 6, 7]),
      weeks,
      rep: {
        asked,
        yes,
        no,
        not_yet: notYet,
        revenue: one([0, 300, 450.5]),
        new_customers: one([0, 1, 2]),
        goal_asks: 10,
        goal_revenue: 500,
        mentor_call: one(['Yes', 'No']),
      },
      prev: one(previous),
      before: one([
        { revenue: 0, customers: 0, asked: 0, yes: 0, reportsSent: 0, weeksOpened: 999 },
        { revenue: 700, customers: 3, asked: 12, yes: 4, reportsSent: 2, weeksOpened: 999 },
      ]),
      moved: one([0, 1, 2]),
      added: one([0, 1, 2]),
      furthest: one([0, 4, 5]),
      stuck: one([[], [{ organisation: 'Clinic A', stage: 2 }]]),
      pipelineCount: one([0, 3]),
      cohortAsked: one([[5], [5, 3], [5, 3, 8], [5, 3, 8, 2]]),
      cohortMoved: one([[1], [1, 0], [1, 0, 2], [1, 0, 2, 3]]),
      late: one([true, false]),
    });
  }
  // Money exactly as last week, from week 6: the growth rule's "unchanged" case.
  cases.push({
    ...(cases[0] as FeedbackContext),
    week: 7,
    rep: { ...(cases[0] as FeedbackContext).rep, revenue: 450.5 },
    prev: previous[3] ?? null,
  });
  return cases;
}

/** Fake Google services with Settings and Weeks tabs, and the legacy script on top. */
function programme(settings: Record<string, string | number> = {}, rules = defaultRuleRows()) {
  const google = useFakeGoogle();
  seedTab(
    google,
    'settings',
    Object.entries(settings).map(([key, value]) => ({ key, value })),
  );
  seedTab(google, 'weeks', [
    { week: 1, opens: '2026-12-06' },
    { week: 6, opens: '2027-01-24', covers_start: new Date('2027-01-18T10:00:00Z') },
  ]);
  seedTab(google, 'rules', rules);
  return { google, legacy: loadLegacy(google), weeks: readWeeks() };
}

describe('feedback rules', () => {
  it('have the legacy defaults, stage names and checks, in the same order', () => {
    const legacy = loadLegacy(new FakeGoogle());
    expect(DEFAULT_RULES).toEqual(json(legacy.get('DEFAULT_RULES')));
    expect(STAGE_NAMES).toEqual(json(legacy.get('STAGE_NAMES')));
    const ids = DEFAULT_RULES.map(([id]) => id);
    expect(Object.keys(RULE_CHECKS)).toEqual(ids);
    expect(Object.keys(legacy.get('RULES') as object)).toEqual(ids);
  });

  it.each([[''], [0], [1], [3], ['5']])(
    'each check agrees with the original on every case (min_teams_for_comparison %j)',
    (minTeams) => {
      const { legacy, weeks } = programme({ min_teams_for_comparison: minTeams });
      const original = legacy.get('RULES') as Record<string, (c: unknown) => unknown>;
      const fired = new Map<string, Set<boolean>>();
      for (const context of contexts(weeks)) {
        for (const [id, check] of Object.entries(RULE_CHECKS)) {
          const result = check(context);
          expect(json(result), id).toEqual(json(original[id]?.(context)));
          if (!fired.has(id)) fired.set(id, new Set());
          fired.get(id)?.add(result !== null);
        }
      }
      // Every rule both applies and does not apply somewhere among the cases. The cohort rules
      // always apply at a threshold of 1, and never at 5 (larger than every cohort here).
      for (const id of Object.keys(RULE_CHECKS)) {
        const outcomes = [...(fired.get(id) ?? [])].sort();
        const cohort = id.startsWith('cohort_');
        const expected =
          cohort && minTeams === 1 ? [true] : cohort && minTeams === '5' ? [false] : [false, true];
        expect(outcomes, id).toEqual(expected);
      }
    },
  );

  it('flags "Money down" when money is unchanged, as the original does (docs/known-issues.md)', () => {
    const { weeks } = programme();
    const unchanged = contexts(weeks).at(-1) as FeedbackContext;
    expect(RULE_CHECKS.growth?.(unchanged)).toEqual({
      vars: { growth_word: 'unchanged at', growth_pct: 0 },
      tone: 'info',
    });
    const items = buildFeedback({ ...unchanged, late: false }).filter(
      (item) => item.id === 'growth',
    );
    expect(items).toEqual([
      expect.objectContaining({
        lead: 'Money received was unchanged at 0% on last week.',
        flag: 'Money down',
      }),
    ]);
  });
});

describe('building feedback', () => {
  const editedRules = () => {
    const rows = defaultRuleRows().reverse();
    rows[0] = { ...rows[0], on: 'yes', track: '' };
    rows[1] = { ...rows[1], on: 'No' };
    rows[2] = { ...rows[2], on: '' };
    rows[3] = { ...rows[3], track: 'Organisation', tone: '', flag: '' };
    rows[4] = { ...rows[4], lead: 'Keep going, {nope} {revenue} {furthest_stage_name}!' };
    rows.splice(5, 0, { id: 'mystery', on: 'Yes', lead: 'Never shown' });
    rows.push({ ...rows[6], lead: 'A second copy of a rule: {asked_phrase}' });
    return rows;
  };

  it.each([
    ['the default rules', defaultRuleRows, ''],
    ['the default rules, at most 3 notes', defaultRuleRows, 3],
    ['the default rules, max set to 0', defaultRuleRows, 0],
    ['edited rules', editedRules, 'abc'],
  ])('matches the original for %s', (_name, rules, max) => {
    const { legacy, weeks } = programme({ max_feedback_items: max, currency_symbol: '₹' }, rules());
    for (const context of contexts(weeks).filter((_, i) => i % 2 === 0)) {
      expect(json(buildFeedback(context))).toEqual(json(legacy.call('buildFeedback_', context)));
    }
    clearSettingsCache();
  });

  it('gives the expected notes for a typical second report', () => {
    const { weeks } = programme();
    const notes = buildFeedback({
      track: 'Direct',
      week: 2,
      weeks,
      rep: {
        asked: 4,
        yes: 0,
        no: 3,
        not_yet: 1,
        revenue: 0,
        new_customers: 0,
        goal_asks: 10,
        goal_revenue: 500,
        mentor_call: 'No',
      },
      prev: report({
        asked: 6,
        yes: 2,
        goal_asks: 10,
        goal_revenue: 500,
        revenue: 300,
        new_customers: 2,
      }),
      before: { revenue: 300, customers: 2, asked: 6, yes: 2, reportsSent: 1, weeksOpened: 999 },
      moved: 0,
      added: 0,
      furthest: 0,
      stuck: [],
      pipelineCount: 0,
      cohortAsked: [4],
      cohortMoved: [0],
      late: false,
    });
    expect(notes).toEqual([
      {
        id: 'asks_change',
        tone: 'warn',
        lead: 'You asked 4 people to buy, down from 6 last week.',
        detail: 'You aimed for 10, so you were 6 short.',
        flag: 'Asks down',
      },
      {
        id: 'money_goal',
        tone: 'info',
        lead: 'You received R0 against a goal of R500.',
        detail: 'Your total so far is R300 from 2 paying customers.',
        flag: 'Money goal missed',
      },
    ]);
  });
});

describe('fillTemplate', () => {
  it('fills known names and leaves the rest, like the original', () => {
    const legacy = loadLegacy(new FakeGoogle());
    const vars = { revenue: 'R300', asked: 0, empty: '', dollars: '$&' };
    for (const text of [
      '{revenue} from {asked}',
      '{unknown} {revenue}',
      '{empty}{dollars}',
      'none',
      '{ revenue }',
    ]) {
      expect(fillTemplate(text, vars), text).toBe(legacy.call('fill_', text, vars));
    }
    expect(fillTemplate('{revenue} and {unknown}', vars)).toBe('R300 and {unknown}');
  });
});
