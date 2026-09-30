import { describe, expect, it } from 'vitest';
import {
  caseStats,
  caseSummaryLine,
  casesSummary,
  caseTone,
  currentStatus,
  isClosed,
  lastUscisEvent,
  milestones,
  newEventCount,
  sortCases,
  timeline,
  waitPosition,
  type Case,
} from '../src';
import { NOW } from './helpers';

function makeCase(patch: Partial<Case>): Case {
  return {
    id: 'c',
    receipt: 'IOE0999000111',
    form: 'I-485',
    owner: 'Pat',
    receivedDate: '2025-01-01',
    notes: '',
    manual: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...patch,
  };
}

const uscis = (events: [string, string][], newKeys: string[] = []) => ({
  lastSyncedAt: NOW,
  events: events.map(([code, at]) => ({ code, at })),
  notices: [{ letterId: 'L' }],
  knownKeys: events.map(([code, at]) => `${code}|${at}`),
  newKeys,
});

describe('currentStatus', () => {
  it('defaults to received', () => {
    expect(currentStatus(makeCase({}))).toBe('received');
  });

  it('prefers a USCIS event over a manual entry on the same day', () => {
    const c = makeCase({
      manual: [
        { id: 'm', date: '2025-03-01', status: 'interview', createdAt: '2025-03-01T23:00:00Z' },
      ],
      uscis: uscis([['FTA0', '2025-03-01T10:00:00.000Z']]),
    });
    expect(currentStatus(c, 'UTC')).toBe('review');
  });

  it('uses a newer manual entry over older USCIS events', () => {
    const c = makeCase({
      manual: [{ id: 'm', date: '2025-03-02', status: 'approved', createdAt: NOW }],
      uscis: uscis([['FTA0', '2025-03-01T10:00:00.000Z']]),
    });
    expect(currentStatus(c, 'UTC')).toBe('approved');
    expect(caseTone(c, 'UTC')).toBe('good');
  });

  it('compares dates in the chosen time zone', () => {
    const c = makeCase({
      manual: [{ id: 'm', date: '2025-03-01', status: 'interview', createdAt: NOW }],
      uscis: uscis([['FTA0', '2025-03-02T03:00:00.000Z']]),
    });
    expect(currentStatus(c, 'UTC')).toBe('review');
    // In Los Angeles the event falls on March 1, so it wins the same-day tie.
    expect(currentStatus(c, 'America/Los_Angeles')).toBe('review');
    const later = { ...c, manual: [{ ...c.manual[0]!, date: '2025-03-02' }] };
    expect(currentStatus(later, 'America/Los_Angeles')).toBe('interview');
  });

  it('treats delivered, denied, and USCIS closed as closed', () => {
    expect(
      isClosed(
        makeCase({ manual: [{ id: 'm', date: '2025-02-01', status: 'denied', createdAt: NOW }] }),
      ),
    ).toBe(true);
    expect(
      isClosed(
        makeCase({
          manual: [{ id: 'm', date: '2025-02-01', status: 'delivered', createdAt: NOW }],
        }),
      ),
    ).toBe(true);
    expect(isClosed(makeCase({ uscis: { ...uscis([]), closed: true } }))).toBe(true);
    expect(isClosed(makeCase({}))).toBe(false);
  });
});

