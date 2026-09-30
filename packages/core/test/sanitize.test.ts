import { describe, expect, it } from 'vitest';
import {
  appointmentSuggestions,
  closedByUscis,
  icsEscape,
  isClosed,
  officialStatusKey,
  parseCaseStatusResponse,
  parseSeriesCsv,
  parseUscisJson,
  sanitizeData,
  sanitizeParsedCase,
  type Case,
} from '../src';
import { idFactory, NOW } from './helpers';

const rawCase = (id: unknown, receipt: string) => ({
  id,
  receipt,
  form: 'I-485',
  receivedDate: '2025-01-02',
  manual: [],
});

describe('sanitizeData', () => {
  it('gives repeated and unusable ids fresh ones', () => {
    const data = sanitizeData(
      {
        cases: [
          rawCase('same', 'IOE0000000001'),
          rawCase('same', 'IOE0000000002'),
          rawCase('c.1/../x', 'IOE0000000003'),
        ],
        deadlines: [
          { id: 'd', title: 'A', date: '2025-02-01' },
          { id: 'd', title: 'B', date: '2025-02-02' },
        ],
      },
      idFactory('new'),
      NOW,
    );
    const ids = data.cases.map((c) => c.id);
    expect(ids[0]).toBe('same');
    expect(new Set(ids).size).toBe(3);
    expect(ids.every((id) => /^[A-Za-z0-9_-]+$/.test(id))).toBe(true);
    expect(new Set(data.deadlines.map((d) => d.id)).size).toBe(2);
  });

  it('ignores prototype keys and unknown checklist ids', () => {
    const raw = JSON.parse('{"checklists":{"__proto__":["a"],"i485":["x"],"Bad Id":["y"]}}');
    const data = sanitizeData(raw, idFactory(), NOW);
    expect(Object.getPrototypeOf(data.checklists)).toBe(Object.prototype);
    expect(data.checklists).toEqual({ i485: ['x'] });
  });

  it('caps long text and removes duplicate events', () => {
    const at = '2025-01-03T10:00:00.000Z';
    const data = sanitizeData(
      {
        cases: [
          {
            ...rawCase('a', 'IOE0000000001'),
            owner: 'x'.repeat(500),
            uscis: {
              events: [
                { code: 'IAF', at },
                { code: 'iaf', at },
              ],
              notices: [{ generationDate: 1735732800000, appointmentDateTime: 'not a date' }],
            },
          },
        ],
      },
      idFactory(),
      NOW,
    );
    const c = data.cases[0]!;
    expect(c.owner).toHaveLength(200);
    expect(c.uscis!.events).toHaveLength(1);
    expect(c.uscis!.notices[0]).toEqual({ generationDate: '2025-01-01T12:00:00.000Z' });
  });
});

describe('sanitizeParsedCase', () => {
  it('keeps valid fields and drops malformed ones', () => {
    expect(
      sanitizeParsedCase({
        receipt: 'ioe0000000001',
        form: 'I-765',
        events: [{ code: 'IAF', at: '2025-01-03T10:00:00Z' }, { code: 7 }, 'x'],
        notices: 'nope',
        closed: 'yes',
      }),
    ).toEqual({
      receipt: 'IOE0000000001',
      form: 'I-765',
      events: [{ code: 'IAF', at: '2025-01-03T10:00:00.000Z' }],
      notices: [],
    });
    expect(sanitizeParsedCase({ receipt: 'bad', events: [] })).toBeNull();
  });
});

describe('notice dates', () => {
  it('are stored as instants when parsed', () => {
    const { cases } = parseUscisJson(
      '{"receiptNumber":"IOE0000000001","notices":[{"generationDate":1735732800000,"appointmentDateTime":"2025-03-01T09:00:00"}]}',
    );
    expect(cases[0]!.notices[0]).toEqual({
      generationDate: '2025-01-01T12:00:00.000Z',
      appointmentDateTime: '2025-03-01T09:00:00.000Z',
    });
  });
});

describe('official status text', () => {
  it.each([
    ['Expedite Request Denied', undefined],
    ['Fee Waiver Was Denied', undefined],
    ['Expedite Request Received', undefined],
    ['Request To Reschedule My Appointment Was Received', undefined],
    ['Case Closed Benefit Received By Other Means', undefined],
    ['Case Was Denied', 'denied'],
    ['Case Was Received', 'received'],
  ])('%s', (text, status) => {
    expect(officialStatusKey(text)).toBe(status);
  });

  it('dates the current status by fetch time when the response has no dates', () => {
    const result = parseCaseStatusResponse(
      {
        case_status: {
          receiptNumber: 'EAC9999103402',
          formType: 'I-130',
          current_case_status_text_en: 'Case Was Approved',
        },
      },
      NOW,
    );
    expect(result.ok && result.case.events).toEqual([
      { code: 'CS:CASE_WAS_APPROVED', at: NOW, text: 'Case Was Approved' },
    ]);
  });
});

describe('closed cases', () => {
  const base: Case = {
    id: 'a',
    receipt: 'IOE0000000001',
    form: 'I-485',
    owner: '',
    receivedDate: '2025-01-02',
    notes: '',
    manual: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
  const withEvents = (codes: string[]): Case => ({
    ...base,
    uscis: {
      lastSyncedAt: NOW,
      events: codes.map((code, i) => ({ code, at: `2025-02-0${i + 1}T12:00:00.000Z` })),
      notices: [],
      knownKeys: [],
      newKeys: [],
    },
  });

  it('counts a closing event after the last status change', () => {
    expect(closedByUscis(withEvents(['IAF', 'EX']))).toBe(true);
    expect(isClosed(withEvents(['IAF', 'EX']), 'UTC')).toBe(true);
    expect(closedByUscis(withEvents(['IAF']))).toBe(false);
  });
});

describe('appointment suggestions', () => {
  it('treat any deadline for the case on that date as the appointment', () => {
    const c: Case = {
      id: 'a',
      receipt: 'IOE0000000001',
      form: 'I-485',
      owner: '',
      receivedDate: '2025-01-02',
      notes: '',
      manual: [],
      createdAt: NOW,
      updatedAt: NOW,
      uscis: {
        lastSyncedAt: NOW,
        events: [],
        notices: [
          { actionType: 'Interview appointment', appointmentDateTime: '2025-10-21T19:00:00Z' },
        ],
        knownKeys: [],
        newKeys: [],
      },
    };
    const deadline = {
      id: 'd',
      caseId: 'a',
      title: 'Interview at the field office',
      date: '2025-10-21',
      done: false,
      createdAt: NOW,
    };
    expect(appointmentSuggestions(c, [deadline], '2025-10-01', 'UTC')).toEqual([]);
    expect(appointmentSuggestions(c, [], '2025-10-01', 'UTC')).toHaveLength(1);
  });
});

describe('small parsers', () => {
  it('rejects non-numeric CSV values', () => {
    const result = parseSeriesCsv('date,months\n2025-01-01,N/A\n2025-02-01,7.5 months');
    expect(result.items).toEqual([{ date: '2025-02-01', value: 7.5 }]);
    expect(result.errors).toHaveLength(1);
  });

  it('escapes a lone carriage return in calendar text', () => {
    expect(icsEscape('a\rURL:x')).toBe('a\\nURL:x');
  });
});
