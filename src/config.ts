/**
 * Programme settings, kept in the Sheet's Settings tab so that one copy of the code serves
 * every programme. Defaults fill in any key the tab does not have.
 */
import { appendRow, readTable, setCells, type TabKey } from './sheets.js';
import type { Cell, Row, Settings } from './types.js';
import { toNumber } from './utils.js';

/** The settings read in this run (see settings()). */
let cache: Settings | null = null;

export const DEFAULT_TZ = 'Africa/Johannesburg';

/** [key, default value, explanation shown in the Settings tab], in the order setup adds them. */
export const DEFAULT_SETTINGS: [key: string, value: Cell, about: string][] = [
  [
    'programme_name',
    'USSAVI Revenue Accelerator',
    "The programme's full name. Shown at the top of the report page, in the page title and as the sender name on emails.",
  ],
  [
    'short_name',
    'URA',
    'A short name for this programme, different for every programme (for example URA). Used in the page title, email subjects and Drive file names.',
  ],
  [
    'report_page_url',
    'https://tools.mashauri.org/ura-report.html',
    'Where the report page is hosted. Team links are this address plus the team\'s private code. After changing it, use "Create missing team links" to update every link.',
  ],
  [
    'contact_email',
    'simon.gifford@mashauri.org',
    'Shown to students if something goes wrong, and used as the reply-to address on emails.',
  ],
  [
    'admin_email',
    'simon.gifford@mashauri.org',
    "Receives the Tuesday summary of the week's reports.",
  ],
  ['signoff', 'Simon', 'How emails and replies are signed.'],
  [
    'time_zone',
    DEFAULT_TZ,
    'The programme\'s time zone, used for dates, deadlines and email times (for example Africa/Johannesburg or Asia/Kolkata). Change it before the programme starts, then run "Set up or repair the sheet" and turn automatic emails off and on again.',
  ],
  ['currency_symbol', 'R', 'Shown before every amount of money (for example R or ₹).'],
  [
    'reminders_on',
    'Yes',
    'Yes: teams that have not reported get a reminder at 14:00 (programme time zone) on the day the report is due.',
  ],
  [
    'digests_on',
    'Yes',
    "Yes: each mentor gets their teams' reports, and you get a summary, at 07:00 (programme time zone) on Tuesdays.",
  ],
  ['cc_mentor_on_replies', 'Yes', "Yes: your written replies are copied to the team's mentor."],
  ['max_feedback_items', 6, 'The most instant-feedback notes a team sees after sending a report.'],
  [
    'min_teams_for_comparison',
    3,
    'How many teams on a track must have reported before a team is compared with the middle team.',
  ],
  [
    'pretend_today',
    '',
    'For testing only. Put a date here (for example 2026-12-20) and the system behaves as if it were that day. Leave EMPTY when the programme is live. While a date is here, the automatic emails do not send unless send_all_emails_to is filled in.',
  ],
  [
    'send_all_emails_to',
    '',
    'For testing only. If an email address is here, EVERY email this Sheet sends goes to that address instead, marked [TEST] and showing who it would have gone to. Leave EMPTY when the programme is live.',
  ],
  [
    'web_app_url',
    '',
    'Filled in by "Prepare the report page": the address the report page talks to.',
  ],
  [
    'proof_folder_id',
    '',
    'Filled in automatically: the Drive folder where proof-of-payment files are saved.',
  ],
];

/** The settings in the Settings tab's rows, plus defaults for missing keys. The first row for a key wins. */
export function settingsFrom(rows: Row[]): Settings {
  // A plain object and `in`, as in the original, so lookups behave exactly as they did.
  const values: Settings = {};
  rows.forEach((row) => {
    const key = String(row.key);
    if (!(key in values)) values[key] = row.value;
  });
  DEFAULT_SETTINGS.forEach(([key, value]) => {
    if (!(key in values)) values[key] = value;
  });
  return values;
}

/**
 * The programme's settings, read once per run (each web request, menu click or trigger is a
 * new run). Without a Settings tab the defaults are returned, and not cached.
 */
export function settings(): Settings {
  if (cache) return cache;
  let rows: Row[] | null = null;
  try {
    rows = readTable('settings').rows;
  } catch {
    // No Settings tab yet (before setup has run).
  }
  const values = settingsFrom(rows ?? []);
  if (rows) cache = values;
  return values;
}

export function clearSettingsCache(): void {
  cache = null;
}

/** Writes one setting, adding a row for it if the tab does not have one yet. */
export function setSetting(key: string, value: Cell): void {
  clearSettingsCache();
  const table = readTable('settings');
  const row = table.rows.find((r) => String(r.key) === key);
  if (row) setCells(table, row._row, { value });
  else appendTableRow('settings', { key, value, about: '' });
}

/**
 * appendRow for callers that may add a setting, which makes the cached settings stale (setup
 * adds missing settings with it).
 */
export function appendTableRow(key: TabKey, record: Record<string, unknown>): void {
  if (key === 'settings') clearSettingsCache();
  appendRow(key, record);
}

/** The currency symbol shown before amounts of money ("R" unless the Settings tab says otherwise). */
export function currency(): string {
  const symbol = settings().currency_symbol;
  return symbol === undefined || symbol === null || symbol === '' ? 'R' : String(symbol).trim();
}

/** An amount of money for people: rounded to a whole number, with thousands separators. */
export function money(amount: unknown): string {
  const whole = Math.round(toNumber(amount));
  return currency() + String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** The programme's short name, for example URA. */
export function shortName(): string {
  return String(settings().short_name || 'Report').trim() || 'Report';
}

/** The short name as it appears in file names: "URA" becomes "ura". */
export function slug(): string {
  return (
    shortName()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'report'
  );
}

/** The ready-to-upload page made by "Prepare the report page", for example ura-report.html. */
export function pageName(): string {
  return slug() + '-report.html';
}

/** The template it is made from, kept in the same Drive folder as the Sheet. */
export function pageTemplateName(): string {
  return slug() + '-report TEMPLATE.html';
}

/** For example "URA report". */
export function reportName(): string {
  return shortName() + ' report';
}
