import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  DEFAULT_TZ,
  appendTableRow,
  clearSettingsCache,
  currency,
  money,
  pageName,
  pageTemplateName,
  reportName,
  setSetting,
  settings,
  settingsFrom,
  shortName,
  slug,
} from '../src/config.js';
import { FakeGoogle } from './support/fake-google.js';
import { json, loadLegacy, useFakeGoogle } from './support/runtime.js';
import { seedTab, tabValues } from './support/seed.js';

describe('setting defaults', () => {
  it('are the legacy defaults, unchanged', () => {
    const legacy = loadLegacy(new FakeGoogle());
    expect(DEFAULT_TZ).toBe(legacy.get('DEFAULT_TZ'));
    expect(DEFAULT_SETTINGS).toEqual(json(legacy.get('DEFAULT_SETTINGS')));
  });

  it('fill in every key the Settings tab lacks; the first row for a key wins', () => {
    const values = settingsFrom([
      { _row: 2, key: 'short_name', value: 'ABC' },
      { _row: 3, key: 'short_name', value: 'ignored' },
      { _row: 4, key: 'custom', value: 7 },
      { _row: 5, key: 'currency_symbol' },
    ]);
    expect(values.short_name).toBe('ABC');
    expect(values.custom).toBe(7);
    expect(values.currency_symbol).toBeUndefined();
    expect(values.programme_name).toBe('USSAVI Revenue Accelerator');
    expect(values.max_feedback_items).toBe(6);
    expect(Object.keys(values)).toEqual(
      expect.arrayContaining(DEFAULT_SETTINGS.map(([key]) => key)),
    );
  });
});

describe('settings', () => {
  it('uses the defaults without caching them while there is no Settings tab', () => {
    const google = useFakeGoogle();
    expect(settings().short_name).toBe('URA');
    seedTab(google, 'settings', [{ key: 'short_name', value: 'NEW' }]);
    expect(settings().short_name).toBe('NEW');
  });

  it('reads the tab once per run, until a setting is written or the cache is cleared', () => {
    const google = useFakeGoogle();
    const sheet = seedTab(google, 'settings', [{ key: 'short_name', value: 'ONE' }]);
    expect(settings().short_name).toBe('ONE');
    sheet.getRange(2, 2).setValue('TWO');
    expect(settings().short_name).toBe('ONE');
    clearSettingsCache();
    expect(settings().short_name).toBe('TWO');
    setSetting('short_name', 'THREE');
    expect(settings().short_name).toBe('THREE');
  });

  it('adds a setting the tab lacks, and clears the cache when a row is appended to it', () => {
    const google = useFakeGoogle();
    seedTab(google, 'settings', [{ key: 'short_name', value: 'ONE' }]);
    expect(settings().pretend_today).toBe('');
    setSetting('pretend_today', '2026-12-07');
    expect(settings().pretend_today).toBe('2026-12-07');
    appendTableRow('settings', { key: 'brand_new', value: 'yes' });
    expect(settings().brand_new).toBe('yes');
  });

  it('writes the Settings tab exactly as the legacy setSetting_ and appendRow_ do', () => {
    const typed = useFakeGoogle();
    const original = new FakeGoogle();
    for (const google of [typed, original]) {
      seedTab(google, 'settings', [{ key: 'short_name', value: 'ONE', about: 'Short name' }]);
      seedTab(google, 'reports');
    }
    const legacy = loadLegacy(original);
    setSetting('short_name', '=TWO');
    setSetting('web_app_url', 'https://example.com/exec');
    appendTableRow('reports', { week: 1, team_name: 'Alpha' });
    legacy.call('setSetting_', 'short_name', '=TWO');
    legacy.call('setSetting_', 'web_app_url', 'https://example.com/exec');
    legacy.call('appendRow_', 'reports', { week: 1, team_name: 'Alpha' });
    expect(tabValues(typed, 'Settings')).toEqual(tabValues(original, 'Settings'));
    expect(tabValues(typed, 'Reports')).toEqual(tabValues(original, 'Reports'));
  });
});

describe('money and names', () => {
  const SHORT_NAMES = ['URA', 'URA TEST', 'Ashoka 2027!', '  ', '', '--X--'];
  const CURRENCIES = ['R', '₹', ' $ ', '', 0];
  const AMOUNTS: unknown[] = [0, 7, 999.5, 1000, 1234567.6, -2500, '1,500', 'abc', null];

  it('format money and file names exactly as the legacy functions do', () => {
    for (const [i, short] of SHORT_NAMES.entries()) {
      const google = useFakeGoogle();
      const symbol = CURRENCIES[i % CURRENCIES.length] ?? '';
      seedTab(google, 'settings', [
        { key: 'short_name', value: short },
        { key: 'currency_symbol', value: symbol },
      ]);
      const legacy = loadLegacy(google);
      const label = `short_name ${JSON.stringify(short)}, currency ${JSON.stringify(symbol)}`;
      expect(
        [currency(), shortName(), slug(), pageName(), pageTemplateName(), reportName()],
        label,
      ).toEqual(
        ['currency_', 'shortName_', 'slug_', 'pageName_', 'pageTemplateName_', 'reportName_'].map(
          (name) => legacy.call(name),
        ),
      );
      for (const amount of AMOUNTS) {
        expect(money(amount), `${label}, ${String(amount)}`).toBe(legacy.call('money_', amount));
      }
    }
  });

  it('give the expected labels', () => {
    const google = useFakeGoogle();
    seedTab(google, 'settings', [{ key: 'short_name', value: 'URA TEST' }]);
    expect(money(1234567.6)).toBe('R1,234,568');
    expect(pageName()).toBe('ura-test-report.html');
    expect(pageTemplateName()).toBe('ura-test-report TEMPLATE.html');
    expect(reportName()).toBe('URA TEST report');
  });
});
