import { describe, expect, it } from 'vitest';
import { eventInfo, type EventCategory, type StatusKey } from '../src';

const EXPECT: [string[], EventCategory, StatusKey | undefined][] = [
  [['IAF', 'IAA', 'IAAA', 'IAB', 'IAC', 'IAD', 'AALB'], 'receipt', 'received'],
  [
    ['FTA0', 'FTA1', 'FSA0', 'FN', 'FNB', 'FNC', 'FNG', 'FNH', 'QAA', 'QAB', 'QAE', 'HC'],
    'checks',
    'review',
  ],
  [['FNA'], 'checks', 'biometrics'],
  [['FI', 'FJ', 'FM', 'IM'], 'interview', 'interview'],
  [['FH', 'FHB', 'FL', 'HG', 'FKA', 'FKB'], 'interview', 'review'],
  [['FT0', 'TA', 'FR', 'FT'], 'processing', 'review'],
  [['FS', 'KA', 'KBA', 'KBB', 'KC', 'KDA', 'FLS', 'FLR'], 'hold', 'review'],
  [['DA', 'DH', 'IEA', 'IEE', 'IEC', 'H008'], 'approved', 'approved'],
  [['LAA', 'LDA', 'MO'], 'card', 'card_prod'],
  [['LEA'], 'card', 'card_mailed'],
  [['IKA', 'FBA', 'FBB', 'IK'], 'evidence', 'rfe'],
  [['HA'], 'evidence', 'rfe_resp'],
  [['FE', 'II'], 'evidence', 'noid'],
  [['EA', 'IFA'], 'denied', 'denied'],
  [['EX', 'EN', 'EZ'], 'closed', undefined],
];

describe('event dictionary', () => {
  for (const [codes, category, status] of EXPECT) {
    it(`${codes.join(', ')} map to ${category}${status ? ` / ${status}` : ''}`, () => {
      for (const code of codes) {
        const info = eventInfo(code);
        expect(info.category, code).toBe(category);
        expect(info.status, code).toBe(status);
      }
    });
  }

  it('reports unknown codes as unrecognized with the raw code', () => {
    expect(eventInfo(' zzz9 ')).toEqual({
      code: 'ZZZ9',
      label: 'Unrecognized event',
      category: 'unknown',
    });
  });
});
