import { describe, expect, it } from 'vitest';
import { formBadgeText, normalizeFormType } from '../src';

describe('normalizeFormType', () => {
  it.each([
    ['I485', 'I-485'],
    ['i-485', 'I-485'],
    [' I 765 ', 'I-765'],
    ['N400', 'N-400'],
    ['I-90', 'I-90'],
  ])('%s becomes %s', (raw, expected) => {
    expect(normalizeFormType(raw)).toBe(expected);
  });

  it.each(['I-999', '', 'hello', 'I485A', null, undefined])('rejects %s', (raw) => {
    expect(normalizeFormType(raw)).toBeNull();
  });
});

describe('formBadgeText', () => {
  it('drops the I prefix and keeps N forms distinct', () => {
    expect(formBadgeText('I-485')).toBe('485');
    expect(formBadgeText('N-400')).toBe('N400');
    expect(formBadgeText('Other')).toBe('Other');
  });
});
