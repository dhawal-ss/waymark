import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const fixture = (name: string): string =>
  readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8');

export function idFactory(prefix = 'id'): () => string {
  let n = 0;
  return () => `${prefix}${++n}`;
}

export const NOW = '2025-07-15T12:00:00.000Z';
