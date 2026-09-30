import { describe, expect, it } from 'vitest';
import { extractJsonObjects, parseUscisJson, toInstant } from '../src';
import { fixture } from './helpers';

describe('extractJsonObjects', () => {
  it('finds objects back to back and ignores braces inside strings', () => {
    const chunks = extractJsonObjects('x {"a":"}{"} junk {"b":{"c":1}} {"d":"\\"}"}');
    expect(chunks).toEqual(['{"a":"}{"}', '{"b":{"c":1}}', '{"d":"\\"}"}']);
  });

  it('drops an unterminated trailing object', () => {
    expect(extractJsonObjects('{"a":1} {"b":')).toEqual(['{"a":1}']);
  });
});

describe('toInstant', () => {
  it('handles ISO, offset-less, date-only, and epoch values', () => {
    expect(toInstant('2025-03-01T15:00:00.000Z')).toBe('2025-03-01T15:00:00.000Z');
    expect(toInstant('2025-03-01T15:00:00')).toBe('2025-03-01T15:00:00.000Z');
    expect(toInstant('2025-03-01 15:00')).toBe('2025-03-01T15:00:00.000Z');
    expect(toInstant('2025-03-01T10:00:00-05:00')).toBe('2025-03-01T15:00:00.000Z');
    expect(toInstant('2025-03-01')).toBe('2025-03-01T12:00:00.000Z');
    expect(toInstant(1735732800000)).toBe('2025-01-01T12:00:00.000Z');
    expect(toInstant(1735732800)).toBe('2025-01-01T12:00:00.000Z');
    expect(toInstant('nope')).toBeUndefined();
    expect(toInstant(null)).toBeUndefined();
  });
});

describe('parseUscisJson', () => {
  it('parses a bare object and keeps only the allowed fields', () => {
    const { cases, problems } = parseUscisJson(fixture('case-basic.json'));
    expect(problems).toEqual([]);
    expect(cases).toHaveLength(1);
    const c = cases[0]!;
    expect(c).toMatchObject({
      receipt: 'IOE0999000111',
      form: 'I-485',
      formName: 'Application to Register Permanent Residence or Adjust Status',
      submittedAt: '2025-02-14T03:30:00.000Z',
      updatedAt: '2025-06-02T17:05:11.201Z',
      closed: false,
      channel: 'Online',
    });
    expect(c.events.map((e) => e.code)).toEqual(['IAF', 'FNA', 'FTA0', 'ZZZ9', 'EX']);
    expect(c.notices).toEqual([
      { letterId: 'L-1', generationDate: '2025-02-15T08:00:00.000Z', actionType: 'Receipt notice' },
      {
        letterId: 'L-2',
        generationDate: '2025-02-20T08:00:00.000Z',
        actionType: 'Biometrics appointment',
        appointmentDateTime: '2025-03-01T15:00:00.000Z',
      },
    ]);
    const json = JSON.stringify(cases);
    expect(json).not.toContain('REDACTED');
    expect(json).not.toContain('Example St');
    expect(json).not.toContain('eventId');
    expect(json).not.toContain('actionCodeText');
  });

  it('unwraps {data: {...}} and reads alternate field names', () => {
    const { cases } = parseUscisJson(fixture('case-rescan.json'));
    expect(cases[0]).toMatchObject({
      receipt: 'IOE0999000111',
      submittedAt: '2025-02-14T12:00:00.000Z',
      updatedAt: '2025-07-10T10:00:00.000Z',
    });
    expect(cases[0]!.events).toHaveLength(5);
  });

  it('unwraps {cases: [...]}, normalizes receipts and forms, and reports invalid receipts', () => {
    const { cases, problems } = parseUscisJson(fixture('cases-list.json'));
    expect(cases.map((c) => [c.receipt, c.form])).toEqual([
      ['LIN0999000222', 'I-765'],
      ['MSC0999000333', 'N-400'],
    ]);
    expect(cases[0]!.events[0]!.at).toBe('2025-01-01T12:00:00.000Z');
    expect(problems).toEqual(['Skipped a case with an invalid receipt number (BAD).']);
  });

  it('parses a top-level array', () => {
    const text = JSON.stringify([
      JSON.parse(fixture('case-basic.json')),
      { data: [{ receiptNumber: 'SRC0999000999' }] },
    ]);
    expect(parseUscisJson(text).cases.map((c) => c.receipt)).toEqual([
      'IOE0999000111',
      'SRC0999000999',
    ]);
  });

  it('parses objects pasted back to back and reports an incomplete one', () => {
    const { cases, problems } = parseUscisJson(fixture('back-to-back.txt'));
    expect(cases.map((c) => [c.receipt, c.form])).toEqual([
      ['IOE0999000444', 'I-131'],
      ['IOE0999000555', 'I-130'],
    ]);
    expect(problems).toEqual([expect.stringContaining('cut off')]);
  });

  it('reports a chunk that looks complete but is not valid JSON', () => {
    const { cases, problems } = parseUscisJson('{"receiptNumber":"IOE0999000444"} {oops}');
    expect(cases).toHaveLength(1);
    expect(problems[0]).toContain('incomplete and skipped');
  });

  it('merges the same case pasted twice', () => {
    const a =
      '{"receiptNumber":"IOE0999000444","events":[{"eventCode":"IAF","createdAtTimestamp":"2025-01-02T10:00:00Z"}]}';
    const b =
      '{"receiptNumber":"IOE0999000444","events":[{"eventCode":"IAF","createdAtTimestamp":"2025-01-02T10:00:00Z"},{"eventCode":"FTA0","createdAtTimestamp":"2025-02-02T10:00:00Z"}]}';
    const { cases } = parseUscisJson(`${a}\n${b}`);
    expect(cases).toHaveLength(1);
    expect(cases[0]!.events.map((e) => e.code)).toEqual(['IAF', 'FTA0']);
  });

  it('explains empty input, text without JSON, and JSON without a case', () => {
    expect(parseUscisJson('  ').problems[0]).toContain('empty');
    expect(parseUscisJson('<html>Sign in</html>').problems[0]).toContain('No JSON found');
    expect(parseUscisJson('{"status":"ok"}').problems[0]).toContain('no receiptNumber');
    expect(parseUscisJson('[1, 2]').cases).toEqual([]);
  });

  it('leaves the form null when the JSON has none', () => {
    expect(parseUscisJson('{"receiptNumber":"IOE0999000444"}').cases[0]!.form).toBeNull();
  });
});
