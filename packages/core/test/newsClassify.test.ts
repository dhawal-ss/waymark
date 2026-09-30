import { describe, expect, it } from 'vitest';
import {
  cleanSummary,
  classifyNews,
  extractForms,
  isFormNumber,
  NEWS_CATEGORIES,
  plainText,
  withClassification,
  type NewsCategory,
} from '../src/index.ts';

const EM_DASH = String.fromCharCode(0x2014);
const classify = (title: string, summary = '', kind = 'Notice'): NewsCategory =>
  classifyNews({ title, summary, kind });

describe('classifyNews', () => {
  it('maps each category from its documented keywords', () => {
    const cases: [string, NewsCategory][] = [
      ['USCIS publishes a new fee schedule', 'fees'],
      ['Changes to the G-1055 fee schedule', 'fees'],
      ['New edition of Form I-130 available', 'forms'],
      ['Form revisions this month', 'forms'],
      ['Agency Information Collection Activities: Form I-90', 'forms'],
      ['Visa Bulletin for November 2026', 'visa'],
      ['Processing time goals updated', 'processing'],
      ['Steps to reduce the backlog', 'processing'],
      ['Case status page has a new look', 'processing'],
      ['Changes to the naturalization civics test', 'citizenship'],
      ['Form N-400 guidance', 'citizenship'],
      ['New oath ceremony locations', 'citizenship'],
      ['Extension of Temporary Protected Status for a country', 'humanitarian'],
      ['TPS re-registration period opens', 'humanitarian'],
      ['Asylum office updates', 'humanitarian'],
      ['Refugee admissions update', 'humanitarian'],
      ['Humanitarian parole process changes', 'humanitarian'],
      ['U visa and T visa filing reminders', 'humanitarian'],
      ['VAWA self-petitioner guidance', 'humanitarian'],
      ['Employment authorization document validity', 'work'],
      ['H-1B registration period', 'work'],
      ['OPT and STEM extension reminders', 'work'],
      ['Information for F-1 students', 'work'],
      ['Beware of scams targeting applicants', 'safety'],
      ['Someone is impersonating agency officers', 'safety'],
      ['Fraudulent websites charge for free forms', 'safety'],
      ['Policy Manual update on residence requirements', 'policy'],
      ['Notice of guidance on document review', 'policy'],
      ['Office closes for the holiday', 'other'],
    ];
    for (const [title, expected] of cases)
      expect([title, classify(title)]).toEqual([title, expected]);
  });

  it('uses the precedence: safety, fees, forms, visa, processing, citizenship, humanitarian, work, policy', () => {
    // Each pair matches two categories; the earlier one in the list wins.
    expect(classify('Scam alert about the new fee schedule')).toBe('safety');
    expect(classify('Fee for the new edition of Form I-485')).toBe('fees');
    expect(classify('New edition of forms in the Visa Bulletin notice')).toBe('forms');
    expect(classify('Visa Bulletin processing time changes')).toBe('visa');
    expect(classify('Processing time for naturalization')).toBe('processing');
    expect(classify('Naturalization for refugees')).toBe('citizenship');
    expect(classify('TPS employment authorization documents')).toBe('humanitarian');
    expect(classify('H-1B final rule')).toBe('work');
  });

  it('looks at the title first and the summary only when the title has no topic', () => {
    // The title names asylum; the passing mention of a fee in the summary does not win.
    expect(classify('Asylum procedures', 'The filing fee is unchanged.')).toBe('humanitarian');
    // No topic in the title: the summary decides.
    expect(classify('Notice of changes', 'The fee schedule will change.')).toBe('fees');
    // A generic policy word in the title does not hide a topic in the summary.
    expect(classify('Final rule on procedures', 'It covers H-1B registration.', 'Rule')).toBe(
      'work',
    );
  });

  it('falls back to policy for Rule and Proposed Rule kinds, and to other for the rest', () => {
    expect(classify('Technical amendments', 'Corrections to filing text.', 'Rule')).toBe('policy');
    expect(classify('Technical amendments', 'Corrections to filing text.', 'Proposed Rule')).toBe(
      'policy',
    );
    expect(classify('Technical amendments', 'Corrections to filing text.', 'Notice')).toBe('other');
    expect(classify('Technical amendments', 'Corrections to filing text.', '')).toBe('other');
    expect(classify('Something', 'A new policy manual chapter.', 'News')).toBe('policy');
  });

  it('matches whole words only', () => {
    expect(classify('Markings are six feet apart')).toBe('other');
    expect(classify('Feedback on the coffee machine')).toBe('other');
    expect(classify('Optional survey about the system')).toBe('other');
    expect(classify('Read the https guide')).toBe('other');
    expect(classify('Report from STPS and TPSX labs')).toBe('other');
    expect(classify('Students of the game')).toBe('work');
    expect(classify('A stem cell story')).toBe('other');
    expect(classify('Please opt in to alerts')).toBe('other');
    expect(classify('Loathe the oaths of others')).toBe('other');
    expect(classify('Scampering squirrels')).toBe('other');
    expect(classify('F-18 flyover and F-10 parking')).toBe('other');
    expect(classify('We read the ead of the line')).toBe('other');
  });

  it('matches acronyms in their usual forms', () => {
    expect(classify('Update for (TPS) holders')).toBe('humanitarian');
    expect(classify('Update for TPS-designated countries')).toBe('humanitarian');
    expect(classify('New EAD card design')).toBe('work');
    expect(classify('h-1b cap news')).toBe('work');
    expect(classify('H1B cap news')).toBe('work');
    expect(classify('Fee waivers and fees')).toBe('fees');
    expect(classify('N400 processing times')).toBe('processing');
    expect(classify('N400 guidance')).toBe('citizenship');
  });

  it('keeps ambiguous words in context', () => {
    // Advance parole is a travel document, not humanitarian parole.
    expect(classify('Advance parole for pending applicants')).toBe('other');
    expect(classify('Humanitarian parole for families')).toBe('humanitarian');
    // Fraud in a records notice is not a warning; fraud in a headline is.
    expect(classify('Privacy notice: Fraud Detection and National Security Records')).toBe('other');
    expect(classify('Fraud in the mail')).toBe('safety');
    // "Fraud" in a summary alone does not make a safety item.
    expect(classify('Program update', 'It helps detect fraud.')).toBe('other');
    // The agency's full name never counts as citizenship.
    expect(classify('U.S. Citizenship and Immigration Services announces hours')).toBe('other');
    // A "new form of" phrase is not a form edition.
    expect(classify('A new form of relief')).toBe('other');
  });

  it('is deterministic and always returns a known category', () => {
    for (const title of ['', 'x', 'fee', 'TPS']) {
      const a = classify(title, 'text');
      expect(a).toBe(classify(title, 'text'));
      expect(NEWS_CATEGORIES).toContain(a);
    }
  });
});

