/**
 * Apps Script entrypoints.
 *
 * Every function exported from this file becomes a top-level function in dist/Code.js
 * (see scripts/build.js). Apps Script calls web app handlers (doGet, doPost), menu items and
 * trigger handlers by name, so they must all be exported from here, under their legacy names:
 * the Sheet's menu and installed triggers refer to them by those names.
 *
 * During the migration they come from src/legacy.js; as each one moves into a typed module,
 * its export here moves with it.
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

export {
  // Menu and script editor.
  setup,
  menuAddDemo,
  menuRemoveDemo,
} from './legacy.js';
