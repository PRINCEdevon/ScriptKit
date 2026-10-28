<div align="center">

# ScriptKit

**A small, modern TypeScript workflow for Google Apps Script apps.**

Typed modules, a real bundler, tests that run in seconds without a Google account,
Git hooks and CI, while the app still calls `SpreadsheetApp`, `DriveApp` and `MailApp`
directly. No framework, no wrappers.

[![CI](https://github.com/PRINCEdevon/ScriptKit/actions/workflows/ci.yml/badge.svg)](https://github.com/PRINCEdevon/ScriptKit/actions/workflows/ci.yml)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![Apps Script](https://img.shields.io/badge/Apps%20Script-V8-4285f4?logo=google&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-24%2B-5fa04e?logo=nodedotjs&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-12-f69220?logo=pnpm&logoColor=white)
![Vitest](https://img.shields.io/badge/tested%20with-Vitest-6e9f18?logo=vitest&logoColor=white)

[Quick start](#quick-start) · [How it works](#how-it-works) · [Project structure](#project-structure) · [Testing](#testing) · [Deploying](#deploying) · [Docs](#documentation)

</div>

---

## What's inside

ScriptKit's first application is the **Revenue Accelerator Monday report**. Teams in an
accelerator programme send a short report every Monday: money received, how many people they
asked to buy, what customers said, their goals and, on the Organisation track, their sales
pipeline.

- 📝 **A report page per team.** Each team has a private link; reports land in the programme's
  Google Sheet.
- 💡 **Instant feedback.** After each report: notes driven by editable rules, the team's
  history, and a cohort scoreboard.
- ✉️ **Email that runs itself.** Due-day reminders, Tuesday digests for mentors, and replies
  from the programme manager, with a test mode that sends everything to one inbox.
- 🧰 **An admin menu in the Sheet.** Team links, replies, setup and repair, demo data and a
  permissions check.

One copy runs per programme. Everything that differs between programmes (name, time zone,
currency, email switches) lives in the Sheet's Settings tab, not in code.

> [!NOTE]
> **Status: migrated, not yet live.** The app was moved from one 1,425-line `Code.gs` into
> typed modules without changing behaviour, and the original is kept in `legacy/` as the
> reference the tests compare against. Live programmes still run the original until the
> [go-live checklist](docs/migration-plan.md#going-live) is complete.

## How it works

```mermaid
flowchart LR
    page["📄 Report page<br/>web/, hosted on the programme's site"]
    subgraph gas["Google Apps Script · dist/Code.js"]
        webapp["Web app<br/>doGet · doPost"]
        menu["Sheet menu<br/>onOpen · menu items"]
        jobs["Time-driven triggers<br/>reminders · digests · daily log"]
    end
    sheet[("Google Sheet<br/>Settings · Teams · Reports · …")]
    drive[("Google Drive<br/>proof of payment")]
    mail["MailApp"]

    page -- "fetch: GET / POST" --> webapp
    webapp --> sheet
    webapp --> drive
    menu --> sheet
    jobs --> sheet
    menu --> mail
    jobs --> mail
```

Three things about Apps Script shape this repository:

- **There are no modules at runtime.** Every file in a script project shares one global scope,
  and Apps Script finds `doGet`, `doPost`, `onOpen`, menu handlers and triggers by looking for
  top-level functions with those names.
- **The build bridges the gap.** `scripts/build.js` bundles `src/` with esbuild into one
  script and adds a top-level function for each export of `src/main.ts`. Exporting a function
  from `main.ts` is how it becomes an entrypoint.
- **Google services are globals.** Types come from `@types/google-apps-script`, and `src/` is
  type-checked without Node.js types, because Node APIs do not exist in Apps Script.

## Quick start

You need **Node.js 24 or newer** and **pnpm** (the exact version is pinned in `package.json`).

```bash
git clone https://github.com/PRINCEdevon/ScriptKit.git
cd ScriptKit
pnpm install   # dependencies and Git hooks
pnpm check     # typecheck, lint, format check, tests and build: what CI runs
```

| Command           | What it does                                                              |
| ----------------- | ------------------------------------------------------------------------- |
| `pnpm build`      | Bundle `src/` into `dist/Code.js` and copy `appsscript.json`.             |
| `pnpm dev`        | Rebuild on every change to `src/` or `appsscript.json`.                   |
| `pnpm test`       | Run the test suite once (`pnpm test:watch` to keep it running).           |
| `pnpm typecheck`  | TypeScript, for `src/` and for the Node.js tooling.                       |
| `pnpm lint`       | ESLint.                                                                   |
| `pnpm format`     | Format with Prettier (`pnpm format:check` to only check).                 |
| `pnpm check`      | All of the above, in CI's order.                                          |
| `pnpm clasp:push` | Check, build and upload `dist/` to Apps Script ([Deploying](#deploying)). |

## Project structure

```text
src/                 Apps Script source, one folder per feature
├── main.ts          every entrypoint Apps Script can call
├── shared/          sheets, settings, dates, teams, pipeline, utils, types
├── feedback/        feedback rules and the cohort scoreboard
├── reports/         web app (doGet, doPost), submissions, proof files
├── email/           reminders, digests, replies, triggers
└── admin/           Sheet menu, setup and repair, demo data, report page
tests/               mirrors src/, plus support/ (fake Google services) and baseline/
legacy/Code.gs       the original application, kept byte-for-byte
web/                 the report page, deployed separately
scripts/             build and Git hook scripts
docs/                migration plan, legacy map, known issues
```

Folders only import **downwards** (`shared` ← `feedback` ← `reports` ← `email` ← `admin` ←
`main`), with no cycles and no index files. `tests/structure.test.ts` keeps it that way.

## Testing

Tests run in Node.js with **no Google account and no network**. Nothing can send a real email
or touch a real Sheet.

- **Fake Google services.** `tests/support/` has in-memory fakes of SpreadsheetApp, DriveApp,
  MailApp, ScriptApp and friends. Each fake throws on anything it does not implement, so a
  gap can't pass silently.
- **Compared with the original.** Most tests run the same inputs through the typed code and
  through `legacy/Code.gs`, loaded into a `node:vm` sandbox, and require identical results:
  return values, errors, every cell, every email and every Drive file.
- **Whole-app baselines.** `tests/baseline/` runs full scenarios against the built bundle the
  way Apps Script runs it, with a fresh global scope for every call.

## Deploying

[clasp](https://github.com/google/clasp) uploads `dist/` to an Apps Script project. Two steps
matter, and they are easy to confuse:

| Step                          | What changes                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| `pnpm clasp:push`             | Replaces **all** code in the script project. The Sheet's menu and triggers use it right away. |
| Update the web app deployment | The report page's `/exec` address serves a fixed version until you point it at a new one.     |

<details>
<summary><strong>First-time setup and details</strong></summary>

1. Copy `.clasp.json.example` to `.clasp.json` (ignored by Git) and set the script ID of a
   **staging** project bound to a copy of the Sheet.
2. Log in with `pnpm exec clasp login`. The token lives in `~/.clasprc.json`, outside the
   repository.
3. Compare the project's manifest with `appsscript.json` before the first push, for example by
   running `pnpm exec clasp clone <scriptId>` in an empty folder.
4. Run `pnpm clasp:push`. clasp asks before it overwrites the project's manifest; in a
   non-interactive shell it skips the push instead, so use `pnpm clasp:push -f` once you have
   compared the manifests.
5. Update the web app deployment: run `pnpm exec clasp update-deployment <deploymentId>`, or
   use Deploy › Manage deployments › Edit › New version in the editor.

Switching a live programme to the bundle has its own checklist:
[Going live](docs/migration-plan.md#going-live).

</details>

## The report page

The page in [`web/`](web/) is plain HTML, CSS and JavaScript. It is uploaded to the programme's
website separately from the backend and talks to the web app with `fetch`.
[web/README.md](web/README.md) describes the API contract it depends on.

## Documentation

| Document                                         | What's in it                                                      |
| ------------------------------------------------ | ----------------------------------------------------------------- |
| [CONTRIBUTING.md](CONTRIBUTING.md)               | Setting up, branches and commits, code and test guidelines.       |
| [AGENTS.md](AGENTS.md)                           | The rules for coding agents working in this repository.           |
| [docs/migration-plan.md](docs/migration-plan.md) | How the migration was done, and the go-live checklist.            |
| [docs/legacy-map.md](docs/legacy-map.md)         | Where each function of the original `Code.gs` lives now.          |
| [docs/known-issues.md](docs/known-issues.md)     | Behaviour kept from the original that is worth fixing, and fixes. |
| [web/README.md](web/README.md)                   | The report page and its API contract.                             |
| [SECURITY.md](SECURITY.md)                       | What is sensitive here and how to report a vulnerability.         |

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), and please follow
the [Code of Conduct](CODE_OF_CONDUCT.md). To report a security problem, see
[SECURITY.md](SECURITY.md) rather than opening an issue.
