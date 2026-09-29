export const FORM_TYPES = [
  'I-485',
  'I-765',
  'I-131',
  'I-130',
  'I-129',
  'I-140',
  'I-751',
  'I-90',
  'I-539',
  'N-400',
  'N-600',
  'Other',
] as const;

export type FormType = (typeof FORM_TYPES)[number];

export const FORM_NAMES: Record<FormType, string> = {
  'I-485': 'Adjustment of status',
  'I-765': 'Employment authorization',
  'I-131': 'Travel document',
  'I-130': 'Petition for alien relative',
  'I-129': 'Petition for nonimmigrant worker',
  'I-140': 'Immigrant petition for alien worker',
  'I-751': 'Remove conditions on residence',
  'I-90': 'Replace green card',
  'I-539': 'Extend or change nonimmigrant status',
  'N-400': 'Naturalization',
  'N-600': 'Certificate of citizenship',
  Other: 'Other form',
};

/** Normalize form identifiers like "I485", "i-485", or "N400" to "I-485". */
export function normalizeFormType(raw: string | null | undefined): FormType | null {
  if (!raw) return null;
  const m = /^\s*([A-Za-z])\s*-?\s*(\d{2,4})\s*$/.exec(raw);
  if (!m || !m[1] || !m[2]) return null;
  const candidate = `${m[1].toUpperCase()}-${m[2]}`;
  return (FORM_TYPES as readonly string[]).includes(candidate) ? (candidate as FormType) : null;
}

/** Short badge text for a form: "485" for I-485, "N-400" stays readable as "N400". */
export function formBadgeText(form: FormType): string {
  if (form === 'Other') return 'Other';
  const [letter, digits] = form.split('-');
  return letter === 'I' ? (digits ?? form) : `${letter}${digits}`;
}
