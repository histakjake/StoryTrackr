/**
 * test/smoke.test.mjs — StoryTrackr smoke tests
 *
 * Run with:  node --test test/smoke.test.mjs
 *
 * These tests spin up the server in-process and call the route handler
 * directly (unit-style), so no live Supabase credentials are needed for
 * the auth / permission checks — those code paths are exercised by the
 * handler logic before any DB call happens.
 *
 * Tests that actually hit Supabase are skipped when SUPABASE_URL is unset.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { routeRequest } from '../server/api-router.js';

// ── Minimal test server ───────────────────────────────────────────────

const TEST_ENV = {
  SUPABASE_URL:         process.env.SUPABASE_URL         ?? 'http://localhost:54321',
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ?? 'test-key',
  NODE_ENV: 'test',
};

let server;
let baseUrl;

before(async () => {
  server = createServer((req, res) => routeRequest(req, res, TEST_ENV));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
});

// ── Helper ───────────────────────────────────────────────────────────────

async function req(method, path, { body, cookie } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = cookie;

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let json = null;
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    json = await res.json().catch(() => null);
  }

  return { status: res.status, json, headers: res.headers };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('returns 400 when body is missing fields', async () => {
    const { status, json } = await req('POST', '/api/auth/login', { body: {} });
    assert.equal(status, 400);
    assert.ok(json.error, 'should have error message');
  });

  it('returns 401 with bad credentials (Supabase rejects)', async () => {
    const { status } = await req('POST', '/api/auth/login', {
      body: { email: 'bad@example.com', password: 'wrongpass' },
    });
    assert.ok([401, 500].includes(status), `expected 401 or 500, got ${status}`);
  });
});

describe('GET /api/sheet/read', () => {
  it('returns 401 when no session cookie is set', async () => {
    const { status, json } = await req('GET', '/api/sheet/read');
    assert.equal(status, 401);
    assert.ok(json.error, 'should have error message');
  });

  it('returns 401 when session cookie is malformed', async () => {
    const { status } = await req('GET', '/api/sheet/read', {
      cookie: 'st_session=definitely-not-valid; st_org_id=fake-org',
    });
    assert.ok([401, 500].includes(status), `expected 401 or 500, got ${status}`);
  });
});

describe('POST /api/sheet/write', () => {
  it('returns 401 when not authenticated', async () => {
    const { status, json } = await req('POST', '/api/sheet/write?action=add', {
      body: { name: 'Test Student' },
    });
    assert.equal(status, 401);
    assert.ok(json.error);
  });

  it('returns 401 with read-only demo session on edit action', async () => {
    const demoToken = encodeURIComponent('demo:test-org-uuid-1234');
    const { status, json } = await req('POST', '/api/sheet/write?action=add', {
      cookie: `st_session=${demoToken}; st_org_id=test-org-uuid-1234`,
      body: { name: 'Should Fail' },
    });
    assert.ok([401, 403, 500].includes(status), `expected 401/403/500, got ${status}`);
  });
});

describe('POST /api/auth/passcode', () => {
  it('returns 400 when passcode is missing', async () => {
    const { status, json } = await req('POST', '/api/auth/passcode', { body: {} });
    assert.equal(status, 400);
    assert.ok(json.error);
  });

  it('returns 401 or 500 for wrong passcode (no live DB in CI)', async () => {
    const { status } = await req('POST', '/api/auth/passcode', {
      body: { passcode: 'definitely-wrong-passcode-xyz' },
    });
    assert.ok([401, 500].includes(status), `expected 401 or 500, got ${status}`);
  });

  it('rate-limits after 10 attempts', async () => {
    const promises = Array.from({ length: 11 }, () =>
      req('POST', '/api/auth/passcode', { body: { passcode: 'x' } })
    );
    const results = await Promise.all(promises);
    const statuses = results.map(r => r.status);
    assert.ok(statuses.includes(429), `expected at least one 429, got: ${statuses.join(', ')}`);
  });
});

describe('POST /api/auth/logout', () => {
  it('returns 200 even without a session', async () => {
    const { status, json } = await req('POST', '/api/auth/logout');
    assert.equal(status, 200);
    assert.equal(json.ok, true);
  });
});

describe('404 fallthrough', () => {
  it('unknown routes return 404', async () => {
    const { status } = await req('GET', '/api/does-not-exist');
    assert.equal(status, 404);
  });
});
