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

export {
  // Simple trigger that builds the menu.
  onOpen,
  // Menu and script editor.
  setup,
  checkSetup,
  menuShowThisWeek,
  menuShowAll,
  menuSendReplies,
  menuRefreshLog,
  menuPreparePage,
  menuCreateLinks,
  menuEmailLinks,
  menuEmailsOn,
  menuEmailsOff,
  menuAddDemo,
  menuRemoveDemo,
  menuRemindersNow,
  menuDigestsNow,
  // Time-driven triggers.
  autoMondayReminder,
  autoDigests,
  autoDaily,
} from './legacy.js';
