import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from '../scripts/build.js';

const tempDir = mkdtempSync(join(tmpdir(), 'scriptkit-build-'));
let code = '';

beforeAll(async () => {
  await build({ outdir: join(tempDir, 'dist') });
  code = readFileSync(join(tempDir, 'dist', 'Code.js'), 'utf8');
});

afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

describe('Apps Script bundle', () => {
  it('copies the V8 manifest next to the code', () => {
    const manifest = JSON.parse(readFileSync(join(tempDir, 'dist', 'appsscript.json'), 'utf8'));
    expect(manifest.runtimeVersion).toBe('V8');
  });

  it('uses no module syntax, which Apps Script cannot load', () => {
    expect(code).not.toMatch(/^\s*(import|export)\s/m);
    expect(code).not.toMatch(/\brequire\(/);
  });

  it('declares each entrypoint as a top-level function', () => {
    expect(code).toMatch(/^function scriptkitSmokeTest\(/m);
  });

  it('exposes callable entrypoints when run as one classic script, as Apps Script does', () => {
    const logged: unknown[] = [];
    const context = vm.createContext({ Logger: { log: (value: unknown) => logged.push(value) } });
    vm.runInContext(code, context);

    const smokeTest = vm.runInContext('scriptkitSmokeTest', context);
    expect(typeof smokeTest).toBe('function');
    expect(smokeTest()).toBe('ScriptKit bundle loaded.');
    expect(logged).toEqual(['ScriptKit bundle loaded.']);
  });
});
