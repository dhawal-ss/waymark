import { describe, expect, it } from 'vitest';
import {
  eventInfo,
  explainEvent,
  isOfficialEvent,
  knownEventCodes,
  officialCode,
  PIPELINE_STAGES,
  SIGNAL_LABELS,
  STAGE_LABELS,
  STATUS_KEYS,
  STATUSES,
  type EventExplanation,
  type EventInfo,
} from '../src';

const TEXT_FIELDS = ['what', 'why', 'purpose', 'next'] as const;
const EM_DASH = String.fromCharCode(0x2014);

function expectWellFormed(label: string, x: EventExplanation) {
  for (const field of TEXT_FIELDS) {
    const text = x[field];
    expect(text.length, `${label} ${field} is empty`).toBeGreaterThan(0);
    expect(text.length, `${label} ${field} is too long (${text.length})`).toBeLessThanOrEqual(150);
    expect(text, `${label} ${field} has an em dash`).not.toContain(EM_DASH);
    expect(text, `${label} ${field} is trimmed`).toBe(text.trim());
    expect(text, `${label} ${field} ends like a sentence`).toMatch(/[.)]$/);
  }
  expect(PIPELINE_STAGES).toContain(x.stage);
  expect(['notice', 'silent']).toContain(x.signal);
  expect(['action', 'bad', 'progress', 'good']).toContain(x.tone);
}

describe('stage and signal labels', () => {
  it('label every stage and signal without em dashes', () => {
    for (const stage of PIPELINE_STAGES) expect(STAGE_LABELS[stage].length).toBeGreaterThan(0);
    expect(SIGNAL_LABELS).toEqual({ notice: 'Notice', silent: 'Background' });
    expect(PIPELINE_STAGES).toEqual(['intake', 'checks', 'review', 'decision', 'card']);
  });
});

describe('explainEvent', () => {
  it('explains every code in the dictionary with bounded, dash-free text', () => {
    const codes = knownEventCodes();
    expect(codes.length).toBeGreaterThan(40);
    for (const code of codes) {
      const info = eventInfo(code);
      const x = explainEvent(info);
      expectWellFormed(code, x);
      expect(x.official, code).toBe(false);
    }
  });

  it('separates biometrics from background checks inside the checks category', () => {
    const bio = explainEvent(eventInfo('FNA'));
    const check = explainEvent(eventInfo('FTA0'));
    expect(bio.stage).toBe('checks');
    expect(check.stage).toBe('checks');
    expect(bio.signal).toBe('notice');
    expect(check.signal).toBe('silent');
    expect(bio.what).toMatch(/biometrics/i);
    expect(check.what).toMatch(/background or security check/i);
    expect(bio.what).not.toBe(check.what);
  });

  it('separates a request, a response, and an intent to deny inside the evidence category', () => {
    const rfe = explainEvent(eventInfo('IKA'));
    const response = explainEvent(eventInfo('HA'));
    const noid = explainEvent(eventInfo('FE'));
    expect(new Set([rfe.what, response.what, noid.what]).size).toBe(3);
    expect(rfe.tone).toBe('action');
    expect(response.tone).toBe('progress');
    expect(noid.what).toMatch(/intent to deny/i);
    for (const x of [rfe, response, noid]) {
      expect(x.stage).toBe('review');
      expect(x.signal).toBe('notice');
    }
  });

  it('marks routine processing, checks, and holds as background activity', () => {
    for (const code of ['FT0', 'FN', 'FS', 'FHB']) {
      expect(explainEvent(eventInfo(code)).signal, code).toBe('silent');
    }
    for (const code of ['IAF', 'FI', 'DA', 'LAA', 'LEA', 'EA', 'FNA']) {
      expect(explainEvent(eventInfo(code)).signal, code).toBe('notice');
    }
  });

  it('places events in stages', () => {
    const stage = (code: string) => explainEvent(eventInfo(code)).stage;
    expect(stage('IAF')).toBe('intake');
    expect(stage('FNA')).toBe('checks');
    expect(stage('FI')).toBe('review');
    expect(stage('FS')).toBe('review');
    expect(stage('DA')).toBe('decision');
    expect(stage('EA')).toBe('decision');
    expect(stage('LAA')).toBe('card');
    expect(stage('LEA')).toBe('card');
  });

  it('uses the tone of the status an event sets', () => {
    expect(explainEvent(eventInfo('DA')).tone).toBe('good');
    expect(explainEvent(eventInfo('EA')).tone).toBe('bad');
    expect(explainEvent(eventInfo('FI')).tone).toBe('action');
    expect(explainEvent(eventInfo('EX')).tone).toBe('progress');
  });

  it('never claims a meaning for an unrecognized code', () => {
    const info = eventInfo('zzz9');
    const x = explainEvent(info);
    expectWellFormed('ZZZ9', x);
    expect(x.official).toBe(false);
    expect(x.signal).toBe('silent');
    expect(x.what).toMatch(/does not describe/);
    expect(x.why).toMatch(/often background activity/);
    expect(x.next).toMatch(/notices/);
    expect(x.next).toMatch(/USCIS account/);
    expect(x.what).not.toContain('ZZZ9');
  });

  it('handles an empty code without throwing', () => {
    const x = explainEvent(eventInfo(''));
    expectWellFormed('empty code', x);
    expect(x.official).toBe(false);
  });
});

