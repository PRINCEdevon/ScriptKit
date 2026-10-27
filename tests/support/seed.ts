// Fills the fake spreadsheet with tabs, the way a person would set them up.
import { TABS, type TabKey } from '../../src/sheets.js';
import type { Cell } from '../../src/types.js';
import type { FakeGoogle } from './fake-google.js';

/** Writes raw values (header row first) into a new tab. */
export function seedValues(google: FakeGoogle, name: string, values: Cell[][]) {
  const sheet = google.spreadsheet.insertSheet(name);
  const width = Math.max(...values.map((row) => row.length));
  const padded = values.map((row) => [...row, ...Array<Cell>(width - row.length).fill('')]);
  sheet.maxColumns = Math.max(sheet.maxColumns, width);
  if (padded.length) sheet.getRange(1, 1, padded.length, width).setValues(padded);
  return sheet;
}

/** Writes one of the application's tabs with its standard headings, rows given by field name. */
export function seedTab(google: FakeGoogle, key: TabKey, records: Record<string, Cell>[] = []) {
  const cols = TABS[key].cols;
  return seedValues(google, TABS[key].name, [
    cols.map(([, heading]) => heading),
    ...records.map((record) => cols.map(([field]) => record[field] ?? '')),
  ]);
}

/** A tab's values as plain data, for comparing two fakes. */
export function tabValues(google: FakeGoogle, name: string) {
  const sheet = google.spreadsheet.getSheetByName(name);
  if (!sheet) throw new Error(`No "${name}" tab`);
  return JSON.parse(
    JSON.stringify({ values: sheet.getDataRange().getValues(), maxRows: sheet.getMaxRows() }),
  ) as { values: Cell[][]; maxRows: number };
}
