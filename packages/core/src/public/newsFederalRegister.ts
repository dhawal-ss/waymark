// Parser for the Federal Register API (https://www.federalregister.gov/developers/documentation/api/v1),
// the official record of USCIS rules, proposed rules, and notices. Only documented fields are read.
import { isLocalDate } from '../dates.ts';
import { isOfficialNewsUrl, type NewsItem } from '../news.ts';
import { asString, isObj } from '../sanitize.ts';
import { plainText, withClassification } from './newsClassify.ts';

const AGENCY = 'u-s-citizenship-and-immigration-services';
const FIELDS = [
  'document_number',
  'title',
  'abstract',
  'html_url',
  'publication_date',
  'type',
] as const;

/** Request for the newest documents published by USCIS, with only the fields Waymark reads. */
export function federalRegisterUrl(base: string): string {
  const url = new URL(`${base.replace(/\/+$/, '')}/api/v1/documents.json`);
  url.searchParams.append('conditions[agencies][]', AGENCY);
  url.searchParams.append('order', 'newest');
  url.searchParams.append('per_page', '50');
  for (const field of FIELDS) url.searchParams.append('fields[]', field);
  return url.toString();
}

function publicationDate(value: unknown): string | null {
  const s = asString(value).trim();
  const day = s.slice(0, 10);
  return isLocalDate(day) && (s.length === 10 || s[10] === 'T') ? day : null;
}

/**
 * Items from a `documents.json` response. Entries without a title, an official link, or a valid
 * publication date are skipped and reported in plain language. `abstract` may be null, which gives
 * an empty summary.
 */
export function parseFederalRegister(json: unknown): { items: NewsItem[]; problems: string[] } {
  const items: NewsItem[] = [];
  const problems: string[] = [];
  if (!isObj(json)) {
    return { items, problems: ['The Federal Register response was not a JSON object.'] };
  }
  if (!Array.isArray(json.results)) {
    // The API leaves out "results" when nothing matches and reports count 0.
    if (json.count !== 0) {
      problems.push('The Federal Register response has no list of documents (results).');
    }
    return { items, problems };
  }
  const seen = new Set<string>();
  for (const entry of json.results) {
    if (!isObj(entry)) {
      problems.push('Skipped a Federal Register entry that is not a document.');
      continue;
    }
    const number = asString(entry.document_number).trim();
    const label = number ? `document ${number}` : 'an entry';
    if (!/^[\w.-]{1,100}$/.test(number)) {
      problems.push('Skipped a Federal Register entry with no usable document number.');
      continue;
    }
    const title = plainText(asString(entry.title));
    if (!title) {
      problems.push(`Skipped Federal Register ${label}: it has no title.`);
      continue;
    }
    const url = asString(entry.html_url).trim();
    if (!isOfficialNewsUrl(url)) {
      problems.push(
        `Skipped Federal Register ${label}: its link is not an official https address.`,
      );
      continue;
    }
    const publishedOn = publicationDate(entry.publication_date);
    if (!publishedOn) {
      problems.push(
        `Skipped Federal Register ${label}: its publication date is missing or invalid.`,
      );
      continue;
    }
    const id = `federal-register:${number}`;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push(
      withClassification({
        id,
        source: 'federal-register',
        kind: asString(entry.type),
        title,
        summary: asString(entry.abstract),
        url,
        publishedOn,
      }),
    );
  }
  return { items, problems };
}
