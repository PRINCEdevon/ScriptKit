# Migration plan

The Revenue Accelerator backend lives in one 1,426-line file, `legacy/Code.gs`. This plan
moves it into typed, tested modules in `src/` without changing what it does. Each step is one
pull request that leaves `main` working. Bug fixes come afterwards, in separate `fix:` PRs
(see [known-issues.md](known-issues.md)).

## Status

| #   | Branch                           | Title                                               | Status                           |
| --- | -------------------------------- | --------------------------------------------------- | -------------------------------- |
| 1   | `chore/scaffold`                 | chore: initialize ScriptKit development environment | Merged                           |
| 2   | `refactor/legacy-runtime`        | refactor: integrate legacy application into build   | Merged                           |
| 3   | `refactor/sheets-and-teams`      | refactor: migrate Sheets and team management        | Merged                           |
| 4   | `refactor/feedback`              | refactor: migrate feedback and scoreboard logic     | Merged                           |
| 5   | `refactor/reports`               | refactor: migrate report submissions and pipeline   | Merged                           |
| 6   | `refactor/notifications`         | refactor: migrate email and scheduled jobs          | Merged                           |
| 7   | `refactor/admin-and-integration` | refactor: complete administration and integration   | Ready for review (branch pushed) |

## The steps

1. **Scaffolding.** TypeScript, pnpm, esbuild, ESLint, Prettier, Vitest, Lefthook, clasp
   config and CI. The legacy file is preserved in `legacy/`. The build is a smoke test only.
2. **Legacy runtime.** Bring the legacy code into the build almost unchanged, as one module
   exempt from strict type checking (isolated and documented), with every entrypoint below
   re-exported from `src/main.ts`. Add the deploy script, verify the bundle exposes all 21
   entrypoints, and verify it once in a staging script project bound to a copy of the Sheet.
   Add baseline tests that run legacy functions against fakes.
3. **Sheets and teams.** Table reading and writing (`table_`, `appendRow_`, `setCells_`,
   `safe_`), settings, team lookup by private code, report links, number parsing, dates and
   reporting-week selection.
4. **Feedback and scoreboard.** `RULES`, `buildFeedback_`, `scoreboard_` and totals, with
   characterization tests that run the same fixtures through the legacy and new code.
5. **Reports and pipeline.** `reportsAll_`, `submitReport_`, `validate_`, `recordReport_`,
   `submitCorrection_`, the team page view, pipeline snapshots and proof uploads, keeping the
   HTTP contract. This includes the historical comparisons and pipeline progression that
   `recordReport_` works out for feedback (previous report, totals, stage moves, stuck
   organisations, cohorts), and the Report log that every submission rebuilds
   (`refreshReportLog_`).
6. **Notifications.** `sendMail_` (including test mode), reminders, digests, replies and the
   trigger handlers, tested with fake mail and trigger services.
7. **Administration and integration.** Menus, setup and repair, demo data, the report page
   preparation, and the remaining legacy functions. Remove the transitional legacy module,
   check every entrypoint, and document any manual verification still needed.

Feedback comes before reports (the original order had them the other way round) because the
report code calls the feedback and scoreboard code, and typed modules never imported from
`src/legacy.js`.

## How the refactoring PRs worked

The legacy code lived on in `src/legacy.js` (an unchanged copy of `legacy/Code.gs` plus an
export block) until every function had moved; PR 7 deleted it. For each function or group a
PR migrated:

1. Write it as typed TypeScript in a feature module (`src/teams.ts`, ...), keeping its
   behaviour, including the known issues.
2. Delete it from `src/legacy.js` and import it there instead, so the remaining legacy code
   calls the new version (`import { readTable as table_ } from './sheets.js'` if the name
   changes). Add its name to `EXTRACTED` in `tests/legacy-source.test.ts`, which
   checks that everything left in `src/legacy.js` is still identical to the original.
3. Move entrypoints' exports in `src/main.ts` from `./legacy.js` to the new module.
4. Add focused unit tests for the new module. The baseline tests in `tests/baseline/` must
   keep passing unchanged: they run the same scenarios against `legacy/Code.gs` and the
   bundle and require identical results. Extend them when a PR touches behaviour they do not
   yet cover.

[legacy-map.md](legacy-map.md) shows which functions belong to which PR and how they call
each other.

## Verifying a build on Google

The tests use fake Google services, so each milestone that changes the bundle should also be
checked once in a **staging** Apps Script project bound to a copy of the Sheet (the URA TEST
Sheet is suitable):

