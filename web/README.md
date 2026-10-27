# web/

The report page that teams open with their private link. It is plain HTML, CSS and
JavaScript in one file, with no build step. It is hosted on the programme's website, not in
Apps Script, and is deployed separately from the backend.

| File                   | What it is                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `report-template.html` | The page template, kept byte-for-byte as the backend expects it (Prettier and ESLint skip it). |

The template was copied from the test programme's Drive folder. Before relying on it for a
live programme, compare it with that programme's template in Drive.

## How the page reaches the backend

The page reads the team's private code from its own URL (`?t=<code>`) and calls the Apps
Script web app URL (`WEB_APP_URL` in the page). The handlers are in `src/api.ts` and
`src/reports.ts`:

| Request                                              | Handler                       | Purpose                                     |
| ---------------------------------------------------- | ----------------------------- | ------------------------------------------- |
| `GET <web app>?action=get&t=<code>`                  | `doGet` → `teamView`          | Everything the page shows for the team.     |
| `POST <web app>` with `{"action":"submit","t",...}`  | `doPost` → `submitReport`     | Send this week's report and proof files.    |
| `POST <web app>` with `{"action":"correct","t",...}` | `doPost` → `submitCorrection` | Add a correction note to an earlier report. |

Every response is JSON. Failures look like `{ "ok": false, "error": "<code>", "message": "..." }`,
where the code is one of `link`, `stopped`, `closed`, `duplicate`, `invalid`, `unknown` or
`server`, and the page shows the message.

These field names and error codes are a contract between `web/` and the backend. A change to
either side must keep them compatible, because the deployed page and the deployed web app
version are updated at different times.

### Browser behaviour to keep (and to verify after changes)

- **No CORS preflight.** The POST body is JSON but is sent _without_ a JSON content type
  header, so the browser treats it as a simple `text/plain` request. Apps Script cannot
  answer a preflight `OPTIONS` request, so adding custom headers would break every
  submission.
- **Redirects.** The web app answers with a redirect to a `googleusercontent.com` URL that
  holds the response. `fetch` follows it (`redirect: 'follow'`); the POST has already run by
  then.
- Both behaviours come from Google and are not covered by automated tests. Check them in a
  browser against a staging deployment whenever the page or the web app deployment settings
  change.

## Preparing and deploying the page

The backend's "Prepare the report page" menu item (`preparePage_` in `legacy/Code.gs`)
produces the uploadable page:

1. It looks in the Sheet's Drive folder for a file named `<short name>-report TEMPLATE.html`
   (for example `ura-report TEMPLATE.html`), based on `short_name` in Settings.
2. It replaces `'PASTE_YOUR_WEB_APP_URL_HERE'` with the web app URL, and `__PAGE_TITLE__`,
   `__PAGE_DESCRIPTION__` and `__PROGRAMME_NAME__` with values from Settings.
3. It saves `<short name>-report.html` in the same folder, for upload to the website at the
   address in the `report_page_url` setting.

The generated page contains the live web app URL. Keep it out of Git (`*-report.html` is
ignored). This Drive-based flow stays until the migration replaces it with a verified
alternative.
