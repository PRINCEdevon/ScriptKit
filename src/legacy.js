// Transitional copy of legacy/Code.gs, bundled by scripts/build.js (see docs/migration-plan.md).
//
// Below this header the code is legacy/Code.gs unchanged. Migration PRs only delete the
// declarations they move into typed modules and add imports for them;
// tests/legacy-source.test.ts checks that whatever remains is still identical to the original.
// Never change, format or lint what remains: this file is excluded from TypeScript, ESLint and
// Prettier, and src/legacy.d.ts describes its exports.

import {
  appendTableRow as appendRow_,
  DEFAULT_SETTINGS,
  pageName as pageName_,
  pageTemplateName as pageTemplateName_,
  reportName as reportName_,
  setSetting as setSetting_,
  settings as settings_,
} from './config.js';
import {
  noonDate as d_,
  dayKey as dstr_,
  parseDay as parseDay_,
  timeZone as tz_,
  readWeeks as weeks_,
} from './dates.js';
import {
  DEFAULT_RULES,
} from './feedback.js';
import {
  uploadSteps as uploadSteps_,
} from './page.js';
import {
  recordReport as recordReport_,
  refreshReportLog as refreshReportLog_,
} from './reports.js';
import {
  lastDataRow as lastRealRow_,
  setCells as setCells_,
  spreadsheet as ss_,
  readTable as table_,
  TABS,
  toast as toast_,
} from './sheets.js';
import {
  createLinks as createLinks_,
  allTeams as teamsAll_,
} from './teams.js';
import {
  toNumber as num_,
} from './utils.js';

/**
 * Mashauri Revenue Accelerator: Monday report.
 *
 * One copy of this script runs each programme (for example the URA report for the
 * USSAVI Revenue Accelerator). It lives inside that programme's own Google Sheet
 * (Extensions > Apps Script). Everything that differs between programmes (the name,
 * the page address, the time zone and the currency) is in the Sheet's Settings tab,
 * so the code itself is the same for every programme. It does four jobs:
 *   1. Receives each team's Monday report from the report page and stores it in the Sheet.
 *   2. Works out the instant feedback, the team's history and the cohort scoreboard.
 *   3. Gives you a "Revenue Accelerator" menu in the Sheet for links, replies and demo data.
 *   4. Sends reminders, your replies and the mentor digests by email.
 *
 * The setup guide explains how to install and publish it. You should not need to edit
 * anything below; settings, dates and feedback wording all live in tabs of the Sheet.
 */

var DEFAULT_WEEKS = [
  // week, covers from, covers to, opens, due, scoreboard
  [1, [2026, 12, 1], [2026, 12, 6], [2026, 12, 6], [2026, 12, 7], 'Activity'],
  [2, [2026, 12, 7], [2026, 12, 13], [2026, 12, 13], [2026, 12, 14], 'Activity'],
  [3, [2026, 12, 14], [2026, 12, 20], [2026, 12, 20], [2026, 12, 21], 'Activity', 'Last report before the Christmas break'],
  [4, [2027, 1, 4], [2027, 1, 10], [2027, 1, 10], [2027, 1, 11], 'Activity'],
  [5, [2027, 1, 11], [2027, 1, 17], [2027, 1, 17], [2027, 1, 18], 'Activity'],
  [6, [2027, 1, 18], [2027, 1, 24], [2027, 1, 24], [2027, 1, 25], 'Revenue', 'Checkpoint week'],
  [7, [2027, 1, 25], [2027, 1, 31], [2027, 1, 31], [2027, 2, 1], 'Revenue'],
  [8, [2027, 2, 1], [2027, 2, 7], [2027, 2, 7], [2027, 2, 8], 'Revenue'],
  [9, [2027, 2, 8], [2027, 2, 14], [2027, 2, 14], [2027, 2, 15], 'Revenue'],
  [10, [2027, 2, 15], [2027, 2, 21], [2027, 2, 21], [2027, 2, 22], 'Revenue', 'Demo Day week']
];

/* Feedback wording that earlier versions used. Setup replaces it with the current wording,
   but only where the text in the Feedback rules tab is still exactly the old wording. */
