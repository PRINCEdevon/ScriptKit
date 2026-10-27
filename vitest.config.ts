import { defineConfig } from 'vitest/config';

// Apps Script runs `new Date(y, m, d)` in the script's time zone (appsscript.json), and the
// legacy code relies on that. Pin the same zone here so tests behave the same on every machine
// and in CI. Set before workers start, so they inherit it.
process.env.TZ = 'Africa/Johannesburg';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Tests that install fake Apps Script globals get them removed again after each test.
    unstubGlobals: true,
  },
});
