import { describe, expect, it } from 'vitest';
import { isStatusKey, STATUS_KEYS, STATUSES, TONE_ORDER } from '../src';

describe('statuses', () => {
  it('describes every key', () => {
    for (const key of STATUS_KEYS) {
      expect(STATUSES[key].key).toBe(key);
      expect(STATUSES[key].label).not.toBe('');
      expect(STATUSES[key].meaning).not.toBe('');
      expect(STATUSES[key].next).not.toBe('');
    }
  });

  it('assigns tones per the spec', () => {
    const byTone = (tone: string) => STATUS_KEYS.filter((k) => STATUSES[k].tone === tone).sort();
    expect(byTone('action')).toEqual(['biometrics', 'interview', 'noid', 'rfe']);
    expect(byTone('good')).toEqual(['approved', 'card_mailed', 'card_prod', 'delivered']);
    expect(byTone('bad')).toEqual(['denied']);
    expect(byTone('progress')).toEqual(['other', 'received', 'review', 'rfe_resp', 'transferred']);
  });

  it('treats delivered and denied as closed', () => {
    expect(STATUS_KEYS.filter((k) => STATUSES[k].closed).sort()).toEqual(['delivered', 'denied']);
  });

  it('orders action, bad, progress, good', () => {
    const tones = Object.entries(TONE_ORDER)
      .sort((a, b) => a[1] - b[1])
      .map(([t]) => t);
    expect(tones).toEqual(['action', 'bad', 'progress', 'good']);
  });

  it('guards status keys', () => {
    expect(isStatusKey('rfe')).toBe(true);
    expect(isStatusKey('RFE')).toBe(false);
    expect(isStatusKey(3)).toBe(false);
  });
});
