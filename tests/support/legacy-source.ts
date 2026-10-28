import { readFileSync } from 'node:fs';

export const legacySource = readFileSync(new URL('../../legacy/Code.gs', import.meta.url), 'utf8');

/** Names of top-level `function` declarations. */
export function topLevelFunctions(source: string): string[] {
  return [...source.matchAll(/^function ([\w$]+)\(/gm)].map((match) => match[1] ?? '');
}

/**
 * The legacy functions Apps Script can call by name: every top-level function whose name does
 * not end in "_" (Apps Script treats a trailing underscore as private).
 */
export function publicFunctions(source: string): string[] {
  return topLevelFunctions(source)
    .filter((name) => !name.endsWith('_'))
    .sort();
}

/** Handler names the legacy code passes as strings to menu items and triggers. */
export function handlerNames(source: string): string[] {
  const menuItems = source.matchAll(/\.addItem\('(?:[^'\\]|\\.)*',\s*'([\w$]+)'\)/g);
  const triggers = source.matchAll(/newTrigger\('([\w$]+)'\)/g);
  return [...new Set([...menuItems, ...triggers].map((match) => match[1] ?? ''))].sort();
}

/**
 * Top-level `function` and `var` declarations with their full text, keyed by name.
 *
 * The legacy code starts every top-level statement at column 0 and indents everything else,
 * so a declaration runs until the next line that starts at column 0 with anything other than
 * a closing bracket.
 */
export function topLevelDeclarations(source: string): Map<string, string> {
  const declarations = new Map<string, string>();
  let name: string | undefined;
  let lines: string[] = [];
  const flush = () => {
    if (name) declarations.set(name, lines.join('\n').trimEnd());
  };
  for (const line of source.split('\n')) {
    if (/^[^\s\]})]/.test(line)) {
      flush();
      name = /^(?:function|var)\s+([\w$]+)/.exec(line)?.[1];
      lines = [line];
    } else {
      lines.push(line);
    }
  }
  flush();
  return declarations;
}
