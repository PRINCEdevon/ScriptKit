# Map of the legacy code

Where each top-level function and variable of `legacy/Code.gs` went, grouped by the PR that
moved it into a typed module in `src/`. Functions ending in `_` were private (Apps Script
cannot call them by name); every other top-level function is one of the 21 entrypoints listed
in [migration-plan.md](migration-plan.md), now exported by `src/main.ts` under the same name.
`tests/legacy-source.test.ts` checks that every declaration is accounted for.

## Shared state

- **Constants:** `TABS` is in `src/shared/sheets.ts`; `DEFAULT_TZ` and `DEFAULT_SETTINGS` in
  `src/shared/settings.ts`; `STAGE_NAMES` in `src/shared/pipeline.ts`; `DEFAULT_RULES` in
  `src/feedback/rules.ts`; `LOG_TAB` in `src/reports/reports.ts`; `DEFAULT_WEEKS`,
  `OLD_DEFAULTS` and `OLD_RULE_TEXT` in `src/admin/setup.ts`.
- **Per-run settings cache:** `SETTINGS_CACHE_` is now a module variable in
  `src/shared/settings.ts`, filled by `settings()` and cleared by `clearSettingsCache()` on
  every settings write. (Until PR 7 it was a real global, because legacy `setup` and
  `tidySettings_` assigned it directly.)
