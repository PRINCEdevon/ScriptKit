# AGENTS.md

Rules for coding agents working in this repository. [README.md](README.md) explains how the
project works and [CONTRIBUTING.md](CONTRIBUTING.md) the workflow for people; this file is the
short, strict version.

## Where things stand

- The migration from `legacy/Code.gs` to typed modules is complete (PRs 1–7), followed by a
  setup fix and the feature-folder layout. Live programmes still run the original until the
  go-live checklist in `docs/migration-plan.md` is done.
- The fixes in `docs/known-issues.md` are **on hold**: do not start one unless asked.
- The web app has only been checked on Google if the "Record" table in
  `docs/migration-plan.md` says so. Never assume it.

## Where to look

| Question                                     | Answer                                              |
| -------------------------------------------- | --------------------------------------------------- |
| Which module does what? Where do I add code? | README "Project structure"; folder rules below.     |
| Where did an original function go?           | `docs/legacy-map.md`                                |
| Is this behaviour a known bug?               | `docs/known-issues.md`                              |
| What does the report page send and expect?   | `web/README.md`                                     |
| How do I try a build on Google?              | `docs/migration-plan.md` (Going live), CONTRIBUTING |

## Architecture

- ScriptKit builds one Google Apps Script bundle. Apps Script is the only backend runtime;
  Google Sheets is the persistence layer.
- `src/main.ts` exports every Apps Script entrypoint; the build turns each export into a
  top-level function. Menus and installed triggers call these by name, so never rename one.
- Code lives in feature folders: `shared/`, `feedback/`, `reports/`, `email/`, `admin/`, plus
  `main.ts`. Imports only go downwards in that order, with no cycles and no index files
  (`tests/structure.test.ts`). Tests mirror `src/`.
- Calls to Google services stay in thin functions around pure logic, easy to find.
- `legacy/Code.gs` is the original application and the behaviour reference. Never edit it; a
  test checks its hash.
- The report page in `web/` is deployed separately. Preserve the web app's request and
  response format, the Sheet's column headings and the Settings keys.
- No frameworks, dependency injection, classes-as-services or layered folders (domain,
  infrastructure, ...).

## Coding

- Strict TypeScript, ES modules, `const`/`let`, small named functions, named types for data.
- Pure functions for business logic; avoid `any`. `src/` must not use Node.js APIs.
- Comments explain business rules and Apps Script quirks, not what the code says.
- Follow ESLint and Prettier. Do not reformat or rename code outside the change. Never edit
  `dist/`.
- Every change comes with tests. Tests never touch real Google services: use the fakes in
  `tests/support/`. Most tests compare the typed code with `legacy/Code.gs` on the same
  fakes. A refactor keeps them all passing unchanged. A `fix:` that deliberately changes
  behaviour updates exactly the comparisons it changes, pins the new behaviour, and says so.

## Git and pull requests

- Branch from the latest `main` with a short name (`fix/digest-repeats`). Never push to `main`.
- Conventional Commits (`type(scope): description`), in meaningful increments. Keep
  refactoring and behaviour changes in separate pull requests.
- Run `pnpm check` before pushing. Never bypass hooks, force-push or rewrite shared history.
- Never merge. Unless told otherwise, push the branch and hand over the compare link plus a PR
  description in the format of `.github/pull_request_template.md`; the maintainer opens and
  merges pull requests on GitHub.
- Do not change the remote, Git identity or global Git config. `gh` cannot infer this
  repository from the SSH remote; pass `--repo PRINCEdevon/ScriptKit`.

## Safety

- Never commit secrets, `.clasp.json`, `.clasprc.json`, spreadsheet exports or generated
  report pages: they hold private team codes, the web app address and login tokens.
- Never run `clasp push`, create or update deployments, or call a web app without explicit
  approval for that specific action. Approval for one push does not cover the next.
- Never send real emails, touch a live programme's Sheet, or change business rules or
  feedback wording without authorization.

## Completing a pull request

1. `pnpm check` passes (also on Node 24, the version CI uses).
2. Review `git diff main...HEAD`: no unrelated, generated or secret files.
3. Update the docs the change affects (README, docs/, web/README).
4. Push the branch and hand over the compare link and the PR description.
