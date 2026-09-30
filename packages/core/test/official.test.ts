import { describe, expect, it } from 'vitest';
import {
  currentStatus,
  eventInfo,
  migrateData,
  mergeImport,
  officialCode,
  officialInstant,
  officialStatusKey,
  parseCaseStatusResponse,
  parseUscisJson,
  readImport,
  sanitizeData,
  timeline,
} from '../src';
import { fixture, idFactory, NOW } from './helpers';

describe('officialStatusKey', () => {
  it.each([
    ['Case Was Received', 'received'],
    ['Fees Were Waived and Case Was Received', 'received'],
    ['Request for Additional Evidence Was Sent', 'rfe'],
    ["Response To USCIS' Request For Evidence Was Received", 'rfe_resp'],
    ['Fingerprint Appointment Was Scheduled', 'biometrics'],
    ['Case Was Updated To Show Fingerprints Were Taken', 'review'],
    ['Interview Was Scheduled', 'interview'],
    ['Interview Was Completed And My Case Must Be Reviewed', 'review'],
    ['Case Was Transferred And A New Office Has Jurisdiction', 'transferred'],
    ['Case Is Being Actively Reviewed By USCIS', 'review'],
    ['Case Was Approved', 'approved'],
    ['Oath Ceremony Notice Was Mailed', 'approved'],
    ['New Card Is Being Produced', 'card_prod'],
    ['Card Was Mailed To Me', 'card_mailed'],
    ['Card Was Picked Up By The United States Postal Service', 'card_mailed'],
    ['Card Was Delivered To Me By The Post Office', 'delivered'],
    ['Notice Of Intent To Deny Was Sent', 'noid'],
    ['Case Was Denied', 'denied'],
  ])('%s maps to %s', (text, status) => {
    expect(officialStatusKey(text)).toBe(status);
  });

  it('returns undefined for unmatched text', () => {
    expect(officialStatusKey('Something else entirely')).toBeUndefined();
  });
});

describe('officialInstant and officialCode', () => {
  it('parses month-first dates as UTC and falls back to ISO', () => {
    expect(officialInstant('09-05-2023 14:37:40')).toBe('2023-09-05T14:37:40.000Z');
    expect(officialInstant('09-05-2023')).toBe('2023-09-05T12:00:00.000Z');
    expect(officialInstant('2023-09-05T14:37:40Z')).toBe('2023-09-05T14:37:40.000Z');
    expect(officialInstant('13-45-2023')).toBeUndefined();
  });

  it('builds stable codes from status text', () => {
    expect(officialCode("Response To USCIS' Request")).toBe('CS:RESPONSE_TO_USCIS_REQUEST');
    expect(officialCode('')).toBe('CS:STATUS');
  });
});

describe('parseCaseStatusResponse', () => {
  it('turns history and the current status into events and drops everything else', () => {
    const result = parseCaseStatusResponse(JSON.parse(fixture('official-response.json')));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const c = result.case;
    expect(c).toMatchObject({
      receipt: 'EAC9999103402',
      form: 'I-130',
      submittedAt: '2023-09-05T14:37:40.000Z',
      updatedAt: '2023-10-12T09:15:00.000Z',
      channel: 'Case Status API',
      notices: [],
    });
    expect(c.events.map((e) => e.text)).toEqual([
      'Case Was Received',
      'Request for Additional Evidence Was Sent',
      "Response To USCIS' Request For Evidence Was Received",
      'Case Was Approved',
    ]);
    expect(JSON.stringify(c)).not.toContain('REDACTED');
    expect(JSON.stringify(c)).not.toContain('Caso');
  });

  it('handles a response without history', () => {
    const result = parseCaseStatusResponse({
      case_status: {
        receiptNumber: 'EAC9999103403',
        formType: 'I-485',
        submittedDate: '01-02-2024 10:00:00',
        current_case_status_text_en: 'Case Was Received',
        hist_case_status: null,
      },
    });
    expect(result.ok && result.case.events).toEqual([
      { code: 'CS:CASE_WAS_RECEIVED', at: '2024-01-02T10:00:00.000Z', text: 'Case Was Received' },
    ]);
  });

  it('reports errors from the API message', () => {
    expect(parseCaseStatusResponse({ message: 'The receipt number entered is invalid' })).toEqual({
      ok: false,
      error: 'The receipt number entered is invalid',
    });
    expect(parseCaseStatusResponse(null)).toMatchObject({ ok: false });
  });
});

describe('official events in the core pipeline', () => {
  const official = parseCaseStatusResponse(JSON.parse(fixture('official-response.json')));

  it('describes CS events by their text', () => {
    expect(eventInfo('CS:CASE_WAS_APPROVED', 'Case Was Approved')).toEqual({
      code: 'CS:CASE_WAS_APPROVED',
      label: 'Case Was Approved',
      category: 'approved',
      status: 'approved',
    });
    expect(eventInfo('CS:SOMETHING_NEW')).toMatchObject({
      label: 'something new',
      category: 'unknown',
    });
  });

  it('merges with manual imports and derives status', () => {
    if (!official.ok) throw new Error('fixture');
    const { cases } = mergeImport([], [official.case], {
      now: NOW,
      makeId: idFactory(),
      timeZone: 'UTC',
    });
    expect(currentStatus(cases[0]!, 'UTC')).toBe('approved');
    expect(timeline(cases[0]!, 'UTC')[0]).toMatchObject({
      kind: 'uscis',
      info: { label: 'Case Was Approved' },
    });

    const elis = parseUscisJson(
      '{"receiptNumber":"EAC9999103402","events":[{"eventCode":"LAA","createdAtTimestamp":"2023-10-20T12:00:00Z"}]}',
    );
    const merged = mergeImport(cases, elis.cases, { now: NOW, makeId: idFactory() });
    expect(merged.summary.updated).toEqual([{ receipt: 'EAC9999103402', newEvents: 1 }]);
    expect(currentStatus(merged.cases[0]!, 'UTC')).toBe('card_prod');
  });

  it('keeps event text and server tracking through sanitize and export', () => {
    if (!official.ok) throw new Error('fixture');
    const { cases } = mergeImport([], [official.case], { now: NOW, makeId: idFactory() });
    const tracked = { ...cases[0]!, serverTracking: { subscriptionId: 'sub_1', since: NOW } };
    const data = sanitizeData({ cases: [tracked] }, idFactory(), NOW);
    expect(data.cases[0]!.uscis!.events[3]!.text).toBe('Case Was Approved');
    expect(data.cases[0]!.serverTracking).toEqual({ subscriptionId: 'sub_1', since: NOW });
  });

  it('migrates schema 1 exports', () => {
    expect(migrateData({ cases: [] }, 1)).toEqual({ cases: [] });
    const text = JSON.stringify({ app: 'waymark', schema: 1, data: { cases: [] } });
    expect(readImport(text, { now: NOW, makeId: idFactory() })).toMatchObject({ ok: true });
  });
});
