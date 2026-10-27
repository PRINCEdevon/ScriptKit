# ScriptKit

ScriptKit is a small TypeScript development environment for Google Apps Script applications.
It gives an Apps Script project the workflow of an ordinary JavaScript repository: typed
modules, a bundler, linting, formatting, unit tests, Git hooks and CI. It does not add a
framework or wrap Google's services; application code still calls `SpreadsheetApp`,
`DriveApp` and `MailApp` directly.

The first application is the **Revenue Accelerator Monday report**, which is being migrated
from one large legacy file into this repository, one pull request at a time.

> **Current status: tooling only.** The build produces a smoke-test bundle, not the
> application. The Revenue Accelerator still runs from `legacy/Code.gs`, pasted into the Apps
> Script editor. See [docs/migration-plan.md](docs/migration-plan.md) for progress.

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

Tests run in Node.js with no Google credentials. They must never call real Google services:
anything that would touch a Sheet, Drive, email or triggers is replaced with a small fake.

## Project layout

```text
src/         Apps Script source (TypeScript). main.ts lists the entrypoints.
tests/       Vitest tests.
scripts/     Build and Git hook scripts.
legacy/      The original Code.gs, kept byte-for-byte as the behaviour reference.
web/         The HTML report page, deployed separately from the backend.
docs/        Migration plan and known issues.
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

**There is no deploy command yet, on purpose.** The current bundle is only a smoke test, and
pushing it would replace the live application code. A deploy script will be added once the
Revenue Accelerator is in the build. The eventual flow is:

1. `pnpm install` and `pnpm check`.
2. `pnpm build`.
3. `clasp push` to a **staging** script project bound to a copy of the Sheet.
4. Test there, then push to production and update the web app deployment.

`appsscript.json` was reconstructed from the deployment settings in use (V8, execute as the
deploying user, anyone can access). Compare it with the real project's manifest before the
first push: a manifest without `oauthScopes` lets Apps Script detect the scopes it needs.

## Frontend

The report page in `web/` is plain HTML, CSS and JavaScript. It is uploaded to the
programme's website separately from the backend and calls the web app URL. See
[web/README.md](web/README.md) for the API contract it depends on.

## Contributing

Work happens on short-lived branches, with Conventional Commits and a pull request into
`main`. Read [AGENTS.md](AGENTS.md) for the project rules, and
[docs/known-issues.md](docs/known-issues.md) before changing behaviour.
