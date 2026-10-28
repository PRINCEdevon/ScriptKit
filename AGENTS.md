# AGENTS.md

Rules for coding agents working in this repository. Read `README.md` for how the project
works and `docs/migration-plan.md` for what is being done now.

## Architecture

- ScriptKit is a TypeScript project that builds one Google Apps Script bundle. Apps Script is
  the only backend runtime; Google Sheets is the persistence layer.
- Calls to Google services (`SpreadsheetApp`, `DriveApp`, `MailApp`, `ScriptApp`, ...) stay
  easy to find: keep them in thin functions, separate from pure logic.
- `src/main.ts` exports every Apps Script entrypoint. The build turns each export into a
  top-level function. Menus and installed triggers call these by name, so never rename one.
- `legacy/Code.gs` is the original application and the behaviour reference. Never edit it;
  a test checks its hash. `docs/legacy-map.md` maps each original function to its module.
- Code lives in feature folders: `shared/`, `feedback/`, `reports/`, `email/`, `admin/`,
  plus `main.ts`. Imports only go downwards in that order (shared at the bottom), with no
  cycles and no index files; `tests/structure.test.ts` enforces it. Tests mirror `src/`.
- The HTML frontend in `web/` is deployed separately. Preserve its API contract.
- No frameworks, dependency injection, classes-as-services or layered folders (domain,
  infrastructure, ...). Add a module to the feature folder it belongs to.

## Coding

- Strict TypeScript, ES modules, `const`/`let`, small named functions, named types for data.
- Pure functions for business logic; avoid `any`.
- Comments explain business rules and Apps Script quirks, not what the code says.
- Follow ESLint and Prettier (`pnpm lint`, `pnpm format`).
- Add tests with every migrated or changed behaviour. Tests never touch real Google services:
  use the fakes in `tests/support/`. Most tests compare the typed code with `legacy/Code.gs`
  on the same fakes. A refactor must keep them all passing unchanged. A `fix:` PR that
  deliberately changes behaviour updates exactly the comparisons it changes, pins the new
  behaviour, and says so in the PR.
- Do not reformat or rename code outside the change. Never edit `dist/`.

## Changes and fixes

- The migration is complete (`docs/migration-plan.md`). Start every PR from the latest `main`.
- Preserve spreadsheet schemas, Settings keys, entrypoint names and HTTP contracts.
- Fix the issues in `docs/known-issues.md` one per `fix:` PR, with a test; update the entry.
- Keep refactoring and behaviour changes in separate PRs. Update docs as you go.

## Git

- Branch from `main` with a short name (`refactor/reports`). Never push to `main`.
- Conventional Commits (`type(scope): description`), in meaningful increments.
- Run `pnpm check` before pushing. Never bypass hooks, force-push or rewrite shared history.
- Never merge a PR. Unless told otherwise, push the branch and hand over the compare link and
  PR text: the maintainer opens and merges PRs on GitHub.
- Do not change the remote, Git identity or global Git config. `gh` cannot infer this
  repository from the SSH remote; pass `--repo PRINCEdevon/ScriptKit`.

## Safety

- Never commit secrets, `.clasp.json`, `.clasprc.json`, spreadsheet exports or generated
  report pages (they hold private team codes and the live web app URL).
- Never run `clasp push` or create deployments without explicit approval.
- Never send real emails, touch production Sheets or call live endpoints during development.
- Never change business rules or feedback wording without authorization.

## Completing a PR

1. `pnpm check` passes.
2. Review `git diff main...HEAD`; confirm no unrelated or generated files changed.
3. Commit, push the branch, and open (or hand over) the PR using the template.
4. Report the PR link, what changed and how it was validated.
