import { describe, expect, it } from 'vitest';
import { appointmentSuggestions, buildIcs, icsEscape, icsFold, type Case } from '../src';
import { NOW } from './helpers';

describe('ics', () => {
  it('escapes special characters', () => {
    expect(icsEscape('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });

  it('folds long lines at 75 octets', () => {
    const folded = icsFold(`SUMMARY:${'x'.repeat(100)}`);
    const lines = folded.split('\r\n');
    expect(lines[0]).toHaveLength(75);
    expect(lines[1]!.startsWith(' ')).toBe(true);
    expect(lines.join('').replace(/ /g, '')).toBe(`SUMMARY:${'x'.repeat(100)}`);
  });

  it('builds all-day events with a reminder a day before', () => {
    const ics = buildIcs(
      [
        {
          uid: 'd1@waymark',
          date: '2026-10-21',
          title: 'Interview, I-485',
          description: 'Bring passport',
        },
      ],
      '2026-09-30T12:00:00.000Z',
    );
    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261021');
    expect(ics).toContain('DTEND;VALUE=DATE:20261022');
    expect(ics).toContain('SUMMARY:Interview\\, I-485');
    expect(ics).toContain('DTSTAMP:20260930T120000Z');
    expect(ics).toContain('TRIGGER:-P1D');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});

describe('appointmentSuggestions', () => {
  const c: Case = {
    id: 'c1',
    receipt: 'IOE0999000111',
    form: 'I-485',
    owner: '',
    receivedDate: '2026-01-01',
    notes: '',
    manual: [],
    createdAt: NOW,
    updatedAt: NOW,
    uscis: {
      lastSyncedAt: NOW,
      events: [],
      knownKeys: [],
      newKeys: [],
      notices: [
        { actionType: 'Interview appointment', appointmentDateTime: '2026-10-21T15:00:00.000Z' },
        { actionType: 'Biometrics appointment', appointmentDateTime: '2026-03-01T15:00:00.000Z' },
        { actionType: 'Interview appointment', appointmentDateTime: '2026-10-21T15:00:00.000Z' },
        { appointmentDateTime: 'not a date' },
        { letterId: 'no appointment' },
      ],
    },
  };

  it('lists upcoming appointments once, in the chosen zone', () => {
    expect(appointmentSuggestions(c, [], '2026-09-30', 'UTC')).toEqual([
      {
        key: '2026-10-21|Interview appointment',
        title: 'Interview appointment',
        date: '2026-10-21',
        instant: '2026-10-21T15:00:00.000Z',
      },
    ]);
  });

  it('skips appointments that are already deadlines', () => {
    const deadlines = [
      {
        id: 'd',
        caseId: 'c1',
        title: 'Interview appointment',
        date: '2026-10-21',
        done: false,
        createdAt: NOW,
      },
    ];
    expect(appointmentSuggestions(c, deadlines, '2026-09-30', 'UTC')).toEqual([]);
  });
});
