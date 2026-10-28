# Security

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Report it privately through GitHub instead: on the repository's **Security** tab, choose
**Report a vulnerability**. Include what you found, how to reproduce it, and what an attacker
could do with it. You will get an acknowledgement as soon as the maintainer can, and we will
agree a fix and a disclosure date with you before anything is made public.

Problems in Google Apps Script, Sheets or Drive themselves belong with
[Google's Vulnerability Reward Program](https://bughunters.google.com/).

## Supported versions

Only the latest `main` is maintained. Programmes running an older pasted copy of the script
(including `legacy/Code.gs`) should move to the current build.

## What is sensitive here

The Revenue Accelerator handles programme data in a Google Sheet. Treat these as secrets:

| Secret                                     | Why it matters                                                                                     |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| A team's private code (`?t=…` in its link) | It is the only credential: anyone with the link can read and report for that team.                 |
| The web app's `/exec` address              | It is the backend's public entry point; with a team code it gives full access to that team's data. |
| Spreadsheet exports (`.xlsx`, `.csv`)      | They contain every team's private code, email addresses and reports.                               |
| `.clasp.json`, `~/.clasprc.json`           | Your script ID and your Google login token.                                                        |

`.gitignore` keeps Excel exports (`.xlsx`, `.xls`), generated report pages and clasp files out
of Git. Don't commit CSV exports either, and never paste real codes, addresses or exports into
issues or pull requests.

## Known limitations

These are documented design decisions and known issues rather than undisclosed
vulnerabilities; see [docs/known-issues.md](docs/known-issues.md).

- **Links are bearer credentials.** A team's link is all that is needed to use its page, and
  codes do not expire. Clearing a team's private code and running "Create missing team links"
  issues a new one.
- **The scoreboard is shared.** Every team's page shows the names and totals of all active
  teams in the programme.
- **Error messages are passed through.** When something fails, the web app returns the
  exception message to the page.
- **Proof uploads are not type-checked.** Files go to a private Drive folder, but any file type
  under about 5.6 MB is accepted.

## For maintainers

- Run builds against a **staging** Apps Script project with `send_all_emails_to` set, never
  against a live programme while developing.
- Before switching a live programme to a new build, follow the go-live checklist in
  [docs/migration-plan.md](docs/migration-plan.md#going-live).
- Private vulnerability reporting must be switched on for the repository (Settings › Code
  security) for the reporting link above to appear.
