import { describe, expect, it } from 'vitest';
import {
  federalRegisterUrl,
  isOfficialNewsUrl,
  parseFederalRegister,
  parseFeed,
  parseFeedDate,
  sanitizeNewsItems,
  shortHash,
} from '../src/index.ts';
import { fixture } from './helpers.ts';

const BOM = String.fromCharCode(0xfeff);

describe('federalRegisterUrl', () => {
  it('builds the documents request for USCIS with only the fields Waymark reads', () => {
    const url = new URL(federalRegisterUrl('https://www.federalregister.gov'));
    expect(url.origin + url.pathname).toBe('https://www.federalregister.gov/api/v1/documents.json');
    expect(url.searchParams.getAll('conditions[agencies][]')).toEqual([
      'u-s-citizenship-and-immigration-services',
    ]);
    expect(url.searchParams.get('order')).toBe('newest');
    expect(url.searchParams.get('per_page')).toBe('50');
    expect(url.searchParams.getAll('fields[]')).toEqual([
      'document_number',
      'title',
      'abstract',
      'html_url',
      'publication_date',
      'type',
    ]);
  });

  it('ignores a trailing slash on the base', () => {
    expect(federalRegisterUrl('https://www.federalregister.gov/')).toBe(
      federalRegisterUrl('https://www.federalregister.gov'),
    );
  });
});

describe('parseFederalRegister', () => {
  const parsed = parseFederalRegister(JSON.parse(fixture('federal-register.json')));

  it('reads valid documents in order and skips bad entries with a plain-language reason', () => {
    expect(parsed.items.map((i) => i.id)).toEqual([
      'federal-register:2026-00311',
      'federal-register:2026-00280',
      'federal-register:2026-00195',
      'federal-register:2026-00144',
      'federal-register:2026-00090',
    ]);
    expect(parsed.problems).toEqual([
      'Skipped Federal Register document 2026-00045: its publication date is missing or invalid.',
      'Skipped Federal Register document 2026-00012: its link is not an official https address.',
    ]);
  });

  it('keeps the published type as the kind and the publication date', () => {
    expect(parsed.items.map((i) => [i.kind, i.publishedOn])).toEqual([
      ['Proposed Rule', '2026-03-02'],
      ['Notice', '2026-02-27'],
      ['Notice', '2026-02-20'],
      ['Rule', '2026-02-12'],
      ['Rule', '2026-02-03'],
    ]);
    expect(parsed.items.every((i) => i.source === 'federal-register')).toBe(true);
    expect(parsed.items.every((i) => isOfficialNewsUrl(i.url))).toBe(true);
  });

  it('classifies each document and extracts form numbers', () => {
    expect(parsed.items.map((i) => [i.category, i.forms])).toEqual([
      ['fees', []],
      ['forms', ['I-485', 'I-693']],
      ['humanitarian', []],
      ['work', []],
      ['policy', []],
    ]);
  });

  it('uses an empty summary for a null abstract and the source text otherwise', () => {
    expect(parsed.items[2]!.summary).toBe('');
    expect(parsed.items[4]!.summary).toBe(
      'This rule makes technical corrections to filing procedures. It does not change eligibility.',
    );
    // The long abstract is cut at a sentence end and adds nothing of its own.
    const fees = parsed.items[0]!.summary;
    expect(fees.length).toBeLessThanOrEqual(280);
    expect(
      'The Department of Homeland Security proposes to adjust the fee schedule for certain immigration benefit requests. The proposal would change how fees are set for several forms. Comments are due by the date shown in the notice.'.startsWith(
        fees.replace(/…$/, ''),
      ),
    ).toBe(true);
  });

  it('produces items the app accepts unchanged', () => {
    expect(sanitizeNewsItems({ items: parsed.items })).toHaveLength(parsed.items.length);
    for (const item of parsed.items) {
      expect(item.summary.length).toBeLessThanOrEqual(400);
    }
  });

  it('reports a response that is not a document list', () => {
    expect(parseFederalRegister(null).problems).toEqual([
      'The Federal Register response was not a JSON object.',
    ]);
    expect(parseFederalRegister({ results: 'nope' }).problems).toEqual([
      'The Federal Register response has no list of documents (results).',
    ]);
  });

  it('treats the empty answer without results as no documents, not a problem', () => {
    expect(parseFederalRegister({ count: 0, description: 'none', total_pages: 0 })).toEqual({
      items: [],
      problems: [],
    });
  });

  it('skips entries with no title, no usable number, or that are not objects', () => {
    const doc = {
      document_number: '2026-1',
      title: 'A notice',
      html_url: 'https://www.federalregister.gov/d/2026-1',
      publication_date: '2026-01-05',
      type: 'Notice',
    };
    const { items, problems } = parseFederalRegister({
      results: [
        doc,
        { ...doc, document_number: '2026-2', title: '  ' },
        { ...doc, document_number: 'bad number' },
        { ...doc, document_number: '2026-3', publication_date: '2026-13-40' },
        { ...doc, document_number: '2026-4', publication_date: '2026-01-05T10:00:00Z' },
        { ...doc },
        'text',
      ],
    });
    expect(items.map((i) => i.id)).toEqual(['federal-register:2026-1', 'federal-register:2026-4']);
    expect(problems).toEqual([
      'Skipped Federal Register document 2026-2: it has no title.',
      'Skipped a Federal Register entry with no usable document number.',
      'Skipped Federal Register document 2026-3: its publication date is missing or invalid.',
      'Skipped a Federal Register entry that is not a document.',
    ]);
  });

  it('cleans markup in titles and abstracts', () => {
    const { items } = parseFederalRegister({
      results: [
        {
          document_number: '2026-9',
          title: 'Rules for <em>H-1B</em> &amp; L-1',
          abstract: '<p>Applies to Form I-129.</p>',
          html_url: 'https://www.federalregister.gov/d/2026-9',
          publication_date: '2026-01-05',
          type: 'Rule',
        },
      ],
    });
    expect(items[0]).toMatchObject({
      title: 'Rules for H-1B & L-1',
      summary: 'Applies to Form I-129.',
      forms: ['I-129'],
      category: 'work',
    });
  });
});

