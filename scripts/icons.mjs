// Regenerates apps/web/src/lib/ui/icons.ts from @material-symbols/svg-400 (Apache License 2.0).
// Add a name to NAMES, then run: node scripts/icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const NAMES = [
  'folder',
  'folder-fill',
  'monitoring',
  'monitoring-fill',
  'newspaper',
  'newspaper-fill',
  'handyman',
  'handyman-fill',
  'settings',
  'settings-fill',
  'add',
  'close',
  'check',
  'keyboard_arrow_down',
  'arrow_drop_down',
  'more_vert',
  'edit',
  'delete',
  'content_copy',
  'sync',
  'content_paste',
  'upload_file',
  'event',
  'undo',
  'arrow_back',
  'info',
  'palette',
  'contrast',
  'light_mode',
  'dark_mode',
  'error',
  'check_circle',
  'schedule',
  'upload',
  'download',
  'chevron_right',
  'table_chart',
  'show_chart',
  'description',
  'fact_check',
  'calculate',
  'open_in_new',
  'visibility',
  'visibility_off',
  'search',
  'link',
  'calendar_add_on',
  'mobile_arrow_down',
  'share',
  'mail',
  'pending',
  'keyboard_arrow_up',
];

// Icons used only by the lazy-loaded Updates feed. They live in their own file so they stay out of
// the initial JS bundle.
const FEED_NAMES = [
  'payments',
  'description',
  'gavel',
  'schedule',
  'public',
  'flag',
  'volunteer_activism',
  'work',
  'shield',
  'article',
];

const require = createRequire(import.meta.url);
const root = join(dirname(require.resolve('@material-symbols/svg-400/package.json')), 'rounded');

const pathLines = (names) =>
  names.map((name) => {
    const svg = readFileSync(join(root, `${name}.svg`), 'utf8');
    const paths = [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
    if (paths.length !== 1) throw new Error(`${name}: expected one path, found ${paths.length}`);
    return `  ${name.replace(/-fill$/, '_fill')}: '${paths[0]}',`;
  });
const lines = pathLines(NAMES);

const out = `// Material Symbols Rounded, weight 400 (Apache License 2.0, Google).
// Path data uses viewBox="0 -960 960 960". Regenerate with scripts/icons.mjs.
export const ICONS = {
${lines.join('\n')}
} as const;

export type IconName = keyof typeof ICONS;
`;
writeFileSync('apps/web/src/lib/ui/icons.ts', out);
console.log(`Wrote ${NAMES.length} icons.`);

const feedOut = `// Material Symbols Rounded, weight 400 (Apache License 2.0, Google), for the Updates feed.
// Path data uses viewBox="0 -960 960 960". Regenerate with scripts/icons.mjs.
export const FEED_ICONS = {
${pathLines(FEED_NAMES).join('\n')}
} as const;

export type FeedIconName = keyof typeof FEED_ICONS;
`;
writeFileSync('apps/web/src/routes/updates/feedIcons.ts', feedOut);
console.log(`Wrote ${FEED_NAMES.length} feed icons.`);
