// Checks USCIS Case Status API credentials against the sandbox and shows what Waymark keeps.
// Credentials come from the environment only:
//   USCIS_CLIENT_ID=... USCIS_CLIENT_SECRET=... pnpm --filter @waymark/server sandbox:check EAC9999103402
import { parseCaseStatusResponse } from '@waymark/core';
import { UscisClient } from '../src/uscis.ts';

/** Key names and value types only, so the output never contains case data. */
function shape(value: unknown, depth = 0): string {
  if (Array.isArray(value))
    return `[${value.length > 0 ? shape(value[0], depth + 1) : ''}] x${value.length}`;
  if (value && typeof value === 'object') {
    if (depth >= 4) return '{...}';
    const parts = Object.entries(value).map(([key, v]) => `${key}: ${shape(v, depth + 1)}`);
    return `{ ${parts.join(', ')} }`;
  }
  return value === null ? 'null' : typeof value;
}

async function main(): Promise<number> {
  const baseUrl = process.env.USCIS_BASE_URL || 'https://api-int.uscis.gov';
  const clientId = process.env.USCIS_CLIENT_ID ?? '';
  const clientSecret = process.env.USCIS_CLIENT_SECRET ?? '';
  const receipt = process.argv[2] ?? process.env.RECEIPT ?? '';

  if (!clientId || !clientSecret) {
    console.error(
      'Set USCIS_CLIENT_ID and USCIS_CLIENT_SECRET in the environment, then run again.',
    );
    return 1;
  }
  if (!receipt) {
    console.error(
      'Pass a sandbox receipt number, for example: pnpm --filter @waymark/server sandbox:check EAC9999103402',
    );
    return 1;
  }

  const client = new UscisClient({ baseUrl, clientId, clientSecret });
  try {
    await client.accessToken();
    console.log(`Token: OK (${baseUrl})`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : 'Token request failed.');
    return 1;
  }

  const result = await client.caseStatus(receipt);
  if (result.kind !== 'ok') {
    console.error(`Case status: ${result.kind}${'message' in result ? `: ${result.message}` : ''}`);
    return 1;
  }
  console.log('Case status: OK');
  console.log(`Response shape (names and types only): ${shape(result.body)}`);
  const parsed = parseCaseStatusResponse(result.body);
  if (!parsed.ok) {
    console.error(`Waymark could not read the response: ${parsed.error}`);
    console.error('Response keys:', Object.keys((result.body ?? {}) as object).join(', '));
    return 1;
  }
  if (parsed.case.events.length <= 1) {
    console.log(
      'Only one status was read. If this receipt has a history, compare the shape above with the ' +
        'fields Waymark reads (hist_case_status) and report the difference.',
    );
  }
  console.log('Waymark keeps:');
  console.log(JSON.stringify(parsed.case, null, 2));
  return 0;
}

process.exitCode = await main();
