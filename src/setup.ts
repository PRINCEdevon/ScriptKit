/**
 * "Set up or repair the sheet": creates any missing tab or column, adds missing settings and the
 * default schedule and feedback rules, upgrades wording that is still an old default, and tidies
 * the Sheet. It never overwrites values someone typed.
 */
import {
  DEFAULT_SETTINGS,
  appendTableRow,
  clearSettingsCache,
  pageName,
  pageTemplateName,
  reportName,
  setSetting,
  settings,
} from './config.js';
import { noonDate, timeZone } from './dates.js';
import { DEFAULT_RULES } from './feedback.js';
import { uploadSteps } from './page.js';
import { refreshReportLog } from './reports.js';
import {
  TABS,
  lastDataRow,
  readTable,
  setCells,
  spreadsheet,
  toast,
  type TabKey,
} from './sheets.js';
import { createLinks } from './teams.js';
import type { Cell, Row, TabDef, Table } from './types.js';

type Spreadsheet = GoogleAppsScript.Spreadsheet.Spreadsheet;
type Sheet = GoogleAppsScript.Spreadsheet.Sheet;
type Day = [year: number, month: number, day: number];

/** The default schedule: week, covers from, covers to, opens, due, scoreboard, note. */
export const DEFAULT_WEEKS: [number, Day, Day, Day, Day, string, string?][] = [
  // week, covers from, covers to, opens, due, scoreboard
  [1, [2026, 12, 1], [2026, 12, 6], [2026, 12, 6], [2026, 12, 7], 'Activity'],
  [2, [2026, 12, 7], [2026, 12, 13], [2026, 12, 13], [2026, 12, 14], 'Activity'],
  [
    3,
    [2026, 12, 14],
    [2026, 12, 20],
    [2026, 12, 20],
    [2026, 12, 21],
    'Activity',
    'Last report before the Christmas break',
  ],
  [4, [2027, 1, 4], [2027, 1, 10], [2027, 1, 10], [2027, 1, 11], 'Activity'],
  [5, [2027, 1, 11], [2027, 1, 17], [2027, 1, 17], [2027, 1, 18], 'Activity'],
  [6, [2027, 1, 18], [2027, 1, 24], [2027, 1, 24], [2027, 1, 25], 'Revenue', 'Checkpoint week'],
  [7, [2027, 1, 25], [2027, 1, 31], [2027, 1, 31], [2027, 2, 1], 'Revenue'],
  [8, [2027, 2, 1], [2027, 2, 7], [2027, 2, 7], [2027, 2, 8], 'Revenue'],
  [9, [2027, 2, 8], [2027, 2, 14], [2027, 2, 14], [2027, 2, 15], 'Revenue'],
  [10, [2027, 2, 15], [2027, 2, 21], [2027, 2, 21], [2027, 2, 22], 'Revenue', 'Demo Day week'],
];

/**
 * Feedback wording that earlier versions used. Setup replaces it with the current wording,
 * but only where the text in the Feedback rules tab is still exactly the old wording.
 */
export const OLD_RULE_TEXT: Record<string, Record<string, string[]>> = {
  org_moves: { when: ['At least one organisation moved forward.'] },
  org_no_moves: {
    lead: ['None of your organisations moved forward a stage this week.'],
    when: ['No organisation moved forward.'],
  },
  org_stuck: {
    flag: ['Stuck organisation'],
    when: ['An organisation has not moved in three reports.'],
  },
  checkpoint_org_none: {
    detail: [
      'You will need a paid pilot or a signed letter of intent. Your furthest organisation is at "{furthest_stage_name}".',
    ],
  },
  checkpoint_org_ok: {
    detail: [
      'You already have an organisation that has signed or paid. Keep the signed letter or proof of payment ready.',
    ],
  },
  cohort_org: {
    lead: [
      'The middle Organisation-track team moved {median_moved} organisations forward this week.',
    ],
  },
};

/** Setting values that earlier versions used as defaults; setup upgrades them. Typed values are left alone. */
export const OLD_DEFAULTS: Record<string, string[]> = {
  programme_name: ['Mashauri Revenue Accelerator'],
  report_page_url: ['https://tools.mashauri.org/revenue-report.html'],
};

