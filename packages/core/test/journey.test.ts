import { describe, expect, it } from 'vitest';
import {
  activityBreakdown,
  caseJourney,
  daysByStage,
  eventsPerMonth,
  exampleData,
  officialCode,
  silentSinceLastNotice,
  type Case,
  type ManualEntry,
  type StatusKey,
} from '../src';
import { idFactory, NOW } from './helpers';

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

const uscis = (events: [string, string][], text: Record<number, string> = {}) => ({
  lastSyncedAt: NOW,
  events: events.map(([code, at], i) => (text[i] ? { code, at, text: text[i] } : { code, at })),
  notices: [],
  knownKeys: [],
  newKeys: [],
});

const manual = (date: string, status: StatusKey, id = `${status}-${date}`): ManualEntry => ({
  id,
  date,
  status,
  createdAt: `${date}T08:00:00.000Z`,
});

const noon = (date: string) => `${date}T12:00:00.000Z`;

describe('caseJourney', () => {
  it('returns no runs for an empty case', () => {
    expect(caseJourney(makeCase({}), '2025-06-01', 'UTC')).toEqual([]);
    expect(caseJourney(makeCase({ uscis: uscis([]) }), '2025-06-01', 'UTC')).toEqual([]);
  });

  it('builds ordered runs and runs the current stage to today', () => {
    const c = makeCase({
      uscis: uscis([
        ['IAF', noon('2025-01-01')],
        ['FNA', noon('2025-01-11')],
        ['FTA0', noon('2025-02-01')],
        ['FS', noon('2025-03-01')],
        ['FT0', noon('2025-03-11')],
      ]),
    });
    expect(caseJourney(c, '2025-04-01', 'UTC')).toEqual([
      { stage: 'intake', from: '2025-01-01', to: '2025-01-11', days: 10, open: false },
      { stage: 'checks', from: '2025-01-11', to: '2025-03-01', days: 49, open: false },
      { stage: 'review', from: '2025-03-01', to: '2025-04-01', days: 31, open: true },
    ]);
  });

  it('follows the order of dates, not the order of the events in the file', () => {
    const c = makeCase({
      uscis: uscis([
        ['FS', noon('2025-03-01')],
        ['IAF', noon('2025-01-01')],
        ['FTA0', noon('2025-02-01')],
      ]),
    });
    const runs = caseJourney(c, '2025-03-11', 'UTC');
    expect(runs.map((r) => r.stage)).toEqual(['intake', 'checks', 'review']);
    expect(runs.map((r) => r.days)).toEqual([31, 28, 10]);
  });

  it('keeps a zero-day run when two stages begin on the same day', () => {
    const c = makeCase({
      uscis: uscis([
        ['IAF', '2025-01-01T09:00:00.000Z'],
        ['FNA', '2025-01-01T15:00:00.000Z'],
        ['FTA0', noon('2025-01-20')],
      ]),
    });
    const runs = caseJourney(c, '2025-02-01', 'UTC');
    expect(runs[0]).toEqual({
      stage: 'intake',
      from: '2025-01-01',
      to: '2025-01-01',
      days: 0,
      open: false,
    });
    expect(runs[1]).toMatchObject({ stage: 'checks', from: '2025-01-01', days: 31, open: true });
  });

  it('orders same-day events by time, so a later event decides the stage', () => {
    const c = makeCase({
      uscis: uscis([
        ['FT0', '2025-01-05T18:00:00.000Z'],
        ['FTA0', '2025-01-05T08:00:00.000Z'],
      ]),
    });
    expect(caseJourney(c, '2025-01-06', 'UTC').map((r) => r.stage)).toEqual(['checks', 'review']);
  });

  it('merges consecutive events of one stage, including only background events', () => {
    const c = makeCase({
      uscis: uscis([
        ['FTA0', noon('2025-02-01')],
        ['FN', noon('2025-02-10')],
        ['QAA', noon('2025-02-20')],
      ]),
    });
    expect(caseJourney(c, '2025-03-01', 'UTC')).toEqual([
      { stage: 'checks', from: '2025-02-01', to: '2025-03-01', days: 28, open: true },
    ]);
  });

  it('starts a new run when a stage repeats after another', () => {
    const c = makeCase({
      uscis: uscis([
        ['FTA0', noon('2025-02-01')],
        ['FT0', noon('2025-02-11')],
        ['QAA', noon('2025-02-21')],
      ]),
    });
    const runs = caseJourney(c, '2025-03-03', 'UTC');
    expect(runs.map((r) => [r.stage, r.days])).toEqual([
      ['checks', 10],
      ['review', 10],
      ['checks', 10],
    ]);
    expect(daysByStage(runs)).toEqual([
      { stage: 'checks', days: 20 },
      { stage: 'review', days: 10 },
    ]);
  });

  it('ignores unrecognized events, which do not start a stage', () => {
    const c = makeCase({
      uscis: uscis([
        ['IAF', noon('2025-01-01')],
        ['ZZZ9', noon('2025-01-05')],
        ['FTA0', noon('2025-01-20')],
      ]),
    });
    const runs = caseJourney(c, '2025-01-30', 'UTC');
    expect(runs.map((r) => r.stage)).toEqual(['intake', 'checks']);
    expect(runs[0]).toMatchObject({ from: '2025-01-01', to: '2025-01-20', days: 19 });
    const onlyUnknown = makeCase({ uscis: uscis([['ZZZ9', noon('2025-01-05')]]) });
    expect(caseJourney(onlyUnknown, '2025-01-30', 'UTC')).toEqual([]);
  });

  it('ignores events without a valid date', () => {
    const c = makeCase({
      uscis: uscis([
        ['IAF', 'not a date'],
        ['FTA0', noon('2025-01-20')],
      ]),
    });
    expect(caseJourney(c, '2025-01-30', 'UTC')).toEqual([
      { stage: 'checks', from: '2025-01-20', to: '2025-01-30', days: 10, open: true },
    ]);
    expect(caseJourney(makeCase({ uscis: uscis([['IAF', '']]) }), '2025-01-30', 'UTC')).toEqual([]);
  });

  it('builds runs from manual entries through their status category', () => {
    const c = makeCase({
      manual: [
        manual('2025-01-01', 'received'),
        manual('2025-02-01', 'biometrics'),
        manual('2025-02-15', 'other'),
        manual('2025-03-01', 'transferred'),
        manual('2025-04-01', 'review'),
      ],
    });
    expect(caseJourney(c, '2025-05-01', 'UTC')).toEqual([
      { stage: 'intake', from: '2025-01-01', to: '2025-02-01', days: 31, open: false },
      { stage: 'checks', from: '2025-02-01', to: '2025-03-01', days: 28, open: false },
      { stage: 'review', from: '2025-03-01', to: '2025-05-01', days: 61, open: true },
    ]);
  });

  it('ignores a manual entry whose status has no stage', () => {
    const c = makeCase({ manual: [manual('2025-01-01', 'other')] });
    expect(caseJourney(c, '2025-05-01', 'UTC')).toEqual([]);
  });

  it('places a USCIS event after a manual entry on the same day', () => {
    const c = makeCase({
      manual: [manual('2025-02-01', 'approved')],
      uscis: uscis([['FTA0', '2025-02-01T09:00:00.000Z']]),
    });
    expect(caseJourney(c, '2025-02-10', 'UTC').map((r) => r.stage)).toEqual(['decision', 'checks']);
  });

  it('applies the time zone to event dates', () => {
    const c = makeCase({
      uscis: uscis([
        ['IAF', '2025-03-01T12:00:00.000Z'],
        ['FTA0', '2025-03-02T03:00:00.000Z'],
      ]),
    });
    expect(caseJourney(c, '2025-03-10', 'UTC')[1]).toMatchObject({
      stage: 'checks',
      from: '2025-03-02',
    });
    const la = caseJourney(c, '2025-03-10', 'America/Los_Angeles');
    expect(la[1]).toMatchObject({ stage: 'checks', from: '2025-03-01' });
    expect(la[0]).toMatchObject({ stage: 'intake', days: 0 });
  });

  it('ends the last run at the last event when the case is closed', () => {
    const c = makeCase({
      uscis: uscis([
        ['IAF', noon('2025-01-01')],
        ['FT0', noon('2025-02-01')],
        ['EA', noon('2025-03-01')],
      ]),
    });
    const runs = caseJourney(c, '2025-09-01', 'UTC');
    expect(runs.map((r) => r.stage)).toEqual(['intake', 'review', 'decision']);
    expect(runs[2]).toEqual({
      stage: 'decision',
      from: '2025-03-01',
      to: '2025-03-01',
      days: 0,
      open: false,
    });
    expect(runs.some((r) => r.open)).toBe(false);
  });

  it('keeps an approved case that is not closed open until today', () => {
    const c = makeCase({
      uscis: uscis([
        ['FT0', noon('2025-02-01')],
        ['DA', noon('2025-03-01')],
      ]),
    });
    const runs = caseJourney(c, '2025-03-11', 'UTC');
    expect(runs[1]).toMatchObject({ stage: 'decision', days: 10, open: true });
  });

  it('does not run a stage backward when today is before its first event', () => {
    const c = makeCase({ uscis: uscis([['FTA0', noon('2025-03-01')]]) });
    expect(caseJourney(c, '2025-02-01', 'UTC')).toEqual([
      { stage: 'checks', from: '2025-03-01', to: '2025-03-01', days: 0, open: true },
    ]);
  });

  it('describes official API events by their status', () => {
    const texts = ['Case Was Received', 'Case Is Being Actively Reviewed By USCIS'];
    const c = makeCase({
      uscis: uscis(
        texts.map((t, i): [string, string] => [
          officialCode(t),
          noon(i === 0 ? '2025-01-01' : '2025-02-01'),
        ]),
        { 0: texts[0]!, 1: texts[1]! },
      ),
    });
    expect(caseJourney(c, '2025-02-11', 'UTC').map((r) => [r.stage, r.days])).toEqual([
      ['intake', 31],
      ['review', 10],
    ]);
  });

  it('draws a plausible journey for the example cases', () => {
    const demo = exampleData('2025-07-15', idFactory(), NOW);
    const runs = caseJourney(demo.cases[0]!, '2025-07-15', 'UTC');
    expect(runs.map((r) => r.stage)).toEqual(['intake', 'checks', 'review', 'checks', 'review']);
    expect(runs.filter((r) => r.open)).toHaveLength(1);
    // The manual-only example case still has a journey.
    expect(caseJourney(demo.cases[2]!, '2025-07-15', 'UTC').length).toBeGreaterThan(1);
  });
});

