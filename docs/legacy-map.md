# Map of the legacy code

How the functions in `legacy/Code.gs` (and its transitional copy `src/legacy.js`) relate to
each other, grouped by the PR that will move them into typed modules. Functions ending in `_`
are private: Apps Script cannot call them by name. Every other top-level function is one of
the 21 entrypoints listed in [migration-plan.md](migration-plan.md).

## Shared state

- **Constants:** `LOG_TAB`, `DEFAULT_WEEKS`, `OLD_RULE_TEXT` and `OLD_DEFAULTS` are still in
  `src/legacy.js`. `TABS` (the spreadsheet schema) is in `src/sheets.ts`; `DEFAULT_TZ` and
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

Still in `src/legacy.js`, moving with their first typed caller (typed modules never import
from `src/legacy.js`): the small helpers `clean_`, `listOf_`,
`find_`, `byWeek_`, `lastBefore_`, `uniq_`, `median_` and `parseJson_`.

## PR 4: feedback and scoreboard (done)

| Legacy                                                        | Now                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `DEFAULT_RULES`, `RULES`, `inRun_`, `buildFeedback_`, `fill_` | `src/feedback.ts`: `DEFAULT_RULES`, `RULE_CHECKS`, `buildFeedback` (pure core `feedbackFrom`), `fillTemplate` |
| `scoreboard_`, `totals_`                                      | `src/scoreboard.ts`: `scoreboard`, `totals`                                                                   |
| `STAGE_NAMES`, `latestSnapshot_`                              | `src/pipeline.ts`: `STAGE_NAMES`, `latestSnapshot`                                                            |
| `median_`                                                     | `src/utils.ts`: `median`                                                                                      |

The feedback context (previous report, totals, stage moves, stuck organisations, cohorts) is
still worked out by `recordReport_`, which moves in PR 5.

## PR 5: reports and pipeline

| Function                                          | Role                                                                                                | Uses                                 |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `doGet` → `getTeamView_`                          | Everything the report page shows: status, previous goals, pipeline, totals, history, scoreboard.    | most of PR 3, `scoreboard_`, `json_` |
| `doPost` → `submitReport_`, `submitCorrection_`   | Receive a report or a correction.                                                                   | `json_`                              |
| `submitReport_`                                   | Under the script lock: check the code, week and duplicates, then validate, save proof and record.   | LockService, `refreshReportLog_`     |
| `validate_`                                       | Check and clean the submitted answers and pipeline.                                                 | `parseNumber_`, `clean_`             |
| `recordReport_`                                   | Compare with earlier reports and pipeline, build feedback, append the rows. Also used by demo data. | `buildFeedback_`, `appendRow_`       |
| `reportsAll_`                                     | Every report, with its numbers as numbers and its team ID as text.                                  | `table_`, `num_`                     |
| `snapshotFor_`, `weekInfo_`                       | One week's pipeline snapshot by organisation; week labels for the page.                             |                                      |
| `saveProof_`, `proofRootFolder_`, `parentFolder_` | Save proof files in Drive next to the Sheet.                                                        | DriveApp, Utilities, `setSetting_`   |
| `json_`                                           | JSON response.                                                                                      | ContentService                       |
| `refreshReportLog_`, `LOG_TAB`                    | Rebuild the Report log tab (also from the menu, setup, demo data and the daily trigger).            | Sheets                               |

## PR 6: notifications and scheduled jobs

| Function                                                        | Role                                                                 |
| --------------------------------------------------------------- | -------------------------------------------------------------------- |
| `sendMail_`, `emailDestination_`                                | Every email goes through `sendMail_`, which applies test mode.       |
| `pretendBlocksAutoEmails_`                                      | Stops automatic emails on a pretend date unless test mode is on.     |
| `autoMondayReminder` → `sendReminders_` → `teamsMissing_`       | Reminders on the due day. `menuRemindersNow` sends them on demand.   |
| `autoDigests` → `sendDigests_` → `digestBlock_`                 | Mentor digests and the admin summary. `menuDigestsNow` on demand.    |
| `menuSendReplies` → `sendTickedReplies_`                        | Email the replies ticked in the Reports tab.                         |
| `menuEmailsOn`, `menuEmailsOff`, `removeTriggers_`, `autoDaily` | Create and remove the three time-driven triggers; daily log refresh. |

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
| `toast_`                                                                                                                | Status messages in the Sheet.                             |
