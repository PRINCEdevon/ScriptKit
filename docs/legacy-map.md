# Map of the legacy code

How the functions in `legacy/Code.gs` (and its transitional copy `src/legacy.js`) relate to
each other, grouped by the PR that will move them into typed modules. Functions ending in `_`
are private: Apps Script cannot call them by name. Every other top-level function is one of
the 21 entrypoints listed in [migration-plan.md](migration-plan.md).

## Shared state

- **Constants:** `DEFAULT_WEEKS`, `OLD_RULE_TEXT` and `OLD_DEFAULTS` are still in
  `src/legacy.js`; `LOG_TAB` is in `src/reports.ts`. `TABS` (the spreadsheet schema) is in `src/sheets.ts`; `DEFAULT_TZ` and
  `DEFAULT_SETTINGS` in `src/config.ts`; `STAGE_NAMES` in `src/pipeline.ts`; `DEFAULT_RULES`
  in `src/feedback.ts`.
- **Per-execution cache:** `SETTINGS_CACHE_`, filled by `settings()` and cleared by every
  settings write. It is the only top-level variable that is reassigned. `src/config.ts` keeps
  it as a real global variable (`globalThis.SETTINGS_CACHE_`), as the original script did,
  because `setup` and `tidySettings_` still clear it by assigning `SETTINGS_CACHE_ = null`
  and an imported binding cannot be assigned. PR 7 moves those two and turns the cache into
  a module variable.
- **Script property:** `SHEET_ID`, written by `setup`, read by `spreadsheet()`.
- **Dead code:** `fmtStamp_` is never called. esbuild leaves it out of the bundle.

## PR 3: Sheets, settings and teams (done)

`src/legacy.js` imports these under their old names (for example
`import { readTable as table_ } from './sheets.js'`).

