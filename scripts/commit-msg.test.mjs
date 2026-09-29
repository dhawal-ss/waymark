// Tests for .githooks/commit-msg. Run: pnpm test:scripts
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

function run(message) {
  const file = join(mkdtempSync(join(tmpdir(), 'waymark-hook-')), 'MSG');
  writeFileSync(file, message);
  const result = spawnSync('sh', ['.githooks/commit-msg', file], { encoding: 'utf8' });
  return { code: result.status, text: readFileSync(file, 'utf8'), stderr: result.stderr };
}

test('strips AI attribution lines and keeps human co-authors', () => {
  const { code, text } = run(
    [
      'Add receipt parser',
      '',
      'Body.',
      '',
      'Co-Authored-By: Claude <noreply@anthropic.com>',
      'co-authored-by: Someone <x@anthropic.com>',
      'Claude-Session: https://claude.ai/code/session_x',
      'Generated with [Claude Code](https://claude.com/claude-code)',
      'Co-authored-by: Jane Doe <jane@example.com>',
      '',
    ].join('\n'),
  );
  assert.equal(code, 0);
  assert.equal(
    text,
    'Add receipt parser\n\nBody.\n\nCo-authored-by: Jane Doe <jane@example.com>\n',
  );
});

test('rejects an em dash', () => {
  const { code, stderr } = run(`Fix a ${String.fromCharCode(0x2014)} b\n`);
  assert.equal(code, 1);
  assert.match(stderr, /em dash/);
});

test('rejects a message left empty', () => {
  assert.equal(run('Claude-Session: https://x\n').code, 1);
});
