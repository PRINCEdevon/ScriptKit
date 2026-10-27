/**
 * Reading and writing the programme's spreadsheet. Each tab is a table: the header row names
 * the columns, and the code refers to columns by field name (TABS), so columns can be moved or
 * added in the Sheet without breaking anything.
 */
import type { Cell, Row, TabDef, Table } from './types.js';
import { toNumber } from './utils.js';

/**
 * Every tab the application uses. Per column: [field name used in code, heading in the Sheet,
 * older headings that are still recognised]. The headings are the contract with existing Sheets.
 */
export const TABS = {
  settings: {
    name: 'Settings',
    cols: [
      ['key', 'Setting'],
      ['value', 'Value'],
      ['about', 'What it does'],
    ],
  },
  teams: {
    name: 'Teams',
    cols: [
      ['team_id', 'Team ID'],
      ['team_name', 'Team name'],
      ['track', 'Track'],
      ['status', 'Status'],
      ['founders', 'Founders (comma-separated)'],
      ['founder_emails', 'Founder emails (comma-separated)'],
      ['mentor_name', 'Mentor'],
      ['mentor_email', 'Mentor email'],
      ['token', 'Private code'],
      ['report_link', 'Report link'],
      ['link_sent_at', 'Link emailed at'],
      ['notes', 'Notes'],
    ],
  },
  weeks: {
    name: 'Weeks',
    cols: [
      ['week', 'Week'],
      ['covers_start', 'Covers from'],
      ['covers_end', 'Covers to'],
      ['opens', 'Report opens'],
      ['due', 'Report due'],
      ['scoreboard', 'Scoreboard shows'],
      ['note', 'Note'],
    ],
  },
  reports: {
    name: 'Reports',
    cols: [
      ['week', 'Week'],
      ['team_name', 'Team'],
      ['track', 'Track'],
      ['submitted_at', 'Sent at'],
      ['late', 'Late'],
      ['submitted_by', 'Sent by'],
      ['flags', 'Flags'],
      ['wants_reply', 'Wants a reply'],
      ['reply', 'Your reply'],
      ['send_reply', 'Send reply'],
      ['reply_sent_at', 'Reply sent at'],
      ['revenue', 'Money received', ['Money received (R)']],
      ['new_customers', 'New paying customers'],
      ['asked', 'Asked'],
      ['yes', 'Said yes'],
      ['no', 'Said no'],
      ['not_yet', 'Not yet'],
      ['orgs_moved', 'Organisations moved forward'],
      ['orgs_added', 'Organisations added'],
      ['customers_said', 'What customers said'],
      ['changing', 'What they are changing'],
      ['goal_asks', 'Goal: asks next week'],
      ['goal_revenue', 'Goal: money next week', ['Goal: money next week (R)']],
      ['goal_text', 'Goal in words'],
      ['blocker', 'Blocker and help needed'],
      ['mentor_call', 'Mentor call'],
      ['mentor_note', 'Mentor call notes'],
      ['asked_names', 'Who they asked'],
      ['proof_links', 'Proof files'],
      ['feedback_text', 'Instant feedback shown'],
      ['team_id', 'Team ID'],
      ['report_id', 'Report ID'],
      ['feedback_json', 'Feedback data'],
    ],
  },
  pipeline: {
    name: 'Pipeline',
    cols: [
      ['week', 'Week'],
      ['team_id', 'Team ID'],
      ['team_name', 'Team'],
      ['organisation', 'Organisation'],
      ['stage', 'Stage'],
      ['stage_name', 'Stage name'],
      ['note', 'What happened'],
      ['submitted_at', 'Sent at'],
    ],
  },
  corrections: {
    name: 'Corrections',
    cols: [
      ['submitted_at', 'Sent at'],
      ['team_id', 'Team ID'],
      ['team_name', 'Team'],
      ['week', 'Week'],
      ['submitted_by', 'Sent by'],
      ['note', 'Correction'],
    ],
  },
  rules: {
    name: 'Feedback rules',
    cols: [
      ['id', 'Rule'],
      ['track', 'Track'],
      ['on', 'On'],
      ['tone', 'Tone'],
      ['lead', 'Headline'],
      ['detail', 'Detail'],
      ['flag', 'Flag for you'],
      ['when', 'When it shows'],
    ],
  },
} satisfies Record<string, TabDef>;

