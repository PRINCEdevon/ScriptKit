# Contributing to ScriptKit

Thanks for helping. This guide covers getting set up, how changes are made, and what a good
pull request looks like. Coding agents also follow [AGENTS.md](AGENTS.md), which states the
same rules more tersely.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

<br/>
<br/>

## Contents

1. [Prerequisites](#prerequisites)
2. [Quick start](#quick-start)
3. [Making changes](#making-changes)
4. [Code guidelines](#code-guidelines)
5. [Automated testing](#automated-testing)
6. [Fixing known issues](#fixing-known-issues)
7. [Reporting problems](#reporting-problems)
8. [Trying changes on Google](#trying-changes-on-google)

<br/>
<br/>

## Prerequisites

- **Node.js 24 or newer**, the LTS version CI uses.
- **pnpm.** The exact version is pinned in `package.json` (`packageManager`).
- **Git.**

That's all you need to develop and test: the tests use in-memory fakes of the Google services,
so **no Google account is needed**. You only need one to try a build in a real Apps Script
project (see [Trying changes on Google](#trying-changes-on-google)).

<br/>
<br/>

## Quick start

```bash
git clone https://github.com/PRINCEdevon/ScriptKit.git
cd ScriptKit
pnpm install   # dependencies and Git hooks
pnpm check     # typecheck, lint, format check, tests and build: what CI runs
```

If `pnpm check` passes, you're ready. These are the commands you'll use:

| Command           | What it does                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------- |
| `pnpm build`      | Bundle `src/` into `dist/Code.js` and copy `appsscript.json`.                            |
| `pnpm dev`        | Rebuild on every change to `src/` or `appsscript.json`.                                  |
| `pnpm test`       | Run the test suite once (`pnpm test:watch` to keep it running).                          |
| `pnpm typecheck`  | TypeScript, for `src/` and for the Node.js tooling.                                      |
| `pnpm lint`       | ESLint.                                                                                  |
| `pnpm format`     | Format with Prettier (`pnpm format:check` to only check).                                |
| `pnpm check`      | All of the above, in CI's order.                                                         |
| `pnpm clasp:push` | Check, build and upload `dist/` to Apps Script ([see below](#trying-changes-on-google)). |

[Lefthook](https://lefthook.dev) installs the Git hooks during `pnpm install` (reinstall with
`pnpm exec lefthook install`):

- **pre-commit**: ESLint and a Prettier check on the files you're committing.
- **commit-msg**: the subject line must follow Conventional Commits (below).
- **pre-push**: `pnpm check`.

<br/>
<br/>

## Making changes

1. **Start from the latest `main`** on a short branch named after the kind of change:
   `fix/digest-repeats`, `feat/reminder-time`, `refactor/sheets`, `docs/readme`.
2. **Keep it to one concern.** A behaviour change and a refactor go in separate pull requests.
3. **Commit with [Conventional Commits](https://www.conventionalcommits.org):**
   `type(scope): description`, imperative and lowercase, for example
   `fix(email): skip teams without addresses`. The types are `feat`, `fix`, `refactor`,
   `test`, `docs`, `chore`, `ci`, `build`, `style`, `perf` and `revert`.
4. **Run `pnpm check`** before you push. The pre-push hook runs it too. Please don't bypass
   the hooks.
5. **Open a pull request** into `main` and fill in the template: a summary, what was added and
   changed, how it was tested, and anything not yet verified on Google.

<br/>
<br/>

## Code guidelines

- **Feature folders.** Code lives in `src/shared/`, `feedback/`, `reports/`, `email/` and
  `admin/`. Folders only import downwards, in that order, with no cycles and no index files;
  `tests/structure.test.ts` checks this. Tests mirror `src/`.
- **Entrypoints keep their names.** Everything Apps Script calls (`doGet`, menu items,
  triggers) is exported from `src/main.ts` under the original name. Menus and installed
  triggers find them by name, so renaming one breaks live Sheets.
- **Strict TypeScript, small functions.** Prefer pure functions for business logic, and keep
  calls to Google services in thin functions around them. No classes-as-services, dependency
  injection or frameworks. `src/` must not use Node.js APIs; Apps Script doesn't have them.
- **The Sheet is the schema.** Tab names, column headings, Settings keys and the web app's
  requests and replies are contracts with existing Sheets and the report page. Change them only
  on purpose, with a migration path.
- **Comments explain why** (a business rule, an Apps Script quirk), not what the code does.
- **Never edit `legacy/Code.gs`.** It is the original application; a test checks its hash.

<br/>
<br/>

## Automated testing

- **Every change comes with tests.** Run one file with
  `pnpm test tests/email/email.test.ts`, or everything with `pnpm check`.
- **Never call real Google services.** Tests must not send email, touch a real Sheet or create
  triggers. Use the fakes in `tests/support/`: `useFakeGoogle()` installs them as globals and
  `seedTab()` fills a tab.
- **Compare with the original.** Most tests run the same inputs through the typed code and
  through `legacy/Code.gs` (`loadLegacy()`) and compare the results. A refactor must keep every
  comparison passing. A fix that deliberately changes behaviour updates exactly the comparisons
  it changes, pins the new behaviour with its own assertions, and says so in the pull request.
- **Whole-app baselines** in `tests/baseline/` run full scenarios against the built bundle.
  They should keep passing unchanged.

<br/>
<br/>

## Fixing known issues

[docs/known-issues.md](docs/known-issues.md) lists behaviour kept from the original app that is
worth fixing. Each entry says where the code lives and how sure we are:

- **Confirmed** <br/>
  The code clearly behaves this way. These are ready to fix.
- **Needs runtime test** <br/>
  Plausible from the code, but it depends on how Google behaves. Reproduce it on a staging
  project first (see below) and note what you saw in the issue.
- **By design** <br/>
  Intended behaviour with a trade-off. Open an issue to discuss it before changing anything.

Fixes are paused at the moment, so please comment on, or open, an issue before starting one.
Then:

1. **Branch** from the latest `main` as `fix/<short-name>`, one issue per pull request.
2. **Show the problem in a test first.** Many issues are already pinned by a test that records
   today's behaviour; change it to expect the fixed behaviour and watch it fail.
3. **Make the smallest change** that makes it pass. Most tests compare the typed code with the
   original `legacy/Code.gs`; update only the comparisons your fix deliberately changes, and
   explain each one in the pull request.
4. **Move the entry** to the "Fixed" section of known-issues.md, saying what changed.
5. **Note anything people will notice** (different emails, a changed page, new formatting in the
   Sheet) in the pull request, and try it on Google if the change depends on the platform.

The setup fix in [pull request #8](https://github.com/PRINCEdevon/ScriptKit/pull/8) is a good
example to follow.

<br/>
<br/>

## Reporting problems

**Check [docs/known-issues.md](docs/known-issues.md) first:** your problem may already be
described there, with the reason it hasn't been fixed yet.

- **Bugs** <br/>
  Open a GitHub issue with the steps you took, what you expected and what happened instead.
  Say which part it was (the report page, the Sheet menu, an email, a scheduled job) and any
  settings that matter, such as `time_zone`, `pretend_today` or whether `send_all_emails_to` is
  set. For a script error, copy the message from **Executions** in the Apps Script editor.
- **Ideas** <br/>
  Describe the problem before the solution: who it affects and what they are trying to do.
- **Questions** <br/>
  Open an issue too; if the answer belongs in the docs, we'll add it.
- **Security problems** <br/>
  Please don't open an issue; follow [SECURITY.md](SECURITY.md) to report it privately.

**Keep real data out of issues.** Never paste a team's private link or code, email addresses,
the web app's `/exec` address or a spreadsheet export. Replace them with placeholders.

<br/>
<br/>

## Trying changes on Google

> [!IMPORTANT]
> **Use a staging project, never a live programme's** <br/>
> The tests cover the code without Google, but some things only show up on the real platform:
> permissions, triggers, emails and the web app. Try those changes in a staging Apps Script
> project bound to a copy of the Sheet, with every email redirected to you, and record what
> you checked in the pull request.
>
> <details>
> <summary><strong>See more: step by step</strong></summary>
> <br/>
>
> 1. **Make a staging Sheet** <br/>
>    A copy of a programme's Sheet, or a new one filled with "Add demo data". Open
>    **Extensions › Apps Script** and note the **Script ID** under Project Settings.
> 2. **Redirect every email to yourself** <br/>
>    In the staging Sheet's Settings tab, set `send_all_emails_to`, `admin_email` and
>    `contact_email` to your own address.
> 3. **Push your build** <br/>
>    Copy `.clasp.json.example` to `.clasp.json`, set the staging script ID, then run
>    `pnpm exec clasp login` and `pnpm clasp:push`.
> 4. **Point the script at the right Sheet** <br/>
>    Reload the Sheet and run **Set up or repair the sheet**. Then check that the `SHEET_ID`
>    script property (Project Settings) matches the ID in the staging Sheet's address: a
>    copied Sheet can still point at the original until setup runs.
> 5. **Try the report page if you need to** <br/>
>    The menu runs your code straight away, but the web app only changes when its deployment
>    does. Create or update a web app deployment; the [README](README.md) explains the
>    difference between pushing and deploying.
>
> </details>
