import { describe, expect, it } from 'vitest';
import {
  bulletinMonth,
  bulletinUrl,
  decodeEntities,
  extractTables,
  normalizeCategory,
  normalizeCountry,
  normalizeFormStats,
  normalizeStatForm,
  parseBulletinDate,
  parseCsv,
  parseProcessingTimes,
  parsePublishedDate,
  parseQuarter,
  parseVisaBulletin,
  quarterEndDate,
  toMonths,
} from '../src';
import { fixture } from './helpers';

describe('html', () => {
  it('decodes entities and special hyphens', () => {
    expect(decodeEntities('A&nbsp;&amp;&#8209;B&#x41;&unknown;')).toBe('A &-BA&unknown;');
  });

  it('extracts table cells and the text before each table', () => {
    const tables = extractTables(
      '<h2>First</h2><table><tr><th>A<br>b</th><td> 1 </td></tr></table><p>Second</p><table><tr><td>x</td></tr></table>',
    );
    expect(tables).toEqual([
      { before: 'First', rows: [['A b', '1']] },
      { before: 'Second', rows: [['x']] },
    ]);
  });
});

describe('visa bulletin', () => {
  const parsed = parseVisaBulletin(fixture('visa-bulletin.html'));

  it('reads dates, C, and U', () => {
    expect(parseBulletinDate('01JAN23')).toBe('2023-01-01');
    expect(parseBulletinDate('15MAR01')).toBe('2001-03-15');
    expect(parseBulletinDate('22OCT98')).toBe('1998-10-22');
    expect(parseBulletinDate('31FEB23')).toBeNull();
    expect(parseBulletinDate('soon')).toBeNull();
  });

  it('builds page URLs in fiscal year folders', () => {
    expect(bulletinUrl('2026-10')).toBe(
      'https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin/2027/visa-bulletin-for-october-2026.html',
    );
    expect(bulletinUrl('2026-03')).toContain('/2026/visa-bulletin-for-march-2026.html');
  });

  it('finds the month from the title or URL', () => {
    expect(bulletinMonth('<h1>Visa Bulletin For October 2026</h1>')).toBe('2026-10');
    expect(bulletinMonth('<p>no title</p>', bulletinUrl('2025-02'))).toBe('2025-02');
  });

  it('normalizes categories and countries', () => {
    expect(normalizeCategory('5th Unreserved (including C5, T5, I5, R5)', 'employment')).toBe(
      'EB5U',
    );
    expect(normalizeCategory('5th Set Aside: High Unemployment (10%)', 'employment')).toBe('EB5H');
    expect(normalizeCategory('Other Workers', 'employment')).toBe('EW');
    expect(normalizeCategory('F2A', 'family')).toBe('F2A');
    expect(normalizeCountry('CHINA-mainland born')).toBe('CHINA');
    expect(normalizeCountry('EL SALVADOR GUATEMALA HONDURAS')).toBe(
      'EL_SALVADOR_GUATEMALA_HONDURAS',
    );
  });

  it('parses all four charts and skips the diversity table', () => {
    expect(parsed.month).toBe('2026-10');
    const count = (chart: string, preference: string) =>
      parsed.rows.filter((r) => r.chart === chart && r.preference === preference).length;
    expect(count('final', 'family')).toBe(25);
    expect(count('filing', 'family')).toBe(10);
    expect(count('final', 'employment')).toBe(50);
    expect(count('filing', 'employment')).toBe(9);
  });

  it('keeps chart assignment when prose mentions the other chart', () => {
    const f1Filing = parsed.rows.find(
      (r) => r.chart === 'filing' && r.category === 'F1' && r.country === 'ALL',
    );
    expect(f1Filing?.cutoff).toBe('2017-09-01');
  });

  it('reads specific cells', () => {
    const find = (chart: string, category: string, country: string) =>
      parsed.rows.find((r) => r.chart === chart && r.category === category && r.country === country)
        ?.cutoff;
    expect(find('final', 'EB2', 'INDIA')).toBe('2013-01-01');
    expect(find('final', 'EB1', 'ALL')).toBe('C');
    expect(find('final', 'EB5H', 'PHILIPPINES')).toBe('U');
    expect(find('filing', 'F2A', 'CHINA')).toBe('C');
  });

  it('reports cells it cannot read', () => {
    expect(parsed.problems).toEqual(['Could not read "soon" for EB3, ALL.']);
    expect(parseVisaBulletin('<p>nothing</p>').problems[0]).toContain('no "Visa Bulletin for');
  });
});

