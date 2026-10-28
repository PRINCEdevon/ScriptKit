/**
 * Apps Script entrypoints.
 *
 * Every function exported from this file becomes a top-level function in dist/Code.js
 * (see scripts/build.js). Apps Script calls web app handlers (doGet, doPost), menu items and
 * trigger handlers by name, so they must all be exported from here, under their legacy names:
 * the Sheet's menu and installed triggers refer to them by those names.
 *
 * Each module's entrypoints keep the names the original legacy/Code.gs gave them.
 */
// Web app (the report page).
export { doGet, doPost } from './api.js';

// Emails: menu items and time-driven triggers.
export {
  autoDigests,
  autoMondayReminder,
  menuDigestsNow,
  menuRemindersNow,
  menuSendReplies,
} from './email.js';

// Turning the automatic emails on and off, and the daily trigger.
export { autoDaily, menuEmailsOff, menuEmailsOn } from './triggers.js';

// Preparing the report page.
export { menuPreparePage } from './page.js';

// The menu, its general items and the permissions check.
export {
  checkSetup,
  menuCreateLinks,
  menuEmailLinks,
  menuRefreshLog,
  menuShowAll,
  menuShowThisWeek,
  onOpen,
} from './admin.js';

// Demo data.
export { menuAddDemo, menuRemoveDemo } from './demo.js';

// Setup and repair.
export { setup } from './setup.js';
