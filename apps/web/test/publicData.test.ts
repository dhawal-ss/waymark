import { describe, expect, it } from 'vitest';
import { officialUrl } from '../src/lib/publicData';

describe('officialUrl', () => {
  const FALLBACK = 'https://www.uscis.gov/';

  it('accepts official https domains and their subdomains', () => {
    for (const url of [
      'https://www.uscis.gov/i-485',
      'https://travel.state.gov/content/x',
      'https://www.federalregister.gov/documents/2026/09/28/2026-18211/x',
      'https://federalregister.gov/d/2026-18211',
      'https://www.govinfo.gov/content/pkg/FR-2026-09-28/pdf/2026-18211.pdf',
      'https://www.dhs.gov/news/2026/09/28/x',
    ])
      expect(officialUrl(url, FALLBACK)).toBe(url);
  });

  it('falls back for other domains, look-alikes, other schemes, and junk', () => {
    for (const url of [
      'http://www.federalregister.gov/x',
      'https://federalregister.gov.evil.example/x',
      'https://evilfederalregister.gov/x',
      'https://dhs.gov.example.com/',
      'https://example.com/govinfo.gov',
      'javascript:alert(1)',
      'not a url',
      '',
      null,
      undefined,
    ])
      expect(officialUrl(url, FALLBACK)).toBe(FALLBACK);
  });
});
