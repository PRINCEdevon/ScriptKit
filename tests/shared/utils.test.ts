import { describe, expect, it } from 'vitest';
import { clean, listOf, median, parseNumber, toNumber } from '../../src/shared/utils.js';
import { FakeGoogle } from '../support/fake-google.js';
import { json, loadLegacy } from '../support/runtime.js';

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

describe('median', () => {
  it('takes the middle value, or the rounded mean of the middle two, like the original', () => {
    const legacy = loadLegacy(new FakeGoogle());
    for (const values of [[5], [5, 3], [5, 3, 8], [5, 3, 8, 2], [1, 2], [-1, -2], [0, 0, 7, 9]]) {
      expect(median(values), String(values)).toBe(legacy.call('median_', values));
    }
    expect(median([5, 3, 8, 2])).toBe(4);
    expect(median([1, 2])).toBe(2);
  });
});

describe('clean and listOf', () => {
  it('trim, cut and split form answers like the originals', () => {
    const legacy = loadLegacy(new FakeGoogle());
    for (const value of [
      '  Ana  ',
      'x'.repeat(30),
      '',
      null,
      undefined,
      0,
      12.5,
      false,
      'a, b,, c ,',
    ]) {
      expect(clean(value, 10), String(value)).toBe(legacy.call('clean_', value, 10));
      expect(listOf(value), String(value)).toEqual(json(legacy.call('listOf_', value)));
    }
    expect(clean(null, 5)).toBe('');
    expect(listOf('Ana One, Ben Two, ,')).toEqual(['Ana One', 'Ben Two']);
  });
});
