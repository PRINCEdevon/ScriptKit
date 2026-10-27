// A small programme for baseline scenarios: four teams on the default schedule.
import type { App } from './runtime.js';

/** Times inside the script, in the programme's time zone. Week 1 opens on Sunday 6 December. */
export const BEFORE_START = '2026-11-20T09:00:00+02:00';
export const WEEK1_OPEN = '2026-12-06T18:00:00+02:00';
export const WEEK1_DUE = '2026-12-07T14:00:00+02:00';
export const WEEK1_TUESDAY = '2026-12-08T07:00:00+02:00';
export const WEEK2_OPEN = '2026-12-13T10:00:00+02:00';

const TEAMS = [
  ['Alpha', 'Direct', 'Ana One, Ben Two', 'ana@example.com, ben@example.com', 'Mentor One'],
  ['Beta', 'Direct', 'Cleo Three', 'cleo@example.com', 'Mentor One'],
  ['Gamma', 'Organisation', 'Dev Four, Eva Five', 'dev@example.com', 'Mentor Two'],
  // No founder emails: left out of link emails and reminders.
  ['Delta', 'Organisation', 'Finn Six', '', 'Mentor Two'],
] as const;

/** Runs setup, adds the teams as a person would in the Teams tab, and creates their links. */
export function startProgramme(app: App) {
  app.now = BEFORE_START;
  app.call('setup');
  for (const [name, track, founders, emails, mentor] of TEAMS) {
    app.table('Teams').append({
      'Team name': name,
      Track: track,
      'Founders (comma-separated)': founders,
      'Founder emails (comma-separated)': emails,
      Mentor: mentor,
      'Mentor email': mentor === 'Mentor One' ? 'mentor1@example.com' : 'mentor2@example.com',
    });
  }
  app.call('menuCreateLinks');
}

/** A team's private code, from the Teams tab. */
export function codeOf(app: App, team: string): string {
  const row = app
    .table('Teams')
    .records()
    .find((record) => record['Team name'] === team);
  return String(row?.['Private code'] ?? '');
}

/** The answers the report page sends, as strings like the form fields. */
export function answers(overrides: Record<string, unknown> = {}) {
  return {
    submitted_by: 'Ana One',
    revenue: '300',
    new_customers: '2',
    asked: '6',
    yes: '2',
    no: '2',
    not_yet: '2',
    goal_asks: '10',
    goal_revenue: '500',
    customers_said: 'Salons want to pay at the end of the month.',
    changing: 'Offering a monthly invoice.',
    goal_text: 'Ask ten salons.',
    blocker: '',
    asked_names: 'Salon A, Salon B',
    wants_reply: false,
    mentor_call: 'Yes',
    mentor_note: '',
    ...overrides,
  };
}

/** A report submission from the report page. */
export function submission(code: string, overrides: Record<string, unknown> = {}, extra = {}) {
  return { action: 'submit', t: code, report: answers(overrides), ...extra };
}
