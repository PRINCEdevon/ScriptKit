import { describe, expect, it } from 'vitest';
import { isConventional, subjectOf } from '../scripts/check-commit-msg.js';

describe('commit message check', () => {
  it.each([
    'feat: add mentor digests',
    'fix(email): skip teams without addresses',
    'refactor!: rename report columns',
    'chore(deps)!: drop Node 22',
    'Merge branch main into chore/scaffold',
    'Revert "feat: add mentor digests"',
  ])('accepts %j', (subject) => {
    expect(isConventional(subject)).toBe(true);
  });

  it.each([
    'update files',
    'Feat: add mentor digests',
    'feature: add mentor digests',
    'feat add mentor digests',
    'feat:',
    'feat: ',
    '',
  ])('rejects %j', (subject) => {
    expect(isConventional(subject)).toBe(false);
  });

  it('checks only the subject, ignoring Git comments, bodies and trailers', () => {
    const message = [
      '# Please enter the commit message',
      '',
      'docs: explain clasp deployments',
      '',
      'Longer explanation.',
      '',
      'Co-Authored-By: Someone <someone@example.com>',
    ].join('\n');
    expect(subjectOf(message)).toBe('docs: explain clasp deployments');
  });
});
