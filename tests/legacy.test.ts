import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// legacy/Code.gs is the behaviour reference for the whole migration and must stay
// byte-for-byte identical to the original. If this fails, restore the file; do not update
// the hash.
const ORIGINAL_SHA256 = 'f53bf5bf0e34901451e9b8255c1e771cbd745ca1ede366151eaa4f4df7ddcb30';

describe('legacy/Code.gs', () => {
  it('is unchanged from the original source', () => {
    const source = readFileSync(new URL('../legacy/Code.gs', import.meta.url));
    expect(createHash('sha256').update(source).digest('hex')).toBe(ORIGINAL_SHA256);
  });
});
