// Checks of the test harness itself (tests/support), which every baseline test relies on.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FakeGoogle, formatDate } from './support/fake-google.js';
import { App } from './support/runtime.js';
import vm from 'node:vm';

describe('test runtime', () => {
  it('runs in the same time zone as the Apps Script project', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../appsscript.json', import.meta.url), 'utf8'),
    );
    expect(manifest.timeZone).toBe('Africa/Johannesburg');
    expect(new Date(2026, 11, 7, 12).toISOString()).toBe('2026-12-07T10:00:00.000Z');
  });

  it('formats dates with the Java patterns the application uses', () => {
    const date = new Date('2026-12-07T08:05:00Z');
    const tz = 'Africa/Johannesburg';
    expect(formatDate(date, tz, 'yyyy-MM-dd')).toBe('2026-12-07');
    expect(formatDate(date, tz, 'EEEE d MMMM')).toBe('Monday 7 December');
    expect(formatDate(date, tz, "HH:mm 'on' EEEE d MMMM")).toBe('10:05 on Monday 7 December');
    expect(formatDate(date, 'Asia/Kolkata', 'yyyy-MM-dd HH:mm')).toBe('2026-12-07 13:35');
    expect(formatDate(new Date('2026-12-31T23:30:00Z'), tz, 'd MMMM')).toBe('1 January');
  });

  it('fails loudly when the application uses something the fakes do not implement', () => {
    const { SpreadsheetApp } = new FakeGoogle().globals() as { SpreadsheetApp: object };
    expect(() => (SpreadsheetApp as Record<string, unknown>).getActive).toThrow(
      'Fake Apps Script: SpreadsheetApp.getActive is not implemented',
    );
  });

  it('starts every call with a fresh global scope and the fixed clock', () => {
    const script = new vm.Script(
      'var calls = (typeof calls === "number" ? calls : 0) + 1;' +
        'function probe() { return [calls, new Date().toISOString(), Date.now()]; }',
    );
    const app = new App({ name: 'probe', script });
    app.now = '2026-12-07T10:00:00+02:00';
    app.call('probe');
    expect(app.call('probe')).toEqual([1, '2026-12-07T08:00:00.000Z', Date.parse(app.now)]);
  });
});
