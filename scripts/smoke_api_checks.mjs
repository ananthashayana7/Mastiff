#!/usr/bin/env node
/**
 * Smoke API Checks
 *
 * Quick sanity checks for local/staging deployments.
 * Exits 0 when all checks pass, non-zero otherwise.
 *
 * Usage:
 *   node scripts/smoke_api_checks.mjs [base_url]
 *
 * Defaults to http://localhost:3000 if no argument is given.
 */

const BASE = process.argv[2] || process.env.SMOKE_BASE_URL || 'http://localhost:3000';

const results = [];

async function check(name, url, opts = {}, expect = {}) {
  const expectedStatus = expect.status || 200;
  const expectedAny = expect.anyStatus;
  try {
    const res = await fetch(url, { ...opts, redirect: 'manual' });
    const pass = expectedAny
      ? expectedAny.includes(res.status)
      : res.status === expectedStatus;
    results.push({ name, pass, status: res.status, expected: expectedAny || expectedStatus });
  } catch (err) {
    results.push({ name, pass: false, status: 'ERR', expected: expectedAny || expectedStatus, error: err.message });
  }
}

async function main() {
  console.log(`Smoke checks against: ${BASE}\n`);

  // 1. App root reachable (200 or 307 redirect is acceptable)
  await check('App root reachable', `${BASE}/`, {}, { anyStatus: [200, 301, 302, 307, 308] });

  // 2. CSRF / auth token endpoint reachable
  await check('CSRF endpoint reachable', `${BASE}/api/auth/csrf`, {}, { anyStatus: [200, 404] });

  // 3. SharePoint OAuth unauthenticated => 401
  await check(
    'SharePoint OAuth GET unauthenticated => 401',
    `${BASE}/api/connectors/sharepoint/oauth`,
    { method: 'GET' },
    { status: 401 },
  );

  // 4. SharePoint import unauthenticated => 401
  await check(
    'SharePoint import POST unauthenticated => 401',
    `${BASE}/api/connectors/test-id/import`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: '00000000-0000-0000-0000-000000000001', sources: [{ id: 's1' }] }),
    },
    { status: 401 },
  );

  // --- Summary ---
  console.log('Results:');
  let allPassed = true;
  for (const r of results) {
    const icon = r.pass ? 'PASS' : 'FAIL';
    if (!r.pass) allPassed = false;
    const extra = r.error ? ` (${r.error})` : '';
    console.log(`  [${icon}] ${r.name} - got ${r.status}, expected ${JSON.stringify(r.expected)}${extra}`);
  }

  console.log(`\n${results.filter((r) => r.pass).length}/${results.length} checks passed.`);

  if (!allPassed) {
    console.error('\nSmoke checks FAILED.');
    process.exit(1);
  } else {
    console.log('\nAll smoke checks PASSED.');
  }
}

main();
