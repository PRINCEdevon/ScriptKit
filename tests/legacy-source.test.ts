import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { legacySource, topLevelDeclarations, topLevelFunctions } from './support/legacy-source.js';

// The migration moved every top-level declaration of legacy/Code.gs into a typed module in
// src/, one PR at a time, through a transitional copy (src/legacy.js) whose remaining code had
// to stay identical to the original. That copy is gone; this test records where everything
// went, so that nothing was dropped silently. docs/legacy-map.md has the new names.
const MIGRATED: string[] = [
  // PR 3: src/shared/sheets.ts and src/shared/utils.ts
  'TABS',
  'ss_',
  'table_',
  'tableRows_',
  'lastRealRow_',
  'setCells_',
  'safe_',
  'num_',
  'parseNumber_',
  // PR 3: src/shared/settings.ts (SETTINGS_CACHE_ became a module variable in PR 7)
  'DEFAULT_TZ',
  'DEFAULT_SETTINGS',
  'SETTINGS_CACHE_',
  'settings_',
  'setSetting_',
  'appendRow_',
  'currency_',
  'money_',
  'shortName_',
  'slug_',
  'pageName_',
  'pageTemplateName_',
  'reportName_',
  // PR 3: src/shared/dates.ts
  'tz_',
  'todayStr_',
  'dstr_',
  'parseDay_',
  'd_',
  'asDate_',
  'longDate_',
  'rangeLabel_',
  'stampLabel_',
  'weeks_',
  'currentWeek_',
  'checkpointLabel_',
  // PR 3: src/shared/teams.ts
  'teamsAll_',
  'teamByToken_',
  'trackOf_',
  'isDemo_',
  'createLinks_',
  'randomToken_',
  'pad2_',
  // PR 4: src/feedback/scoreboard.ts and src/shared/pipeline.ts
  'scoreboard_',
  'totals_',
  'STAGE_NAMES',
  'latestSnapshot_',
  // PR 4: src/feedback/rules.ts and src/shared/utils.ts
  'DEFAULT_RULES',
  'RULES',
  'inRun_',
  'buildFeedback_',
  'fill_',
  'median_',
  // PR 5: src/reports/proof-files.ts, src/shared/pipeline.ts and src/shared/utils.ts
  'saveProof_',
  'proofRootFolder_',
  'parentFolder_',
  'snapshotFor_',
  'clean_',
  'listOf_',
  // PR 5: src/reports/reports.ts
  'LOG_TAB',
  'reportsAll_',
  'validate_',
  'recordReport_',
  'submitReport_',
  'submitCorrection_',
  'refreshReportLog_',
  'byWeek_',
  'lastBefore_',
  'uniq_',
  // PR 5: src/reports/web-app.ts (doGet and doPost now come from there)
  'doGet',
  'doPost',
  'json_',
  'getTeamView_',
  'weekInfo_',
  'parseJson_',
  // PR 6: src/email/email.ts and src/shared/sheets.ts
  'sendMail_',
  'emailDestination_',
  'pretendBlocksAutoEmails_',
  'autoMondayReminder',
  'teamsMissing_',
  'sendReminders_',
  'menuRemindersNow',
  'autoDigests',
  'sendDigests_',
  'digestBlock_',
  'menuDigestsNow',
  'sendTickedReplies_',
  'menuSendReplies',
  'toast_',
  // PR 6: src/email/triggers.ts
  'menuEmailsOn',
  'menuEmailsOff',
  'removeTriggers_',
  'autoDaily',
  // PR 7: src/admin/report-page.ts
  'menuPreparePage',
  'uploadSteps_',
  'preparePage_',
  'htmlEscape_',
  // PR 7: src/admin/menu.ts
  'onOpen',
  'menuShowThisWeek',
  'menuShowAll',
  'menuRefreshLog',
  'menuCreateLinks',
  'menuEmailLinks',
  'checkSetup',
  // PR 7: src/admin/demo.ts
  'menuAddDemo',
  'addDemo_',
  'menuRemoveDemo',
  'removeDemo_',
  // PR 7: src/admin/setup.ts
  'setup',
  'tidySettings_',
  'writeStartHere_',
  'upgradeRuleText_',
  'ensureTab_',
  'setValidationList_',
  'tidyReportRows_',
  'DEFAULT_WEEKS',
  'OLD_DEFAULTS',
  'OLD_RULE_TEXT',
];

// Legacy declarations with no typed counterpart, and why.
const RETIRED: Record<string, string> = {
  find_: 'typed code uses Array.prototype.find (with ?? null where the original null matters)',
  fmtStamp_: 'never called in the original',
};

const original = topLevelDeclarations(legacySource);

describe('the migration from legacy/Code.gs', () => {
  it('accounts for every top-level legacy declaration exactly once', () => {
    const accounted = [...MIGRATED, ...Object.keys(RETIRED)];
    expect(new Set(accounted).size).toBe(accounted.length);
    expect(accounted.sort()).toEqual([...original.keys()].sort());
  });

  it('has removed the transitional copy', () => {
    expect(existsSync(new URL('../src/legacy.js', import.meta.url))).toBe(false);
  });

  it('parses every top-level legacy declaration separately', () => {
    // Guards the parser: a missed or merged declaration would weaken the check above.
    expect(topLevelFunctions(legacySource).every((name) => original.has(name))).toBe(true);
    expect(original.size).toBe(legacySource.match(/^(function|var) /gm)?.length);
  });
});
