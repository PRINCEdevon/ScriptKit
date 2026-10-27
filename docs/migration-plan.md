# Migration plan

The Revenue Accelerator backend lives in one 1,426-line file, `legacy/Code.gs`. This plan
moves it into typed, tested modules in `src/` without changing what it does. Each step is one
pull request that leaves `main` working. Bug fixes come afterwards, in separate `fix:` PRs
(see [known-issues.md](known-issues.md)).

## Status

| #   | Branch                           | Title                                               | Status                           |
| --- | -------------------------------- | --------------------------------------------------- | -------------------------------- |
| 1   | `chore/scaffold`                 | chore: initialize ScriptKit development environment | Ready for review (branch pushed) |
| 2   | `refactor/legacy-runtime`        | refactor: integrate legacy application into build   | Not started                      |
| 3   | `refactor/sheets-and-teams`      | refactor: migrate Sheets and team management        | Not started                      |
| 4   | `refactor/reports`               | refactor: migrate report submissions and pipeline   | Not started                      |
| 5   | `refactor/feedback`              | refactor: migrate feedback and scoreboard logic     | Not started                      |
| 6   | `refactor/notifications`         | refactor: migrate email and scheduled jobs          | Not started                      |
| 7   | `refactor/admin-and-integration` | refactor: complete administration and integration   | Not started                      |

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
4. **Reports and pipeline.** `submitReport_`, `validate_`, `recordReport_`,
   `submitCorrection_`, pipeline snapshots and proof uploads, keeping the HTTP contract.
5. **Feedback and scoreboard.** `RULES`, `buildFeedback_`, `scoreboard_` and totals, with
   characterization tests that run the same fixtures through the legacy and new code.
6. **Notifications.** `sendMail_` (including test mode), reminders, digests, replies and
   the trigger handlers, tested with fake mail and trigger services.
7. **Administration and integration.** Menus, setup and repair, demo data, the report page
   preparation, and the remaining legacy functions. Remove the transitional legacy module,
   check every entrypoint, and document any manual verification still needed.

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
