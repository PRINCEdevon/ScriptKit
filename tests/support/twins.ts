// A programme seeded identically into two sets of fakes: one for the typed modules (installed
// as globals) and one for the original legacy/Code.gs, so their results can be compared.
import { expect, vi } from 'vitest';
import { DEFAULT_RULES } from '../../src/feedback/rules.js';
import { FakeGoogle } from './fake-google.js';
import { loadLegacy, useFakeGoogle } from './runtime.js';
import { seedTab, tabValues } from './seed.js';

export const CODES = {
  alpha: 'alpha-code-0000000000000000',
  beta: 'beta-code-00000000000000000',
  gamma: 'gamma-code-0000000000000000',
  delta: 'delta-code-0000000000000000',
};

export const noon = (day: string) => new Date(`${day}T10:00:00Z`);

/** Settings, four teams (one with a numeric ID), the first four default weeks and the rules. */
export function seedProgramme(google: FakeGoogle) {
  seedTab(google, 'settings', [{ key: 'short_name', value: 'URA TEST' }]);
  const link = (code: string) => `https://reports.example.com/page.html?t=${code}`;
  seedTab(google, 'teams', [
    {
      team_id: 'T01',
      team_name: 'Alpha',
      track: 'Direct',
      status: 'Active',
      founders: 'Ana One, Ben Two',
      founder_emails: 'ana@example.com, ben@example.com',
      mentor_name: 'Mentor One',
      mentor_email: 'mentor1@example.com',
      token: CODES.alpha,
      report_link: link(CODES.alpha),
    },
    {
      team_id: 'T02',
      team_name: 'Beta',
      track: 'Direct',
      status: 'Active',
      founders: '',
      founder_emails: 'cleo@example.com',
      mentor_name: 'Mentor One',
      mentor_email: 'mentor1@example.com',
      token: CODES.beta,
      report_link: link(CODES.beta),
    },
    {
      team_id: 'T03',
      team_name: 'Gamma',
      track: 'Organisation',
      status: 'Active',
      founders: 'Dev Four',
      founder_emails: 'dev@example.com',
      mentor_name: 'Mentor Two',
      mentor_email: 'mentor2@example.com',
      token: CODES.gamma,
      report_link: link(CODES.gamma),
    },
    {
      team_id: 104,
      team_name: 'Delta',
      track: 'Organisation',
      status: 'Stopped',
      founders: 'Finn Six',
      founder_emails: 'finn@example.com',
      mentor_name: 'Mentor Two',
      mentor_email: 'mentor2@example.com',
      token: CODES.delta,
      report_link: link(CODES.delta),
    },
    {
      team_id: 'T05',
      team_name: 'Epsilon',
      track: 'Direct',
      status: 'Active',
      founders: 'Gus',
      founder_emails: '',
      mentor_email: '',
      token: 'epsilon-code-00000000000000',
      report_link: link('epsilon'),
    },
  ]);
  seedTab(
    google,
    'weeks',
    [
      ['2026-12-01', '2026-12-06', '2026-12-06', '2026-12-07'],
      ['2026-12-07', '2026-12-13', '2026-12-13', '2026-12-14'],
      ['2026-12-14', '2026-12-20', '2026-12-20', '2026-12-21'],
      ['2027-01-04', '2027-01-10', '2027-01-10', '2027-01-11'],
    ].map(([from, to, opens, due], i) => ({
      week: i + 1,
      covers_start: noon(from as string),
      covers_end: noon(to as string),
      opens: noon(opens as string),
      due: noon(due as string),
      scoreboard: 'Activity',
    })),
  );
  seedTab(
    google,
    'rules',
    DEFAULT_RULES.map(([id, track, on, tone, lead, detail, flag, when]) => ({
      id,
      track,
      on,
      tone,
      lead,
      detail,
      flag,
      when,
    })),
  );
  seedTab(google, 'reports');
  seedTab(google, 'pipeline');
  seedTab(google, 'corrections');
}

/** The typed modules and the original script on twin fakes, at the same moment. */
export function twins(now: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(now));
  const typed = useFakeGoogle();
  const original = new FakeGoogle();
  seedProgramme(typed);
  seedProgramme(original);
  return { typed, original, legacy: loadLegacy(original, now) };
}

export const TABS_TO_COMPARE = ['Reports', 'Pipeline', 'Corrections', 'Settings', 'Report log'];

export function expectSameTabs(typed: FakeGoogle, original: FakeGoogle) {
  for (const name of TABS_TO_COMPARE) {
    if (!original.spreadsheet.getSheetByName(name)) continue;
    expect(tabValues(typed, name), name).toEqual(tabValues(original, name));
  }
}