describe('timeline', () => {
  const c = makeCase({
    manual: [
      { id: 'a', date: '2025-01-01', status: 'received', createdAt: NOW },
      { id: 'b', date: '2025-02-10', status: 'transferred', note: 'Moved', createdAt: NOW },
    ],
    uscis: uscis(
      [
        ['IAF', '2025-01-01T12:00:00.000Z'],
        ['FNA', '2025-02-10T15:00:00.000Z'],
        ['QQQ', '2025-03-05T15:00:00.000Z'],
      ],
      ['QQQ|2025-03-05T15:00:00.000Z'],
    ),
  });

  it('merges newest first with USCIS events before manual entries on the same day', () => {
    const items = timeline(c, 'UTC');
    expect(items.map((i) => (i.kind === 'uscis' ? i.code : i.status))).toEqual([
      'QQQ',
      'FNA',
      'transferred',
      'IAF',
      'received',
    ]);
    const first = items[0]!;
    expect(first.kind === 'uscis' && first.isNew && first.info.label).toBe('Unrecognized event');
    expect(items[1]!.day).toBe(40);
  });

  it('computes stats, last event, and new count', () => {
    expect(caseStats(c, '2025-03-15', 'UTC')).toEqual({
      daysSinceLastEvent: 10,
      events: 3,
      notices: 1,
    });
    expect(lastUscisEvent(c)?.code).toBe('QQQ');
    expect(newEventCount(c)).toBe(1);
  });

  it('places milestones by time since filing', () => {
    const ms = milestones({ ...c, processingMonths: 6 }, '2025-03-15', 'UTC');
    expect(ms[0]).toMatchObject({ position: 0, category: 'receipt' });
    expect(ms.find((m) => m.label === 'Case transferred')?.category).toBe('processing');
    expect(ms[ms.length - 1]!.position).toBeCloseTo(63 / 183, 5);
  });
});

describe('waitPosition', () => {
  it('measures elapsed days against the processing time', () => {
    const c = makeCase({ processingMonths: 12 });
    expect(waitPosition(c, '2025-07-01')).toEqual({
      elapsed: 181,
      total: 365,
      remaining: 184,
      fraction: 181 / 365,
    });
    expect(waitPosition(c, '2026-02-01')!.remaining).toBeLessThan(0);
    expect(waitPosition(makeCase({}), '2025-07-01')).toBeNull();
  });
});

describe('lists', () => {
  const action = makeCase({
    id: 'a',
    receivedDate: '2025-05-01',
    manual: [{ id: 'm', date: '2025-06-01', status: 'rfe', createdAt: NOW }],
  });
  const bad = makeCase({
    id: 'b',
    receivedDate: '2025-04-01',
    manual: [{ id: 'm', date: '2025-06-01', status: 'denied', createdAt: NOW }],
  });
  const oldProgress = makeCase({ id: 'p1', receivedDate: '2024-01-01' });
  const newProgress = makeCase({ id: 'p2', receivedDate: '2025-01-01' });
  const good = makeCase({
    id: 'g',
    receivedDate: '2023-01-01',
    manual: [{ id: 'm', date: '2025-06-01', status: 'approved', createdAt: NOW }],
  });

  it('sorts by tone, then by days descending', () => {
    const ids = sortCases([good, newProgress, bad, oldProgress, action], '2025-07-01').map(
      (c) => c.id,
    );
    expect(ids).toEqual(['a', 'b', 'p1', 'p2', 'g']);
  });

  it('summarizes open cases and the next deadline', () => {
    const summary = casesSummary(
      [action, bad, oldProgress, good],
      [
        { id: 'd1', title: 'Past', date: '2025-06-01', done: false, createdAt: NOW },
        { id: 'd2', title: 'Done', date: '2025-07-02', done: true, createdAt: NOW },
        { id: 'd3', title: 'Later', date: '2025-08-01', done: false, createdAt: NOW },
        { id: 'd4', title: 'Soon', date: '2025-07-10', done: false, createdAt: NOW },
      ],
      '2025-07-01',
    );
    expect(summary.inProgress).toBe(3);
    expect(summary.longestWait).toEqual({ caseId: 'g', days: 912 });
    expect(summary.nextDeadline?.id).toBe('d4');
  });

  it('writes a one-line summary', () => {
    expect(caseSummaryLine(oldProgress, '2024-02-01')).toBe(
      'I-485 IOE0999000111 (Pat): Case received. Day 31 since filing on 2024-01-01.',
    );
  });
});