| Legacy                                                                                               | Now                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TABS`, `ss_`, `table_`, `tableRows_`, `lastRealRow_`, `setCells_`, `safe_`                          | `src/sheets.ts`: `TABS`, `spreadsheet`, `readTable` (row mapping in the pure `mapTable`), `readRows`, `lastDataRow`, `setCells`, `safeValue`; plus `appendRow` |
| `appendRow_`                                                                                         | `src/config.ts`: `appendTableRow`, which clears the settings cache and calls `appendRow`                                                                       |
| `DEFAULT_TZ`, `DEFAULT_SETTINGS`, `settings_`, `setSetting_`                                         | `src/config.ts`: the same constants, `settings` (pure core `settingsFrom`), `setSetting`, `clearSettingsCache`                                                 |
| `currency_`, `money_`, `shortName_`, `slug_`, `pageName_`, `pageTemplateName_`, `reportName_`        | `src/config.ts`: `currency`, `money`, `shortName`, `slug`, `pageName`, `pageTemplateName`, `reportName`                                                        |
| `tz_`, `todayStr_`, `dstr_`, `parseDay_`, `d_`, `asDate_`, `longDate_`, `rangeLabel_`, `stampLabel_` | `src/dates.ts`: `timeZone`, `today`, `dayKey`, `parseDay`, `noonDate`, `asDate`, `longDate`, `rangeLabel`, `stampLabel`                                        |
| `weeks_`, `currentWeek_`, `checkpointLabel_`                                                         | `src/dates.ts`: `readWeeks`, `currentWeek`, `checkpointLabel`                                                                                                  |
| `teamsAll_`, `teamByToken_`, `trackOf_`, `isDemo_`, `createLinks_`, `randomToken_`, `pad2_`          | `src/teams.ts`: `allTeams`, `teamByToken`, `trackOf`, `isDemo`, `createLinks` (plan in the pure `planLinks`), `randomToken`, `reportLink`                      |
| `num_`, `parseNumber_`                                                                               | `src/utils.ts`: `toNumber`, `parseNumber`                                                                                                                      |

Helpers that typed code needed moved with their first typed caller (typed modules never
import from `src/legacy.js`): `median_` in PR 4; `clean_`, `listOf_`, `byWeek_`,
`lastBefore_`, `uniq_` and `parseJson_` in PR 5. `find_` stays in `src/legacy.js` for the
code that still uses it; typed code uses `Array.prototype.find` (with `?? null` where the
original's `null` matters).

## PR 4: feedback and scoreboard (done)

| Legacy                                                        | Now                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `DEFAULT_RULES`, `RULES`, `inRun_`, `buildFeedback_`, `fill_` | `src/feedback.ts`: `DEFAULT_RULES`, `RULE_CHECKS`, `buildFeedback` (pure core `feedbackFrom`), `fillTemplate` |
| `scoreboard_`, `totals_`                                      | `src/scoreboard.ts`: `scoreboard`, `totals`                                                                   |
| `STAGE_NAMES`, `latestSnapshot_`                              | `src/pipeline.ts`: `STAGE_NAMES`, `latestSnapshot`                                                            |
| `median_`                                                     | `src/utils.ts`: `median`                                                                                      |

The feedback context (previous report, totals, stage moves, stuck organisations, cohorts) is
still worked out by `recordReport_`, which moves in PR 5.

## PR 5: reports and pipeline (done)

The web app (`doGet`, `doPost`) no longer runs any legacy code.

| Legacy                                                                            | Now                                                                                                              |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `doGet`, `doPost`, `json_`, `getTeamView_`, `weekInfo_`, `parseJson_`             | `src/api.ts`: `doGet`, `doPost`, `teamView`, `weekInfo` (the entrypoints are exported by `main.ts`)              |
| `reportsAll_`, `validate_`, `recordReport_`, `submitReport_`, `submitCorrection_` | `src/reports.ts`: `readReports`, `validateReport`, `recordReport`, `submitReport`, `submitCorrection`            |
| `refreshReportLog_`, `LOG_TAB`, `byWeek_`, `lastBefore_`, `uniq_`                 | `src/reports.ts`: `refreshReportLog`, `LOG_TAB`, `byWeek`, `lastBefore` (`uniq_` folded into `pipelineProgress`) |
| the pipeline comparison inside `recordReport_`, `snapshotFor_`                    | `src/pipeline.ts`: `pipelineProgress` (pure), `snapshotFor`                                                      |
| `saveProof_`, `proofRootFolder_`, `parentFolder_`                                 | `src/drive.ts`: `saveProof`, `proofFolder`, `parentFolder`                                                       |
| `clean_`, `listOf_`                                                               | `src/utils.ts`: `clean`, `listOf`                                                                                |

## PR 6: notifications and scheduled jobs (done)

All email now goes through typed code; `menuEmailLinks` (PR 7) imports `sendMail` and
`emailDestination` under their legacy names.

| Legacy                                                                      | Now                                                                                       |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `sendMail_`, `emailDestination_`, `pretendBlocksAutoEmails_`                | `src/email.ts`: `sendMail`, `emailDestination`, `autoEmailsBlocked`                       |
| `autoMondayReminder`, `sendReminders_`, `teamsMissing_`, `menuRemindersNow` | `src/email.ts`: `autoMondayReminder`, `sendReminders`, `teamsMissing`, `menuRemindersNow` |
| `autoDigests`, `sendDigests_`, `digestBlock_`, `menuDigestsNow`             | `src/email.ts`: `autoDigests`, `sendDigests`, `digestBlock`, `menuDigestsNow`             |
| `menuSendReplies`, `sendTickedReplies_`                                     | `src/email.ts`: `menuSendReplies`, `sendTickedReplies`                                    |
| `menuEmailsOn`, `menuEmailsOff`, `removeTriggers_`, `autoDaily`             | `src/triggers.ts`: the same names, with `removeTriggers`                                  |
| `toast_`                                                                    | `src/sheets.ts`: `toast`                                                                  |

## PR 7: administration

| Function                                                                                                                | Role                                                      |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `onOpen`                                                                                                                | Builds the Revenue Accelerator menu.                      |
| `setup` → `ensureTab_`, `tidySettings_`, `upgradeRuleText_`, `writeStartHere_`, `setValidationList_`, `tidyReportRows_` | Create or repair every tab without overwriting edits.     |
| `checkSetup`                                                                                                            | Permission and configuration check.                       |
| `menuShowThisWeek`, `menuShowAll`, `menuRefreshLog`                                                                     | Filter the Reports tab; rebuild the Report log tab.       |
| `menuCreateLinks`, `menuEmailLinks`                                                                                     | Create links; email each team its link once.              |
| `menuPreparePage` → `preparePage_`, `uploadSteps_`, `htmlEscape_`                                                       | Fill in the report page template from Drive.              |
| `menuAddDemo` → `addDemo_`, `menuRemoveDemo` → `removeDemo_`                                                            | Demo teams and reports, recorded through `recordReport_`. |
