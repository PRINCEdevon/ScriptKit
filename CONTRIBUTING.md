# Contributing to ScriptKit

Thanks for helping. This guide covers setting up, how changes are made, and what a good pull
request looks like. Coding agents also follow [AGENTS.md](AGENTS.md), which states the same
rules more tersely.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Setting up

You need Node.js 24 or newer and pnpm (the version is pinned in `package.json`).

```bash
git clone https://github.com/PRINCEdevon/ScriptKit.git
cd ScriptKit
pnpm install   # installs dependencies and the Git hooks
pnpm check     # everything CI runs
```

You do not need a Google account to develop or test: the tests use in-memory fakes of the
Google services. You only need one to try a build in a real Apps Script project (see
[Trying a change on Google](#trying-a-change-on-google)).

## Making a change

1. **Start from the latest `main`** on a short branch named after the kind of change:
   `fix/digest-repeats`, `feat/reminder-time`, `refactor/sheets`, `docs/readme`.
2. **Keep it to one concern.** A behaviour change and a refactor go in separate pull requests.
3. **Commit with [Conventional Commits](https://www.conventionalcommits.org):**
   `type(scope): description`, imperative and lowercase, for example
   `fix(email): skip teams without addresses`. The types are `feat`, `fix`, `refactor`,
   `test`, `docs`, `chore`, `ci`, `build`, `style`, `perf` and `revert`. The commit-msg hook
   checks the subject line.
4. **Run `pnpm check`** before you push. The pre-push hook runs it too. Please don't bypass
   the hooks.
5. **Open a pull request** into `main` and fill in the template: a summary, what was added and
   changed, how it was tested, and anything not yet verified on Google.

## Code guidelines

- **Feature folders.** Code lives in `src/shared/`, `feedback/`, `reports/`, `email/` and
  `admin/`. Folders only import downwards, in that order, with no cycles and no index files;
  `tests/structure.test.ts` checks this. Tests mirror `src/`.
- **Entrypoints keep their names.** Everything Apps Script calls (`doGet`, menu items,
  triggers) is exported from `src/main.ts` under the original name. Menus and installed
  triggers find them by name, so renaming one breaks live Sheets.
- **Strict TypeScript, small functions.** Prefer pure functions for business logic, and keep
  calls to Google services in thin functions around them. No classes-as-services, dependency
  injection or frameworks.
- **The Sheet is the schema.** Column headings, Settings keys and the web app's request and
  response format are contracts with existing Sheets and the report page; change them only on
  purpose, with a migration path.
- **Comments explain why** (a business rule, an Apps Script quirk), not what the code does.
- **Never edit `legacy/Code.gs`.** It is the original application; a test checks its hash.

## Tests

- Add or update tests with every change. Run a single file with
  `pnpm test tests/email/email.test.ts`.
- Tests must never call real Google services, send email or create triggers. Use the fakes in
  `tests/support/`: `useFakeGoogle()` installs them as globals, and `seedTab()` fills a tab.
- Most tests run the same inputs through the typed code and through `legacy/Code.gs`
  (`loadLegacy()`) and compare the results. A refactor must keep every comparison passing. A
  fix that deliberately changes behaviour updates exactly the comparisons it changes, pins
  the new behaviour with its own assertions, and says so in the pull request.

## Fixing a known issue

[docs/known-issues.md](docs/known-issues.md) lists behaviour kept from the original that is
worth fixing. Fix one issue per `fix:` pull request, with a test, and move its entry to the
"Fixed" section.

## Trying a change on Google

Never point `.clasp.json` at a live programme's project while developing. Use a staging
project bound to a copy of the Sheet, with `send_all_emails_to` set to your own address so that
every email comes to you. Then:

```bash
cp .clasp.json.example .clasp.json   # set the staging scriptId
pnpm exec clasp login
pnpm clasp:push
```

The Sheet's menu runs the new code straight away. To try the report page, update the staging
web app deployment as well. The [README](README.md#deploying) explains the difference.

## Reporting problems

- **Bugs and ideas:** open a GitHub issue with what you did, what you expected and what
  happened.
- **Security problems:** please don't open an issue; follow [SECURITY.md](SECURITY.md).
