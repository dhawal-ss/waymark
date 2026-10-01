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

  it('reads the history when it is named hist_case_data', () => {
    const result = parseCaseStatusResponse({
      case_status: {
        receiptNumber: 'EAC9999103404',
        formType: 'I-765',
        submittedDate: '01-02-2024 10:00:00',
        modifiedDate: '02-03-2024 09:00:00',
        current_case_status_text_en: 'Case Was Approved',
        hist_case_data: [{ date: '01-02-2024 10:00:00', completed_text_en: 'Case Was Received' }],
      },
    });
    expect(result.ok && result.case.events.map((e) => e.text)).toEqual([
      'Case Was Received',
      'Case Was Approved',
    ]);
  });

  // Shape of the example on the developer portal (first history entry): the history dates are
  // plain dates, and the history already lists the current status as a sentence.
  it('does not repeat the current status that the history already lists', () => {
    const result = parseCaseStatusResponse({
      case_status: {
        receiptNumber: 'EAC9999103403',
        formType: 'I-130',
        submittedDate: '09-05-2023 14:28:46',
        modifiedDate: '09-05-2023 14:28:46',
        current_case_status_text_en: 'Case Was Approved',
        hist_case_status: [
          {
            date: '2023-09-05',
            completed_text_en: 'We approved your Form I-130, Petition for Alien Relative.',
          },
        ],
      },
    });
    expect(result.ok && result.case.events).toEqual([
      {
        code: 'CS:WE_APPROVED_YOUR_FORM_I_130_PETITION_FOR_ALIEN_RELATIVE',
        at: '2023-09-05T12:00:00.000Z',
        text: 'We approved your Form I-130, Petition for Alien Relative.',
      },
    ]);
    expect(result.ok && result.case.updatedAt).toBe('2023-09-05T14:28:46.000Z');
  });

  it('keeps a current status that the history does not list', () => {
    const result = parseCaseStatusResponse({
      case_status: {
        receiptNumber: 'EAC9999103403',
        formType: 'I-130',
        submittedDate: '09-05-2023 14:28:46',
        modifiedDate: '10-12-2023 09:15:00',
        current_case_status_text_en: 'Case Was Approved',
        hist_case_status: [{ date: '2023-09-05', completed_text_en: 'Case Was Received' }],
      },
    });
    expect(result.ok && result.case.events.map((e) => e.text)).toEqual([
      'Case Was Received',
      'Case Was Approved',
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
    // The JSON is a new source for this case, so its history is added but not marked new.
    expect(merged.summary.updated).toEqual([{ receipt: 'EAC9999103402', newEvents: 0 }]);
    expect(merged.cases[0]!.uscis!.newKeys).toEqual([]);
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

  it('keeps data sources and drops invalid ones', () => {
    const data = sanitizeData(
      {
        series: [
          {
            name: 'Linked',
            points: [],
            source: {
              kind: 'processing-times',
              form: 'I-485',
              office: 'NBC',
              subtype: '134A',
              label: 'Family',
              updatedAt: NOW,
            },
          },
          { name: 'Bad source', points: [], source: { kind: 'other' } },
        ],
        visa: {
          cutoffs: [],
          source: {
            kind: 'visa-bulletin',
            chart: 'final',
            preference: 'employment',
            category: 'EB2',
            country: 'INDIA',
            updatedAt: NOW,
          },
        },
        prefs: { publicData: true },
      },
      idFactory(),
      NOW,
    );
    expect(data.series[0]!.source).toMatchObject({ form: 'I-485', subtype: '134A' });
    expect(data.series[1]!.source).toBeUndefined();
    expect(data.visa.source).toMatchObject({ chart: 'final', category: 'EB2', country: 'INDIA' });
    expect(data.prefs.publicData).toBe(true);
    const bad = sanitizeData(
      { visa: { cutoffs: [], source: { kind: 'visa-bulletin', chart: 'x' } } },
      idFactory(),
      NOW,
    );
    expect(bad.visa.source).toBeUndefined();
  });

  it('migrates schema 1 exports', () => {
    expect(migrateData({ cases: [] }, 1)).toEqual({ cases: [] });
    const text = JSON.stringify({ app: 'waymark', schema: 1, data: { cases: [] } });
    expect(readImport(text, { now: NOW, makeId: idFactory() })).toMatchObject({ ok: true });
  });
});