describe('shortHash and parseFeedDate', () => {
  it('gives a stable 16 character hex hash', () => {
    expect(shortHash('abc')).toBe(shortHash('abc'));
    expect(shortHash('abc')).not.toBe(shortHash('abd'));
    expect(shortHash('')).toBe('cbf29ce484222325');
    expect(shortHash('a')).toBe('af63dc4c8601ec8c');
    expect(shortHash('café')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('reads RFC 822, ISO 8601, and plain dates as the publisher wrote them', () => {
    expect(parseFeedDate('Tue, 03 Mar 2026 09:30:00 -0500')).toBe('2026-03-03');
    expect(parseFeedDate('Tue, 03 Mar 2026 23:30:00 -0500')).toBe('2026-03-03');
    expect(parseFeedDate('3 March 2026')).toBe('2026-03-03');
    expect(parseFeedDate('Fri, 6 Mar 26 10:00 GMT')).toBe('2026-03-06');
    expect(parseFeedDate('2026-03-03T23:30:00-05:00')).toBe('2026-03-03');
    expect(parseFeedDate('2026-03-03')).toBe('2026-03-03');
    expect(parseFeedDate('March 3, 2026')).toBe('2026-03-03');
    expect(parseFeedDate('03/03/2026')).toBe('2026-03-03');
  });

  it('rejects impossible or implausible dates', () => {
    for (const bad of ['', 'soon', '2026-02-30', '31 Feb 2026', '2026-13-01', '0026-03-03']) {
      expect(parseFeedDate(bad)).toBeUndefined();
    }
  });
});

describe('parseFeed: RSS 2.0', () => {
  const parsed = parseFeed(fixture('uscis-news.rss'));

  it('reads valid items and reports the ones it skips', () => {
    expect(parsed.items.map((i) => i.title)).toEqual([
      "Beware of scams that use the agency's name & logo",
      'Form I-765 & Form I-131 get new editions',
      'Update on the U.S. Department of State Visa Bulletin',
      'Item with no description',
    ]);
    expect(parsed.problems).toEqual([
      'Skipped "Item without a date": its publication date is missing or invalid.',
      'Skipped "Item from another site": its link is not an official https address.',
    ]);
  });

  it('decodes CDATA, entities, and HTML in descriptions', () => {
    expect(parsed.items[0]!.summary).toBe(
      'Callers may impersonate officials and ask for payment. Read the scam guidance. Second paragraph.',
    );
    expect(parsed.items[1]!.summary).toBe(
      'USCIS released a new edition of Form I-765 and Form I-131. Older editions are accepted until the date shown.',
    );
    expect(parsed.items[2]!.summary).toBe(
      'Don’t miss this: the chart for filing changes… See the bulletin for details.',
    );
    expect(parsed.items[3]!.summary).toBe('');
  });

  it('uses the source dates, trims links, and upgrades an http link on an official host', () => {
    expect(parsed.items.map((i) => i.publishedOn)).toEqual([
      '2026-03-03',
      '2026-03-02',
      '2026-02-27',
      '2026-02-25',
    ]);
    expect(parsed.items.map((i) => i.url)).toEqual([
      'https://www.uscis.gov/newsroom/alerts/beware-of-scams',
      'https://www.uscis.gov/newsroom/news-releases/new-form-editions',
      'https://www.uscis.gov/newsroom/alerts/visa-bulletin-update',
      'https://www.uscis.gov/newsroom/no-description',
    ]);
  });

  it('takes the kind from the feed category, else News', () => {
    expect(parsed.items.map((i) => i.kind)).toEqual(['Alert', 'News release', 'News', 'News']);
  });

  it('classifies items and extracts forms', () => {
    expect(parsed.items.map((i) => [i.category, i.forms])).toEqual([
      ['safety', []],
      ['forms', ['I-131', 'I-765']],
      ['visa', []],
      ['other', []],
    ]);
  });

  it('builds stable ids from the guid, or from the link when there is no guid', () => {
    const ids = parsed.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(4);
    for (const id of ids) expect(id).toMatch(/^uscis-feed:[0-9a-f]{16}$/);
    expect(ids[0]).toBe(`uscis-feed:${shortHash('1001 at https://www.uscis.gov')}`);
    expect(ids[1]).toBe(
      `uscis-feed:${shortHash('https://www.uscis.gov/newsroom/news-releases/new-form-editions')}`,
    );
    expect(parseFeed(fixture('uscis-news.rss')).items.map((i) => i.id)).toEqual(ids);
  });

  it('produces items the app accepts unchanged', () => {
    expect(sanitizeNewsItems({ items: parsed.items })).toHaveLength(parsed.items.length);
    expect(parsed.items.every((i) => i.source === 'uscis-feed')).toBe(true);
  });
});

describe('parseFeed: Atom', () => {
  const parsed = parseFeed(fixture('uscis-updates.atom'));

  it('reads entries, the alternate link, categories, and both text kinds', () => {
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]).toMatchObject({
      title: 'Updated instructions for Form N-400',
      url: 'https://www.uscis.gov/forms/updates/n-400-instructions?a=1&b=2',
      publishedOn: '2026-03-01',
      kind: 'Forms update',
      summary: 'The instructions for Form N-400 were revised to clarify the civics test section.',
      forms: ['N-400'],
      category: 'citizenship',
    });
    expect(parsed.items[0]!.id).toBe(
      `uscis-feed:${shortHash('tag:uscis.gov,2026:n-400-instructions')}`,
    );
    // No published date: the updated date is used. A link element with only href is read.
    expect(parsed.items[1]).toMatchObject({
      title: 'Processing time page updated',
      url: 'https://www.uscis.gov/processing-times',
      publishedOn: '2026-02-24',
      kind: 'News',
      summary: 'Processing times were refreshed. Check the tool.',
      category: 'processing',
    });
  });

  it('ignores the source element and reports an invalid date', () => {
    expect(parsed.items.map((i) => i.title)).not.toContain(
      'Original feed title that is not the item title',
    );
    expect(parsed.problems).toEqual([
      'Skipped "Entry with an invalid date": its publication date is missing or invalid.',
    ]);
  });
});

describe('parseFeed: RDF and edge cases', () => {
  const rdf = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel rdf:about="https://www.uscis.gov/feed"><title>Feed</title><items><rdf:Seq><rdf:li rdf:resource="https://www.uscis.gov/a"/></rdf:Seq></items></channel>
  <item rdf:about="https://www.uscis.gov/a">
    <title>TPS re-registration opens</title>
    <link>https://www.uscis.gov/a</link>
    <description>Holders of TPS can re-register.</description>
    <dc:date>2026-03-04T12:00:00Z</dc:date>
    <dc:subject>Humanitarian</dc:subject>
  </item>
</rdf:RDF>`;

  it('reads RDF items with dc:date and dc:subject', () => {
    const { items, problems } = parseFeed(rdf);
    expect(problems).toEqual([]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: 'TPS re-registration opens',
      publishedOn: '2026-03-04',
      kind: 'Humanitarian',
      category: 'humanitarian',
      summary: 'Holders of TPS can re-register.',
    });
  });

  it('reads namespaced item tags and uses the link as the id when there is no guid', () => {
    const xml = `<feed><atom:entry><atom:title>Hi</atom:title><atom:link href="https://www.uscis.gov/x"/><atom:updated>2026-01-02T00:00:00Z</atom:updated></atom:entry></feed>`;
    const { items } = parseFeed(xml);
    expect(items[0]).toMatchObject({ title: 'Hi', url: 'https://www.uscis.gov/x' });
    expect(items[0]!.id).toBe(`uscis-feed:${shortHash('https://www.uscis.gov/x')}`);
  });

  it('uses a guid that is an address when the item has no link', () => {
    const xml = `<rss><channel><item><title>Only a guid</title><guid>https://www.uscis.gov/g</guid><pubDate>Mon, 02 Mar 2026 10:00:00 GMT</pubDate></item></channel></rss>`;
    expect(parseFeed(xml).items[0]!.url).toBe('https://www.uscis.gov/g');
  });

  it('reports an item with no link or no title', () => {
    const xml = `<rss><channel>
      <item><title>No link</title><pubDate>Mon, 02 Mar 2026 10:00:00 GMT</pubDate></item>
      <item><link>https://www.uscis.gov/t</link><pubDate>Mon, 02 Mar 2026 10:00:00 GMT</pubDate></item>
    </channel></rss>`;
    const { items, problems } = parseFeed(xml);
    expect(items).toEqual([]);
    expect(problems).toEqual([
      'Skipped "No link": it has no link.',
      'Skipped a feed item with no title.',
    ]);
  });

  it('rejects look-alike hosts, other schemes, and unofficial sites', () => {
    const item = (link: string) =>
      `<rss><channel><item><title>T</title><link>${link}</link><pubDate>Mon, 02 Mar 2026 10:00:00 GMT</pubDate></item></channel></rss>`;
    for (const link of [
      'https://uscis.gov.evil.example/a',
      'https://www.uscis.gov.example.com/a',
      'ftp://www.uscis.gov/a',
      'javascript:alert(1)',
      'http://example.com/a',
      '/relative/path',
    ]) {
      const { items, problems } = parseFeed(item(link));
      expect([link, items.length]).toEqual([link, 0]);
      expect(problems).toHaveLength(1);
    }
    expect(parseFeed(item('https://www.federalregister.gov/d/1')).items).toHaveLength(1);
  });

  it('accepts CDATA in titles and links, and ignores comments and a byte order mark', () => {
    const xml = `${BOM}<rss><channel><!-- <item><title>Hidden</title></item> --><item><title><![CDATA[Fish &amp; <b>chips</b>]]></title><link><![CDATA[https://www.uscis.gov/c]]></link><pubDate>Mon, 02 Mar 2026 10:00:00 GMT</pubDate><description><![CDATA[<!-- note --><p>Kept</p>]]></description></item></channel></rss>`;
    const { items } = parseFeed(xml);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: 'Fish & chips',
      url: 'https://www.uscis.gov/c',
      summary: 'Kept',
    });
  });

  it('drops repeated items and reads only the first of a very long feed', () => {
    const one = (n: number) =>
      `<item><title>T${n}</title><guid>g${n % 3}</guid><link>https://www.uscis.gov/${n}</link><pubDate>Mon, 02 Mar 2026 10:00:00 GMT</pubDate></item>`;
    const xml = `<rss><channel>${[0, 1, 2, 3, 4, 5].map(one).join('')}</channel></rss>`;
    expect(parseFeed(xml).items.map((i) => i.title)).toEqual(['T0', 'T1', 'T2']);
    const many = `<rss><channel>${Array.from({ length: 300 }, (_, i) => one(i).replace(/g\d/, `u${i}`)).join('')}</channel></rss>`;
    expect(parseFeed(many).items).toHaveLength(200);
  });

  it('explains input that is not a feed', () => {
    expect(parseFeed('<html><body>Blocked</body></html>').problems).toEqual([
      'The response is a web page, not an RSS or Atom feed.',
    ]);
    expect(parseFeed('<rss><channel><title>x</title></channel></rss>').problems).toEqual([
      'The feed has no items.',
    ]);
    expect(parseFeed('{"not":"xml"}').problems).toEqual([
      'The response is not an RSS, Atom, or RDF feed.',
    ]);
    expect(parseFeed('').items).toEqual([]);
  });

  it('does not throw on truncated or malformed markup', () => {
    for (const xml of [
      '<rss><channel><item><title>Cut off',
      '<item><title>a</title><link>https://www.uscis.gov/a</link>',
      '<entry><link href="https://www.uscis.gov/a"><title>x</title></entry>',
      '<![CDATA[ unclosed',
    ]) {
      expect(() => parseFeed(xml)).not.toThrow();
    }
  });
});
