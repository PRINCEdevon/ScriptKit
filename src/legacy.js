// Transitional copy of legacy/Code.gs, bundled by scripts/build.js (see docs/migration-plan.md).
//
// Below this header the code is legacy/Code.gs unchanged. Migration PRs only delete the
// declarations they move into typed modules and add imports for them;
// tests/legacy-source.test.ts checks that whatever remains is still identical to the original.
// Never change, format or lint what remains: this file is excluded from TypeScript, ESLint and
// Prettier, and src/legacy.d.ts describes its exports.

import {
  appendTableRow as appendRow_,
  currency as currency_,
  DEFAULT_SETTINGS,
  money as money_,
  pageName as pageName_,
  pageTemplateName as pageTemplateName_,
  reportName as reportName_,
  setSetting as setSetting_,
  settings as settings_,
  shortName as shortName_,
} from './config.js';
import {
  checkpointLabel as checkpointLabel_,
  currentWeek as currentWeek_,
  noonDate as d_,
  dayKey as dstr_,
  longDate as longDate_,
  parseDay as parseDay_,
  rangeLabel as rangeLabel_,
  stampLabel as stampLabel_,
  today as todayStr_,
  timeZone as tz_,
  readWeeks as weeks_,
} from './dates.js';
import {
  parentFolder as parentFolder_,
} from './drive.js';
import {
  DEFAULT_RULES,
} from './feedback.js';
import {
  latestSnapshot as latestSnapshot_,
  STAGE_NAMES,
} from './pipeline.js';
import {
  byWeek as byWeek_,
  lastBefore as lastBefore_,
  LOG_TAB,
  recordReport as recordReport_,
  refreshReportLog as refreshReportLog_,
  readReports as reportsAll_,
  submitCorrection as submitCorrection_,
  submitReport as submitReport_,
} from './reports.js';
import {
  scoreboard as scoreboard_,
  totals as totals_,
} from './scoreboard.js';
import {
  lastDataRow as lastRealRow_,
  setCells as setCells_,
  spreadsheet as ss_,
  readTable as table_,
  readRows as tableRows_,
  TABS,
} from './sheets.js';
import {
  createLinks as createLinks_,
  isDemo as isDemo_,
  teamByToken as teamByToken_,
  allTeams as teamsAll_,
  trackOf as trackOf_,
} from './teams.js';
import {
  listOf as listOf_,
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

/* ============================== Web endpoints ============================== */

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (p.action === 'get') return json_(getTeamView_(String(p.t || '')));
    return json_({ ok: false, error: 'unknown', message: 'Nothing to see here.' });
  } catch (err) {
    return json_({ ok: false, error: 'server', message: String(err && err.message || err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action === 'submit') return json_(submitReport_(body));
    if (body.action === 'correct') return json_(submitCorrection_(body));
    return json_({ ok: false, error: 'unknown', message: 'Unknown request.' });
  } catch (err) {
    return json_({ ok: false, error: 'server', message: String(err && err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ============================== Reading the team's page ============================== */

function getTeamView_(token) {
  var settings = settings_();
  var team = teamByToken_(token);
  if (!team) return { ok: false, error: 'link', message: 'This link does not work.', contact: settings.contact_email };

  var weeks = weeks_();
  var today = todayStr_();
  var cur = currentWeek_(weeks, today);
  var reports = reportsAll_();
  var mine = reports.filter(function (r) { return r.team_id === team.team_id; }).sort(byWeek_);
  var thisRep = cur ? find_(mine, function (r) { return r.week === cur.week; }) : null;

  var status = 'open';
  if (String(team.status).toLowerCase() === 'stopped') status = 'stopped';
  else if (!cur) status = 'not_started';
  else if (thisRep) status = 'submitted';

  var beforeWeek = cur ? cur.week : 999;
  var prev = lastBefore_(mine, beforeWeek);
  var pipelineAll = tableRows_('pipeline').filter(function (r) { return r.team_id === team.team_id; });
  var snapWeek = status === 'submitted' ? beforeWeek + 1 : beforeWeek;
  var snapshot = latestSnapshot_(pipelineAll, snapWeek).filter(function (o) { return o.stage > 0; });

  var corrections = tableRows_('corrections').filter(function (c) { return c.team_id === team.team_id; });
  var history = mine.slice().reverse().map(function (r) {
    return {
      week: r.week, late: r.late === 'Yes', asked: r.asked, yes: r.yes, no: r.no, not_yet: r.not_yet,
      revenue: r.revenue, new_customers: r.new_customers, moved: r.orgs_moved,
      reply: r.reply_sent_at ? String(r.reply || '') : '',
      corrections: corrections.filter(function (c) { return num_(c.week) === r.week; }).map(function (c) { return String(c.note); })
    };
  });

  var view = {
    ok: true,
    programme: settings.programme_name,
    shortName: shortName_(),
    currency: currency_(),
    contact: settings.contact_email,
    team: { name: team.team_name, track: trackOf_(team), founders: listOf_(team.founders) },
    status: status,
    week: cur ? weekInfo_(cur) : null,
    firstWeek: weeks.length ? weekInfo_(weeks[0]) : null,
    weeksTotal: weeks.length,
    checkpointDate: checkpointLabel_(weeks),
    prev: prev ? { week: prev.week, asked: prev.asked, revenue: prev.revenue, goal_asks: prev.goal_asks, goal_revenue: prev.goal_revenue, goal_text: String(prev.goal_text || '') } : null,
    pipeline: snapshot.map(function (o) { return { organisation: o.organisation, stage: o.stage, note: o.note }; }),
    totals: totals_(mine, cur ? cur.week : 0),
    thisReport: thisRep ? {
      submitted_at: stampLabel_(thisRep.submitted_at), submitted_by: thisRep.submitted_by, late: thisRep.late === 'Yes',
      feedback: parseJson_(thisRep.feedback_json, [])
    } : null,
    history: history,
    scoreboard: cur ? scoreboard_(cur, weeks, reports, team.team_id, today) : null,
    stages: STAGE_NAMES
  };
  return view;
}

function weekInfo_(w) {
  return {
    n: w.week,
    covers: rangeLabel_(w.covers_start, w.covers_end),
    due: longDate_(w.due),
    opens: longDate_(w.opens),
    phase: String(w.scoreboard || 'Activity')
  };
}

/* ============================== Preparing the report page ============================== */

function menuPreparePage() {
  var ui = SpreadsheetApp.getUi();
  var saved = String(settings_().web_app_url || '').trim();
  var res = ui.prompt('Prepare the report page',
    'Paste the web app address from the Deploy screen. It starts with https://script.google.com/ and ends with /exec.' +
    (saved ? '\n\nOr leave this empty to use the address already saved in Settings:\n' + saved : ''),
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var url = String(res.getResponseText() || '').trim() || saved;
  if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) {
    ui.alert('That does not look like the web app address. It should start with https://script.google.com/ and end with /exec. Copy it again from Deploy > Manage deployments.');
    return;
  }
  var out = preparePage_(url);
  ui.alert('The report page is ready', out.name + ' is now in the same Drive folder as this Sheet, with your web app address already inside it.\n\n' + uploadSteps_(out.name), ui.ButtonSet.OK);
}

/** Says where to upload the page so that it sits at report_page_url. */
function uploadSteps_(fileName) {
  var url = String(settings_().report_page_url || '').trim();
  var m = url.match(/^https?:\/\/([^\/]+)\/(.*)$/);
  if (!m) return 'Upload it to your website so that it sits at ' + url + '.';
  var host = m[1], path = m[2].replace(/\?.*$/, '');
  if (!path || /\/$/.test(path)) {
    var folder = path.replace(/\/$/, '');
    return 'Upload it in File Manager: open ' + host + ' > public_html' + (folder ? ', create a folder called "' + folder + '" (once), open it,' : ',') +
      ' upload ' + fileName + ' and rename it to index.html. It then opens at ' + url + '.';
  }
  return 'Upload it to ' + host + ' > public_html' + (path.indexOf('/') > 0 ? '/' + path.replace(/\/[^\/]*$/, '') : '') + ' so that it sits at ' + url + '.';
}

function preparePage_(url) {
  var folder = parentFolder_();
  var settings = settings_();
  var templateName = pageTemplateName_(), pageName = pageName_();
  var it = folder.getFilesByName(templateName);
  if (!it.hasNext()) throw new Error('Could not find "' + templateName + '" in the same Drive folder as this Sheet. Its name must match the short_name in Settings.');
  var html = it.next().getBlob().getDataAsString('UTF-8');
  var placeholder = "'PASTE_YOUR_WEB_APP_URL_HERE'";
  if (html.indexOf(placeholder) < 0) throw new Error('The page template has been changed: it no longer contains the place for the web app address.');
  var programme = String(settings.programme_name || 'Mashauri Revenue Accelerator');
  var fill = {
    '__PAGE_TITLE__': reportName_() + ' · ' + programme,
    '__PAGE_DESCRIPTION__': 'The weekly report page for teams in the ' + programme + '. It only opens with a team\'s private link.',
    '__PROGRAMME_NAME__': programme
  };
  html = html.replace(placeholder, "'" + url + "'");
  Object.keys(fill).forEach(function (k) { html = html.split(k).join(htmlEscape_(fill[k])); });
  var old = folder.getFilesByName(pageName);
  while (old.hasNext()) old.next().setTrashed(true);
  folder.createFile(Utilities.newBlob(html, 'text/html', pageName));
  setSetting_('web_app_url', url);
  return { name: pageName };
}

function htmlEscape_(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

/* ============================== Emails ============================== */

function sendTickedReplies_() {
  var t = table_('reports');
  var settings = settings_();
  var teams = teamsAll_();
  var sent = 0;
  t.rows.forEach(function (r) {
    if (r.send_reply !== true || !String(r.reply || '').trim() || r.reply_sent_at) return;
    var team = find_(teams, function (x) { return x.team_id === r.team_id; });
    if (!team) return;
    var to = listOf_(team.founder_emails).join(',');
    if (to) {
      var cc = String(settings.cc_mentor_on_replies).toLowerCase() === 'yes' ? String(team.mentor_email || '') : '';
      sendMail_(to, cc, reportName_() + ', week ' + num_(r.week) + ': a reply from ' + settings.signoff,
        'Hello ' + team.team_name + ',\n\n' + String(r.reply).trim() + '\n\nAll your reports and replies are here:\n' + team.report_link + '\n\n' + settings.signoff);
    }
    setCells_(t, r._row, { reply_sent_at: new Date(), send_reply: false });
    sent++;
  });
  return sent;
}

/** Safety: while a pretend date is set, the automatic emails only run if every email is redirected to a test address. */
function pretendBlocksAutoEmails_() {
  var s = settings_();
  if (String(s.pretend_today || '').trim() && !String(s.send_all_emails_to || '').trim()) {
    Logger.log('Automatic emails skipped: pretend_today is set and send_all_emails_to is empty.');
    return true;
  }
  return false;
}

function autoMondayReminder() {
  var settings = settings_();
  if (String(settings.reminders_on).toLowerCase() !== 'yes' || pretendBlocksAutoEmails_()) return;
  var cur = currentWeek_(weeks_(), todayStr_());
  if (!cur || dstr_(cur.due) !== todayStr_()) return;
  sendReminders_(cur);
}

/** The teams that have not yet sent the report for this week (demo and stopped teams left out). */
function teamsMissing_(cur) {
  var reports = reportsAll_();
  return teamsAll_().filter(function (t) {
    if (!t.team_name || String(t.status).toLowerCase() === 'stopped' || isDemo_(t)) return false;
    if (find_(reports, function (r) { return r.team_id === t.team_id && r.week === cur.week; })) return false;
    return listOf_(t.founder_emails).length && t.report_link;
  });
}

function sendReminders_(cur) {
  var settings = settings_();
  var due = dstr_(cur.due) === todayStr_();
  var teams = teamsMissing_(cur);
  teams.forEach(function (t) {
    sendMail_(listOf_(t.founder_emails).join(','), '', 'Your ' + reportName_() + ' is due ' + (due ? 'today' : 'on ' + longDate_(cur.due)),
      'Hello ' + t.team_name + ',\n\nYour report for week ' + cur.week + ' (' + rangeLabel_(cur.covers_start, cur.covers_end) + ') is due ' + (due ? 'today' : 'on ' + longDate_(cur.due)) + '. It takes about seven minutes:\n' + t.report_link + '\n\n' + settings.signoff);
  });
  return teams.length;
}

function autoDigests() {
  var settings = settings_();
  if (String(settings.digests_on).toLowerCase() !== 'yes' || pretendBlocksAutoEmails_()) return;
  var cur = currentWeek_(weeks_(), todayStr_());
  if (!cur) return;
  sendDigests_(cur);
}

function sendDigests_(cur) {
  var settings = settings_();
  var reports = reportsAll_();
  var teams = teamsAll_().filter(function (t) { return String(t.status).toLowerCase() !== 'stopped' && !isDemo_(t) && t.team_name; });
  var byMentor = {};
  var summary = [];
  teams.forEach(function (t) {
    var r = find_(reports, function (x) { return x.team_id === t.team_id && x.week === cur.week; });
    var text = digestBlock_(t, r);
    summary.push(text);
    var m = String(t.mentor_email || '').trim();
    if (m) (byMentor[m] = byMentor[m] || []).push(text);
  });
  Object.keys(byMentor).forEach(function (m) {
    sendMail_(m, '', reportName_() + ', week ' + cur.week + ': Monday reports from your ' + (byMentor[m].length === 1 ? 'team' : 'teams'),
      'Hello,\n\nHere is what your team sent for week ' + cur.week + ' (' + rangeLabel_(cur.covers_start, cur.covers_end) + ').\n\n' +
      byMentor[m].join('\n\n') + '\n\nThank you for coaching them.\n' + settings.signoff);
  });
  if (settings.admin_email && summary.length) {
    sendMail_(String(settings.admin_email), '', reportName_() + ', week ' + cur.week + ': summary of Monday reports',
      summary.join('\n\n') + '\n\nOpen the Reports tab and use "Revenue Accelerator > Show this week\'s reports" to reply.');
  }
  return { mentors: Object.keys(byMentor).length, summary: !!(settings.admin_email && summary.length) };
}

function digestBlock_(t, r) {
  if (!r) return '== ' + t.team_name + ' (' + trackOf_(t) + ') ==\nNo report yet.';
  var lines = ['== ' + t.team_name + ' (' + trackOf_(t) + ')' + (r.late === 'Yes' ? ' – late' : '') + ' =='];
  lines.push('Money received: ' + money_(r.revenue) + (trackOf_(t) === 'Direct' ? ' · new paying customers: ' + r.new_customers : ' · potential customers moved forward: ' + num_(r.orgs_moved)));
  lines.push('Asked: ' + r.asked + ' · yes ' + r.yes + ' · no ' + r.no + ' · not yet ' + r.not_yet);
  lines.push('Customers said: ' + r.customers_said);
  if (r.changing) lines.push('Changing: ' + r.changing);
  lines.push('Next week: ask ' + r.goal_asks + ', receive ' + money_(r.goal_revenue) + (r.goal_text ? ' – ' + r.goal_text : ''));
  if (r.blocker) lines.push('Blocker: ' + r.blocker + (r.wants_reply === 'Yes' ? ' (wants a reply)' : ''));
  lines.push('Mentor call: ' + r.mentor_call + (r.mentor_note ? ' – ' + r.mentor_note : ''));
  if (r.flags) lines.push('Flags: ' + r.flags);
  return lines.join('\n');
}

function sendMail_(to, cc, subject, body) {
  var s = settings_();
  var opts = { name: String(s.programme_name || 'Mashauri Revenue Accelerator') };
  var redirect = String(s.send_all_emails_to || '').trim();
  if (redirect) {
    body = '[TEST: this email would have gone to ' + to + (cc ? ', copied to ' + cc : '') + ']\n\n' + body;
    subject = '[TEST] ' + subject;
    to = redirect; cc = '';
  }
  if (cc) opts.cc = cc;
  if (s.contact_email) opts.replyTo = String(s.contact_email);
  MailApp.sendEmail(to, subject, body, opts);
}

/** One line saying where emails from this Sheet will go, for confirmation boxes. */
function emailDestination_() {
  var r = String(settings_().send_all_emails_to || '').trim();
  return r ? 'TEST MODE: every email goes to ' + r + ' only.' : 'Emails go to the real addresses in the Teams tab.';
}

/* ============================== Menu ============================== */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Revenue Accelerator')
    .addItem('Show this week\'s reports', 'menuShowThisWeek')
    .addItem('Show all reports', 'menuShowAll')
    .addItem('Send ticked replies', 'menuSendReplies')
    .addItem('Refresh the report log', 'menuRefreshLog')
    .addSeparator()
    .addItem('Prepare the report page…', 'menuPreparePage')
    .addItem('Create missing team links', 'menuCreateLinks')
    .addItem('Email teams their links…', 'menuEmailLinks')
    .addSeparator()
    .addItem('Turn on automatic emails', 'menuEmailsOn')
    .addItem('Turn off automatic emails', 'menuEmailsOff')
    .addSeparator()
    .addItem('Add demo data', 'menuAddDemo')
    .addItem('Remove demo data', 'menuRemoveDemo')
    .addSubMenu(SpreadsheetApp.getUi().createMenu('Testing')
      .addItem('Send reminders now…', 'menuRemindersNow')
      .addItem('Send Tuesday digests now…', 'menuDigestsNow'))
    .addItem('Set up or repair the sheet', 'setup')
    .addItem('Check permissions', 'checkSetup')
    .addToUi();
}

function menuRemindersNow() {
  var ui = SpreadsheetApp.getUi();
  var cur = currentWeek_(weeks_(), todayStr_());
  if (!cur) { ui.alert('No week is open yet (today counts as ' + todayStr_() + ').'); return; }
  var teams = teamsMissing_(cur);
  if (!teams.length) { ui.alert('Every team has sent its week ' + cur.week + ' report, so there is nobody to remind.'); return; }
  var ok = ui.alert('Send reminders now', 'This sends the week ' + cur.week + ' reminder to the ' + teams.length + (teams.length === 1 ? ' team' : ' teams') + ' that have not reported:\n\n' +
    teams.map(function (t) { return '• ' + t.team_name; }).join('\n') + '\n\n' + emailDestination_() + '\n\nContinue?', ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  var n = sendReminders_(cur);
  toast_(n + (n === 1 ? ' reminder sent.' : ' reminders sent.'));
}

function menuDigestsNow() {
  var ui = SpreadsheetApp.getUi();
  var cur = currentWeek_(weeks_(), todayStr_());
  if (!cur) { ui.alert('No week is open yet (today counts as ' + todayStr_() + ').'); return; }
  var ok = ui.alert('Send Tuesday digests now', 'This sends the week ' + cur.week + ' digest to every mentor in the Teams tab, and the summary to ' + (settings_().admin_email || 'nobody (admin_email is empty)') + '.\n\n' + emailDestination_() + '\n\nContinue?', ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  var r = sendDigests_(cur);
  toast_(r.mentors + ' mentor ' + (r.mentors === 1 ? 'digest' : 'digests') + (r.summary ? ' and your summary' : '') + ' sent.');
}

function menuShowThisWeek() {
  var cur = currentWeek_(weeks_(), todayStr_());
  var t = table_('reports');
  var sh = t.sheet;
  if (sh.getFilter()) sh.getFilter().remove();
  var range = sh.getRange(1, 1, Math.max(sh.getLastRow(), 2), sh.getLastColumn());
  var f = range.createFilter();
  if (cur) f.setColumnFilterCriteria(t.col.week, SpreadsheetApp.newFilterCriteria().whenNumberEqualTo(cur.week).build());
  sh.activate();
  toast_(cur ? 'Showing week ' + cur.week + '. Type your reply in "Your reply", tick "Send reply", then use "Send ticked replies".' : 'No week is open yet.');
}

function menuShowAll() {
  var sh = table_('reports').sheet;
  if (sh.getFilter()) sh.getFilter().remove();
  sh.activate();
}

function menuSendReplies() {
  var n = sendTickedReplies_();
  toast_(n ? n + (n === 1 ? ' reply sent.' : ' replies sent.') : 'No ticked replies to send. Tick "Send reply" next to a reply first.');
}

function menuRefreshLog() { refreshReportLog_(); ss_().getSheetByName(LOG_TAB).activate(); }

function menuCreateLinks() {
  var n = createLinks_();
  var msg = [];
  if (n.made) msg.push(n.made + ' new team ' + (n.made === 1 ? 'link' : 'links') + ' created.');
  if (n.changed) msg.push(n.changed + ' existing ' + (n.changed === 1 ? 'link' : 'links') + ' updated to the address in Settings.');
  toast_(msg.length ? msg.join(' ') : 'Every team already has an up-to-date link.');
}

function menuEmailLinks() {
  createLinks_();
  var ui = SpreadsheetApp.getUi();
  var settings = settings_();
  var t = table_('teams');
  var targets = t.rows.filter(function (r) { return r.team_name && !isDemo_(r) && String(r.status).toLowerCase() !== 'stopped' && listOf_(r.founder_emails).length && !r.link_sent_at; });
  if (!targets.length) { ui.alert('There are no teams waiting for their link. (A team gets its link once; clear "Link emailed at" to send it again.)'); return; }
  var ok = ui.alert('Email links', 'This emails ' + targets.length + (targets.length === 1 ? ' team its' : ' teams their') + ' private report link:\n\n' + targets.map(function (r) { return '• ' + r.team_name; }).join('\n') + '\n\n' + emailDestination_() + '\n\nContinue?', ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  var weeks = weeks_();
  var first = weeks[0];
  targets.forEach(function (r) {
    var names = listOf_(r.founders).map(function (n) { return n.split(' ')[0]; });
    sendMail_(listOf_(r.founder_emails).join(','), '', 'Your ' + reportName_() + ' link: ' + settings.programme_name,
      'Hello ' + (names.length ? names.join(', ') : r.team_name) + ',\n\n' +
      'This is your team\'s private link for the Monday report:\n' + r.report_link + '\n\n' +
      'Every Monday, one of you fills it in for the week before. It takes about seven minutes, and you get feedback straight away. ' +
      'Keep the link within your team: anyone who has it can report for you.\n\n' +
      (first ? 'Your first report opens on ' + longDate_(first.opens) + ' and is due on ' + longDate_(first.due) + '.\n\n' : '') +
      settings.signoff);
    setCells_(t, r._row, { link_sent_at: new Date() });
  });
  toast_('Links sent to ' + targets.length + (targets.length === 1 ? ' team.' : ' teams.'));
}

function menuEmailsOn() {
  removeTriggers_();
  ScriptApp.newTrigger('autoMondayReminder').timeBased().everyDays(1).atHour(14).inTimezone(tz_()).create();
  ScriptApp.newTrigger('autoDigests').timeBased().onWeekDay(ScriptApp.WeekDay.TUESDAY).atHour(7).inTimezone(tz_()).create();
  ScriptApp.newTrigger('autoDaily').timeBased().everyDays(1).atHour(5).inTimezone(tz_()).create();
  toast_('Automatic emails are on: reminders on due days at 14:00, digests on Tuesdays at 07:00 (' + tz_() + ' time).');
}

function menuEmailsOff() { removeTriggers_(); toast_('Automatic emails are off.'); }

function removeTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (tr) {
    if (['autoMondayReminder', 'autoDigests', 'autoDaily'].indexOf(tr.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(tr);
  });
}

function autoDaily() { refreshReportLog_(); }

/* ============================== Checking permissions ============================== */

/**
 * Run this from the script editor (or the menu) to check that Google has given the script every
 * permission it needs. If one is missing, Google asks for it again.
 */
function checkSetup() {
  var lines = [];
  var ok = true;
  function check(label, fn) {
    try { var extra = fn(); lines.push('OK  ' + label + (extra ? ' (' + extra + ')' : '')); }
    catch (e) { ok = false; lines.push('NOT OK  ' + label + ': ' + (e && e.message || e)); }
  }
  check('Read and write this spreadsheet', function () { return 'Sheet "' + ss_().getName() + '", ' + teamsAll_().length + ' teams in the Teams tab'; });
  check('Use Google Drive (proof files, the report page)', function () {
    var folder = parentFolder_();
    var found = folder.getFilesByName(pageTemplateName_()).hasNext();
    return 'folder "' + folder.getName() + '"' + (found ? ', page template "' + pageTemplateName_() + '" found' : ', page template "' + pageTemplateName_() + '" NOT found');
  });
  check('Send email', function () { return MailApp.getRemainingDailyQuota() + ' emails left today'; });
  check('Run automatic emails', function () { return ScriptApp.getProjectTriggers().length + ' automatic jobs set'; });
  var s = settings_();
  lines.push('');
  lines.push('This Sheet: ' + s.programme_name + ' (' + reportName_() + '), page ' + s.report_page_url);
  lines.push(emailDestination_());
  if (String(s.pretend_today || '').trim()) lines.push('Pretend date is set to ' + dstr_(s.pretend_today) + '. Clear it before going live.');
  var msg = (ok ? 'Everything is in place.' : 'Something is missing. Run checkSetup again and allow every permission Google asks for, ticking all the boxes if it shows a list.') + '\n\n' + lines.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert('Revenue Accelerator: permissions check', msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { /* run from the editor: see the log */ }
  return msg;
}

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
function parseJson_(s, dflt) { try { return JSON.parse(String(s)); } catch (e) { return dflt; } }
function toast_(msg) {
  try { ss_().toast(msg, 'Revenue Accelerator', 8); } catch (e) { Logger.log(msg); }
}

// Apps Script entrypoints, re-exported by src/main.ts. Apps Script calls these by name.
export {
  doGet,
  doPost,
  onOpen,
  setup,
  checkSetup,
  menuShowThisWeek,
  menuShowAll,
  menuSendReplies,
  menuRefreshLog,
  menuPreparePage,
  menuCreateLinks,
  menuEmailLinks,
  menuEmailsOn,
  menuEmailsOff,
  menuAddDemo,
  menuRemoveDemo,
  menuRemindersNow,
  menuDigestsNow,
  autoMondayReminder,
  autoDigests,
  autoDaily,
};