describe('extractForms', () => {
  it('finds forms written in common ways and returns unique sorted numbers', () => {
    expect(
      extractForms('Forms I-485, I485 and i-485; Form N-400, G-28, I-9, and I-765/I-131.'),
    ).toEqual(['G-28', 'I-9', 'I-131', 'I-485', 'I-765', 'N-400']);
  });

  it('sorts by prefix, then by number', () => {
    expect(extractForms('N-600 I-90 AR-11 I-539 G-1055 I-9')).toEqual([
      'AR-11',
      'G-1055',
      'I-9',
      'I-90',
      'I-539',
      'N-600',
    ]);
  });

  it('accepts typographic hyphens and a trailing form letter', () => {
    expect(extractForms('Form I‑485 and I–130 and I-129S')).toEqual(['I-129S', 'I-130', 'I-485']);
    // A lowercase letter is a plural, not part of the number.
    expect(extractForms('the I-485s and N-400s')).toEqual(['I-485', 'N-400']);
  });

  it('rejects other prefixes, alien numbers, dates, years, and longer numbers', () => {
    expect(extractForms('A-12345678 is an A-Number')).toEqual([]);
    expect(extractForms('Filed 2026-03-02 and 03/02/2026')).toEqual([]);
    expect(extractForms('H-1B, F-1, L-1, and E-2 visas')).toEqual([]);
    expect(extractForms('The N-2026 plan and G-2100')).toEqual([]);
    expect(extractForms('AR-12345678 and I-12345')).toEqual([]);
    expect(extractForms('Forms I-0485 and I-')).toEqual([]);
    expect(extractForms('Docket USCIS-2026-0001 and DHS-2026-0007')).toEqual([]);
    expect(extractForms('Words like in-485 or Nina-400')).toEqual([]);
    expect(extractForms('')).toEqual([]);
  });

  it('only returns numbers the feed contract accepts', () => {
    for (const form of extractForms('I-485 N-400 G-1055 AR-11 I-129S I-9')) {
      expect(isFormNumber(form)).toBe(true);
    }
    expect(isFormNumber('i-485')).toBe(false);
    expect(isFormNumber('I485')).toBe(false);
    expect(isFormNumber('I-485; DROP')).toBe(false);
  });
});

