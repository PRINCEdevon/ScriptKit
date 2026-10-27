import { describe, expect, it } from 'vitest';
import {
  allTeams,
  createLinks,
  isDemo,
  planLinks,
  randomToken,
  reportLink,
  teamByToken,
  trackOf,
} from '../src/teams.js';
import type { Row } from '../src/types.js';
import { FakeGoogle } from './support/fake-google.js';
import { json, loadLegacy, useFakeGoogle } from './support/runtime.js';
import { seedTab, tabValues } from './support/seed.js';

const CODE = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4';

function seedTeams(google: FakeGoogle) {
  seedTab(google, 'settings', [
    { key: 'report_page_url', value: 'https://reports.example.com/page.html' },
  ]);
  seedTab(google, 'teams', [
    { team_id: 'T01', team_name: 'Alpha', status: 'Active', token: CODE, track: 'Direct' },
    { team_id: 'T03', team_name: 'Beta', track: 'organisation' },
    { team_name: 'Gamma', token: 'existing-code-1234', report_link: 'https://old.example.com?t=x' },
    { team_id: 101, team_name: 'Delta', token: 4242424242, track: 'Org' },
    { team_name: '   ' },
    { team_id: 'DEMO1', team_name: 'Demo team', status: 'Stopped' },
  ]);
}

describe('finding a team by its private code', () => {
  it('matches the whole code, and ignores codes shorter than 10 characters', () => {
    const google = useFakeGoogle();
    seedTeams(google);
    const legacy = loadLegacy(google);
    for (const code of [CODE, CODE.slice(0, 27), 'short', '', '4242424242', 'not-a-code-at-all']) {
      expect(json(teamByToken(code)), code).toEqual(json(legacy.call('teamByToken_', code)));
    }
    expect(teamByToken(CODE)?.team_name).toBe('Alpha');
    expect(teamByToken('4242424242')?.team_name).toBe('Delta');
    expect(teamByToken('short')).toBeNull();
    expect(teamByToken('not-a-code-at-all')).toBeNull();
  });

  it('returns team rows as stored, as the legacy teamsAll_ does', () => {
    const google = useFakeGoogle();
    seedTeams(google);
    expect(json(allTeams())).toEqual(json(loadLegacy(google).call('teamsAll_')));
    // Numeric team IDs stay numbers (docs/known-issues.md).
    expect(allTeams()[3]?.team_id).toBe(101);
  });
});

describe('tracks and demo teams', () => {
  it.each([
    ['Organisation', 'Organisation'],
    ['org', 'Organisation'],
    ['ORGANISATION track', 'Organisation'],
    ['Direct', 'Direct'],
    [' Organisation', 'Direct'],
    ['', 'Direct'],
    [undefined, 'Direct'],
  ])('reads track %j as %j', (track, expected) => {
    expect(trackOf({ track })).toBe(expected);
    expect(loadLegacy(new FakeGoogle()).call('trackOf_', { track })).toBe(expected);
  });

  it('recognises demo teams by their ID', () => {
    expect(isDemo({ team_id: 'DEMO3' })).toBe(true);
    expect(isDemo({ team_id: 'T01' })).toBe(false);
    expect(isDemo({ team_id: 'demo1' })).toBe(false);
  });
});

describe('report links', () => {
  it('add the code as a query parameter', () => {
    expect(reportLink('https://example.com/r.html', 'abc')).toBe(
      'https://example.com/r.html?t=abc',
    );
    expect(reportLink('https://example.com/r?x=1', 'abc')).toBe('https://example.com/r?x=1&t=abc');
  });

  it('are planned for every named team, filling IDs, statuses and codes', () => {
    const rows: Row[] = [
      {
        _row: 2,
        team_id: 'T01',
        team_name: 'Alpha',
        status: 'Active',
        token: 'c1',
        report_link: 'https://r?t=c1',
      },
      { _row: 3, team_id: '', team_name: 'Beta', token: 'c2', report_link: 'https://old?t=c2' },
      { _row: 4, team_name: 'Gamma' },
      { _row: 5, team_name: '' },
    ];
    let n = 0;
    const plan = planLinks(rows, 'https://r', () => `new${++n}`);
    expect(plan).toEqual({
      made: 1,
      changed: 1,
      updates: [
        { row: 3, changes: { team_id: 'T02', status: 'Active', report_link: 'https://r?t=c2' } },
        {
          row: 4,
          changes: {
            team_id: 'T03',
            status: 'Active',
            token: 'new1',
            report_link: 'https://r?t=new1',
          },
        },
      ],
    });
  });

  it('are written to the Teams tab exactly as the legacy createLinks_ writes them', () => {
    const typed = useFakeGoogle();
    const original = new FakeGoogle();
    seedTeams(typed);
    seedTeams(original);
    const legacy = loadLegacy(original);
    expect(createLinks()).toEqual(json(legacy.call('createLinks_')));
    expect(tabValues(typed, 'Teams')).toEqual(tabValues(original, 'Teams'));
    expect(createLinks()).toEqual({ made: 0, changed: 0 });
  });

  it('use 28-character codes', () => {
    useFakeGoogle();
    expect(randomToken()).toMatch(/^[0-9a-f]{28}$/);
    expect(randomToken()).not.toBe(randomToken());
  });
});
