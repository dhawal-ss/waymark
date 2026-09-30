// Encryption at rest for receipt numbers and case data (AES-256-GCM), keyed hashing for lookup
// (HMAC-SHA-256), and hashing for account tokens and change detection (SHA-256).

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromBase64(value: string): Uint8Array {
  const s = atob(value);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const toHex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

/** URL-safe random token with 256 bits of entropy. */
export function randomToken(bytes = 32): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return toBase64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomId(prefix: string): string {
  return `${prefix}_${randomToken(12)}`;
}

export interface Sealer {
  encrypt(plaintext: string): Promise<string>;
  decrypt(sealed: string): Promise<string>;
  /** Deterministic keyed hash for lookups. */
  hmac(value: string): Promise<string>;
}

export async function createSealer(encKeyB64: string, hmacKeyB64: string): Promise<Sealer> {
  const decode = (value: string) => {
    try {
      return fromBase64(value || '');
    } catch {
      return new Uint8Array(0);
    }
  };
  const encBytes = decode(encKeyB64);
  const hmacBytes = decode(hmacKeyB64);
  if (encBytes.length !== 32) throw new Error('RECEIPT_ENC_KEY must be base64 of 32 bytes.');
  if (hmacBytes.length < 32)
    throw new Error('RECEIPT_HMAC_KEY must be base64 of at least 32 bytes.');
  const aes = await crypto.subtle.importKey('raw', encBytes, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
  const mac = await crypto.subtle.importKey(
    'raw',
    hmacBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return {
    async encrypt(plaintext) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, enc.encode(plaintext));
      return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(ct))}`;
    },
    async decrypt(sealed) {
      const [version, ivB64, ctB64] = sealed.split('.');
      if (version !== 'v1' || !ivB64 || !ctB64) throw new Error('Unknown sealed format');
      const pt = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromBase64(ivB64) },
        aes,
        fromBase64(ctB64),
      );
      return dec.decode(pt);
    },
    async hmac(value) {
      return toHex(await crypto.subtle.sign('HMAC', mac, enc.encode(value)));
    },
  };
}