describe('activityBreakdown', () => {
  it('counts events by signal and category', () => {
    const c = makeCase({
      uscis: uscis([
        ['IAF', noon('2025-01-01')],
        ['FNA', noon('2025-01-11')],
        ['FTA0', noon('2025-02-01')],
        ['FN', noon('2025-02-02')],
        ['FT0', noon('2025-02-03')],
        ['ZZZ9', noon('2025-02-04')],
        ['FI', noon('2025-03-01')],
      ]),
    });
    const b = activityBreakdown(c, 'UTC');
    expect(b.total).toBe(7);
    expect(b.bySignal).toEqual({ notice: 3, silent: 4 });
    expect(b.byCategory).toMatchObject({
      receipt: 1,
      checks: 3,
      processing: 1,
      interview: 1,
      unknown: 1,
      hold: 0,
    });
    expect(Object.values(b.byCategory).reduce((a, n) => a + n, 0)).toBe(b.total);
    expect(b.official).toBe(0);
  });

  it('returns zero counts for a case without USCIS data', () => {
    const b = activityBreakdown(makeCase({ manual: [manual('2025-01-01', 'received')] }), 'UTC');
    expect(b.total).toBe(0);
    expect(b.bySignal).toEqual({ notice: 0, silent: 0 });
    expect(Object.values(b.byCategory).every((n) => n === 0)).toBe(true);
  });

  it('counts only silent events when the case has only background activity', () => {
    const c = makeCase({
      uscis: uscis([
        ['FTA0', noon('2025-01-01')],
        ['FT0', noon('2025-01-02')],
      ]),
    });
    expect(activityBreakdown(c, 'UTC').bySignal).toEqual({ notice: 0, silent: 2 });
  });

  it('counts official events as notices and reports how many there are', () => {
    const t = 'Case Is Being Actively Reviewed By USCIS';
    const c = makeCase({ uscis: uscis([[officialCode(t), noon('2025-01-01')]], { 0: t }) });
    const b = activityBreakdown(c, 'UTC');
    expect(b.bySignal).toEqual({ notice: 1, silent: 0 });
    expect(b.official).toBe(1);
  });

  it('leaves out events without a valid date', () => {
    const c = makeCase({
      uscis: uscis([
        ['IAF', 'bad'],
        ['FTA0', noon('2025-01-01')],
      ]),
    });
    expect(activityBreakdown(c, 'UTC').total).toBe(1);
  });
});

