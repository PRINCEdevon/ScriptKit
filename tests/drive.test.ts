import { describe, expect, it } from 'vitest';
import { parentFolder, proofFolder, saveProof } from '../src/drive.js';
import { FakeGoogle } from './support/fake-google.js';
import { json, loadLegacy, useFakeGoogle } from './support/runtime.js';
import { seedTab, tabValues } from './support/seed.js';

const file = (name: string | undefined, text: string, type?: string) => ({
  name,
  type,
  data: Buffer.from(text).toString('base64'),
});

/** Every folder and file in the fake Drive, as plain data. */
function drive(google: FakeGoogle) {
  return json({
    folders: google.drive.folders.map((folder) => folder.path()),
    files: google.drive.files
      .filter((f) => f.blob)
      .map((f) => ({
        path: `${f.parent.path()}/${f.name}`,
        url: f.getUrl(),
        type: f.blob?.contentType,
        text: f.blob?.getDataAsString(),
      })),
  });
}

describe('proof files', () => {
  it('are saved exactly where and as the legacy saveProof_ saves them', () => {
    const typed = useFakeGoogle();
    const original = new FakeGoogle();
    for (const google of [typed, original]) {
      seedTab(google, 'settings', [{ key: 'short_name', value: 'URA TEST' }]);
    }
    const legacy = loadLegacy(original);
    const alpha = { _row: 2, team_name: 'Alpha' };
    const beta = { _row: 3, team_name: 'Beta' };
    const uploads: [typeof alpha, number, unknown][] = [
      [alpha, 1, [file('receipt.png', 'png bytes', 'image/png'), file(undefined, 'no name')]],
      [alpha, 2, [file('  ', 'blank name'), file('x'.repeat(150), 'long name', '')]],
      [beta, 2, [file('=formula.pdf', 'pdf', 'application/pdf')]],
      [beta, 3, []],
      [beta, 3, undefined],
    ];
    for (const [team, week, files] of uploads) {
      expect(saveProof(team, week, files)).toEqual(
        json(legacy.call('saveProof_', team, week, files)),
      );
    }
    expect(drive(typed)).toEqual(drive(original));
    expect(tabValues(typed, 'Settings')).toEqual(tabValues(original, 'Settings'));
    expect(drive(typed).files.map((f: { path: string }) => f.path)).toEqual([
      'My Drive/Programme/URA TEST proof of payment/Alpha/Week 1 - receipt.png',
      'My Drive/Programme/URA TEST proof of payment/Alpha/Week 1 - proof 2',
      'My Drive/Programme/URA TEST proof of payment/Alpha/Week 2 - proof 1',
      `My Drive/Programme/URA TEST proof of payment/Alpha/Week 2 - ${'x'.repeat(100)}`,
      'My Drive/Programme/URA TEST proof of payment/Beta/Week 2 - =formula.pdf',
    ]);
  });

  it('get a new folder when the recorded one no longer exists', () => {
    const google = useFakeGoogle();
    seedTab(google, 'settings', [{ key: 'proof_folder_id', value: 'folder-deleted' }]);
    const folder = proofFolder();
    expect(folder.getName()).toBe('URA proof of payment');
    expect(proofFolder().getId()).toBe(folder.getId());
  });

  it('live next to the Sheet', () => {
    useFakeGoogle();
    expect(parentFolder().getName()).toBe('Programme');
  });
});
