# Known issues in the legacy application

Found by reading `legacy/Code.gs`. They are recorded here so the migration can preserve
behaviour deliberately; none are fixed in the refactoring PRs. Each fix should be a separate
`fix:` PR with a test.

- **Confirmed**: the code clearly behaves this way.
- **Needs runtime test**: plausible from the code, but depends on Apps Script or Sheets
  behaviour that should be reproduced in a staging copy first.
- **By design**: intended behaviour with a risk worth a decision.

## Scheduling and email

### Tuesday digests repeat when no new week has opened (Confirmed)

`autoDigests` runs every Tuesday and sends the digest for the week returned by
`currentWeek_`, without recording that it was already sent. With the default schedule, the
week 3 digest goes out on 22 December, 29 December and 5 January, and after the last week the
week 10 digest goes out every Tuesday until automatic emails are turned off.

### Reporting never closes after the last week (Confirmed)

`currentWeek_` (now `currentWeek` in `src/dates.ts`) returns the latest week whose open date
has passed, with no end date. After
week 10, the report page keeps showing week 10 and `submitReport_` keeps accepting late week
10 reports. Whether the programme should close needs a product decision.

### Test mode still records emails as sent (Confirmed)

With `send_all_emails_to` set, every email is redirected to the test address, but
`menuEmailLinks` still writes "Link emailed at" and `sendTickedReplies_` still writes "Reply
sent at" (which also shows the reply on the team's page). Used on a live Sheet, test mode
would mark real teams as having received links they never got. In a dedicated test Sheet this
is harmless.

### Replies are marked as sent when a team has no email addresses (Confirmed)

In `sendTickedReplies_`, a team without founder emails gets no email, but the reply is still
stamped as sent and counted in the "replies sent" message.

### Automatic emails can run twice if two people turn them on (Needs runtime test)

`menuEmailsOn` removes existing triggers before creating new ones, but
`ScriptApp.getProjectTriggers()` only returns the current user's triggers. If two editors each
turn automatic emails on, both sets of triggers would run and every reminder and digest would
be sent twice.

## Report submissions

### Partial submissions can leave inconsistent records (Confirmed; impact needs runtime test)

`submitReport_` saves proof files to Drive (`saveProof_`) before writing anything to the
Sheet, and `recordReport_` then appends the report row and each pipeline row separately, with
no rollback. A failure part-way through leaves orphaned files or a report without its
pipeline rows, and the duplicate check then blocks a corrected resubmission for that week.

### Fractional counts are accepted and rounded (Confirmed)

`validate_` accepts decimals for counts (asked, yes, no, not yet, goals, new customers) and
rounds them with `Math.round` before checking that yes + no + not yet equals asked. The report
page only lets people type digits into count fields, so this only affects requests sent
directly to the web app.

### Money is stored with cents but always shown rounded (Confirmed)

`validate_` keeps money to two decimal places, but `money_` (now `money` in `src/config.ts`,
used in feedback, digests and the page) rounds to whole units, so 299.50 is shown as 300.
`parseNumber_` (now `parseNumber` in `src/utils.ts`) also removes commas, so a decimal comma
such as `1,5` is read as 15, and it removes the letter R anywhere in the value.

### Proof upload limits differ from the message, and types are not checked (Confirmed)

`validate_` allows five files of up to 7,500,000 base64 characters each (about 5.6 MB), while
the error says 5 MB. `saveProof_` saves whatever file type and name the request supplies,
into a Drive folder named after the team (renaming a team starts a new folder). The files are
private to the script owner's Drive.

### Number-only team IDs never match their reports (Confirmed)

`reportsAll_` converts each report's team ID to text, but `teamsAll_` (now `allTeams` in
`src/teams.ts`) returns the Teams cell as stored. A team ID typed as a number (such as 101) is
read as a number, so `r.team_id === team.team_id` is never true: the team never sees its
reports, and the duplicate check in `submitReport_` does not stop repeat submissions. IDs
created by "Create missing team links" (T01, T02, ...) are text and are not affected.

### Corrections are saved without the script lock (Needs runtime test)

`submitCorrection_` does not take the lock that `submitReport_` uses. `appendRow_` writes to
the row after the last filled one, so two corrections arriving at the same moment could land
on the same row, and one would be lost.

## Access

### A team's link is its only credential (By design)

The private code in a team's link (`teamByToken` in `src/teams.ts`) is all that is needed to
read the team's history and submit reports or corrections for it. Codes do not expire. The
team view also includes the scoreboard, which shows every active team's name and money
received (`scoreboard_`), and error responses include raw exception messages from `doGet` and
`doPost`. The link email asks teams to keep the link private.

## Feedback wording

### "Last week" comparisons use the previous report (Confirmed)

`asks_change`, `money_flat` and `growth` compare with the team's previous report
(`lastBefore_`). If a team skipped a week, that report is older than last week, but the
wording still says "last week" or "two weeks running".
