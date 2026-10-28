import { describe, expect, it } from 'vitest';
import { doGet, doPost, teamView } from '../../src/reports/web-app.js';
import type { Row } from '../../src/shared/types.js';
import { FakeGoogle } from '../support/fake-google.js';
import { json, loadLegacy, outcome, useFakeGoogle } from '../support/runtime.js';

/** A programme with the legacy demo data (pretend date: week 3 opens), plus a correction. */
function demoProgramme() {
  const google = useFakeGoogle();
  const legacy = loadLegacy(google);
  legacy.call('setup');
  legacy.call('addDemo_');
  legacy.call('appendRow_', 'corrections', {
    team_id: 'DEMO1',
    team_name: 'Demo Direct team',
    week: '1',
    note: 'Money was R250.',
  });
  // A stopped team still sees its page, with status "stopped".
  google.spreadsheet.getSheetByName('Teams')?.getRange(6, 4).setValue('Stopped');
  const teams = legacy.call('teamsAll_') as Row[];
  return { google, codes: teams.map((t) => String(t.token)) };
}

const body = (output: unknown) => JSON.parse((output as { getContent(): string }).getContent());

describe('team page', () => {
  it('shows every demo team exactly what the legacy getTeamView_ shows', () => {
    const { google, codes } = demoProgramme();
    const legacy = loadLegacy(google);
    for (const code of [...codes, 'short', 'not-a-real-code-at-all-000']) {
      expect(json(teamView(code)), code).toEqual(json(legacy.call('getTeamView_', code)));
    }
  });

  it('includes history, corrections, replies, totals and the scoreboard', () => {
    const { codes } = demoProgramme();
    const view = teamView(codes[0] ?? '');
    expect(view).toMatchObject({
      ok: true,
      status: 'open',
      week: { n: 3, covers: '14 to 20 December', due: 'Monday 21 December', phase: 'Activity' },
      prev: { week: 2, asked: 9, revenue: 500, goal_asks: 15, goal_revenue: 500 },
      totals: { revenue: 700, customers: 4, reportsSent: 2, weeksOpened: 3 },
      history: [
        { week: 2, reply: '', corrections: [] },
        {
          week: 1,
          reply: expect.stringContaining('A real start'),
          corrections: ['Money was R250.'],
        },
      ],
      thisReport: null,
    });
    expect(teamView(codes[4] ?? '')).toMatchObject({ status: 'stopped' });
    expect(teamView('nope')).toMatchObject({ ok: false, error: 'link' });
  });
});

describe('web requests', () => {
  it('answer odd requests exactly as the legacy doGet and doPost do', () => {
    const { google, codes } = demoProgramme();
    const legacy = loadLegacy(google);
    const gets = [
      undefined,
      {},
      { parameter: {} },
      { parameter: { action: 'get' } },
      { parameter: { action: 'get', t: codes[1] } },
    ];
    for (const event of gets) {
      expect(body(doGet(event as never)), JSON.stringify(event)).toEqual(
        body(legacy.call('doGet', event)),
      );
    }
    const posts = [
      '',
      '{',
      'null',
      '5',
      '[]',
      '{"action":"submit"}',
      '{"action":"correct","t":"x"}',
      '{"action":"delete"}',
    ];
    for (const contents of posts) {
      const event = { postData: { contents } };
      const typed = outcome(() => body(doPost(event as never)));
      const twin = new FakeGoogle();
      expect(typed, contents).toEqual(outcome(() => body(loadLegacy(twin).call('doPost', event))));
    }
    expect(body(doPost({ postData: { contents: '{' } } as never))).toMatchObject({
      ok: false,
      error: 'server',
    });
    expect(body(doGet(undefined))).toEqual({
      ok: false,
      error: 'unknown',
      message: 'Nothing to see here.',
    });
  });
});