describe('silentSinceLastNotice', () => {
  it('counts background events after the last notice', () => {
    const c = makeCase({
      uscis: uscis([
        ['IAF', noon('2025-01-01')],
        ['FTA0', noon('2025-01-05')],
        ['FNA', noon('2025-01-11')],
        ['FTA1', noon('2025-02-01')],
        ['FT0', noon('2025-02-11')],
        ['FS', noon('2025-03-01')],
      ]),
    });
    expect(silentSinceLastNotice(c, 'UTC')).toEqual({ count: 3, lastNoticeDate: '2025-01-11' });
  });

  it('is zero when the newest event is a notice', () => {
    const c = makeCase({
      uscis: uscis([
        ['FTA0', noon('2025-01-05')],
        ['FI', noon('2025-02-01')],
      ]),
    });
    expect(silentSinceLastNotice(c, 'UTC')).toEqual({ count: 0, lastNoticeDate: '2025-02-01' });
  });

  it('counts every event and reports no notice date when there are only background events', () => {
    const c = makeCase({
      uscis: uscis([
        ['FTA0', noon('2025-01-05')],
        ['FT0', noon('2025-01-06')],
      ]),
    });
    expect(silentSinceLastNotice(c, 'UTC')).toEqual({ count: 2, lastNoticeDate: null });
  });

  it('returns nothing for a case without events or with only manual entries', () => {
    expect(silentSinceLastNotice(makeCase({}), 'UTC')).toEqual({ count: 0, lastNoticeDate: null });
    const c = makeCase({ manual: [manual('2025-01-01', 'received')] });
    expect(silentSinceLastNotice(c, 'UTC')).toEqual({ count: 0, lastNoticeDate: null });
  });

  it('orders by time within a day and ignores the order in the file', () => {
    const c = makeCase({
      uscis: uscis([
        ['FTA0', '2025-01-05T20:00:00.000Z'],
        ['FNA', '2025-01-05T10:00:00.000Z'],
        ['FT0', '2025-01-05T09:00:00.000Z'],
      ]),
    });
    expect(silentSinceLastNotice(c, 'UTC')).toEqual({ count: 1, lastNoticeDate: '2025-01-05' });
  });

  it('reports the notice date in the chosen time zone', () => {
    const c = makeCase({ uscis: uscis([['FNA', '2025-03-02T03:00:00.000Z']]) });
    expect(silentSinceLastNotice(c, 'UTC').lastNoticeDate).toBe('2025-03-02');
    expect(silentSinceLastNotice(c, 'America/Los_Angeles').lastNoticeDate).toBe('2025-03-01');
  });

  it('shows background activity after the last notice in the example case', () => {
    const demo = exampleData('2025-07-15', idFactory(), NOW);
    const s = silentSinceLastNotice(demo.cases[0]!, 'UTC');
    expect(s.lastNoticeDate).toBe('2025-07-12');
    expect(s.count).toBe(0);
  });
});