describe('plainText', () => {
  it('strips tags, decodes entities, and collapses whitespace', () => {
    expect(plainText('<p>One&nbsp;<b>two</b></p>\n<p>three &amp; four</p>')).toBe(
      'One two three & four',
    );
  });

  it('removes inline tags without leaving a space before punctuation', () => {
    expect(plainText('Read <a href="https://www.uscis.gov">USCIS</a>.')).toBe('Read USCIS.');
  });

  it('drops scripts, styles, and comments', () => {
    expect(plainText('a<script>alert(1)</script><style>p{}</style><!-- hidden -->b')).toBe('a b');
  });

  it('turns dashes into hyphens and keeps other text', () => {
    expect(plainText(`a&#8212;b ${EM_DASH} c`)).toBe('a-b - c');
    expect(plainText('Don&#8217;t &hellip; stop')).toBe('Don’t … stop');
  });

  it('keeps a less-than sign that is not a tag', () => {
    expect(plainText('under 5 < 6 pages')).toBe('under 5 < 6 pages');
  });
});

describe('cleanSummary', () => {
  it('returns short text unchanged apart from cleanup', () => {
    expect(cleanSummary('<p>A short summary.</p>')).toBe('A short summary.');
    expect(cleanSummary('')).toBe('');
    expect(cleanSummary('   ')).toBe('');
  });

  it('shortens at a sentence end without an ellipsis', () => {
    const first = 'The first sentence is long enough to be a fair summary of the whole notice.';
    const text = `${first} ${'Then a second sentence that is far too long to fit. '.repeat(8)}`;
    expect(cleanSummary(text, 120)).toBe(first);
  });

  it('does not end a sentence at an abbreviation', () => {
    const text =
      'Please contact the U.S. Department of State for the chart. Extra words follow here and here.';
    // "U.S." would be a sentence end that keeps enough text if it counted.
    expect(cleanSummary(text, 40)).toBe('Please contact the U.S. Department of…');
    expect(cleanSummary('See No. 5 for details. More text follows after that sentence.', 30)).toBe(
      'See No. 5 for details.',
    );
  });

  it('shortens a long sentence at a word boundary with an ellipsis', () => {
    const text = 'word '.repeat(100).trim();
    const out = cleanSummary(text, 50);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out).toBe(`${'word '.repeat(10).trim()}…`);
    expect(out).not.toMatch(/wor…$/);
  });

  it('cuts a single very long word and never exceeds the limit', () => {
    const out = cleanSummary('x'.repeat(500), 40);
    expect(out).toBe(`${'x'.repeat(39)}…`);
    expect(cleanSummary('a'.repeat(280))).toHaveLength(280);
    expect(cleanSummary('a'.repeat(400)).length).toBeLessThanOrEqual(280);
  });

  it('uses 280 characters by default', () => {
    const text = 'Some words go here. '.repeat(40);
    const out = cleanSummary(text);
    expect(out.length).toBeLessThanOrEqual(280);
    expect(out.length).toBeGreaterThan(200);
    expect(out.endsWith('.')).toBe(true);
  });

  it('never adds words: the output is a prefix of the source text', () => {
    const source = plainText(
      'Alpha beta gamma. Delta epsilon zeta eta theta iota kappa lambda mu.',
    );
    for (const max of [10, 20, 30, 45]) {
      const out = cleanSummary(source, max).replace(/…$/, '');
      expect(source.startsWith(out)).toBe(true);
    }
  });
});

describe('withClassification', () => {
  const base = {
    id: 'uscis-feed:abc',
    source: 'uscis-feed' as const,
    kind: 'News',
    url: 'https://www.uscis.gov/x',
    publishedOn: '2026-03-02',
  };

  it('cleans text and derives category and forms from the stored title and summary', () => {
    const item = withClassification({
      ...base,
      title: 'Form I-765 &amp; I-131 <em>new edition</em>',
      summary: '<p>Use the new edition of Form I-765.</p><p>Form N-400 is unchanged.</p>',
    });
    expect(item).toEqual({
      ...base,
      title: 'Form I-765 & I-131 new edition',
      summary: 'Use the new edition of Form I-765. Form N-400 is unchanged.',
      category: 'forms',
      forms: ['I-131', 'I-765', 'N-400'],
    });
    // Classifying the stored item again gives the same category and forms.
    expect(classifyNews(item)).toBe(item.category);
    expect(extractForms(`${item.title} ${item.summary}`)).toEqual(item.forms);
  });

  it('leaves the summary empty when the source has none', () => {
    const item = withClassification({ ...base, title: 'Office hours', summary: '' });
    expect(item.summary).toBe('');
    expect(item.category).toBe('other');
    expect(item.forms).toEqual([]);
  });

  it('keeps at most 10 forms and 60 characters of kind', () => {
    const many = Array.from({ length: 15 }, (_, i) => `I-${100 + i}`).join(' ');
    const item = withClassification({ ...base, kind: 'k'.repeat(90), title: many, summary: '' });
    expect(item.forms).toHaveLength(10);
    expect(item.kind).toHaveLength(60);
  });
});