var OLD_RULE_TEXT = {
  org_moves: { when: ["At least one organisation moved forward."] },
  org_no_moves: { lead: ["None of your organisations moved forward a stage this week."], when: ["No organisation moved forward."] },
  org_stuck: { flag: ["Stuck organisation"], when: ["An organisation has not moved in three reports."] },
  checkpoint_org_none: { detail: ["You will need a paid pilot or a signed letter of intent. Your furthest organisation is at \"{furthest_stage_name}\"."] },
  checkpoint_org_ok: { detail: ["You already have an organisation that has signed or paid. Keep the signed letter or proof of payment ready."] },
  cohort_org: { lead: ["The middle Organisation-track team moved {median_moved} organisations forward this week."] }
};

/* ============================== Setup ============================== */

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet() || ss_();
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());
  SETTINGS_CACHE_ = null;
  Object.keys(TABS).forEach(function (k) { ensureTab_(ss, TABS[k]); });

  // Settings: add any missing keys, never overwrite yours.
  var st = table_('settings');
  var have = st.rows.map(function (r) { return String(r.key); });
  DEFAULT_SETTINGS.forEach(function (d) { if (have.indexOf(d[0]) < 0) appendRow_('settings', { key: d[0], value: d[1], about: d[2] }); });
  var upgraded = tidySettings_();
  ss.setSpreadsheetTimeZone(tz_());
  writeStartHere_(ss);

  var wk = table_('weeks');
  if (!wk.rows.length) {
    var vals = DEFAULT_WEEKS.map(function (w) { return [w[0], d_(w[1]), d_(w[2]), d_(w[3]), d_(w[4]), w[5], w[6] || '']; });
    wk.sheet.getRange(2, 1, vals.length, 7).setValues(vals);
    wk.sheet.getRange(2, 2, vals.length, 4).setNumberFormat('ddd d mmm yyyy');
  }
  var ru = table_('rules');
  if (!ru.rows.length) {
    var rv = DEFAULT_RULES.map(function (r) { return r.slice(); });
    ru.sheet.getRange(2, 1, rv.length, rv[0].length).setValues(rv);
  } else upgradeRuleText_(ru);

  // Helpful formatting and drop-downs.
  var tt = table_('teams');
  setValidationList_(tt.sheet, tt.col.track, ['Direct', 'Organisation']);
  setValidationList_(tt.sheet, tt.col.status, ['Active', 'Stopped']);
  var rp = table_('reports');
  tidyReportRows_(rp);
  setValidationList_(ru.sheet, ru.col.on, ['Yes', 'No']);
  setValidationList_(ru.sheet, ru.col.track, ['Both', 'Direct', 'Organisation']);
  [['reports', ['flags', 'reply', 'customers_said', 'changing', 'blocker', 'feedback_text']], ['rules', ['lead', 'detail', 'when']], ['settings', ['about']]].forEach(function (x) {
    var t = table_(x[0]);
    x[1].forEach(function (k) { t.sheet.setColumnWidth(t.col[k], 280); t.sheet.getRange(1, t.col[k], 1000, 1).setWrap(true); });
  });
  rp.sheet.getRange(1, rp.col.reply, 1, 3).setBackground('#fde8eb');
  var hideFrom = rp.col.team_id;
  rp.sheet.hideColumns(hideFrom, rp.headers.length - hideFrom + 1);

  var blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  refreshReportLog_();
  var links = createLinks_();
  ss.setActiveSheet(ss.getSheetByName('Teams'));
  var notes = [];
  if (upgraded.length) notes.push('Settings updated to the new defaults: ' + upgraded.join(', ') + '.');
  if (links.changed) notes.push(links.changed + ' team ' + (links.changed === 1 ? 'link' : 'links') + ' updated to ' + settings_().report_page_url + '.');
  toast_('The sheet is ready. ' + (notes.length ? notes.join(' ') : 'Next: add your teams in the Teams tab, or try "Add demo data".'));
}

/* Values that earlier versions used as defaults, upgraded automatically by setup. Anything you typed yourself is left alone. */
var OLD_DEFAULTS = {
  programme_name: ['Mashauri Revenue Accelerator'],
  report_page_url: ['https://tools.mashauri.org/revenue-report.html']
};

