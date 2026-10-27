# Map of the legacy code

How the functions in `legacy/Code.gs` (and its transitional copy `src/legacy.js`) relate to
each other, grouped by the PR that will move them into typed modules. Functions ending in `_`
are private: Apps Script cannot call them by name. Every other top-level function is one of
the 21 entrypoints listed in [migration-plan.md](migration-plan.md).

## Shared state

- **Constants:** `STAGE_NAMES`, `TABS` (the spreadsheet schema), `LOG_TAB`, `DEFAULT_TZ`,
  `DEFAULT_SETTINGS`, `DEFAULT_WEEKS`, `DEFAULT_RULES`, `OLD_RULE_TEXT`, `OLD_DEFAULTS`.
- **Per-execution cache:** `SETTINGS_CACHE_`, filled by `settings_()` and cleared by every
  settings write (`appendRow_('settings')`, `setSetting_`, `setup`, `tidySettings_`). It is the
  only top-level variable that is reassigned. Imported bindings are read-only, so it cannot
  simply be moved to a module and imported into `src/legacy.js` while `setup` and
  `tidySettings_` (PR 7) still assign to it: keep it in `src/legacy.js` until all its writers
  have moved, or replace the assignments with a function that clears it.
- **Script property:** `SHEET_ID`, written by `setup`, read by `ss_()`.
- **Dead code:** `fmtStamp_` is never called. esbuild leaves it out of the bundle.

## PR 3: Sheets, settings and teams

| Function                                                                                 | Role                                                              | Uses                              |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------- |
| `ss_`                                                                                    | The programme's spreadsheet (by `SHEET_ID`, else the active one). | SpreadsheetApp, PropertiesService |
| `table_`, `tableRows_`                                                                   | Read a tab as objects keyed by `TABS` field names.                | Sheets                            |
| `appendRow_`, `lastRealRow_`, `setCells_`, `safe_`                                       | Write rows and cells; `safe_` stops text becoming a formula.      | Sheets                            |
| `settings_`, `setSetting_`                                                               | Read (cached) and write the Settings tab.                         | `table_`, `appendRow_`            |
| `teamsAll_`, `teamByToken_`, `trackOf_`, `isDemo_`                                       | Team lookup, by private code for web requests.                    | `table_`                          |
| `reportsAll_`, `weeks_`, `currentWeek_`, `checkpointLabel_`                              | Reports with numeric fields; the schedule and the open week.      | `table_`, `dstr_`                 |
| `createLinks_`, `randomToken_`, `pad2_`                                                  | Team IDs, private codes and report links.                         | `table_`, `setCells_`, Utilities  |
| `tz_`, `todayStr_`, `dstr_`, `parseDay_`, `d_`, `asDate_`                                | Time zone and dates as `yyyy-MM-dd` strings; `pretend_today`.     | Utilities                         |
| `longDate_`, `rangeLabel_`, `stampLabel_`                                                | Dates for people.                                                 | Utilities                         |
| `num_`, `parseNumber_`, `money_`, `currency_`                                            | Numbers and money.                                                | `settings_`                       |
| `clean_`, `listOf_`, `find_`, `byWeek_`, `lastBefore_`, `uniq_`, `median_`, `parseJson_` | Small helpers.                                                    |                                   |
| `shortName_`, `slug_`, `pageName_`, `pageTemplateName_`, `reportName_`                   | Names derived from `short_name`.                                  | `settings_`                       |

## PR 4: reports and pipeline

| Function                                                  | Role                                                                                                | Uses                                 |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `doGet` → `getTeamView_`                                  | Everything the report page shows: status, previous goals, pipeline, totals, history, scoreboard.    | most of PR 3, `scoreboard_`, `json_` |
| `doPost` → `submitReport_`, `submitCorrection_`           | Receive a report or a correction.                                                                   | `json_`                              |
| `submitReport_`                                           | Under the script lock: check the code, week and duplicates, then validate, save proof and record.   | LockService, `refreshReportLog_`     |
| `validate_`                                               | Check and clean the submitted answers and pipeline.                                                 | `parseNumber_`, `clean_`             |
| `recordReport_`                                           | Compare with earlier reports and pipeline, build feedback, append the rows. Also used by demo data. | `buildFeedback_`, `appendRow_`       |
| `latestSnapshot_`, `snapshotFor_`, `totals_`, `weekInfo_` | Pipeline snapshots, running totals and week labels.                                                 |                                      |
| `saveProof_`, `proofRootFolder_`, `parentFolder_`         | Save proof files in Drive next to the Sheet.                                                        | DriveApp, Utilities, `setSetting_`   |
| `json_`                                                   | JSON response.                                                                                      | ContentService                       |

## PR 5: feedback and scoreboard

| Function                  | Role                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| `RULES`, `inRun_`         | One function per feedback rule id; returns `null` or the values for its wording.          |
| `buildFeedback_`, `fill_` | Apply the rules in the order of the Feedback rules tab and fill in their wording.         |
| `scoreboard_`             | Rank teams per track by activity or by money, as the Weeks tab's "Scoreboard shows" says. |

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
| `menuShowThisWeek`, `menuShowAll`, `menuRefreshLog` → `refreshReportLog_`                                               | Filter the Reports tab; rebuild the Report log tab.       |
| `menuCreateLinks`, `menuEmailLinks`                                                                                     | Create links; email each team its link once.              |
| `menuPreparePage` → `preparePage_`, `uploadSteps_`, `htmlEscape_`                                                       | Fill in the report page template from Drive.              |
| `menuAddDemo` → `addDemo_`, `menuRemoveDemo` → `removeDemo_`                                                            | Demo teams and reports, recorded through `recordReport_`. |
| `toast_`                                                                                                                | Status messages in the Sheet.                             |
