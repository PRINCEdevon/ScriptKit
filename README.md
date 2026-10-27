# ScriptKit

ScriptKit is a small TypeScript development environment for Google Apps Script applications.
It gives an Apps Script project the workflow of an ordinary JavaScript repository: typed
modules, a bundler, linting, formatting, unit tests, Git hooks and CI. It does not add a
framework or wrap Google's services; application code still calls `SpreadsheetApp`,
`DriveApp` and `MailApp` directly.

The first application is the **Revenue Accelerator Monday report**, which is being migrated
from one large legacy file into this repository, one pull request at a time.

> **Current status: migration in progress.** The bundle runs the whole application behind all
> 21 of its entrypoints. The web app (report page API, submissions, feedback, scoreboard) and
> the spreadsheet, settings, date and team code are typed modules in `src/`. Emails, triggers
> and the admin menu are still the original code in `src/legacy.js`. The live Sheets keep running
> the pasted `Code.gs` until the migrated bundle is deployed. See
> [docs/migration-plan.md](docs/migration-plan.md) for progress.

## The Revenue Accelerator

Teams in an accelerator programme fill in a short report every Monday: money received, how
many people they asked to buy, what customers said, their goals and (for the Organisation
track) their sales pipeline. The application:

- serves each team's report page through a private link and stores the reports in a Sheet;
- shows instant feedback, the team's history and a cohort scoreboard after each report;
- emails reminders, mentor digests and the programme manager's replies;
- gives the programme manager a menu in the Sheet for links, replies, setup and demo data.

One copy runs per programme. Everything that differs between programmes lives in the Sheet's
Settings tab, not in code.

## How it fits together

| Piece                             | Role                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| Google Apps Script                | The backend. Server-side JavaScript (V8) that runs in Google's cloud, bound to one Sheet.     |
| Google Sheets                     | The database and the admin interface. Each tab is a table; the header row names the columns.  |
| Google Drive                      | Stores proof-of-payment uploads and the report page template.                                 |
| MailApp                           | Sends reminders, digests, replies and link emails from the script owner's account.            |
| Time-driven triggers              | Run scheduled jobs (reminders, digests, the daily log refresh).                               |
| Settings tab                      | Programme configuration: name, time zone, currency, email switches, test mode.                |
| [HTML report page](web/README.md) | Hosted separately on the programme's website; talks to the script's web app URL with `fetch`. |

A few things about Apps Script that shape this repository:

- **There are no modules at runtime.** Every file in a script project shares one global
  scope. Apps Script finds `doGet`, `doPost`, `onOpen`, menu handlers and trigger handlers by
  looking for top-level functions with those names.
- **The build bridges the gap.** `scripts/build.js` bundles `src/` with esbuild into one
  script, `dist/Code.js`, and adds a top-level function for each export of `src/main.ts`.
  Exporting a function from `src/main.ts` is how you make it an entrypoint.
- **Google services are globals** (`SpreadsheetApp`, `DriveApp`, ...). Types come from
  `@types/google-apps-script`. Code in `src/` is type-checked without Node.js types, because
  Node APIs do not exist in Apps Script.

## Getting started

Requirements: Node.js 24 LTS or newer, and pnpm (the version is pinned in `package.json`).

```bash
pnpm install   # installs dependencies and the Git hooks
pnpm check     # typecheck, lint, format check, tests and build
```

| Command             | What it does                                                  |
| ------------------- | ------------------------------------------------------------- |
| `pnpm build`        | Bundle `src/` into `dist/Code.js` and copy `appsscript.json`. |
| `pnpm dev`          | Rebuild whenever `src/` or `appsscript.json` changes.         |
| `pnpm typecheck`    | TypeScript checks for `src/` and for the Node.js tooling.     |
| `pnpm lint`         | ESLint.                                                       |
| `pnpm format`       | Format with Prettier.                                         |
| `pnpm format:check` | Check formatting without changing files.                      |
| `pnpm test`         | Run the Vitest suite once.                                    |
| `pnpm test:watch`   | Run Vitest in watch mode.                                     |
| `pnpm check`        | Everything CI runs, in the same order.                        |
| `pnpm clasp:push`   | Check, build and upload `dist/` with clasp (see below).       |

