import { describe, expect, it } from 'vitest';
import {
  checkReceipt,
  isValidReceipt,
  maskReceipt,
  normalizeReceipt,
  prefixCenter,
  prefixHint,
} from '../src';

describe('receipts', () => {
  it('strips non-alphanumerics and uppercases', () => {
    expect(normalizeReceipt(' ioe-09 99 000.111 ')).toBe('IOE0999000111');
  });

  it('validates the pattern', () => {
    expect(isValidReceipt('IOE0999000111')).toBe(true);
    expect(isValidReceipt('IOE099900011')).toBe(false);
    expect(isValidReceipt('IO10999000111')).toBe(false);
  });

  it('explains what is wrong', () => {
    expect(checkReceipt('', [])).toMatchObject({ ok: false, error: 'Enter a receipt number.' });
    expect(checkReceipt('IOE12', [])).toMatchObject({
      ok: false,
      error: expect.stringContaining('3 letters and 10 digits'),
    });
    expect(checkReceipt('ioe0999000111', ['IOE0999000111'])).toMatchObject({
      ok: false,
      error: 'A case with this receipt number already exists.',
    });
    expect(checkReceipt('eac 09 990 00111', [])).toEqual({ ok: true, receipt: 'EAC0999000111' });
  });

  it('knows every documented prefix', () => {
    expect(prefixCenter('EAC')).toBe('Vermont Service Center');
    expect(prefixCenter('WAC')).toBe('California Service Center');
    expect(prefixCenter('LIN')).toBe('Nebraska Service Center');
    expect(prefixCenter('SRC')).toBe('Texas Service Center');
    expect(prefixCenter('NBC')).toBe('National Benefits Center');
    expect(prefixCenter('MSC')).toBe('National Benefits Center');
    expect(prefixCenter('IOE')).toBe('Online filing');
    expect(prefixCenter('YSC')).toBe('Potomac Service Center');
  });

  it('hints that the prefix shows where the case started', () => {
    expect(prefixHint('io')).toBeNull();
    expect(prefixHint('lin1')).toContain('where the case started, not where it is now');
    expect(prefixHint('ABC')).toContain('not a known prefix');
  });

  it('masks all but the last 4 digits', () => {
    expect(maskReceipt('IOE0999000111')).toBe('•'.repeat(9) + '0111');
  });
});