describe('eventsPerMonth', () => {
  it('returns nothing without USCIS events', () => {
    expect(eventsPerMonth(makeCase({}), 'UTC')).toEqual([]);
    expect(eventsPerMonth(makeCase({ manual: [manual('2025-01-01', 'received')] }), 'UTC')).toEqual(
      [],
    );
  });

  it('fills months between the first and last event', () => {
    const c = makeCase({
      uscis: uscis([
        ['IAF', noon('2025-01-15')],
        ['FTA0', noon('2025-01-20')],
        ['FT0', noon('2025-04-02')],
        ['FI', noon('2025-04-30')],
      ]),
    });
    expect(eventsPerMonth(c, 'UTC')).toEqual([
      { month: '2025-01', notice: 1, silent: 1 },
      { month: '2025-02', notice: 0, silent: 0 },
      { month: '2025-03', notice: 0, silent: 0 },
      { month: '2025-04', notice: 1, silent: 1 },
    ]);
  });

  it('crosses a year boundary and handles out-of-order events', () => {
    const c = makeCase({
      uscis: uscis([
        ['FT0', noon('2025-02-10')],
        ['IAF', noon('2024-11-05')],
      ]),
    });
    expect(eventsPerMonth(c, 'UTC').map((m) => m.month)).toEqual([
      '2024-11',
      '2024-12',
      '2025-01',
      '2025-02',
    ]);
  });

  it('returns one month for a single event and for events on one day', () => {
    const one = makeCase({ uscis: uscis([['IAF', noon('2025-05-31')]]) });
    expect(eventsPerMonth(one, 'UTC')).toEqual([{ month: '2025-05', notice: 1, silent: 0 }]);
    const same = makeCase({
      uscis: uscis([
        ['FTA0', '2025-05-31T01:00:00.000Z'],
        ['FT0', '2025-05-31T02:00:00.000Z'],
      ]),
    });
    expect(eventsPerMonth(same, 'UTC')).toEqual([{ month: '2025-05', notice: 0, silent: 2 }]);
  });

  it('counts only background events for a case with only background events', () => {
    const c = makeCase({
      uscis: uscis([
        ['FTA0', noon('2025-01-10')],
        ['FT0', noon('2025-03-10')],
      ]),
    });
    const months = eventsPerMonth(c, 'UTC');
    expect(months.map((m) => m.silent)).toEqual([1, 0, 1]);
    expect(months.every((m) => m.notice === 0)).toBe(true);
  });

  it('assigns events to months in the chosen time zone', () => {
    const c = makeCase({
      uscis: uscis([
        ['FTA0', '2025-03-01T03:00:00.000Z'],
        ['FT0', '2025-03-15T12:00:00.000Z'],
      ]),
    });
    expect(eventsPerMonth(c, 'UTC').map((m) => m.month)).toEqual(['2025-03']);
    // In Los Angeles the first event is still on Feb 28.
    expect(eventsPerMonth(c, 'America/Los_Angeles')).toEqual([
      { month: '2025-02', notice: 0, silent: 1 },
      { month: '2025-03', notice: 0, silent: 1 },
    ]);
  });

  it('sums to the same total as the breakdown', () => {
    const demo = exampleData('2025-07-15', idFactory(), NOW);
    for (const c of demo.cases) {
      const months = eventsPerMonth(c, 'UTC');
      const sum = months.reduce((n, m) => n + m.notice + m.silent, 0);
      expect(sum).toBe(activityBreakdown(c, 'UTC').total);
    }
  });
});

describe('example cases', () => {
  it('mix notices with several background updates', () => {
    const demo = exampleData('2025-07-15', idFactory(), NOW);
    for (const c of demo.cases.slice(0, 2)) {
      const b = activityBreakdown(c, 'UTC');
      expect(b.bySignal.silent, c.receipt).toBeGreaterThanOrEqual(4);
      expect(b.bySignal.notice, c.receipt).toBeGreaterThanOrEqual(3);
      expect(b.byCategory.unknown).toBe(0);
    }
  });
});