/** Removes repeated setting rows (keeping the filled-in value) and upgrades old default values. Returns the upgraded keys. */
function tidySettings_() {
  var t = table_('settings');
  var first = {}, extra = [];
  t.rows.forEach(function (r) {
    var k = String(r.key || '').trim();
    if (!k) return;
    if (!first[k]) { first[k] = r; return; }
    if (String(first[k].value) === '' && String(r.value) !== '') { setCells_(t, first[k]._row, { value: r.value }); first[k].value = r.value; }
    extra.push(r._row);
  });
  extra.sort(function (a, b) { return b - a; }).forEach(function (n) { t.sheet.deleteRow(n); });
  var upgraded = [];
  Object.keys(OLD_DEFAULTS).forEach(function (k) {
    if (first[k] && OLD_DEFAULTS[k].indexOf(String(first[k].value).trim()) >= 0) upgraded.push(k);
  });
  SETTINGS_CACHE_ = null;
  upgraded.forEach(function (k) {
    var d = find_(DEFAULT_SETTINGS, function (x) { return x[0] === k; });
    setSetting_(k, d[1]);
    var tt = table_('settings'), row = find_(tt.rows, function (x) { return String(x.key) === k; });
    if (row) setCells_(tt, row._row, { about: d[2] });
  });
  if (extra.length) SETTINGS_CACHE_ = null;
  return upgraded;
}

/** Rewrites the "Start here" tab so its instructions always match this Sheet's settings. */
function writeStartHere_(ss) {
  var s = settings_();
  var sh = ss.getSheetByName('Start here') || ss.insertSheet('Start here', 0);
  var lines = [
    [s.programme_name + ': ' + reportName_() + ' (Monday reports)'],
    ['This Sheet stores every Monday report for this programme. This tab is rewritten each time you run "Set up or repair the sheet"; do not type in it.'],
    [''],
    ['Once, before teams get their links'],
    ['1. Settings tab: check programme_name, short_name, report_page_url, time_zone and currency_symbol.'],
    ['2. Revenue Accelerator > Create missing team links (this also updates every link after report_page_url changes).'],
    ['3. Revenue Accelerator > Prepare the report page... It makes ' + pageName_() + ' from ' + pageTemplateName_() + ' in this Drive folder.'],
    ['4. ' + uploadSteps_(pageName_())],
    ['5. Revenue Accelerator > Email teams their links..., then Revenue Accelerator > Turn on automatic emails.'],
    [''],
    ['Every week: Revenue Accelerator > Show this week\'s reports, type replies in "Your reply", tick "Send reply", then Send ticked replies.'],
    ['The full guide is the README in Drive, next to this Sheet.']
  ];
  sh.clearContents();
  sh.getRange(1, 1, lines.length, 1).setValues(lines).setWrap(true).setVerticalAlignment('top');
  sh.getRange(1, 1).setFontWeight('bold').setFontSize(16);
  sh.getRange(4, 1).setFontWeight('bold');
  sh.setColumnWidth(1, 900);
}

/** Updates feedback wording that is still exactly an older default. Wording you edited yourself is left alone. */
function upgradeRuleText_(ru) {
  var cols = ['id', 'track', 'on', 'tone', 'lead', 'detail', 'flag', 'when'];
  ru.rows.forEach(function (r) {
    var old = OLD_RULE_TEXT[String(r.id)];
    var cur = find_(DEFAULT_RULES, function (d) { return d[0] === String(r.id); });
    if (!old || !cur) return;
    var upd = {};
    Object.keys(old).forEach(function (k) { if (old[k].indexOf(String(r[k])) >= 0) upd[k] = cur[cols.indexOf(k)]; });
    if (Object.keys(upd).length) setCells_(ru, r._row, upd);
  });
}

function ensureTab_(ss, def) {
  var sh = ss.getSheetByName(def.name);
  if (!sh) sh = ss.insertSheet(def.name);
  var lastCol = sh.getLastColumn();
  var existing = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
  var missing = def.cols.filter(function (c) { return [c[1]].concat(c[2] || []).every(function (h) { return existing.indexOf(h) < 0; }); });
  var need = existing.length + missing.length - sh.getMaxColumns();
  if (need > 0) sh.insertColumnsAfter(sh.getMaxColumns(), need);
  missing.forEach(function (c) { existing.push(c[1]); sh.getRange(1, existing.length).setValue(c[1]); });
  sh.getRange(1, 1, 1, existing.length).setFontWeight('bold').setBackground('#f1f1f4');
  sh.setFrozenRows(1);
}

