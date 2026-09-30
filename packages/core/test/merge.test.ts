import { describe, expect, it } from 'vitest';
import {
  currentStatus,
  describeMerge,
  markSeen,
  mergeImport,
  parseUscisJson,
  type Case,
} from '../src';
import { fixture, idFactory, NOW } from './helpers';

const parse = (name: string) => parseUscisJson(fixture(name)).cases;

describe('mergeImport', () => {
  it('creates a missing case with the filing date from the submission time in the user zone', () => {
    const { cases, summary } = mergeImport([], parse('case-basic.json'), {
      now: NOW,
      makeId: idFactory(),
      timeZone: 'America/Los_Angeles',
    });
    expect(summary).toEqual({ created: ['IOE0999000111'], updated: [], unchanged: [] });
    expect(cases[0]).toMatchObject({
      id: 'id1',
      receipt: 'IOE0999000111',
      form: 'I-485',
      owner: '',
      // 2025-02-14T03:30Z is the evening of Feb 13 in Los Angeles.
      receivedDate: '2025-02-13',
      manual: [],
    });
    expect(cases[0]!.uscis!.newKeys).toEqual([]);
    expect(cases[0]!.uscis!.knownKeys).toHaveLength(5);
  });

  it('marks nothing new on the first import into an existing manual case', () => {
    const existing: Case = {
      id: 'c1',
      receipt: 'IOE0999000111',
      form: 'Other',
      owner: 'Pat',
      receivedDate: '2025-02-14',
      notes: '',
      manual: [],
      createdAt: NOW,
      updatedAt: NOW,
    };
    const { cases, summary } = mergeImport([existing], parse('case-basic.json'), {
      now: NOW,
      makeId: idFactory(),
    });
    expect(summary.updated).toEqual([{ receipt: 'IOE0999000111', newEvents: 0 }]);
    expect(cases[0]).toMatchObject({
      id: 'c1',
      owner: 'Pat',
      form: 'I-485',
      receivedDate: '2025-02-14',
    });
    expect(cases[0]!.uscis!.newKeys).toEqual([]);
    expect(existing.uscis).toBeUndefined();
  });

  it('marks unseen events new on re-import and keeps earlier new ones', () => {
    const first = mergeImport([], parse('case-basic.json'), {
      now: NOW,
      makeId: idFactory(),
    }).cases;
    const second = mergeImport(first, parse('case-rescan.json'), { now: NOW, makeId: idFactory() });
    expect(second.summary.updated).toEqual([{ receipt: 'IOE0999000111', newEvents: 2 }]);
    const uscis = second.cases[0]!.uscis!;
    expect(uscis.newKeys).toEqual(['FI|2025-07-01T16:00:00.000Z', 'IKA|2025-07-09T16:00:00.000Z']);
    expect(uscis.events).toHaveLength(7);
    expect(uscis.notices).toHaveLength(2);
    expect(uscis.updatedAt).toBe('2025-07-10T10:00:00.000Z');

    const third = mergeImport(second.cases, parse('case-rescan.json'), {
      now: NOW,
      makeId: idFactory(),
    });
    expect(third.summary.unchanged).toEqual(['IOE0999000111']);
    expect(third.cases[0]!.uscis!.newKeys).toHaveLength(2);
  });

  it('derives status from the newest event with a known mapping', () => {
    const first = mergeImport([], parse('case-basic.json'), {
      now: NOW,
      makeId: idFactory(),
    }).cases;
    // Newest events are ZZZ9 (unknown) and EX (closed, no status), so FTA0 decides.
    expect(currentStatus(first[0]!, 'UTC')).toBe('review');
    const second = mergeImport(first, parse('case-rescan.json'), {
      now: NOW,
      makeId: idFactory(),
    }).cases;
    expect(currentStatus(second[0]!, 'UTC')).toBe('rfe');
  });

  it('summarizes results for the snackbar', () => {
    expect(describeMerge({ created: ['IOE0999000111'], updated: [], unchanged: [] })).toBe(
      'Added case IOE0999000111.',
    );
    expect(
      describeMerge({
        created: [],
        updated: [{ receipt: 'IOE0999000111', newEvents: 2 }],
        unchanged: [],
      }),
    ).toBe('2 new events for IOE0999000111.');
    expect(
      describeMerge({
        created: ['A', 'B'],
        updated: [{ receipt: 'C', newEvents: 1 }],
        unchanged: [],
      }),
    ).toBe('Added 2 cases. 1 new event for C.');
    expect(describeMerge({ created: [], updated: [], unchanged: ['C'] })).toBe(
      'No new events for C.',
    );
  });

  it('clears new markers with markSeen', () => {
    const first = mergeImport([], parse('case-basic.json'), {
      now: NOW,
      makeId: idFactory(),
    }).cases;
    const second = mergeImport(first, parse('case-rescan.json'), {
      now: NOW,
      makeId: idFactory(),
    }).cases;
    expect(markSeen(second[0]!, NOW).uscis!.newKeys).toEqual([]);
    expect(markSeen(first[0]!, NOW)).toBe(first[0]);
  });
});
