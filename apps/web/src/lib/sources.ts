// Official public sources only. Links go to USCIS, the Federal Register, and the State Department.
import type { FormType } from '@waymark/core';

export type SourceGroup = 'policy' | 'data' | 'bulletin' | 'forms';

export const GROUP_LABELS: Record<SourceGroup, string> = {
  policy: 'Policy',
  data: 'Data',
  bulletin: 'Visa Bulletin',
  forms: 'Forms',
};

export interface Source {
  id: string;
  name: string;
  description: string;
  url: string;
  group: SourceGroup;
}

export const SOURCES: Source[] = [
  {
    id: 'newsroom',
    name: 'USCIS newsroom',
    description: 'Alerts, announcements, and policy updates.',
    url: 'https://www.uscis.gov/newsroom',
    group: 'policy',
  },
  {
    id: 'news-releases',
    name: 'USCIS news releases',
    description: 'Formal announcements of rule changes and programs.',
    url: 'https://www.uscis.gov/newsroom/news-releases',
    group: 'policy',
  },
  {
    id: 'federal-register',
    name: 'Federal Register: USCIS',
    description: 'Proposed and final rules, notices, and fee rules.',
    url: 'https://www.federalregister.gov/agencies/u-s-citizenship-and-immigration-services',
    group: 'policy',
  },
  {
    id: 'processing-times',
    name: 'Processing times',
    description: 'Published times by form, category, and office.',
    url: 'https://egov.uscis.gov/processing-times/',
    group: 'data',
  },
  {
    id: 'case-status',
    name: 'Case status online',
    description: 'Official status for a receipt number.',
    url: 'https://egov.uscis.gov/',
    group: 'data',
  },
  {
    id: 'developer-portal',
    name: 'USCIS developer portal',
    description: 'Official APIs, including the Case Status API.',
    url: 'https://developer.uscis.gov/',
    group: 'data',
  },
  {
    id: 'visa-bulletin',
    name: 'Visa Bulletin',
    description: 'Monthly cutoff dates from the State Department.',
    url: 'https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin.html',
    group: 'bulletin',
  },
  {
    id: 'fee-schedule',
    name: 'Fee schedule (G-1055)',
    description: 'Current filing fees for every form.',
    url: 'https://www.uscis.gov/g-1055',
    group: 'forms',
  },
  {
    id: 'forms',
    name: 'All forms',
    description: 'Current editions and instructions.',
    url: 'https://www.uscis.gov/forms/all-forms',
    group: 'forms',
  },
];

/** Form page on uscis.gov, for example https://www.uscis.gov/i-485. */
export function formPageUrl(form: FormType): string | null {
  return form === 'Other' ? null : `https://www.uscis.gov/${form.toLowerCase()}`;
}
