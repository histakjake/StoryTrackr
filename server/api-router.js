/**
 * api-router.js — StoryTrackr HTTP API
 *
 * All request/response objects are Node.js native http.IncomingMessage /
 * http.ServerResponse (wrapped in thin helpers below). No Express dependency.
 *
 * Route map
 * ─────────────────────────────────────────────────────────────────────────────
 *  POST   /api/auth/login          Leader email+password login
 *  POST   /api/auth/logout         Clear session cookie
 *  POST   /api/auth/reset          Send password reset email
 *  POST   /api/auth/passcode       Quick-View passcode login   ← P0 adapter
 *
 *  GET    /api/students            List students for org
 *  POST   /api/students            Create student
 *  PATCH  /api/students/:id        Update student
 *  DELETE /api/students/:id        Soft-delete student
 *
 *  POST   /api/demo-session        Redeem demo token, issue read-only cookie
 *
 *  GET    /api/sheet/read          Roster adapter (legacy frontend call) ← P0
 *  POST   /api/sheet/write         CRUD adapter  (legacy frontend call)  ← P0
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js';

// ─── Environment helpers ───────────────────────────────────────────────────

function getEnv(key, fallback) {
  const val = process.env[key] ?? fallback;
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

// ─── Supabase client (service role — bypasses RLS) ────────────────────────

let _supabase = null;
function getSupabase(env) {
  if (_supabase) return _supabase;
  _supabase = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  );
  return _supabase;
}

// ─── In-memory rate limiter (resets on server restart) ────────────────────

const rateLimitStore = new Map(); // key → { count, resetAt }

function checkRateLimit(key, maxHits, windowSeconds) {
  const now = Date.now();
  let entry = rateLimitStore.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowSeconds * 1000 };
    rateLimitStore.set(key, entry);
  }
  entry.count += 1;
  return entry.count > maxHits; // true = limit exceeded
}

// ─── Session cookie helpers ────────────────────────────────────────────────

const SESSION_COOKIE = 'st_session';
const ORG_COOKIE     = 'st_org_id';
const COOKIE_MAX_AGE = 60 * 60 * 8; // 8 hours

function parseCookies(req) {
  const header = req.headers?.cookie ?? '';
  return Object.fromEntries(
    header.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k, v.join('=')];
    }).filter(([k]) => k)
  );
}

function buildSetCookieHeader(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.path)           parts.push(`Path=${opts.path}`);
  if (opts.httpOnly)       parts.push('HttpOnly');
  if (opts.sameSite)       parts.push(`SameSite=${opts.sameSite}`);
  if (opts.secure)         parts.push('Secure');
  return parts.join('; ');
}

function attachSessionCookies(res, sessionToken, orgId, { readonly = false } = {}) {
  const cookieOpts = {
    maxAge:   readonly ? 60 * 60 * 2 : COOKIE_MAX_AGE, // 2 h for read-only
    path:     '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure:   process.env.NODE_ENV === 'production',
  };
  const cookies = [
    buildSetCookieHeader(SESSION_COOKIE, sessionToken, cookieOpts),
    buildSetCookieHeader(ORG_COOKIE,     orgId,        cookieOpts),
  ];
  const existing = res.getHeader('Set-Cookie') ?? [];
  res.setHeader('Set-Cookie', [...(Array.isArray(existing) ? existing : [existing]), ...cookies]);
}

function clearSessionCookies(res) {
  res.setHeader('Set-Cookie', [
    buildSetCookieHeader(SESSION_COOKIE, '', { maxAge: 0, path: '/', httpOnly: true }),
    buildSetCookieHeader(ORG_COOKIE,     '', { maxAge: 0, path: '/', httpOnly: true }),
  ]);
}

// ─── Session validation ────────────────────────────────────────────────────

/**
 * Validates the session cookie.
 * Returns { userId, orgId, role, readonly } or throws with a 401 JSON response.
 */
