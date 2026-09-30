import { describe, expect, it } from 'vitest';
import { isOfficialNewsUrl, sanitizeNewsItem, sanitizeNewsItems } from '../src/index.ts';

const valid = {
  id: 'federal-register:2026-01234',
  source: 'federal-register',
  kind: 'Rule',
  title: 'Example rule',
  summary: 'An example summary.',
  url: 'https://www.federalregister.gov/d/2026-01234',
  publishedOn: '2026-03-02',
  category: 'fees',
  forms: ['I-485', 'N-400'],
};

describe('isOfficialNewsUrl', () => {
  it('accepts https URLs on official domains and their subdomains', () => {
    expect(isOfficialNewsUrl('https://www.uscis.gov/newsroom')).toBe(true);
    expect(isOfficialNewsUrl('https://www.federalregister.gov/d/2026-1')).toBe(true);
    expect(isOfficialNewsUrl('https://travel.state.gov/x')).toBe(true);
  });
  it('rejects other hosts, look-alikes, and non-https', () => {
    expect(isOfficialNewsUrl('http://www.uscis.gov/x')).toBe(false);
    expect(isOfficialNewsUrl('https://uscis.gov.evil.example/x')).toBe(false);
    expect(isOfficialNewsUrl('https://eviluscis.gov.example')).toBe(false);
    expect(isOfficialNewsUrl('javascript:alert(1)')).toBe(false);
    expect(isOfficialNewsUrl(42)).toBe(false);
  });
});

describe('sanitizeNewsItem', () => {
  it('keeps a valid item', () => {
    expect(sanitizeNewsItem(valid)).toEqual(valid);
  });
  it('drops items with a missing title, bad date, bad id, or unofficial link', () => {
    expect(sanitizeNewsItem({ ...valid, title: '  ' })).toBeNull();
    expect(sanitizeNewsItem({ ...valid, publishedOn: '03/02/2026' })).toBeNull();
    expect(sanitizeNewsItem({ ...valid, id: 'other:1' })).toBeNull();
    expect(sanitizeNewsItem({ ...valid, url: 'https://example.com/a' })).toBeNull();
    expect(sanitizeNewsItem(null)).toBeNull();
  });
  it('falls back to other for an unknown category and filters bad form numbers', () => {
    const item = sanitizeNewsItem({ ...valid, category: 'gossip', forms: ['I-485', 'nope', 7] });
    expect(item?.category).toBe('other');
    expect(item?.forms).toEqual(['I-485']);
  });
  it('limits text length', () => {
    const item = sanitizeNewsItem({ ...valid, title: 'a'.repeat(1000), summary: 'b'.repeat(1000) });
    expect(item?.title).toHaveLength(300);
    expect(item?.summary).toHaveLength(400);
  });
});

describe('sanitizeNewsItems', () => {
  it('accepts an array or { items }, drops repeats, and sorts newest first', () => {
    const older = { ...valid, id: 'uscis-feed:a', source: 'uscis-feed', publishedOn: '2026-01-01' };
    const list = [older, valid, valid, { bad: true }];
    expect(sanitizeNewsItems(list).map((i) => i.id)).toEqual([valid.id, older.id]);
    expect(sanitizeNewsItems({ items: list })).toHaveLength(2);
    expect(sanitizeNewsItems('nope')).toEqual([]);
  });
});
