// Receipt numbers: 3 letters (the filing location prefix) and 10 digits.

export const RECEIPT_PATTERN = /^[A-Z]{3}\d{10}$/;

/** Strip everything except letters and digits and uppercase the result. */
export function normalizeReceipt(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export function isValidReceipt(value: unknown): value is string {
  return typeof value === 'string' && RECEIPT_PATTERN.test(value);
}

export const RECEIPT_PREFIXES: Record<string, string> = {
  EAC: 'Vermont Service Center',
  WAC: 'California Service Center',
  LIN: 'Nebraska Service Center',
  SRC: 'Texas Service Center',
  NBC: 'National Benefits Center',
  MSC: 'National Benefits Center',
  IOE: 'Online filing',
  YSC: 'Potomac Service Center',
};

/** Where a receipt prefix says the case started, or null for unknown prefixes. */
export function prefixCenter(receipt: string): string | null {
  const prefix = normalizeReceipt(receipt).slice(0, 3);
  return RECEIPT_PREFIXES[prefix] ?? null;
}

/** Short hint for the add case form. The prefix shows where the case started, not where it is now. */
export function prefixHint(raw: string): string | null {
  const receipt = normalizeReceipt(raw);
  if (receipt.length < 3) return null;
  const center = prefixCenter(receipt);
  const prefix = receipt.slice(0, 3);
  if (!center) return `${prefix} is not a known prefix. Check the receipt notice.`;
  return `${prefix}: ${center}. The prefix shows where the case started, not where it is now.`;
}

export type ReceiptCheck =
  { ok: true; receipt: string } | { ok: false; receipt: string; error: string };

/** Validate a receipt entered by the user. `existing` holds receipts of other cases. */
export function checkReceipt(raw: string, existing: readonly string[]): ReceiptCheck {
  const receipt = normalizeReceipt(raw);
  if (!receipt) return { ok: false, receipt, error: 'Enter a receipt number.' };
  if (!RECEIPT_PATTERN.test(receipt)) {
    return {
      ok: false,
      receipt,
      error: 'Enter 3 letters and 10 digits, for example IOE0123456789.',
    };
  }
  if (existing.includes(receipt)) {
    return { ok: false, receipt, error: 'A case with this receipt number already exists.' };
  }
  return { ok: true, receipt };
}

/** Hide all but the last 4 digits. */
export function maskReceipt(receipt: string): string {
  return `${'•'.repeat(Math.max(0, receipt.length - 4))}${receipt.slice(-4)}`;
}
