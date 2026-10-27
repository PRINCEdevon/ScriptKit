/**
 * Teams and their private report links. A team's link carries its private code (`?t=...`),
 * which is the only thing that identifies the team to the report page.
 */
import { settings } from './config.js';
import { readTable, setCells } from './sheets.js';
import type { Cell, Row, Track } from './types.js';

/** Every row of the Teams tab, as stored (team IDs typed as numbers stay numbers). */
export function allTeams(): Row[] {
  return readTable('teams').rows;
}

/** The team with this private code, or null. Codes shorter than 10 characters never match. */
export function teamByToken(token: string): Row | null {
  if (!token || token.length < 10) return null;
  return allTeams().find((team) => String(team.token) === token) ?? null;
}

/** Anything whose track starts with "org" is on the Organisation track; the rest are Direct. */
export function trackOf(team: { track?: unknown; [field: string]: unknown }): Track {
  return String(team.track).toLowerCase().indexOf('org') === 0 ? 'Organisation' : 'Direct';
}

/** Teams added by "Add demo data" have IDs starting with DEMO. */
export function isDemo(team: { team_id?: unknown; [field: string]: unknown }): boolean {
  return /^DEMO/.test(String(team.team_id));
}

/** A new 28-character private code. */
export function randomToken(): string {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 28);
}

/** A team's report link: the report page address with its private code added. */
export function reportLink(base: string, token: Cell | undefined): string {
  return base + (base.indexOf('?') >= 0 ? '&' : '?') + 't=' + String(token);
}

export interface TeamUpdate {
  row: number;
  changes: Record<string, string>;
}

/**
 * The changes "Create missing team links" makes to the Teams tab: an ID (T01, T02, ...),
 * status Active and a private code where missing, and a link at the current report page
 * address. Rows without a team name are left alone. `made` counts new codes; `changed` counts
 * existing links that pointed at another address.
 */
export function planLinks(
  teams: Row[],
  base: string,
  newToken: () => string,
): { updates: TeamUpdate[]; made: number; changed: number } {
  const used = teams.map((team) => String(team.team_id));
  const updates: TeamUpdate[] = [];
  let made = 0;
  let changed = 0;
  for (const team of teams) {
    if (!String(team.team_name || '').trim()) continue;
    const changes: Record<string, string> = {};
    if (!team.team_id) {
      let i = 1;
      while (used.indexOf('T' + pad2(i)) >= 0) i++;
      changes.team_id = 'T' + pad2(i);
      used.push(changes.team_id);
    }
    if (!team.status) changes.status = 'Active';
    if (!team.token) {
      changes.token = newToken();
      made++;
    }
    const link = reportLink(base, changes.token || team.token);
    if (team.report_link !== link) {
      changes.report_link = link;
      if (team.token && team.report_link) changed++;
    }
    if (Object.keys(changes).length) updates.push({ row: team._row, changes });
  }
  return { updates, made, changed };
}

/** Gives every named team an ID, a status, a private code and an up-to-date report link. */
export function createLinks(): { made: number; changed: number } {
  const table = readTable('teams');
  const base = String(settings().report_page_url || '').trim();
  const { updates, made, changed } = planLinks(table.rows, base, randomToken);
  updates.forEach(({ row, changes }) => setCells(table, row, changes));
  return { made, changed };
}

function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n);
}
