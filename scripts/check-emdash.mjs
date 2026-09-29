// Fails when any tracked or new text file contains an em dash (U+2014).
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const BINARY = /\.(woff2?|ttf|otf|png|jpe?g|gif|webp|ico|avif|pdf|zip|gz)$/i;
const EM_DASH = String.fromCharCode(0x2014);

const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
  encoding: 'utf8',
})
  .split('\0')
  .filter((f) => f && !BINARY.test(f) && existsSync(f));

const hits = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  if (!text.includes(EM_DASH)) continue;
  text.split('\n').forEach((line, i) => {
    if (line.includes(EM_DASH)) hits.push(`${file}:${i + 1}: ${line.trim().slice(0, 120)}`);
  });
}

if (hits.length > 0) {
  console.error(
    `Found ${hits.length} em dash (U+2014) occurrence(s). Replace with a comma, colon, or parentheses:`,
  );
  for (const hit of hits) console.error(`  ${hit}`);
  process.exit(1);
}
console.log(`No em dashes in ${files.length} files.`);
