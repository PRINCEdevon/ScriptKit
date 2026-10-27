/**
 * Proof-of-payment files, saved in Google Drive in a folder next to the programme's Sheet:
 * "<short name> proof of payment" / <team name> / "Week <n> - <file name>".
 */
import { setSetting, settings, shortName } from './config.js';
import { spreadsheet } from './sheets.js';
import type { Row } from './types.js';
import { clean } from './utils.js';

/** A file as the report page sends it: name, MIME type and base64 data. */
export interface ProofFile {
  name?: unknown;
  type?: unknown;
  data?: unknown;
}

/** Saves a report's proof files and returns their Drive links. */
export function saveProof(team: Row, week: number, files: unknown): string[] {
  const list = files as ProofFile[];
  if (!list || !list.length) return [];
  const root = proofFolder();
  const existing = root.getFoldersByName(team.team_name as string);
  const folder = existing.hasNext() ? existing.next() : root.createFolder(team.team_name as string);
  return list.map((file, i) => {
    const name = 'Week ' + week + ' - ' + (clean(file.name, 100) || 'proof ' + (i + 1));
    const blob = Utilities.newBlob(
      Utilities.base64Decode(String(file.data)),
      String(file.type || 'application/octet-stream'),
      name,
    );
    return folder.createFile(blob).getUrl();
  });
}

/** The proof-of-payment folder, created (and recorded in Settings) when it is missing. */
export function proofFolder(): GoogleAppsScript.Drive.Folder {
  const id = settings().proof_folder_id;
  if (id) {
    try {
      return DriveApp.getFolderById(String(id));
    } catch {
      // The folder was deleted or is not shared any more: make a new one.
    }
  }
  const folder = parentFolder().createFolder(shortName() + ' proof of payment');
  setSetting('proof_folder_id', folder.getId());
  return folder;
}

/** The Drive folder that holds the programme's Sheet (or My Drive if it has none). */
export function parentFolder(): GoogleAppsScript.Drive.Folder {
  const parents = DriveApp.getFileById(spreadsheet().getId()).getParents();
  return parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
}
