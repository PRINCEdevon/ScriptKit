import { describe, expect, it } from 'vitest';
import { parseNumber, toNumber } from '../src/utils.js';
import { FakeGoogle } from './support/fake-google.js';
import { loadLegacy } from './support/runtime.js';

const SAMPLES: unknown[] = [
  0,
  12,
  -3,
  1.5,
  NaN,
  Infinity,
  '12',
  ' 12 ',
  '12.50',
  '-4',
  'R 1,500',
  'r20',
  '₹2 000',
  '$5',
  '£7.25',
  '€3',
  '1\u00a0000',
  '1,5',
  '1e3',
  '+3',
  '.5',
  '',
  '  ',
  'abc',
  '12abc',
  '1.2.3',
  null,
  undefined,
  true,
  false,
  new Date(0),
  [5],
  {},
];

describe('parseNumber', () => {
  it.each([
    ['12', 12],
    [' 12.50 ', 12.5],
    ['-4', -4],
    ['R 1,500', 1500],
    ['₹2 000', 2000],
    [7, 7],
    [Infinity, null],
    ['', null],
    ['12abc', null],
    ['1e3', null],
    [true, null],
    [null, null],
    ['1,5', 15], // a decimal comma is read as a thousands separator (docs/known-issues.md)
  ])('reads %j as %j', (input, expected) => {
    expect(parseNumber(input)).toBe(expected);
  });

  it('gives 0 instead of null through toNumber', () => {
    expect(toNumber('abc')).toBe(0);
    expect(toNumber('R 300')).toBe(300);
  });

  it('matches the legacy parseNumber_ and num_ on every sample', () => {
    const legacy = loadLegacy(new FakeGoogle());
    for (const input of SAMPLES) {
      expect(parseNumber(input), String(input)).toBe(legacy.call('parseNumber_', input));
      expect(toNumber(input), String(input)).toBe(legacy.call('num_', input));
    }
  });
});