Tests run in Node.js with no Google credentials and never call real Google services.
`tests/support/` has in-memory fakes of the services the application uses and runs a script
the way Apps Script does, with a fresh global scope for every call. The baseline tests in
`tests/baseline/` run the same scenarios against the original `legacy/Code.gs` and against
the bundle, and require identical results: that is how each refactoring step proves it has
not changed behaviour.

## Project layout

```text
src/         Apps Script source. main.ts lists the entrypoints; legacy.js is the
             transitional copy of the original, shrinking as code moves into typed modules.
tests/       Vitest tests; support/ holds the fake Apps Script services.
scripts/     Build and Git hook scripts.
legacy/      The original Code.gs, kept byte-for-byte as the behaviour reference.
web/         The HTML report page, deployed separately from the backend.
docs/        Migration plan, map of the legacy code, and known issues.
dist/        Build output (generated, not committed).
```

## Git hooks

[Lefthook](https://lefthook.dev) installs the hooks during `pnpm install`. To reinstall them,
run `pnpm exec lefthook install`.

- **pre-commit**: ESLint and a Prettier check on staged files.
- **commit-msg**: the subject must follow [Conventional Commits](https://www.conventionalcommits.org),
  for example `feat: add reminders` or `fix(email): skip empty recipients`.
- **pre-push**: `pnpm check`.

CI runs the same checks on every pull request and on pushes to `main`.

## Deployment with clasp

[clasp](https://github.com/google/clasp) uploads local files to an Apps Script project. Two
steps matter, and they are easy to confuse:

1. **`clasp push` uploads code.** It replaces _every_ file in the script project with the
   contents of `dist/` (set by `rootDir` in `.clasp.json`). The Sheet's menu, the triggers
   and the editor's test deployment run this uploaded code **immediately**.
2. **A deployment publishes a version.** The web app URL that the report page calls (the one
   ending in `/exec`) serves a fixed, numbered version. It only changes when the deployment
   is pointed at a new version: `clasp update-deployment <deploymentId>` snapshots the pushed
   code as a new version and switches the deployment to it (or use Deploy > Manage
   deployments > Edit > New version in the editor).

So a push changes the Sheet's behaviour straight away, while the report page keeps using the
previously deployed version until the deployment is updated.

To link a checkout to a script project, copy `.clasp.json.example` to `.clasp.json` (ignored
by Git) and fill in the script ID. Log in with `pnpm exec clasp login`; the token is stored
in `~/.clasprc.json`, outside the repository.

`pnpm clasp:push` runs `pnpm check` and then `clasp push`, uploading `dist/` to whichever
project `.clasp.json` names. Nothing runs it automatically. The flow is:

1. Point `.clasp.json` at a **staging** script project bound to a copy of the Sheet, and run
   `pnpm clasp:push`.
2. In the staging Sheet, reload and run "Check permissions"; then update the staging web app
   deployment and work through the manual test script.
3. Only then point `.clasp.json` at production, push, and update the production deployment.

Before the first push to any project, compare the project's own manifest with
`appsscript.json` (for example `pnpm exec clasp clone <scriptId>` into an empty scratch
folder). The repository's manifest was reconstructed from the deployment settings in use: V8,
execute as the deploying user, anyone can access, and no `oauthScopes`, so Apps Script detects
the scopes from the code. `clasp push` asks before it overwrites the project's manifest (the
script deliberately does not pass `-f`), so you can still say no. Without an interactive
terminal (an agent or a script) it cannot ask, and prints "Skipping push." instead; there, once
you have compared the manifests, run `pnpm clasp:push -f`.

## Frontend

The report page in `web/` is plain HTML, CSS and JavaScript. It is uploaded to the
programme's website separately from the backend and calls the web app URL. See
[web/README.md](web/README.md) for the API contract it depends on.

## Contributing

Work happens on short-lived branches, with Conventional Commits and a pull request into
`main`. Read [AGENTS.md](AGENTS.md) for the project rules, and
[docs/known-issues.md](docs/known-issues.md) before changing behaviour.