function setValidationList_(sh, col, list) {
  sh.getRange(2, col, 999, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build());
}

/* ============================== Demo data ============================== */

function menuAddDemo() {
  var res = addDemo_();
  toast_('Demo data added. The system now pretends today is ' + res.pretend + '. Open a demo team\'s "Report link" from the Teams tab to try the page.');
}

function addDemo_() {
  removeDemo_();
  var demo = [
    ['DEMO1', 'Demo Direct team', 'Direct', 'Founder One, Founder Two'],
    ['DEMO2', 'Demo Organisation team', 'Organisation', 'Founder One, Founder Two, Founder Three'],
    ['DEMO3', 'Demo team: tutoring', 'Direct', 'A, B'],
    ['DEMO4', 'Demo team: hair products', 'Direct', 'A, B'],
    ['DEMO5', 'Demo team: laundry service', 'Direct', 'A, B'],
    ['DEMO6', 'Demo team: school software', 'Organisation', 'A, B'],
    ['DEMO7', 'Demo team: clinic booking', 'Organisation', 'A, B']
  ];
  demo.forEach(function (d) { appendRow_('teams', { team_id: d[0], team_name: d[1], track: d[2], status: 'Active', founders: d[3], notes: 'Demo data: remove with "Remove demo data".' }); });
  createLinks_();
  var weeks = weeks_();
  var byId = {};
  teamsAll_().forEach(function (t) { byId[t.team_id] = t; });
  var R = function (by, rev, cust, asked, yes, no, ny, ga, gr, said, call) {
    return { submitted_by: by, revenue: rev, new_customers: cust, asked: asked, yes: yes, no: no, not_yet: ny, goal_asks: ga, goal_revenue: gr,
      customers_said: said, changing: '', goal_text: '', blocker: '', asked_names: '', wants_reply: 'No', mentor_call: call || 'Yes', mentor_note: '' };
  };
  var plan = [
    ['DEMO1', 1, R('Founder One', 200, 1, 6, 1, 3, 2, 10, 400, 'Salon owners like it but want to pay at month end.'), []],
    ['DEMO1', 2, R('Founder Two', 500, 3, 9, 3, 2, 4, 15, 500, 'Two salons asked for a cheaper trial.'), []],
    ['DEMO3', 1, R('A', 0, 0, 8, 0, 6, 2, 12, 300, 'Parents want results before paying.', 'No'), []],
    ['DEMO3', 2, R('A', 300, 2, 12, 2, 7, 3, 15, 500, 'A free first session helped.', 'No'), []],
    ['DEMO4', 1, R('A', 450, 3, 10, 3, 5, 2, 15, 600, 'Price is fine; delivery is the issue.'), []],
    ['DEMO4', 2, R('A', 600, 4, 16, 4, 9, 3, 20, 800, 'Repeat buyers asked for bigger bottles.'), []],
    ['DEMO5', 1, R('A', 0, 0, 3, 0, 1, 2, 8, 200, 'Students do not trust a new service.'), []],
    ['DEMO2', 1, R('Founder One', 0, 0, 3, 1, 0, 2, 4, 0, 'Schools want to see it working first.'),
      [['Secondary school, Soweto', 2, 'Demo to the deputy principal'], ['Private clinic, Braamfontein', 1, 'First meeting'], ['Municipal library service', 3, 'Proposal sent']]],
    ['DEMO2', 2, R('Founder Two', 0, 0, 3, 1, 1, 1, 4, 0, 'The library needs approval from the budget committee.'),
      [['Secondary school, Soweto', 2, 'Waiting for a reply'], ['Private clinic, Braamfontein', 1, 'Second meeting booked'], ['Municipal library service', 3, 'Waiting for budget meeting']]],
    ['DEMO6', 1, R('A', 0, 0, 4, 2, 1, 1, 5, 0, 'Principals like it; governing bodies decide.'), [['School A', 2, ''], ['School B', 1, '']]],
    ['DEMO6', 2, R('A', 0, 0, 5, 2, 2, 1, 5, 0, 'Governing body meets in January.'), [['School A', 4, 'Head agreed'], ['School B', 2, ''], ['School C', 1, '']]],
    ['DEMO7', 1, R('A', 0, 0, 2, 1, 0, 1, 4, 0, 'Clinics want a pilot.'), [['Clinic A', 1, '']]],
    ['DEMO7', 2, R('A', 0, 0, 3, 1, 1, 1, 4, 0, 'Clinic A will try it for a month.'), [['Clinic A', 3, 'Pilot price sent'], ['Clinic B', 1, '']]],
    ['DEMO3', 3, R('A', 250, 1, 11, 1, 6, 4, 15, 500, 'Parents prefer weekly payments.', 'Yes'), []],
    ['DEMO4', 3, R('A', 900, 5, 22, 5, 12, 5, 25, 1000, 'Hair salons want to stock it.'), []],
    ['DEMO6', 3, R('A', 0, 0, 4, 2, 1, 1, 5, 0, 'School A wants a letter template.'), [['School A', 4, ''], ['School B', 3, 'Price sent'], ['School C', 2, '']]]
  ];
  plan.forEach(function (p) {
    var team = byId[p[0]];
    var w = find_(weeks, function (x) { return x.week === p[1]; });
    var pipeline = p[3].map(function (o) { return { organisation: o[0], stage: o[1], note: o[2] }; });
    var when = parseDay_(dstr_(w.due)); when.setHours(10, 15);
    recordReport_(team, w, weeks, p[2], pipeline, [], when, false);
  });
  // One reply already sent, so the history shows how replies appear.
  var t = table_('reports');
  var r1 = find_(t.rows, function (r) { return r.team_id === 'DEMO1' && num_(r.week) === 1; });
  if (r1) setCells_(t, r1._row, { reply: 'A real start: a paying customer in week 1. Next week, ask for payment in the first conversation, not the third.', reply_sent_at: new Date() });
  var w3 = find_(weeks, function (x) { return x.week === 3; }) || weeks[weeks.length - 1];
  var pretend = dstr_(w3.opens);
  setSetting_('pretend_today', pretend);
  try { refreshReportLog_(); } catch (e) { }
  return { pretend: pretend };
}

