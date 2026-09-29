// Fails when the JS loaded by index.html exceeds the gzipped budget.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 80;
const dist = 'apps/web/dist';
const indexPath = join(dist, 'index.html');
if (!existsSync(indexPath)) {
  console.error('apps/web/dist/index.html not found. Run pnpm build first.');
  process.exit(1);
}

const html = readFileSync(indexPath, 'utf8');
const refs = new Set();
for (const m of html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)) refs.add(m[1]);
for (const m of html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+\.js)"/g))
  refs.add(m[1]);
for (const m of html.matchAll(/<link[^>]+href="([^"]+\.js)"[^>]+rel="modulepreload"/g))
  refs.add(m[1]);

let total = 0;
for (const ref of refs) {
  const size = gzipSync(readFileSync(join(dist, ref.replace(/^\//, '')))).length;
  total += size;
  console.log(`${(size / 1024).toFixed(1).padStart(7)} KB  ${ref}`);
}
const cssRefs = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+\.css)"/g)].map(
  (m) => m[1],
);
for (const ref of cssRefs) {
  const size = gzipSync(readFileSync(join(dist, ref.replace(/^\//, '')))).length;
  console.log(`${(size / 1024).toFixed(1).padStart(7)} KB  ${ref} (css, not counted)`);
}

const totalKb = total / 1024;
console.log(`Initial JS: ${totalKb.toFixed(1)} KB gzipped (budget ${BUDGET_KB} KB).`);
if (totalKb > BUDGET_KB) {
  console.error(`Initial JS is over budget by ${(totalKb - BUDGET_KB).toFixed(1)} KB.`);
  process.exit(1);
}