- **Script property:** `SHEET_ID`, written by `setup`, read by `spreadsheet()`.
- **Retired:** `fmtStamp_` was never called; `find_` is replaced by `Array.prototype.find`
  (with `?? null` where the original's `null` matters).

## PR 3: Sheets, settings and teams (done)

During the migration `src/legacy.js` imported these under their old names (for example
`import { readTable as table_ } from './sheets.js'`).

| Legacy                                                                                               | Now                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TABS`, `ss_`, `table_`, `tableRows_`, `lastRealRow_`, `setCells_`, `safe_`                          | `src/shared/sheets.ts`: `TABS`, `spreadsheet`, `readTable` (row mapping in the pure `mapTable`), `readRows`, `lastDataRow`, `setCells`, `safeValue`; plus `appendRow` |
| `appendRow_`                                                                                         | `src/shared/settings.ts`: `appendTableRow`, which clears the settings cache and calls `appendRow`                                                                     |
| `DEFAULT_TZ`, `DEFAULT_SETTINGS`, `settings_`, `setSetting_`                                         | `src/shared/settings.ts`: the same constants, `settings` (pure core `settingsFrom`), `setSetting`, `clearSettingsCache`                                               |
| `currency_`, `money_`, `shortName_`, `slug_`, `pageName_`, `pageTemplateName_`, `reportName_`        | `src/shared/settings.ts`: `currency`, `money`, `shortName`, `slug`, `pageName`, `pageTemplateName`, `reportName`                                                      |
| `tz_`, `todayStr_`, `dstr_`, `parseDay_`, `d_`, `asDate_`, `longDate_`, `rangeLabel_`, `stampLabel_` | `src/shared/dates.ts`: `timeZone`, `today`, `dayKey`, `parseDay`, `noonDate`, `asDate`, `longDate`, `rangeLabel`, `stampLabel`                                        |
| `weeks_`, `currentWeek_`, `checkpointLabel_`                                                         | `src/shared/dates.ts`: `readWeeks`, `currentWeek`, `checkpointLabel`                                                                                                  |
| `teamsAll_`, `teamByToken_`, `trackOf_`, `isDemo_`, `createLinks_`, `randomToken_`, `pad2_`          | `src/shared/teams.ts`: `allTeams`, `teamByToken`, `trackOf`, `isDemo`, `createLinks` (plan in the pure `planLinks`), `randomToken`, `reportLink`                      |
| `num_`, `parseNumber_`                                                                               | `src/shared/utils.ts`: `toNumber`, `parseNumber`                                                                                                                      |

Helpers that typed code needed moved with their first typed caller (typed modules never
import from `src/legacy.js`): `median_` in PR 4; `clean_`, `listOf_`, `byWeek_`,
`lastBefore_`, `uniq_` and `parseJson_` in PR 5. `find_` stayed in `src/legacy.js` until it
was deleted in PR 7; typed code uses `Array.prototype.find` (with `?? null` where the
original's `null` matters).

## PR 4: feedback and scoreboard (done)

| Legacy                                                        | Now                                                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `DEFAULT_RULES`, `RULES`, `inRun_`, `buildFeedback_`, `fill_` | `src/feedback/rules.ts`: `DEFAULT_RULES`, `RULE_CHECKS`, `buildFeedback` (pure core `feedbackFrom`), `fillTemplate` |
| `scoreboard_`, `totals_`                                      | `src/feedback/scoreboard.ts`: `scoreboard`, `totals`                                                                |
| `STAGE_NAMES`, `latestSnapshot_`                              | `src/shared/pipeline.ts`: `STAGE_NAMES`, `latestSnapshot`                                                           |
| `median_`                                                     | `src/shared/utils.ts`: `median`                                                                                     |

The feedback context (previous report, totals, stage moves, stuck organisations, cohorts) is
still worked out by `recordReport_`, which moves in PR 5.

## PR 5: reports and pipeline (done)

The web app (`doGet`, `doPost`) no longer runs any legacy code.

| Legacy                                                                            | Now                                                                                                                      |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `doGet`, `doPost`, `json_`, `getTeamView_`, `weekInfo_`, `parseJson_`             | `src/reports/web-app.ts`: `doGet`, `doPost`, `teamView`, `weekInfo` (the entrypoints are exported by `main.ts`)          |
| `reportsAll_`, `validate_`, `recordReport_`, `submitReport_`, `submitCorrection_` | `src/reports/reports.ts`: `readReports`, `validateReport`, `recordReport`, `submitReport`, `submitCorrection`            |
| `refreshReportLog_`, `LOG_TAB`, `byWeek_`, `lastBefore_`, `uniq_`                 | `src/reports/reports.ts`: `refreshReportLog`, `LOG_TAB`, `byWeek`, `lastBefore` (`uniq_` folded into `pipelineProgress`) |
| the pipeline comparison inside `recordReport_`, `snapshotFor_`                    | `src/shared/pipeline.ts`: `pipelineProgress` (pure), `snapshotFor`                                                       |
| `saveProof_`, `proofRootFolder_`, `parentFolder_`                                 | `src/reports/proof-files.ts`: `saveProof`, `proofFolder`, `parentFolder`                                                 |
| `clean_`, `listOf_`                                                               | `src/shared/utils.ts`: `clean`, `listOf`                                                                                 |

## PR 6: notifications and scheduled jobs (done)

All email now goes through typed code; `menuEmailLinks` (PR 7) imports `sendMail` and
`emailDestination` under their legacy names.

| Legacy                                                                      | Now                                                                                             |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `sendMail_`, `emailDestination_`, `pretendBlocksAutoEmails_`                | `src/email/email.ts`: `sendMail`, `emailDestination`, `autoEmailsBlocked`                       |
| `autoMondayReminder`, `sendReminders_`, `teamsMissing_`, `menuRemindersNow` | `src/email/email.ts`: `autoMondayReminder`, `sendReminders`, `teamsMissing`, `menuRemindersNow` |
| `autoDigests`, `sendDigests_`, `digestBlock_`, `menuDigestsNow`             | `src/email/email.ts`: `autoDigests`, `sendDigests`, `digestBlock`, `menuDigestsNow`             |
| `menuSendReplies`, `sendTickedReplies_`                                     | `src/email/email.ts`: `menuSendReplies`, `sendTickedReplies`                                    |
| `menuEmailsOn`, `menuEmailsOff`, `removeTriggers_`, `autoDaily`             | `src/email/triggers.ts`: the same names, with `removeTriggers`                                  |
| `toast_`                                                                    | `src/shared/sheets.ts`: `toast`                                                                 |

## PR 7: administration (done)

| Legacy                                                                                                                 | Now                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `onOpen`, `menuShowThisWeek`, `menuShowAll`, `menuRefreshLog`, `menuCreateLinks`, `menuEmailLinks`, `checkSetup`       | `src/admin/menu.ts`: the same names                                                                                                    |
| `menuPreparePage`, `preparePage_`, `uploadSteps_`, `htmlEscape_`                                                       | `src/admin/report-page.ts`: `menuPreparePage`, `preparePage`, `uploadSteps`, `htmlEscape`                                              |
| `menuAddDemo`, `addDemo_`, `menuRemoveDemo`, `removeDemo_`                                                             | `src/admin/demo.ts`: `menuAddDemo`, `addDemo`, `menuRemoveDemo`, `removeDemo`                                                          |
| `setup`, `tidySettings_`, `writeStartHere_`, `upgradeRuleText_`, `ensureTab_`, `setValidationList_`, `tidyReportRows_` | `src/admin/setup.ts`: `setup`, `tidySettings`, `writeStartHere`, `upgradeRuleText`, `ensureTab`, `setValidationList`, `tidyReportRows` |
| `DEFAULT_WEEKS`, `OLD_DEFAULTS`, `OLD_RULE_TEXT`                                                                       | `src/admin/setup.ts`: the same names                                                                                                   |