function menuRemoveDemo() { removeDemo_(); setSetting_('pretend_today', ''); toast_('Demo data removed, and the date is back to today.'); }

function removeDemo_() {
  ['reports', 'pipeline', 'corrections', 'teams'].forEach(function (k) {
    var t = table_(k);
    var rows = t.rows.filter(function (r) { return /^DEMO/.test(String(r.team_id)); }).map(function (r) { return r._row; }).sort(function (a, b) { return b - a; });
    rows.forEach(function (n) { t.sheet.deleteRow(n); });
  });
  try { refreshReportLog_(); } catch (e) { }
}

/* ============================== Sheet helpers ============================== */

/** Gives every real report a tick box, and removes tick boxes (and anything else) from the empty rows below. */
function tidyReportRows_(t) {
  var sh = t.sheet;
  var last = lastRealRow_(t);
  var below = sh.getMaxRows() - last;
  if (below > 0) {
    var rng = sh.getRange(last + 1, 1, below, sh.getMaxColumns());
    rng.clearDataValidations();
    rng.clearContent();
  }
  if (last > 1 && t.col.send_reply) {
    var cb = sh.getRange(2, t.col.send_reply, last - 1, 1);
    var vals = cb.getValues();
    cb.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
    cb.setValues(vals.map(function (v) { return [v[0] === true]; }));
  }
}

/* ============================== Small utilities ============================== */

function fmtStamp_(d) { return Utilities.formatDate(d, tz_(), 'yyyy-MM-dd HH:mm'); }
function find_(arr, fn) { for (var i = 0; i < arr.length; i++) if (fn(arr[i])) return arr[i]; return null; }
// Apps Script entrypoints, re-exported by src/main.ts. Apps Script calls these by name.
export {
  setup,
  menuAddDemo,
  menuRemoveDemo,
};
