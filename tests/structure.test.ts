// Keeps src/ organised: feature folders, imports in one direction, no cycles.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

/**
 * Feature folders from the bottom up. A module may import from its own folder or a folder
 * listed before it, never after: shared code knows nothing about features, and the admin menu
 * may use everything.
 */
const LAYERS = ['shared', 'feedback', 'reports', 'email', 'admin'];

function sourceFiles(dir = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
  });
}

/** Module (path relative to src/, without .ts) → the modules it imports. */
const imports = new Map(
  sourceFiles().map((file) => {
    const from = relative(SRC, file).replace(/\.ts$/, '');
    const specifiers = [...readFileSync(file, 'utf8').matchAll(/from '(\.[^']+)\.js'/g)];
    const targets = specifiers.map((m) => normalize(join(dirname(from), m[1] ?? '')));
    return [from, targets] as const;
  }),
);

const folderOf = (module: string) => module.split('/')[0] ?? '';

describe('src/', () => {
  it('keeps every module in a feature folder, apart from main.ts', () => {
    for (const module of imports.keys()) {
      if (module === 'main') continue;
      expect(LAYERS, module).toContain(folderOf(module));
      expect(module.split('/'), module).toHaveLength(2);
    }
  });

  it('only imports modules that exist', () => {
    for (const [module, targets] of imports) {
      for (const target of targets) expect(imports.has(target), `${module} → ${target}`).toBe(true);
    }
  });

  it('imports downwards: shared ← feedback ← reports ← email ← admin ← main', () => {
    const rank = (module: string) =>
      module === 'main' ? LAYERS.length : LAYERS.indexOf(folderOf(module));
    for (const [module, targets] of imports) {
      for (const target of targets) {
        expect(rank(target), `${module} imports ${target}`).toBeLessThanOrEqual(rank(module));
      }
    }
  });

  it('has no import cycles', () => {
    const cycles: string[] = [];
    const visit = (module: string, path: string[]) => {
      for (const next of imports.get(module) ?? []) {
        if (path.includes(next)) cycles.push([...path.slice(path.indexOf(next)), next].join(' → '));
        else visit(next, [...path, next]);
      }
    };
    for (const module of imports.keys()) visit(module, [module]);
    expect([...new Set(cycles)]).toEqual([]);
  });
});