export type TabKey = keyof typeof TABS;

/** The programme's spreadsheet: the one setup recorded, or else the one the script is bound to. */
export function spreadsheet(): GoogleAppsScript.Spreadsheet.Spreadsheet {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

/** Reads a whole tab. Throws if the tab is missing; the message is shown to people as is. */
export function readTable(key: TabKey): Table {
  const def: TabDef = TABS[key];
  const sheet = spreadsheet().getSheetByName(def.name);
  if (!sheet) {
    throw new Error('The "' + def.name + '" tab is missing. Run "Set up or repair the sheet".');
  }
  return { sheet, ...mapTable(def, sheet.getDataRange().getValues()), def };
}

/**
 * Maps a tab's values (header row first) to rows keyed by field name. Columns with unknown
 * headings are ignored, and rows that are entirely empty (or only unticked boxes) are skipped.
 */
export function mapTable(def: TabDef, values: Cell[][]): Omit<Table, 'sheet' | 'def'> {
  const headers = (values[0] ?? []).map((heading) => String(heading).trim());
  // Plain objects, as in the original, so lookups behave exactly as they did.
  const fieldOf: Record<string, string> = {};
  def.cols.forEach(([field, heading, oldHeadings]) => {
    fieldOf[heading] = field;
    (oldHeadings ?? []).forEach((old) => {
      fieldOf[old] = field;
    });
  });
  const col: Record<string, number> = {};
  headers.forEach((heading, i) => {
    const field = fieldOf[heading];
    if (field) col[field] = i + 1;
  });
  const rows: Row[] = [];
  for (let r = 1; r < values.length; r++) {
    const cells = values[r] ?? [];
    if (cells.every((value) => value === '' || value === null || value === false)) continue;
    const row: Row = { _row: r + 1 };
    headers.forEach((heading, i) => {
      const field = fieldOf[heading];
      if (field) row[field] = cells[i];
    });
    rows.push(row);
  }
  return { headers, col, rows };
}

/** readTable's rows; Pipeline rows get numeric week and stage. */
export function readRows(key: TabKey): Row[] {
  const rows = readTable(key).rows;
  if (key === 'pipeline') {
    rows.forEach((row) => {
      row.week = toNumber(row.week);
      row.stage = toNumber(row.stage);
    });
  }
  return rows;
}

/** The last row that holds data (1 when there is only the header). */
export function lastDataRow(table: Table): number {
  let last = 1;
  table.rows.forEach((row) => {
    if (row._row > last) last = row._row;
  });
  return last;
}

/** Text typed by students must never become a spreadsheet formula. */
export function safeValue<T>(value: T): T | string {
  if (typeof value === 'string' && /^[=+\-@]/.test(value)) return "'" + value;
  return value;
}

/**
 * Adds a row after the last row with data, by field name. Reports rows get a "Send reply" tick
 * box. (Writing to the Settings tab also needs the settings cache cleared: see config.ts.)
 */
export function appendRow(key: TabKey, record: Record<string, unknown>): void {
  const table = readTable(key);
  const row: unknown[] = table.headers.map(() => '');
  Object.keys(record).forEach((field) => {
    const column = table.col[field];
    if (column) row[column - 1] = safeValue(record[field]);
  });
  const rowNumber = lastDataRow(table) + 1;
  const sheet = table.sheet;
  if (rowNumber > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 50);
  sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
  if (key === 'reports' && table.col.send_reply) {
    sheet
      .getRange(rowNumber, table.col.send_reply)
      .setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build())
      .setValue(false);
  }
}

/** Writes some fields of one row. Fields the tab does not have are ignored. */
export function setCells(table: Table, rowNumber: number, record: Record<string, unknown>): void {
  Object.keys(record).forEach((field) => {
    const column = table.col[field];
    if (column) table.sheet.getRange(rowNumber, column).setValue(safeValue(record[field]));
  });
}
