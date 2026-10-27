import { readFileSync } from 'node:fs';
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
const EXTRACTED: string[] = [];

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

  it('parses every top-level legacy declaration separately', () => {
    // Guards the parser above: a missed or merged declaration would weaken both checks.
    expect(topLevelFunctions(legacySource).every((name) => original.has(name))).toBe(true);
    expect(original.size).toBe(legacySource.match(/^(function|var) /gm)?.length);
  });
});
