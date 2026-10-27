import { readFileSync } from 'node:fs';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import {
  legacySource,
  topLevelDeclarations,
  topLevelFunctions,
  topLevelStatementStarts,
} from './support/legacy-source.js';

// src/legacy.js is the transitional copy of legacy/Code.gs that the build bundles. Functions
// are moved out of it into typed modules one PR at a time; whatever remains must stay exactly
// as it was in the original, so that refactoring never hides a change of behaviour there.
//
// When a PR moves a legacy function or variable into a module, delete it from src/legacy.js
// and add its name here.
const EXTRACTED: string[] = [
  // PR 3: src/sheets.ts and src/utils.ts
  'TABS',
  'ss_',
  'table_',
  'tableRows_',
  'lastRealRow_',
  'setCells_',
  'safe_',
  'num_',
  'parseNumber_',
];

// Apps Script services, plus the settings cache that src/config.ts keeps as a real global
// because legacy code still assigns it directly (see docs/legacy-map.md).
const APPS_SCRIPT_GLOBALS = {
  ...Object.fromEntries(
    [
      'SpreadsheetApp',
      'DriveApp',
      'MailApp',
      'ScriptApp',
      'PropertiesService',
      'LockService',
      'Utilities',
      'ContentService',
      'Logger',
    ].map((name) => [name, 'readonly' as const]),
  ),
  SETTINGS_CACHE_: 'writable' as const,
};

const copySource = readFileSync(new URL('../src/legacy.js', import.meta.url), 'utf8');
const original = topLevelDeclarations(legacySource);
const copy = topLevelDeclarations(copySource);

describe('src/legacy.js', () => {
  it('keeps every remaining legacy declaration exactly as in legacy/Code.gs', () => {
    for (const [name, text] of copy) {
      expect(original.has(name), `${name} is not a legacy declaration`).toBe(true);
      expect(text, `${name} differs from legacy/Code.gs`).toBe(original.get(name));
    }
  });

  it('is missing only the declarations listed as extracted', () => {
    const missing = [...original.keys()].filter((name) => !copy.has(name)).sort();
    expect(missing).toEqual([...EXTRACTED].sort());
  });

  it('adds nothing at the top level except comments, imports and exports', () => {
    const added = topLevelStatementStarts(copySource).filter(
      (line) => !/^(function |var |\/\*|\/\/|import |export )/.test(line),
    );
    expect(added).toEqual([]);
  });

  it('declares or imports every name it uses', async () => {
    // A moved function that is still called but not imported would only fail when that line
    // runs, because the bundle treats unknown names as globals.
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: {
        languageOptions: { sourceType: 'module', ecmaVersion: 2019, globals: APPS_SCRIPT_GLOBALS },
        rules: { 'no-undef': 'error' },
      },
    });
    const [result] = await eslint.lintText(copySource, { filePath: 'legacy.js' });
    expect(result?.messages.map((m) => `${m.line}: ${m.message}`)).toEqual([]);
  });

  it('parses every top-level legacy declaration separately', () => {
    // Guards the parser above: a missed or merged declaration would weaken both checks.
    expect(topLevelFunctions(legacySource).every((name) => original.has(name))).toBe(true);
    expect(original.size).toBe(legacySource.match(/^(function|var) /gm)?.length);
  });
});