async function requireSession(req, res, supabase) {
  const cookies = parseCookies(req);
  const token   = cookies[SESSION_COOKIE];
  const orgId   = cookies[ORG_COOKIE];

  if (!token) {
    jsonError(res, 401, 'Not authenticated');
    return null;
  }

  // Demo / read-only tokens are prefixed "demo:"
  if (token.startsWith('demo:')) {
    return { userId: null, orgId: token.replace('demo:', ''), role: 'readonly', readonly: true };
  }

  // Verify with Supabase Auth
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    clearSessionCookies(res);
    jsonError(res, 401, 'Session expired');
    return null;
  }

  // Validate org membership (P1: org cookie not blindly trusted)
  const { data: dbUser, error: userErr } = await supabase
    .from('users')
    .select('org_id, role')
    .eq('id', user.id)
    .single();

  if (userErr || !dbUser) {
    jsonError(res, 401, 'User not found');
    return null;
  }

  if (orgId && dbUser.org_id !== orgId) {
    // st_org_id cookie was tampered — use the real one from DB
    attachSessionCookies(res, token, dbUser.org_id);
  }

  return { userId: user.id, orgId: dbUser.org_id, role: dbUser.role, readonly: false };
}

/**
 * requirePermission wraps requireSession and additionally checks the role.
 * Returns session info or null (and has already written the error response).
 */
async function requirePermission(req, res, supabase, _resource, action) {
  const session = await requireSession(req, res, supabase);
  if (!session) return null;

  if (action === 'edit' && session.readonly) {
    jsonError(res, 403, 'Read-only session cannot make changes');
    return null;
  }
  return session;
}

// ─── Request body parser ───────────────────────────────────────────────────

async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function parseQuery(url) {
  return Object.fromEntries(new URL(url, 'http://localhost').searchParams);
}

// ─── Response helpers ──────────────────────────────────────────────────────

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type':  'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function jsonError(res, status, message) {
  json(res, status, { error: message });
}

// ─── Student data transformer ──────────────────────────────────────────────

/**
 * Transforms a flat students[] array from Supabase into the nested shape
 * that the legacy frontend DATA object expects:
 *
 *   { hs: { core: [], loose: [], fringe: [] },
 *     ms: { core: [], loose: [], fringe: [] } }
 */
function studentsToRosterShape(rows) {
  const roster = {
    hs: { core: [], loose: [], fringe: [] },
    ms: { core: [], loose: [], fringe: [] },
  };

  for (const row of rows) {
    const sk      = row.sk      ?? 'hs';
    const section = row.section ?? 'core';

    if (!roster[sk] || !roster[sk][section]) continue;

    roster[sk][section].push({
      id:                     row.id,
      name:                   row.name,
      grade:                  row.grade,
      school:                 row.school,
      birthday:               row.birthday,
      sk:                     row.sk,
      section:                row.section,
      primaryGoal:            row.primary_goal,
      goals:                  row.goals ?? [],
      photoUrl:               row.photo_url,
      lastInteractionDate:    row.last_interaction_date,
      lastInteractionSummary: row.last_interaction_summary,
      lastLeader:             row.last_leader,
      interactionCount:       row.interaction_count ?? 0,
    });
  }

  return roster;
}

// ─── Route handlers ────────────────────────────────────────────────────────

// POST /api/auth/login
async function handleLogin(req, res, supabase) {
  const { email, password } = await parseBody(req);

  if (!email || !password) {
    return jsonError(res, 400, 'email and password required');
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return jsonError(res, 401, 'Invalid credentials');
  }

  const { data: dbUser } = await supabase
    .from('users')
    .select('org_id, role')
    .eq('id', data.user.id)
    .single();

  if (!dbUser) {
    return jsonError(res, 401, 'User not provisioned');
  }

  attachSessionCookies(res, data.session.access_token, dbUser.org_id);
  return json(res, 200, { ok: true, orgId: dbUser.org_id, role: dbUser.role });
}