describe('explainEvent for official API events', () => {
  const official = (text: string): EventInfo => eventInfo(officialCode(text), text);

  it('flags official events and takes what and next from the status text', () => {
    const info = official('Case Was Approved');
    expect(isOfficialEvent(info)).toBe(true);
    const x = explainEvent(info);
    expectWellFormed('approved', x);
    expect(x.official).toBe(true);
    expect(x.signal).toBe('notice');
    expect(x.what).toBe(STATUSES.approved.meaning);
    expect(x.next).toBe(STATUSES.approved.next);
    expect(x.stage).toBe('decision');
    expect(x.tone).toBe('good');
  });

  it('never flags community events as official', () => {
    expect(isOfficialEvent(eventInfo('IAF'))).toBe(false);
    expect(isOfficialEvent(eventInfo('zzz9'))).toBe(false);
  });

  it('explains every status the official rules can produce', () => {
    const samples: [string, (typeof STATUS_KEYS)[number]][] = [
      ['Case Was Received', 'received'],
      ['Request for Additional Evidence Was Sent', 'rfe'],
      ['Response To USCIS Request For Evidence Was Received', 'rfe_resp'],
      ['Fingerprint Appointment Was Scheduled', 'biometrics'],
      ['Case Is Being Actively Reviewed By USCIS', 'review'],
      ['Interview Was Scheduled', 'interview'],
      ['Case Was Transferred To Another Office', 'transferred'],
      ['Case Was Approved', 'approved'],
      ['Card Is Being Produced', 'card_prod'],
      ['Card Was Mailed To Me', 'card_mailed'],
      ['Card Was Delivered To Me By The Post Office', 'delivered'],
      ['Case Was Denied', 'denied'],
      ['Notice of Intent to Deny Was Sent', 'noid'],
    ];
    for (const [text, status] of samples) {
      const info = official(text);
      expect(info.status, text).toBe(status);
      const x = explainEvent(info);
      expectWellFormed(text, x);
      expect(x.official).toBe(true);
      expect(x.what).toBe(STATUSES[status].meaning);
      expect(x.next).toBe(STATUSES[status].next);
    }
  });

  it('handles official status text that Waymark does not classify', () => {
    const info = official('Expedite Request Was Denied');
    expect(info.category).toBe('unknown');
    const x = explainEvent(info);
    expectWellFormed('unclassified', x);
    expect(x.official).toBe(true);
    expect(x.signal).toBe('notice');
    expect(x.what).toMatch(/does not classify/);
    // The status text is shown by the app, not repeated in the explanation.
    expect(x.what).not.toContain('Expedite');
  });

  it('keeps text short for a long status text', () => {
    const long = 'Case Was Updated '.repeat(12);
    const x = explainEvent(official(long));
    expectWellFormed('long', x);
  });
});
