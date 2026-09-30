// Tolerant parser for RSS 2.0, Atom, and RDF (RSS 1.0) feeds, without a DOM so it runs in Workers
// and Node. It reads titles, links, dates, categories, and descriptions, decodes CDATA and
// entities, and strips HTML. Items it cannot use are skipped and reported in plain language.
import { isLocalDate, type LocalDate } from '../dates.ts';
import { isOfficialNewsUrl, type NewsItem } from '../news.ts';
import { plainText, withClassification } from './newsClassify.ts';
import { decodeEntities } from './html.ts';
import { parsePublishedDate } from './processingTimes.ts';

/** Feeds carry a few dozen items; a larger response is read only as far as this. */
const MAX_ITEMS = 200;

/**
 * A short stable hash (FNV-1a, 64 bits, as 16 hex characters) used to build item ids from a guid
 * or link. It only needs to be stable and well spread; it is not a security measure.
 */
export function shortHash(text: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

/** A real date in a sane range, so a typo like year 0026 is reported rather than stored. */
function isPlausible(date: string): boolean {
  return isLocalDate(date) && date >= '1990-01-01' && date <= '2100-12-31';
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * Calendar date of a feed timestamp as written by the source: RFC 822 ("Tue, 03 Mar 2026
 * 14:00:00 EST"), ISO 8601 ("2026-03-03T14:00:00-05:00"), or a plain date. The time zone is
 * ignored on purpose, so the date is the one the publisher printed.
 */
export function parseFeedDate(raw: string): LocalDate | undefined {
  const s = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(s);
  if (iso) {
    const date = `${iso[1]}-${iso[2]}-${iso[3]}`;
    return isPlausible(date) ? date : undefined;
  }
  const rfc = /(?:^|[\s,])(\d{1,2})[\s-]+([A-Za-z]{3,9})\.?[\s-]+(\d{2,4})(?=$|[\s,T])/.exec(s);
  if (rfc) {
    const month = MONTHS.indexOf((rfc[2] ?? '').slice(0, 3).toLowerCase());
    let year = Number(rfc[3]);
    if ((rfc[3] ?? '').length === 2) year += year < 50 ? 2000 : 1900;
    const date = `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${(rfc[1] ?? '').padStart(2, '0')}`;
    return month >= 0 && isPlausible(date) ? date : undefined;
  }
  return parsePublishedDate(s);
}

/** The value of an XML element: CDATA kept as written, other text with entities decoded once. */
function xmlValue(inner: string): string {
  let out = '';
  let last = 0;
  for (const m of inner.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)) {
    const start = m.index ?? 0;
    out += decodeEntities(inner.slice(last, start)) + (m[1] ?? '');
    last = start + m[0].length;
  }
  return out + decodeEntities(inner.slice(last));
}

const NAME_END = '(?![\\w:.-])';
const ANY_PREFIX = '(?:[\\w.-]+:)?';

interface Element {
  attrs: string;
  inner: string;
}

/** First element with this name (a prefix like "dc:" is part of the name), or null. */
function element(block: string, name: string, anyPrefix = false): Element | null {
  const prefix = anyPrefix ? ANY_PREFIX : '';
  const re = new RegExp(
    `<${prefix}${name}${NAME_END}([^>]*?)(?:/>|>([\\s\\S]*?)</${prefix}${name}\\s*>)`,
    'i',
  );
  const m = re.exec(block);
  return m ? { attrs: m[1] ?? '', inner: m[2] ?? '' } : null;
}

/** Like `element`, then the same name under any namespace prefix (`atom:title`, `media:title`). */
function find(block: string, name: string): Element | null {
  return element(block, name) ?? (name.includes(':') ? null : element(block, name, true));
}

function attribute(attrs: string, name: string): string {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(attrs);
  return decodeEntities(m?.[1] ?? m?.[2] ?? '').trim();
}

/** Text of the first of these elements that has any, as plain text. */
function textOfFirst(block: string, names: string[]): string {
  for (const name of names) {
    const el = find(block, name);
    const text = el ? plainText(xmlValue(el.inner)) : '';
    if (text) return text;
  }
  return '';
}

function dateOf(block: string): LocalDate | undefined {
  for (const name of ['pubDate', 'published', 'dc:date', 'dcterms:issued', 'issued', 'updated']) {
    const el = find(block, name);
    const date = el ? parseFeedDate(xmlValue(el.inner)) : undefined;
    if (date) return date;
  }
  return undefined;
}

/** Source text of the first of these elements that has any (HTML is cleaned later). */
function bodyOf(block: string, names: string[]): string {
  for (const name of names) {
    const inner = find(block, name)?.inner ?? '';
    const value = xmlValue(inner);
    if (plainText(value)) return value;
  }
  return '';
}

/** The item's own page: an RSS link, or the alternate link of an Atom entry. */
function linkOf(block: string): string {
  const re = new RegExp(
    `<${ANY_PREFIX}link${NAME_END}([^>]*?)(?:/>|>([\\s\\S]*?)</${ANY_PREFIX}link\\s*>)`,
    'gi',
  );
  for (const m of block.matchAll(re)) {
    const attrs = m[1] ?? '';
    const href = attribute(attrs, 'href');
    if (href) {
      const rel = attribute(attrs, 'rel') || 'alternate';
      if (rel === 'alternate') return href;
    } else if (m[2]) {
      const text = xmlValue(m[2]).replace(/\s+/g, '').trim();
      if (text) return text;
    }
  }
  return '';
}

function categoryOf(block: string): string {
  const el = find(block, 'category');
  if (el) {
    const text = attribute(el.attrs, 'label') || attribute(el.attrs, 'term');
    const value = text || plainText(xmlValue(el.inner));
    if (value) return value;
  }
  return textOfFirst(block, ['dc:subject']);
}

/** An https URL on an official domain: the link as given, or with http changed to https. */
function officialLink(raw: string): string | null {
  const url = raw.trim();
  for (const candidate of [url, url.replace(/^http:\/\//i, 'https://')]) {
    if (isOfficialNewsUrl(candidate)) return candidate;
  }
  return null;
}

function shorter(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}\u2026` : text;
}

/**
 * Items from an RSS 2.0, Atom, or RDF feed. Each item needs a title, a link on an official
 * domain, and a publication date; the rest is optional. The id is `uscis-feed:` plus a hash of the
 * guid (or the link when there is no guid). The kind is the feed category, else "News".
 */
export function parseFeed(xml: string): { items: NewsItem[]; problems: string[] } {
  const items: NewsItem[] = [];
  const problems: string[] = [];
  // Comments are removed, but CDATA is left alone: it may contain "<!--" as text.
  const text = xml
    .replace(/^\ufeff/, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->/g, (m) => (m.startsWith('<!--') ? '' : m));
  const blocks = [
    ...text.matchAll(/<(?:[\w.-]+:)?(item|entry)\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?\1\s*>/gi),
  ];
  if (blocks.length === 0) {
    if (/<html[\s>]/i.test(text)) {
      problems.push('The response is a web page, not an RSS or Atom feed.');
    } else if (/<(?:rss|feed|(?:[\w.-]+:)?RDF)\b/i.test(text)) {
      problems.push('The feed has no items.');
    } else {
      problems.push('The response is not an RSS, Atom, or RDF feed.');
    }
    return { items, problems };
  }
  const seen = new Set<string>();
  for (const match of blocks.slice(0, MAX_ITEMS)) {
    // An Atom entry can carry the feed it was copied from; its title and dates are not the item's.
    const block = (match[2] ?? '').replace(/<source\b[\s\S]*?<\/source>/gi, '');
    const title = textOfFirst(block, ['title', 'dc:title']);
    const label = title ? `"${shorter(title, 60)}"` : 'an item';
    if (!title) {
      problems.push('Skipped a feed item with no title.');
      continue;
    }
    const rawLink = linkOf(block);
    const guid = textOfFirst(block, ['guid', 'id', 'dc:identifier']);
    // Without a link, a guid that is itself an address stands in for it.
    const link = rawLink || (/^https?:\/\//i.test(guid) ? guid : '');
    const url = link ? officialLink(link) : null;
    if (!url) {
      problems.push(
        link
          ? `Skipped ${label}: its link is not an official https address.`
          : `Skipped ${label}: it has no link.`,
      );
      continue;
    }
    const publishedOn = dateOf(block);
    if (!publishedOn) {
      problems.push(`Skipped ${label}: its publication date is missing or invalid.`);
      continue;
    }
    const id = `uscis-feed:${shortHash(guid || url)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push(
      withClassification({
        id,
        source: 'uscis-feed',
        kind: categoryOf(block) || 'News',
        title,
        summary: bodyOf(block, [
          'description',
          'summary',
          'content:encoded',
          'content',
          'dc:description',
        ]),
        url,
        publishedOn,
      }),
    );
  }
  return { items, problems };
}
