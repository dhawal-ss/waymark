// Writes the app icon SVG and renders PNG sizes with Playwright's Chromium.
// Run: node scripts/render-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = 'apps/web/public/icons';
const BG = '#00504a';
const SHAPE = '#70f8e4';
const MARK = '#00201c';

function scallop(cx, cy, r, lobes, depth, samples = 240) {
  let d = '';
  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * Math.PI * 2;
    const rr = r * (1 - depth + depth * Math.cos(lobes * t));
    const x = cx + rr * Math.cos(t - Math.PI / 2);
    const y = cy + rr * Math.sin(t - Math.PI / 2);
    d += `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return `${d}Z`;
}

// A waymark: a trail marker post with a flag.
function icon(size, { maskable = false } = {}) {
  const c = size / 2;
  const r = maskable ? size * 0.3 : size * 0.4;
  const s = r / 100;
  const mark = `<g transform="translate(${c - 34 * s} ${c - 52 * s}) scale(${s})" fill="${MARK}">
    <rect x="0" y="0" width="14" height="104" rx="7"/>
    <path d="M10 6h50c6 0 9 7 5 12l-9 11 9 11c4 5 1 12-5 12H10z"/>
  </g>`;
  const radius = maskable ? 0 : size * 0.22;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${BG}"/>
  <path d="${scallop(c, c, r, 12, 0.06)}" fill="${SHAPE}"/>
  ${mark}
</svg>
`;
}

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/icon.svg`, icon(512));

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const page = await browser.newPage();
for (const [name, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}</style>${icon(size, { maskable })}`,
  );
  await page.locator('svg').screenshot({ path: `${OUT}/${name}`, omitBackground: true });
}
await browser.close();
console.log('Wrote icons to', OUT);