describe('processing times', () => {
  it('reads published dates and units', () => {
    expect(parsePublishedDate('July 25, 2026')).toBe('2026-07-25');
    expect(parsePublishedDate('Sept. 5, 2026')).toBe('2026-09-05');
    expect(parsePublishedDate('07/25/2026')).toBe('2026-07-25');
    expect(parsePublishedDate('2026-07-25T10:00:00Z')).toBe('2026-07-25');
    expect(parsePublishedDate('soon')).toBeUndefined();
    expect(toMonths(26, 'Weeks')).toBeCloseTo(5.98, 2);
    expect(toMonths(1, 'Years')).toBe(12);
    expect(toMonths(3, 'fortnights')).toBeNull();
  });

  it('keeps one record per subtype with the headline and low values', () => {
    const { times, problems } = parseProcessingTimes(JSON.parse(fixture('processing-times.json')), {
      form: 'I-485',
      office: 'NBC',
    });
    expect(problems).toEqual([]);
    expect(times).toEqual([
      {
        form: 'I-485',
        office: 'NBC',
        subtype: '134A',
        months: 13.5,
        lowMonths: 8,
        publishedDate: '2026-07-25',
        subtypeLabel: 'Family-based adjustment applications',
      },
      {
        form: 'I-485',
        office: 'NBC',
        subtype: '134B',
        months: 6,
        publishedDate: '2026-07-25',
        subtypeLabel: 'Employment-based adjustment applications',
      },
    ]);
  });

  it('filters by subtype and reports a response with no range', () => {
    const body = JSON.parse(fixture('processing-times.json'));
    expect(
      parseProcessingTimes(body, { form: 'I-485', office: 'NBC', subtype: '134B' }).times.map(
        (t) => t.subtype,
      ),
    ).toEqual(['134B']);
    expect(
      parseProcessingTimes({ data: {} }, { form: 'I-485', office: 'NBC' }).problems[0],
    ).toContain('format may have changed');
  });

  it('accepts a flat record without subtypes', () => {
    const { times } = parseProcessingTimes(
      { range: [{ value: 7, unit: 'Months' }], publication_date: '2026-08-01' },
      { form: 'I-765', office: 'PSC', subtype: 'C9' },
    );
    expect(times).toEqual([
      { form: 'I-765', office: 'PSC', subtype: 'C9', months: 7, publishedDate: '2026-08-01' },
    ]);
  });
});

describe('form statistics', () => {
  it('parses quoted CSV', () => {
    expect(parseCsv('a,"b, c","d ""e"""\r\n1,2,3\n')).toEqual([
      ['a', 'b, c', 'd "e"'],
      ['1', '2', '3'],
    ]);
  });

  it('reads quarters and their end dates', () => {
    expect(parseQuarter('FY2025 Q3')).toBe('FY2025 Q3');
    expect(parseQuarter('Q1 FY25')).toBe('FY2025 Q1');
    expect(parseQuarter('fy24q4')).toBe('FY2024 Q4');
    expect(parseQuarter('2025 Q2')).toBe('FY2025 Q2');
    expect(parseQuarter('spring')).toBeNull();
    expect(quarterEndDate('FY2025 Q1')).toBe('2024-12-31');
    expect(quarterEndDate('FY2025 Q4')).toBe('2025-09-30');
  });

  it('normalizes form numbers', () => {
    expect(normalizeStatForm('I485')).toBe('I-485');
    expect(normalizeStatForm('Form I-129F')).toBe('I-129F');
    expect(normalizeStatForm('Total')).toBeNull();
  });

  it('finds the header, fills merged cells, skips totals, and keeps suppressed values empty', () => {
    const { records, problems } = normalizeFormStats(
      parseCsv(fixture('form-stats.csv')),
      'FY2026 Q3',
    );
    expect(problems).toEqual([]);
    expect(records).toEqual([
      {
        quarter: 'FY2026 Q3',
        form: 'I-485',
        office: 'National Benefits Center',
        received: 12345,
        approved: 8001,
        denied: 512,
        pending: 44210,
      },
      {
        quarter: 'FY2026 Q3',
        form: 'I-485',
        office: 'Texas Service Center',
        received: 3400,
        approved: 2100,
        denied: null,
        pending: 9876,
      },
      {
        quarter: 'FY2026 Q3',
        form: 'I-765',
        office: 'Potomac Service Center',
        received: 20000,
        approved: 18500,
        denied: 1200,
        pending: 6000,
      },
      {
        quarter: 'FY2026 Q3',
        form: 'I-130',
        office: 'Nebraska Service Center',
        received: 9000,
        approved: 4000,
        denied: null,
        pending: 70500,
      },
    ]);
  });

  it('explains a file without the expected header', () => {
    expect(normalizeFormStats([['a', 'b']], 'FY2026 Q3').problems[0]).toContain('No header row');
  });
});
