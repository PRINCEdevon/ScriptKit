// Git commit-msg hook (run by Lefthook): the subject line must follow Conventional Commits,
// for example "feat: add reminders" or "fix(email)!: skip empty recipients".
// Only the subject is checked, so bodies and trailers are free-form.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const TYPES = [
  'feat',
  'fix',
  'refactor',
  'test',
  'docs',
  'chore',
  'ci',
  'build',
  'style',
  'perf',
  'revert',
];

const CONVENTIONAL = new RegExp(`^(${TYPES.join('|')})(\\([^()\\s]+\\))?!?: \\S`);
// Messages Git writes itself for merges and reverts.
const GIT_GENERATED = /^(Merge|Revert) /;

/**
 * The first line that is neither empty nor a Git comment.
 * @param {string} message
 */
export function subjectOf(message) {
  return message.split('\n').find((line) => line.trim() !== '' && !line.startsWith('#')) ?? '';
}

/** @param {string} subject */
export function isConventional(subject) {
  return CONVENTIONAL.test(subject) || GIT_GENERATED.test(subject);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: node scripts/check-commit-msg.js <commit message file>');
  const subject = subjectOf(readFileSync(file, 'utf8'));
  if (!isConventional(subject)) {
    console.error(`Commit message does not follow Conventional Commits:\n\n  ${subject}\n`);
    console.error(`Use "type: description" or "type(scope): description", where type is one of:`);
    console.error(`  ${TYPES.join(', ')}\n`);
    process.exit(1);
  }
}
