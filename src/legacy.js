// Transitional copy of legacy/Code.gs, bundled by scripts/build.js (see docs/migration-plan.md).
//
// Below this header the code is legacy/Code.gs unchanged. Migration PRs only delete the
// declarations they move into typed modules and add imports for them;
// tests/legacy-source.test.ts checks that whatever remains is still identical to the original.
// Never change, format or lint what remains: this file is excluded from TypeScript, ESLint and
// Prettier, and src/legacy.d.ts describes its exports.

import {
  timeZone as tz_,
} from './dates.js';

/**
 * Mashauri Revenue Accelerator: Monday report.
 *
 * One copy of this script runs each programme (for example the URA report for the
 * USSAVI Revenue Accelerator). It lives inside that programme's own Google Sheet
 * (Extensions > Apps Script). Everything that differs between programmes (the name,
 * the page address, the time zone and the currency) is in the Sheet's Settings tab,
 * so the code itself is the same for every programme. It does four jobs:
 *   1. Receives each team's Monday report from the report page and stores it in the Sheet.
 *   2. Works out the instant feedback, the team's history and the cohort scoreboard.
 *   3. Gives you a "Revenue Accelerator" menu in the Sheet for links, replies and demo data.
 *   4. Sends reminders, your replies and the mentor digests by email.
 *
 * The setup guide explains how to install and publish it. You should not need to edit
 * anything below; settings, dates and feedback wording all live in tabs of the Sheet.
 */

/* ============================== Small utilities ============================== */

function fmtStamp_(d) { return Utilities.formatDate(d, tz_(), 'yyyy-MM-dd HH:mm'); }
function find_(arr, fn) { for (var i = 0; i < arr.length; i++) if (fn(arr[i])) return arr[i]; return null; }
// Apps Script entrypoints, re-exported by src/main.ts. Apps Script calls these by name.
export {
};
