/**
 * Apps Script entrypoints.
 *
 * Every function exported from this file becomes a top-level function in dist/Code.js
 * (see scripts/build.js). Apps Script calls web app handlers (doGet, doPost), menu items and
 * trigger handlers by name, so they must be exported from here.
 *
 * The Revenue Accelerator is not in the build yet (see docs/migration-plan.md). Until it is,
 * the only entrypoint is a smoke test showing that the bundle loads and its functions are
 * callable.
 */

/** Run from the Apps Script editor to confirm that a ScriptKit bundle is loaded. */
export function scriptkitSmokeTest(): string {
  const message = 'ScriptKit bundle loaded.';
  Logger.log(message);
  return message;
}
