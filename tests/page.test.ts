import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { htmlEscape, menuPreparePage, preparePage, uploadSteps } from '../src/page.js';
import { FakeBlob, FakeGoogle } from './support/fake-google.js';
import { json, loadLegacy, outcome, stateOf, useFakeGoogle } from './support/runtime.js';
import { seedTab } from './support/seed.js';
import { twins } from './support/twins.js';

afterEach(() => {
  vi.useRealTimers();
});

const NOW = '2026-11-20T09:00:00+02:00';
const TEMPLATE = readFileSync(new URL('../web/report-template.html', import.meta.url), 'utf8');
const WEB_APP = 'https://script.google.com/macros/s/TEST-DEPLOYMENT/exec';

function addFile(google: FakeGoogle, name: string, text: string) {
  google.drive.addFile(
    name,
    google.folder,
    new FakeBlob(new Uint8Array(Buffer.from(text)), 'text/html', name),
  );
}

function setSettings(google: FakeGoogle, settings: Record<string, string>) {
  const sheet = google.spreadsheet.getSheetByName('Settings');
  for (const [key, value] of Object.entries(settings)) {
    sheet?.getRange(sheet.getLastRow() + 1, 1, 1, 2).setValues([[key, value]]);
  }
}

describe('upload steps', () => {
  it.each([
    'https://tools.mashauri.org/ura-report.html',
    'https://example.com/reports/',
    'https://example.com/',
    'https://example.com/a/b/page.html?t=1',
    'http://example.com/folder/sub/',
    'not a web address',
    '',
  ])('for %j match the original', (url) => {
    const google = useFakeGoogle();
    seedTab(google, 'settings', [{ key: 'report_page_url', value: url }]);
    expect(uploadSteps('ura-report.html')).toBe(
      loadLegacy(google).call('uploadSteps_', 'ura-report.html'),
    );
  });
});

describe('preparing the report page', () => {
  it.each([
    ['the real template', TEMPLATE, WEB_APP, {}],
    [
      'a programme name with HTML characters',
      TEMPLATE,
      WEB_APP,
      { programme_name: 'R&D <Lab> "2027"' },
    ],
    ['an address containing $&', TEMPLATE, 'https://script.google.com/macros/s/A$&B/exec', {}],
    ['a template without the address placeholder', '<html>__PAGE_TITLE__</html>', WEB_APP, {}],
  ])('with %s matches the original', (_name, template, url, settings) => {
    const { typed, original } = twins(NOW);
    for (const google of [typed, original]) {
      setSettings(google, settings);
      addFile(google, 'ura-test-report TEMPLATE.html', template);
      addFile(google, 'ura-test-report.html', 'an earlier page');
    }
    const result = outcome(() => preparePage(url));
    expect(result).toEqual(outcome(() => loadLegacy(original, NOW).call('preparePage_', url)));
    expect(stateOf(typed)).toEqual(stateOf(original));
  });

  it('fails like the original when the template is missing', () => {
    const { original } = twins(NOW);
    const message = 'Could not find "ura-test-report TEMPLATE.html" in the same Drive folder';
    expect(() => preparePage(WEB_APP)).toThrow(message);
    expect(() => loadLegacy(original, NOW).call('preparePage_', WEB_APP)).toThrow(message);
  });

  it.each([
    ['a pasted address', ['OK'], [WEB_APP], {}],
    ['the saved address', ['OK'], [''], { web_app_url: WEB_APP }],
    ['a wrong address', ['OK'], ['https://example.com/exec'], {}],
    ['Cancel', ['CANCEL'], [WEB_APP], {}],
  ])('from the menu with %s matches the original', (_name, buttons, responses, settings) => {
    const { typed, original } = twins(NOW);
    for (const google of [typed, original]) {
      setSettings(google, settings);
      addFile(google, 'ura-test-report TEMPLATE.html', TEMPLATE);
      google.ui.buttons.push(...buttons);
      google.ui.responses.push(...responses);
    }
    menuPreparePage();
    loadLegacy(original, NOW).call('menuPreparePage');
    expect(stateOf(typed)).toEqual(stateOf(original));
  });

  it('escapes text for HTML', () => {
    expect(htmlEscape('R&D <Lab> "x"')).toBe('R&amp;D &lt;Lab&gt; &quot;x&quot;');
    expect(json(htmlEscape("it's"))).toBe("it's");
  });
});