// POST /api/auth/reset
async function handlePasswordReset(req, res, supabase) {
  const { email } = await parseBody(req);
  if (!email) return jsonError(res, 400, 'email required');

  // Best-effort; always return success to avoid user enumeration
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.PUBLIC_URL ?? ''}/update-password`,
  }).catch(() => {});

  return json(res, 200, { ok: true });
}

// POST /api/auth/logout
async function handleLogout(req, res, supabase) {
  try {
    const cookies = parseCookies(req);
    if (cookies[SESSION_COOKIE] && !cookies[SESSION_COOKIE].startsWith('demo:')) {
      await supabase.auth.signOut();
    }
  } catch (_) {
    // best-effort; clear cookies regardless
  }
  clearSessionCookies(res);
  return json(res, 200, { ok: true });
}

// POST /api/auth/passcode   ← P0 adapter
async function handlePasscodeLogin(req, res, supabase, clientIp) {
  const { passcode } = await parseBody(req);

  if (!passcode) {
    return jsonError(res, 400, 'passcode required');
  }

  // Rate limit: 10 attempts per IP per 15 minutes
  const rlKey = `auth:passcode:${clientIp}`;
  if (checkRateLimit(rlKey, 10, 60 * 15)) {
    return jsonError(res, 429, 'Too many attempts. Try again later.');
  }

  // Find any org whose settings.passcode matches
  const { data: rows, error } = await supabase
    .from('org_settings')
    .select('org_id, settings');

  if (error) {
    return jsonError(res, 500, 'Database error');
  }

  const match = (rows ?? []).find(row => row.settings?.passcode === passcode);

  if (!match) {
    return jsonError(res, 401, 'Wrong passcode');
  }

  // Issue a short-lived read-only demo-style cookie
  const demoToken = `demo:${match.org_id}`;
  attachSessionCookies(res, demoToken, match.org_id, { readonly: true });

  return json(res, 200, { ok: true, orgId: match.org_id });
}

// GET /api/students
async function handleGetStudents(req, res, supabase) {
  const session = await requirePermission(req, res, supabase, 'roster', 'view');
  if (!session) return;

  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('org_id', session.orgId)
    .is('archived_at', null)
    .order('roster_index', { ascending: true });

  if (error) return jsonError(res, 500, 'Failed to fetch students');

  return json(res, 200, { students: data });
}

// POST /api/students
async function handleCreateStudent(req, res, supabase) {
  const session = await requirePermission(req, res, supabase, 'roster', 'edit');
  if (!session) return;

  const body = await parseBody(req);
  const { name, grade, school, sk, section, birthday, primaryGoal, goals, photoUrl } = body;

  if (!name) return jsonError(res, 400, 'name required');

  const { data, error } = await supabase
    .from('students')
    .insert({
      org_id:       session.orgId,
      name,
      grade:        grade  ?? null,
      school:       school ?? null,
      sk:           sk     ?? 'hs',
      section:      section ?? 'core',
      birthday:     birthday ?? null,
      primary_goal: primaryGoal ?? null,
      goals:        goals ?? [],
      photo_url:    photoUrl ?? null,
    })
    .select()
    .single();

  if (error) return jsonError(res, 500, 'Failed to create student');

  return json(res, 201, { student: data });
}

// PATCH /api/students/:id
async function handleUpdateStudent(req, res, supabase, id) {
  const session = await requirePermission(req, res, supabase, 'roster', 'edit');
  if (!session) return;

  const body = await parseBody(req);

  // Map camelCase frontend keys → snake_case DB columns
  const updates = {};
  if (body.name            != null) updates.name                   = body.name;
  if (body.grade           != null) updates.grade                  = body.grade;
  if (body.school          != null) updates.school                 = body.school;
  if (body.sk              != null) updates.sk                     = body.sk;
  if (body.section         != null) updates.section                = body.section;
  if (body.birthday        != null) updates.birthday               = body.birthday;
  if (body.primaryGoal     != null) updates.primary_goal           = body.primaryGoal;
  if (body.goals           != null) updates.goals                  = body.goals;
  if (body.photoUrl        != null) updates.photo_url              = body.photoUrl;
  if (body.rosterIndex     != null) updates.roster_index           = body.rosterIndex;
  if (body.lastInteractionDate    != null) updates.last_interaction_date    = body.lastInteractionDate;
  if (body.lastInteractionSummary != null) updates.last_interaction_summary = body.lastInteractionSummary;
  if (body.lastLeader      != null) updates.last_leader            = body.lastLeader;
  if (body.interactionCount != null) updates.interaction_count     = body.interactionCount;

  const { data, error } = await supabase
    .from('students')
    .update(updates)
    .eq('id', id)
    .eq('org_id', session.orgId)
    .select()
    .single();

  if (error) return jsonError(res, 500, 'Failed to update student');
  if (!data) return jsonError(res, 404, 'Student not found');

  return json(res, 200, { student: data });
}

// DELETE /api/students/:id  (soft delete)
async function handleDeleteStudent(req, res, supabase, id) {
  const session = await requirePermission(req, res, supabase, 'roster', 'edit');
  if (!session) return;

  const { error } = await supabase
    .from('students')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', session.orgId);

  if (error) return jsonError(res, 500, 'Failed to delete student');

  return json(res, 200, { success: true });
}

// POST /api/demo-session
async function handleDemoSession(req, res, supabase) {
  const body = await parseBody(req);
  const token = body.token ?? parseQuery(req.url ?? '').token;

  if (!token) return jsonError(res, 400, 'token required');

  // Look up which org has this demo token in org_settings
  const { data: rows } = await supabase
    .from('org_settings')
    .select('org_id, settings');

  const match = (rows ?? []).find(row => row.settings?.demoToken === token);

  if (!match) return jsonError(res, 401, 'Invalid demo token');

  const demoSessionToken = `demo:${match.org_id}`;
  attachSessionCookies(res, demoSessionToken, match.org_id, { readonly: true });

  return json(res, 200, { ok: true, orgId: match.org_id });
}

// ── P0 Adapter: GET /api/sheet/read ───────────────────────────────────────

async function handleSheetRead(req, res, supabase) {
  const session = await requirePermission(req, res, supabase, 'roster', 'view');
  if (!session) return;

  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('org_id', session.orgId)
    .is('archived_at', null)
    .order('roster_index', { ascending: true });

  if (error) return jsonError(res, 500, 'Failed to fetch roster');

  return json(res, 200, studentsToRosterShape(data ?? []));
}

// ── P0 Adapter: POST /api/sheet/write ─────────────────────────────────────

async function handleSheetWrite(req, res, supabase) {
  const session = await requirePermission(req, res, supabase, 'roster', 'edit');
  if (!session) return;

  const query = parseQuery(req.url ?? '');
  const action = query.action;
  const body = await parseBody(req);

  if (action === 'add') {
    const { name, grade, school, sk, section, birthday, primaryGoal, goals, photoUrl } = body;
    if (!name) return jsonError(res, 400, 'name required');

    const { data, error } = await supabase
      .from('students')
      .insert({
        org_id:       session.orgId,
        name,
        grade:        grade  ?? null,
        school:       school ?? null,
        sk:           sk     ?? 'hs',
        section:      section ?? 'core',
        birthday:     birthday ?? null,
        primary_goal: primaryGoal ?? null,
        goals:        goals ?? [],
        photo_url:    photoUrl ?? null,
      })
      .select()
      .single();

    if (error) return jsonError(res, 500, 'Failed to add student');
    return json(res, 201, { success: true, student: data });
  }

  if (action === 'update') {
    const { id, ...rest } = body;
    if (!id) return jsonError(res, 400, 'id required');

    const updates = {};
    if (rest.name            != null) updates.name                   = rest.name;
    if (rest.grade           != null) updates.grade                  = rest.grade;
    if (rest.school          != null) updates.school                 = rest.school;
    if (rest.sk              != null) updates.sk                     = rest.sk;
    if (rest.section         != null) updates.section                = rest.section;
    if (rest.birthday        != null) updates.birthday               = rest.birthday;
    if (rest.primaryGoal     != null) updates.primary_goal           = rest.primaryGoal;
    if (rest.goals           != null) updates.goals                  = rest.goals;
    if (rest.photoUrl        != null) updates.photo_url              = rest.photoUrl;
    if (rest.lastInteractionDate    != null) updates.last_interaction_date    = rest.lastInteractionDate;
    if (rest.lastInteractionSummary != null) updates.last_interaction_summary = rest.lastInteractionSummary;
    if (rest.lastLeader      != null) updates.last_leader            = rest.lastLeader;
    if (rest.interactionCount != null) updates.interaction_count     = rest.interactionCount;

    const { error } = await supabase
      .from('students')
      .update(updates)
      .eq('id', id)
      .eq('org_id', session.orgId);

    if (error) return jsonError(res, 500, 'Failed to update student');
    return json(res, 200, { success: true });
  }

  if (action === 'delete') {
    const { id } = body;
    if (!id) return jsonError(res, 400, 'id required');

    const { error } = await supabase
      .from('students')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', id)
      .eq('org_id', session.orgId);

    if (error) return jsonError(res, 500, 'Failed to delete student');
    return json(res, 200, { success: true });
  }

  return jsonError(res, 400, 'Unknown action. Use add | update | delete');
}

// ─── Main router function ──────────────────────────────────────────────────

export async function routeRequest(req, res, env) {
  const url      = new URL(req.url ?? '/', `http://${req.headers?.host ?? 'localhost'}`);
  const pathname = url.pathname;
  const method   = req.method ?? 'GET';

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return res.end();
  }

  // Common headers
  res.setHeader('Content-Type', 'application/json');

  const supabase = getSupabase(env);
  const clientIp = req.headers?.['x-forwarded-for']?.split(',')[0].trim()
                ?? req.socket?.remoteAddress
                ?? 'unknown';

  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    if (pathname === '/api/auth/login' && method === 'POST') {
      return await handleLogin(req, res, supabase);
    }

    if (pathname === '/api/auth/logout' && method === 'POST') {
      return await handleLogout(req, res, supabase);
    }

    if (pathname === '/api/auth/reset' && method === 'POST') {
      return await handlePasswordReset(req, res, supabase);
    }

    // P0: passcode quick-view login
    if (pathname === '/api/auth/passcode' && method === 'POST') {
      return await handlePasscodeLogin(req, res, supabase, clientIp);
    }

    // ── Students ──────────────────────────────────────────────────────────
    if (pathname === '/api/students' && method === 'GET') {
      return await handleGetStudents(req, res, supabase);
    }

    if (pathname === '/api/students' && method === 'POST') {
      return await handleCreateStudent(req, res, supabase);
    }

    const studentMatch = pathname.match(/^\/api\/students\/([^/]+)$/);
    if (studentMatch) {
      const id = studentMatch[1];
      if (method === 'PATCH') return await handleUpdateStudent(req, res, supabase, id);
      if (method === 'DELETE') return await handleDeleteStudent(req, res, supabase, id);
    }

    // ── Demo session ──────────────────────────────────────────────────────
    if (pathname === '/api/demo-session' && method === 'POST') {
      return await handleDemoSession(req, res, supabase);
    }

    // ── P0 Legacy adapters ────────────────────────────────────────────────
    if (pathname === '/api/sheet/read' && method === 'GET') {
      return await handleSheetRead(req, res, supabase);
    }

    if (pathname === '/api/sheet/write' && method === 'POST') {
      return await handleSheetWrite(req, res, supabase);
    }

    // ── 404 fallthrough ───────────────────────────────────────────────────
    return jsonError(res, 404, `Not found: ${method} ${pathname}`);

  } catch (err) {
    console.error('[api-router] Unhandled error:', err);
    return jsonError(res, 500, 'Internal server error');
  }
}