1. Compare the staging project's manifest with `appsscript.json`, then `pnpm clasp:push`.
2. Reload the Sheet: the Revenue Accelerator menu appears. Run "Check permissions".
3. Update the staging web app deployment to a new version, so `/exec` serves the bundle.
4. With `send_all_emails_to` set, work through the URA end-to-end test script (kept with
   the test Sheet in the programme's Drive folder, not in this repository).

### Record

**Still to do:** run the web app (`doGet`/`doPost`) on Google: a deployment in the test project,
loading a team's page, one submission and one correction. It has been deferred so far and must
happen before the live project switches to the bundle.

| Build | Where                                        | Checked                                                            | Not checked                                             |
| ----- | -------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------- |
| PR 2  | A personal test project bound to a Sheet     | Menu, "Set up or repair the sheet", "Check permissions", demo data | Web app (`doGet`/`doPost`)                              |
| PR 3  | The same test project (pushed and read back) | Menu, "Set up or repair the sheet", "Check permissions", demo data | Web app (`doGet`/`doPost`)                              |
| PR 4  | The same test project (pushed and read back) | Menu, "Set up or repair the sheet", "Check permissions", demo data | Web app (`doGet`/`doPost`), which runs the scoreboard   |
| PR 5  | Not pushed                                   | Nothing                                                            | Everything: the first build whose web app is typed code |
| PR 6  | Not pushed                                   | Nothing                                                            | Everything                                              |

## Going live

The test project has only ever run builds up to PR 4, and the web app has never run on Google.
Before a live programme switches from the pasted `Code.gs` to the bundle:

1. In the test project (`.clasp.json`), push the current `main` with `pnpm clasp:push` and
   repeat the Sheet checks: reload for the menu, "Set up or repair the sheet", "Check
   permissions", "Add demo data", then "Remove demo data" and "Set up or repair the sheet"
   again (see the known issue about deleted rows).
2. Run the web app there: create a web app deployment, open a demo team's page from a
   prepared report page, send a report and a correction, and check the Reports, Pipeline and
   Corrections tabs and the proof folder.
3. With `send_all_emails_to` set to your own address, try "Testing > Send reminders now" and
   "Send Tuesday digests now".
4. Decide which Google account pushes and deploys the live project. This checkout's clasp
   login is a personal account, which may not be able to edit it. The manifest runs the web
   app as the deploying user (`executeAs: USER_DEPLOYING`), which likely also decides whose
   mailbox sends the emails and whose Drive holds the proof files; confirm that against
   Google's web app deployment documentation.
5. For the live project: compare its manifest with `appsscript.json` (time zone included),
   point `.clasp.json` at it, `pnpm clasp:push`, then update its existing web app deployment
   to the new version so the report page's address stays the same. Run "Check permissions".
6. Keep the pasted `Code.gs` (a copy of `legacy/Code.gs`) at hand: pushing it back and
   redeploying is the way back.

## After the migration

Fix the issues in [known-issues.md](known-issues.md) in separate `fix:` PRs, each with a
test. Most tests compare the typed code with `legacy/Code.gs`, so a fix that changes
behaviour updates exactly the comparisons it changes and pins the new behaviour instead.

## Legacy entrypoints

Apps Script calls these by name, so the names must not change. Installed triggers are stored
in Google's systems with the handler name, and the menu refers to handlers as strings.

| Called by                                      | Functions                                                                                                                                                                                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web app (the report page)                      | `doGet`, `doPost`                                                                                                                                                                                                                      |
| Simple trigger when the Sheet opens            | `onOpen`                                                                                                                                                                                                                               |
| Menu and script editor                         | `setup`, `checkSetup`                                                                                                                                                                                                                  |
| Revenue Accelerator menu                       | `menuShowThisWeek`, `menuShowAll`, `menuSendReplies`, `menuRefreshLog`, `menuPreparePage`, `menuCreateLinks`, `menuEmailLinks`, `menuEmailsOn`, `menuEmailsOff`, `menuAddDemo`, `menuRemoveDemo`, `menuRemindersNow`, `menuDigestsNow` |
| Time-driven triggers created by `menuEmailsOn` | `autoMondayReminder` (daily, 14:00), `autoDigests` (Tuesdays, 07:00), `autoDaily` (daily, 05:00)                                                                                                                                       |

## Constraints found in the legacy code

- **Spreadsheet schema.** `TABS` maps each tab's column headings to field names, including
  older headings that are still recognised. Headings are the contract with existing Sheets;
  column order is not.
- **Settings and defaults.** `DEFAULT_SETTINGS`, `DEFAULT_WEEKS` and `DEFAULT_RULES` seed new
  Sheets. `setup` only adds missing keys and upgrades wording that still matches an old
  default (`OLD_DEFAULTS`, `OLD_RULE_TEXT`); edited values are never overwritten.
- **Spreadsheet binding.** `setup` stores the Sheet ID in the `SHEET_ID` script property;
  `ss_()` falls back to the active spreadsheet.
- **Per-run caching.** `SETTINGS_CACHE_` caches settings for one execution and is cleared
  whenever settings are written.
- **Concurrency.** `submitReport_` holds the script lock while it checks for duplicates and
  writes.
- **Dates.** Dates are compared as `yyyy-MM-dd` strings in the programme's time zone
  (`tz_()`), and `pretend_today` overrides today for testing. Default week dates are created
  at noon so that time zone differences cannot move them to another day.
- **Report page.** `preparePage_` reads a template from Drive by name and fills in the web
  app URL and three placeholders (see [web/README.md](../web/README.md)).
