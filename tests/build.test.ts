import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from '../scripts/build.js';
import { handlerNames, legacySource, publicFunctions } from './support/legacy-source.js';

const tempDir = mkdtempSync(join(tmpdir(), 'scriptkit-build-'));
let code = '';
let entrypoints: string[] = [];

beforeAll(async () => {
  ({ entrypoints } = await build({ outdir: join(tempDir, 'dist') }));
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

  it('exposes exactly the functions the legacy script made callable', () => {
    const topLevel = [...code.matchAll(/^function ([\w$]+)\(/gm)].map((match) => match[1]);
    expect(entrypoints).toEqual(publicFunctions(legacySource));
    expect(topLevel.sort()).toEqual(publicFunctions(legacySource));
  });

  it('exposes every handler that the legacy menu and triggers call by name', () => {
    expect(handlerNames(legacySource).length).toBeGreaterThan(10);
    for (const name of handlerNames(legacySource)) expect(entrypoints).toContain(name);
  });

  it('loads as one classic script without calling any Google service', () => {
    // Apps Script evaluates the whole script before every call, including simple triggers
    // that run with limited authorization, so loading must not touch SpreadsheetApp and co.
    const context = vm.createContext({});
    vm.runInContext(code, context);
    for (const name of entrypoints) {
      expect(typeof vm.runInContext(name, context), name).toBe('function');
    }
  });
});