/** Menu and script editor: creates or repairs every tab of the programme's Sheet. */
export function setup(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet() || spreadsheet();
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());
  clearSettingsCache();
  Object.keys(TABS).forEach((key) => ensureTab(ss, TABS[key as TabKey]));

  // Settings: add any missing keys, never overwrite yours.
  const have = readTable('settings').rows.map((row) => String(row.key));
  DEFAULT_SETTINGS.forEach(([key, value, about]) => {
    if (have.indexOf(key) < 0) appendTableRow('settings', { key, value, about });
  });
  const upgraded = tidySettings();
  ss.setSpreadsheetTimeZone(timeZone());
  writeStartHere(ss);

  const weeks = readTable('weeks');
  if (!weeks.rows.length) {
    const values = DEFAULT_WEEKS.map((w) => [
      w[0],
      noonDate(w[1]),
      noonDate(w[2]),
      noonDate(w[3]),
      noonDate(w[4]),
      w[5],
      w[6] || '',
    ]);
    weeks.sheet.getRange(2, 1, values.length, 7).setValues(values);
    weeks.sheet.getRange(2, 2, values.length, 4).setNumberFormat('ddd d mmm yyyy');
  }
  const rules = readTable('rules');
  if (!rules.rows.length) {
    const values = DEFAULT_RULES.map((rule) => rule.slice());
    rules.sheet.getRange(2, 1, values.length, (values[0] as string[]).length).setValues(values);
  } else {
    upgradeRuleText(rules);
  }

  // Helpful formatting and drop-downs.
  const teams = readTable('teams');
  setValidationList(teams.sheet, teams.col.track as number, ['Direct', 'Organisation']);
  setValidationList(teams.sheet, teams.col.status as number, ['Active', 'Stopped']);
  const reports = readTable('reports');
  tidyReportRows(reports);
  setValidationList(rules.sheet, rules.col.on as number, ['Yes', 'No']);
  setValidationList(rules.sheet, rules.col.track as number, ['Both', 'Direct', 'Organisation']);
  const wrapped: [TabKey, string[]][] = [
    ['reports', ['flags', 'reply', 'customers_said', 'changing', 'blocker', 'feedback_text']],
    ['rules', ['lead', 'detail', 'when']],
    ['settings', ['about']],
  ];
  wrapped.forEach(([key, fields]) => {
    const table = readTable(key);
    fields.forEach((field) => {
      const column = table.col[field] as number;
      table.sheet.setColumnWidth(column, 280);
      // The whole column, however many rows the tab has now.
      table.sheet.getRange(1, column, table.sheet.getMaxRows(), 1).setWrap(true);
    });
  });
  reports.sheet.getRange(1, reports.col.reply as number, 1, 3).setBackground('#fde8eb');
  const hideFrom = reports.col.team_id as number;
  reports.sheet.hideColumns(hideFrom, reports.headers.length - hideFrom + 1);

  const blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  refreshReportLog();
  const links = createLinks();
  ss.setActiveSheet(ss.getSheetByName('Teams') as Sheet);
  const notes: string[] = [];
  if (upgraded.length)
    notes.push('Settings updated to the new defaults: ' + upgraded.join(', ') + '.');
  if (links.changed) {
    notes.push(
      links.changed +
        ' team ' +
        (links.changed === 1 ? 'link' : 'links') +
        ' updated to ' +
        settings().report_page_url +
        '.',
    );
  }
  toast(
    'The sheet is ready. ' +
      (notes.length
        ? notes.join(' ')
        : 'Next: add your teams in the Teams tab, or try "Add demo data".'),
  );
}

/**
 * Removes repeated setting rows (keeping the filled-in value) and upgrades old default values.
 * Returns the upgraded keys.
 */
export function tidySettings(): string[] {
  const table = readTable('settings');
  // A plain object, as in the original.
  const first: Record<string, Row> = {};
  const extra: number[] = [];
  table.rows.forEach((row) => {
    const key = String(row.key || '').trim();
    if (!key) return;
    const kept = first[key];
    if (!kept) {
      first[key] = row;
      return;
    }
    if (String(kept.value) === '' && String(row.value) !== '') {
      setCells(table, kept._row, { value: row.value });
      kept.value = row.value;
    }
    extra.push(row._row);
  });
  extra.sort((a, b) => b - a).forEach((row) => table.sheet.deleteRow(row));
  const upgraded: string[] = [];
  Object.keys(OLD_DEFAULTS).forEach((key) => {
    const kept = first[key];
    if (kept && (OLD_DEFAULTS[key] as string[]).indexOf(String(kept.value).trim()) >= 0) {
      upgraded.push(key);
    }
  });
  clearSettingsCache();
  upgraded.forEach((key) => {
    const defaults = (DEFAULT_SETTINGS.find(([k]) => k === key) ?? null) as [string, Cell, string];
    setSetting(key, defaults[1]);
    const settingsTable = readTable('settings');
    const row = settingsTable.rows.find((r) => String(r.key) === key);
    if (row) setCells(settingsTable, row._row, { about: defaults[2] });
  });
  if (extra.length) clearSettingsCache();
  return upgraded;
}

