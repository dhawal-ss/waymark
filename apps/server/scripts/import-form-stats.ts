// Normalize a quarterly USCIS form data file (XLSX or CSV) and optionally upload it.
//   pnpm --filter @waymark/server forms:import <file> --quarter "FY2026 Q3" --source <uscis.gov URL>
//     [--sheet "Sheet name"] [--server https://sync.example.org]
// With --server, ADMIN_TOKEN must be set in the environment. Without it, JSON is printed.
import { readFileSync } from 'node:fs';
import { normalizeFormStats, parseCsv, parseQuarter } from '@waymark/core';
import { readXlsx } from '../src/xlsx.ts';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<number> {
  const file = process.argv[2];
  const quarter = parseQuarter(arg('quarter') ?? '');
  const source = arg('source') ?? '';
  if (!file || !quarter || !/^https:\/\/(www\.)?uscis\.gov\//.test(source)) {
    console.error(
      'Usage: forms:import <file.xlsx|file.csv> --quarter "FY2026 Q3" --source https://www.uscis.gov/... [--sheet name] [--server URL]',
    );
    return 1;
  }
  const bytes = readFileSync(file);
  const sheets = /\.xlsx$/i.test(file)
    ? await readXlsx(new Uint8Array(bytes), arg('sheet'))
    : [{ name: 'csv', rows: parseCsv(new TextDecoder().decode(bytes)) }];

  const records = [];
  for (const sheet of sheets) {
    const result = normalizeFormStats(sheet.rows, quarter);
    if (result.records.length > 0) {
      console.error(`Sheet "${sheet.name}": ${result.records.length} records.`);
      records.push(...result.records);
    }
    for (const p of result.problems.slice(0, 5)) console.error(`Sheet "${sheet.name}": ${p}`);
  }
  if (records.length === 0) {
    console.error('No records found. Try --sheet with the sheet that has the form table.');
    return 1;
  }

  const server = arg('server');
  if (!server) {
    console.log(JSON.stringify({ source, records }, null, 2));
    return 0;
  }
  const token = process.env.ADMIN_TOKEN ?? '';
  if (!token) {
    console.error('Set ADMIN_TOKEN in the environment to upload.');
    return 1;
  }
  const res = await fetch(`${server.replace(/\/+$/, '')}/v1/admin/form-stats`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, records }),
  });
  console.error(`Upload: HTTP ${res.status} ${await res.text()}`);
  return res.ok ? 0 : 1;
}

process.exitCode = await main();
