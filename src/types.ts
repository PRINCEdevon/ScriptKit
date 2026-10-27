/** A value in a spreadsheet cell, as Apps Script returns it. */
export type Cell = string | number | boolean | Date;

/** One row of a tab: values keyed by the field names in TABS, plus its 1-based row number. */
export interface Row {
  _row: number;
  [field: string]: Cell | undefined;
}

/** A tab's layout: its name and, per column, [field name, heading, older headings]. */
export interface TabDef {
  name: string;
  cols: [field: string, heading: string, oldHeadings?: string[]][];
}

/** A tab read into memory. `col` maps a field name to its 1-based column. */
export interface Table {
  sheet: GoogleAppsScript.Spreadsheet.Sheet;
  headers: string[];
  col: Record<string, number>;
  rows: Row[];
  def: TabDef;
}

/** A row of the Reports tab with its numbers parsed and its team ID as text. */
export interface Report extends Row {
  team_id: string;
  week: number;
  revenue: number;
  new_customers: number;
  asked: number;
  yes: number;
  no: number;
  not_yet: number;
  goal_asks: number;
  goal_revenue: number;
}

/** The Settings tab as key → value. */
export type Settings = Record<string, Cell | undefined>;

export type Track = 'Direct' | 'Organisation';