/** Rewrites the "Start here" tab so its instructions always match this Sheet's settings. */
export function writeStartHere(ss: Spreadsheet): void {
  const config = settings();
  const sheet = ss.getSheetByName('Start here') || ss.insertSheet('Start here', 0);
  const lines = [
    [config.programme_name + ': ' + reportName() + ' (Monday reports)'],
    [
      'This Sheet stores every Monday report for this programme. This tab is rewritten each time you run "Set up or repair the sheet"; do not type in it.',
    ],
    [''],
    ['Once, before teams get their links'],
    [
      '1. Settings tab: check programme_name, short_name, report_page_url, time_zone and currency_symbol.',
    ],
    [
      '2. Revenue Accelerator > Create missing team links (this also updates every link after report_page_url changes).',
    ],
    [
      '3. Revenue Accelerator > Prepare the report page... It makes ' +
        pageName() +
        ' from ' +
        pageTemplateName() +
        ' in this Drive folder.',
    ],
    ['4. ' + uploadSteps(pageName())],
    [
      '5. Revenue Accelerator > Email teams their links..., then Revenue Accelerator > Turn on automatic emails.',
    ],
    [''],
    [
      'Every week: Revenue Accelerator > Show this week\'s reports, type replies in "Your reply", tick "Send reply", then Send ticked replies.',
    ],
    ['The full guide is the README in Drive, next to this Sheet.'],
  ];
  sheet.clearContents();
  sheet.getRange(1, 1, lines.length, 1).setValues(lines).setWrap(true).setVerticalAlignment('top');
  sheet.getRange(1, 1).setFontWeight('bold').setFontSize(16);
  sheet.getRange(4, 1).setFontWeight('bold');
  sheet.setColumnWidth(1, 900);
}

/** Updates feedback wording that is still exactly an older default. Edited wording is left alone. */
export function upgradeRuleText(rules: Table): void {
  const cols = ['id', 'track', 'on', 'tone', 'lead', 'detail', 'flag', 'when'];
  rules.rows.forEach((row) => {
    const old = OLD_RULE_TEXT[String(row.id)];
    const current = DEFAULT_RULES.find((rule) => rule[0] === String(row.id)) ?? null;
    if (!old || !current) return;
    const changes: Record<string, unknown> = {};
    Object.keys(old).forEach((field) => {
      if ((old[field] as string[]).indexOf(String(row[field])) >= 0) {
        changes[field] = current[cols.indexOf(field)];
      }
    });
    if (Object.keys(changes).length) setCells(rules, row._row, changes);
  });
}

/** Creates a tab if it is missing and adds any missing column at the end (older headings count). */
export function ensureTab(ss: Spreadsheet, def: TabDef): void {
  const sheet = ss.getSheetByName(def.name) || ss.insertSheet(def.name);
  const lastColumn = sheet.getLastColumn();
  const existing: string[] = lastColumn
    ? (sheet.getRange(1, 1, 1, lastColumn).getValues()[0] as unknown[]).map(String)
    : [];
  const missing = def.cols.filter(([, heading, older]) =>
    [heading].concat(older || []).every((h) => existing.indexOf(h) < 0),
  );
  const need = existing.length + missing.length - sheet.getMaxColumns();
  if (need > 0) sheet.insertColumnsAfter(sheet.getMaxColumns(), need);
  missing.forEach(([, heading]) => {
    existing.push(heading);
    sheet.getRange(1, existing.length).setValue(heading);
  });
  sheet.getRange(1, 1, 1, existing.length).setFontWeight('bold').setBackground('#f1f1f4');
  sheet.setFrozenRows(1);
}

/**
 * A drop-down on every row below the header, however many rows the tab has. (A fixed 999 rows
 * used to run past the end of a tab that had lost rows, for example after removing demo data.)
 */
function setValidationList(sheet: Sheet, column: number, list: string[]): void {
  const rows = sheet.getMaxRows() - 1;
  if (rows < 1) return; // only a header row
  sheet
    .getRange(2, column, rows, 1)
    .setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(list, true)
        .setAllowInvalid(false)
        .build(),
    );
}

/** Gives every real report a tick box, and clears the empty rows below of tick boxes and anything else. */
export function tidyReportRows(table: Table): void {
  const sheet = table.sheet;
  const last = lastDataRow(table);
  const below = sheet.getMaxRows() - last;
  if (below > 0) {
    const range = sheet.getRange(last + 1, 1, below, sheet.getMaxColumns());
    range.clearDataValidations();
    range.clearContent();
  }
  if (last > 1 && table.col.send_reply) {
    const boxes = sheet.getRange(2, table.col.send_reply, last - 1, 1);
    const values = boxes.getValues();
    boxes.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
    boxes.setValues(values.map((value) => [value[0] === true]));
  }
}
