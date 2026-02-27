import { createClient } from '@supabase/supabase-js';

const SESSION_COOKIE_ACCESS = 'st_access_token';
const SESSION_COOKIE_REFRESH = 'st_refresh_token';
const SESSION_COOKIE_ORG = 'st_org_id';
const DEMO_COOKIE = 'st_demo_token';

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const RESET_TTL_MINUTES = 30;
const DEMO_TOKEN_TTL_SECONDS = 5 * 60;
const DEMO_SESSION_TTL_SECONDS = 60 * 60;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = new Set(['student', 'leader', 'logo']);
const ALLOWED_UPLOAD_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']);
const DEMO_ORG_ID_FALLBACK = '00000000-0000-0000-0000-000000000001';

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const PERMISSION_LEVELS = { none: 0, view: 1, edit: 2, admin: 3 };

const DEFAULT_PERMISSION_MODULES = {
  roster:       { pending: 'view', approved: 'edit', leader: 'edit', admin: 'admin', demo: 'view',  viewer: 'view' },
  activity:     { pending: 'view', approved: 'view', leader: 'edit', admin: 'admin', demo: 'view',  viewer: 'view' },
  brainDump:    { pending: 'none', approved: 'edit', leader: 'edit', admin: 'admin', demo: 'none',  viewer: 'none' },
  attendance:   { pending: 'view', approved: 'edit', leader: 'edit', admin: 'admin', demo: 'view',  viewer: 'view' },
  hangoutNotes: { pending: 'none', approved: 'edit', leader: 'edit', admin: 'admin', demo: 'view',  viewer: 'none' },
  adminland:    { pending: 'none', approved: 'none', leader: 'none', admin: 'admin', demo: 'none',  viewer: 'none' },
  dashboard:    { pending: 'view', approved: 'view', leader: 'view', admin: 'admin', demo: 'view',  viewer: 'view' },
};

const DEFAULT_SETTINGS = {
  ministryName: 'StoryTrackr Ministry',
  campus: '',
  timezone: 'America/Chicago',
  logoUrl: '',
  logoEnabled: false,
  logoTone: 'light',
  gradeTabs: {
    hs: { label: 'High School', grades: [9, 10, 11, 12] },
    ms: { label: 'Middle School', grades: [6, 7, 8] },
  },
  meetingDay: 'wednesday',
  weekStartsOn: 'sunday',
  tracking: {
    hangoutNotes: true,
    tags: false,
    birthdays: true,
    showGrade: true,
    school: true,
    age: true,
  },
  defaults: {
    newStudentStatus: 'new',
    autoArchive: false,
    autoArchiveWeeks: 8,
  },
  access: {
    mode: 'leaders-only',
    passcode: '',
    passcodePermissions: {
      viewRoster: true,
      viewAttendance: false,
      viewNotes: false,
      viewPrayer: false,
    },
  },
  appearance: {
    theme: 'auto',
    compactMode: false,
    stickyBottomTabs: true,
  },
  permissions: {
    roles: ['pending', 'approved', 'leader', 'admin'],
    levels: ['none', 'view', 'edit', 'admin'],
    modules: {
      roster: { pending: 'view', approved: 'edit', leader: 'edit', admin: 'admin' },
      activity: { pending: 'view', approved: 'view', leader: 'edit', admin: 'admin' },
      brainDump: { pending: 'none', approved: 'edit', leader: 'edit', admin: 'admin' },
      attendance: { pending: 'view', approved: 'edit', leader: 'edit', admin: 'admin' },
      hangoutNotes: { pending: 'none', approved: 'edit', leader: 'edit', admin: 'admin' },
      adminland: { pending: 'none', approved: 'none', leader: 'none', admin: 'admin' },
      dashboard: { pending: 'view', approved: 'view', leader: 'view', admin: 'admin' },
    },
  },
  inactivityDays: 90,
  statCards: {
    totalStudents: true,
    totalInteractions: true,
    interactionsThisMonth: true,
    activeLeaders: true,
  },
  features: {
    goals: true,
    notes: true,
    activity: true,
    familyContact: true,
  },
};

const DEMO_STUDENTS = [
  { id: 'demo-student-1', sk: 'hs', section: 'core', roster_index: 0, name: 'Jordan', grade: 11, school: 'Lincoln High', birthday: null, group_sport: 'Varsity Soccer', primary_goal: 'Grow in faith', goals: [], photo_url: null, connected_this_quarter: true, last_interaction_date: '2026-01-15', last_interaction_summary: 'Talked about college plans and spiritual growth.', last_leader: 'Demo Leader', interaction_count: 3 },
  { id: 'demo-student-2', sk: 'hs', section: 'core', roster_index: 1, name: 'Kayla', grade: 10, school: 'Lincoln High', birthday: null, group_sport: 'Drama Club', primary_goal: 'Find community', goals: [], photo_url: null, connected_this_quarter: true, last_interaction_date: '2026-01-20', last_interaction_summary: 'She opened up about struggles at home.', last_leader: 'Demo Leader', interaction_count: 5 },
  { id: 'demo-student-3', sk: 'hs', section: 'loose', roster_index: 0, name: 'Marcus', grade: 9, school: 'Jefferson Prep', birthday: null, group_sport: 'Basketball', primary_goal: 'Connect with peers', goals: [], photo_url: null, connected_this_quarter: false, last_interaction_date: '2025-11-10', last_interaction_summary: 'Brief chat after service — seems interested.', last_leader: 'Demo Leader', interaction_count: 1 },
];

export async function handleApiRequest(request) {
  const env = getEnv();
  const url = new URL(request.url);
  const pathname = url.pathname;
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();

  if (request.method === 'OPTIONS') {
    return finalizeResponse(new Response(null, { status: 204 }), request, env, requestId);
  }

  const clients = makeClients(env);

  try {
    const response = await routeRequest(request, pathname, env, clients, requestId);
    return finalizeResponse(response, request, env, requestId);
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      requestId,
      event: 'request.error',
      path: pathname,
      message: error?.message || 'unknown',
      stack: error?.stack || null,
    }));
    return finalizeResponse(json({ error: 'Internal server error', requestId }, 500), request, env, requestId);
  }
}

export async function handleManifestRequest(request) {
  const env = getEnv();
  const clients = makeClients(env);
  const url = new URL(request.url);
  const orgId = url.searchParams.get('orgId') || null;

  let name = 'StoryTrackr';
  if (orgId) {
    const { data } = await clients.service
      .from('org_settings')
      .select('settings')
      .eq('org_id', orgId)
      .maybeSingle();
    if (data?.settings?.ministryName) name = data.settings.ministryName;
  }

  return new Response(JSON.stringify({
    name,
    short_name: 'StoryTrackr',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#6366f1',
    icons: [
      { src: '/assets/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/assets/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

async function routeRequest(request, pathname, env, clients, requestId) {
  const method = request.method.toUpperCase();

  if (pathname === '/api/cron/attendance') {
    return handleAttendanceCron(request, env, clients, requestId);
  }

  if (pathname === '/api/settings/public' && method === 'GET') {
    return handleSettingsPublic(request, clients);
  }

  if (pathname === '/api/demo-session' && method === 'POST') {
    return handleDemoSessionCreate(request, env, clients);
  }

  if (pathname === '/api/demo-session/redeem' && method === 'POST') {
    return handleDemoSessionRedeem(request, env, clients);
  }

  if (pathname === '/api/auth/signup' && method === 'POST') return handleSignup(request, env, clients);
  if (pathname === '/api/auth/login' && method === 'POST') return handleLogin(request, env, clients);
  if (pathname === '/api/auth/logout' && method === 'POST') return handleLogout();
  if (pathname === '/api/auth/change-password' && method === 'POST') return handleChangePassword(request, env, clients);
  if (pathname === '/api/auth/forgot-password' && method === 'POST') return handleForgotPassword(request, env, clients);
  if (pathname === '/api/auth/reset-password' && method === 'POST') return handleResetPassword(request, env, clients);

  if (pathname === '/api/me' && method === 'GET') return handleMe(request, env, clients);
  if (pathname === '/api/profile/update' && method === 'POST') return handleProfileUpdate(request, env, clients);

  if (pathname.startsWith('/api/settings') && pathname !== '/api/settings/public') {
    return handleSettings(request, pathname, method, env, clients);
  }

  if (pathname.startsWith('/api/students')) return handleStudents(request, pathname, method, env, clients);
  if (pathname.startsWith('/api/student/interactions')) return handleInteractions(request, method, env, clients);
  if (pathname.startsWith('/api/activity/')) return handleActivity(request, pathname, method, env, clients);

  if (pathname.startsWith('/api/admin/')) return handleAdmin(request, pathname, method, env, clients);
  if (pathname.startsWith('/api/attendance/')) return handleAttendance(request, pathname, method, env, clients);
  if (pathname.startsWith('/api/notifications')) return handleNotifications(request, pathname, method, env, clients);

  if (pathname === '/api/brain-dump' && method === 'POST') return handleBrainDump(request, env, clients);
  if (pathname === '/api/upload-photo' && method === 'POST') return handleUpload(request, env, clients);

  if (pathname.startsWith('/api/owner')) return handleOwner(request, pathname, method, env, clients);

  return json({ error: 'Not found' }, 404);
}

function getEnv() {
  const rawDemoId = process.env.DEMO_TENANT_ID || '';
  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    APP_ORIGIN: process.env.APP_ORIGIN || 'https://dashboard.storytrackr.app',
    MARKETING_ORIGIN: process.env.MARKETING_ORIGIN || 'https://storytrackr.app',
    OWNER_SECRET: process.env.OWNER_SECRET || '',
    CRON_SECRET: process.env.CRON_SECRET || '',
    RESEND_API_KEY: process.env.RESEND_API_KEY || '',
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL || '',
    DEMO_TENANT_ID: /^[0-9a-f-]{36}$/i.test(rawDemoId) ? rawDemoId : DEMO_ORG_ID_FALLBACK,
  };

  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL, SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY');
  }

  return env;
}

function makeClients(env) {
  const anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const service = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { anon, service };
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

function finalizeResponse(response, request, env, requestId) {
  const headers = new Headers(response.headers);
  const origin = request.headers.get('origin') || '';
  const allowedOrigins = new Set([env.APP_ORIGIN, env.MARKETING_ORIGIN, 'http://localhost:3000', 'http://localhost:8787']);
  const allowOrigin = allowedOrigins.has(origin) ? origin : env.APP_ORIGIN;

  headers.set('Access-Control-Allow-Origin', allowOrigin);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Vary', 'Origin');

  headers.set('X-Request-Id', requestId);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function parseCookies(request) {
  const raw = request.headers.get('cookie') || '';
  const out = {};
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (!key) continue;
    out[key] = decodeURIComponent(rest.join('='));
  }
  return out;
}

function buildCookie(name, value, options = {}) {
  const attrs = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path || '/'}`,
    `Max-Age=${options.maxAge ?? SESSION_TTL_SECONDS}`,
    'HttpOnly',
    'Secure',
    `SameSite=${options.sameSite || 'Lax'}`,
  ];
  if (options.domain) attrs.push(`Domain=${options.domain}`);
  return attrs.join('; ');
}

function clearCookie(name, options = {}) {
  return buildCookie(name, '', { ...options, maxAge: 0 });
}

async function parseJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

function validatePasswordStrength(password = '') {
  return password.length >= 10 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password);
}

function deepMerge(...sources) {
  const result = {};
  for (const src of sources) {
    if (!src || typeof src !== 'object') continue;
    for (const [key, value] of Object.entries(src)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = deepMerge(result[key] || {}, value);
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

function generateToken() {
  return [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashToken(value) {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function getClientIp(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}

function startOfMonth(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function asLocalDate(value) {
  if (!value) return null;
  if (typeof value === 'string' && value.length >= 10) return value.slice(0, 10);
  return null;
}

function safeInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.orgRole || user.role || 'pending',
    orgRole: user.orgRole || user.role || 'pending',
    status: user.orgStatus || null,
    photoUrl: user.photoUrl || null,
    leaderSince: user.leaderSince || null,
    funFact: user.funFact || null,
    isDemoMode: !!user.isDemoMode,
    orgId: user.orgId || null,
    orgIds: user.orgIds || [],
    orgName: user.orgName || null,
    preferences: user.preferences || null,
  };
}

async function checkRateLimit(clients, scopeKey, limit, windowSeconds) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowSeconds * 1000);
  const { data: existing } = await clients.service
    .from('rate_limits')
    .select('scope_key, window_start, count')
    .eq('scope_key', scopeKey)
    .maybeSingle();

  if (!existing || new Date(existing.window_start).getTime() < windowStart.getTime()) {
    await clients.service.from('rate_limits').upsert({
      scope_key: scopeKey,
      window_start: now.toISOString(),
      count: 1,
    }, { onConflict: 'scope_key' });
    return true;
  }

  const nextCount = (existing.count || 0) + 1;
  await clients.service.from('rate_limits').update({ count: nextCount }).eq('scope_key', scopeKey);
  return nextCount <= limit;
}

async function sendEmail(env, payload) {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL || !payload?.to) return false;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL,
        to: Array.isArray(payload.to) ? payload.to : [payload.to],
        subject: payload.subject,
        html: payload.html,
      }),
    });

    return res.ok;
  } catch {
    return false;
  }
}

async function getSessionContext(request, env, clients) {
  const cookies = parseCookies(request);
  const demoToken = cookies[DEMO_COOKIE];

  if (demoToken) {
    const tokenHash = await hashToken(demoToken);
    const nowIso = new Date().toISOString();
    const { data } = await clients.service
      .from('demo_sessions')
      .select('org_id, expires_at')
      .eq('token_hash', tokenHash)
      .gt('expires_at', nowIso)
      .maybeSingle();

    if (data) {
      return {
        user: {
          id: null,
          email: null,
          name: 'Demo User',
          role: 'demo',
          orgRole: 'demo',
          orgStatus: 'approved',
          orgId: data.org_id,
          orgIds: [data.org_id],
          orgName: 'Demo Ministry',
          isDemoMode: true,
          preferences: null,
        },
        refreshedSession: null,
      };
    }
  }

  const accessToken = cookies[SESSION_COOKIE_ACCESS];
  const refreshToken = cookies[SESSION_COOKIE_REFRESH];
  if (!accessToken) return { user: null, refreshedSession: null };

  let authUser = null;
  let refreshedSession = null;

  {
    const { data } = await clients.anon.auth.getUser(accessToken);
    if (data?.user) authUser = data.user;
  }

  if (!authUser && refreshToken) {
    const { data } = await clients.anon.auth.refreshSession({ refresh_token: refreshToken });
    if (data?.user) {
      authUser = data.user;
      refreshedSession = data.session;
    }
  }

  if (!authUser) return { user: null, refreshedSession: null };

  const loadedUser = await loadUserFromAuthId(authUser.id, cookies[SESSION_COOKIE_ORG], clients);
  return { user: loadedUser, refreshedSession };
}

async function loadUserFromAuthId(authUserId, preferredOrgId, clients) {
  const { data: profile } = await clients.service
    .from('profiles')
    .select('user_id, email, name, photo_url, leader_since, fun_fact, preferences')
    .eq('user_id', authUserId)
    .maybeSingle();

  const { data: memberRows } = await clients.service
    .from('org_members')
    .select('org_id, role, status, organizations(name)')
    .eq('user_id', authUserId);

  const memberships = memberRows || [];
  const approved = memberships.filter(m => m.status === 'approved');
  const selected =
    approved.find(m => m.org_id === preferredOrgId) ||
    approved[0] ||
    memberships.find(m => m.org_id === preferredOrgId) ||
    memberships[0] ||
    null;

  return {
    id: authUserId,
    email: profile?.email || null,
    name: profile?.name || 'User',
    photoUrl: profile?.photo_url || null,
    leaderSince: profile?.leader_since || null,
    funFact: profile?.fun_fact || null,
    preferences: profile?.preferences || null,
    role: selected?.role || 'pending',
    orgRole: selected?.role || 'pending',
    orgStatus: selected?.status || 'pending_approval',
    orgId: selected?.org_id || null,
    orgIds: approved.map(m => m.org_id),
    orgName: selected?.organizations?.name || null,
    isDemoMode: false,
  };
}

async function getPermissionMatrix(orgId, clients) {
  if (!orgId) return DEFAULT_PERMISSION_MODULES;
  const { data } = await clients.service
    .from('org_settings')
    .select('settings')
    .eq('org_id', orgId)
    .maybeSingle();

  const matrix = data?.settings?.permissions?.modules || {};
  const merged = {};
  for (const [module, defaults] of Object.entries(DEFAULT_PERMISSION_MODULES)) {
    merged[module] = { ...defaults, ...(matrix[module] || {}) };
  }
  return merged;
}

async function hasPermission(user, module, level, clients) {
  if (!user) return false;
  if (user.orgRole === 'admin') return true;

  const required = PERMISSION_LEVELS[level] || 0;
  const matrix = await getPermissionMatrix(user.orgId, clients);
  const role = user.orgRole || user.role || 'pending';
  const roleLevel = matrix[module]?.[role] || 'none';
  const granted = PERMISSION_LEVELS[roleLevel] || 0;

  if (user.isDemoMode && required > PERMISSION_LEVELS.view) return false;
  return granted >= required;
}

async function requirePermission(request, env, clients, module, level) {
  const session = await getSessionContext(request, env, clients);
  if (!session.user) return { ok: false, response: json({ error: 'Not authenticated' }, 401), session };
  const allowed = await hasPermission(session.user, module, level, clients);
  if (!allowed) return { ok: false, response: json({ error: 'Forbidden' }, 403), session };
  return { ok: true, user: session.user, session };
}

function attachSessionCookies(response, env, session, orgId = null) {
  const headers = new Headers(response.headers);
  headers.append('Set-Cookie', buildCookie(SESSION_COOKIE_ACCESS, session.access_token, { maxAge: session.expires_in || SESSION_TTL_SECONDS }));
  headers.append('Set-Cookie', buildCookie(SESSION_COOKIE_REFRESH, session.refresh_token, { maxAge: SESSION_TTL_SECONDS }));
  headers.append('Set-Cookie', clearCookie(DEMO_COOKIE));
  if (orgId) headers.append('Set-Cookie', buildCookie(SESSION_COOKIE_ORG, orgId, { maxAge: SESSION_TTL_SECONDS }));
  return new Response(response.body, { status: response.status, headers });
}

function clearSessionCookies(response) {
  const headers = new Headers(response.headers);
  headers.append('Set-Cookie', clearCookie(SESSION_COOKIE_ACCESS));
  headers.append('Set-Cookie', clearCookie(SESSION_COOKIE_REFRESH));
  headers.append('Set-Cookie', clearCookie(SESSION_COOKIE_ORG));
  headers.append('Set-Cookie', clearCookie(DEMO_COOKIE));
  return new Response(response.body, { status: response.status, headers });
}

function withRefreshedSession(response, refreshedSession) {
  if (!refreshedSession) return response;
  const headers = new Headers(response.headers);
  headers.append('Set-Cookie', buildCookie(SESSION_COOKIE_ACCESS, refreshedSession.access_token, { maxAge: refreshedSession.expires_in || SESSION_TTL_SECONDS }));
  headers.append('Set-Cookie', buildCookie(SESSION_COOKIE_REFRESH, refreshedSession.refresh_token, { maxAge: SESSION_TTL_SECONDS }));
  return new Response(response.body, { status: response.status, headers });
}

async function handleSignup(request, env, clients) {
  const body = await parseJsonBody(request);
  if (!body) return json({ error: 'Invalid JSON body' }, 400);

  const name = String(body.name || '').trim();
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  const orgName = String(body.orgName || '').trim() || `${name}'s Ministry`;

  if (!name || !email || !password) return json({ error: 'Name, email, and password are required' }, 400);
  if (!isValidEmail(email)) return json({ error: 'Invalid email' }, 400);
  if (!validatePasswordStrength(password)) return json({ error: "Your password isn't long enough." }, 400);

  const { data: existing } = await clients.service
    .from('profiles')
    .select('user_id')
    .eq('email', email)
    .maybeSingle();
  if (existing?.user_id) return json({ error: 'Account already exists' }, 409);

  const { data: createdUserData, error: createError } = await clients.service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });

  if (createError || !createdUserData?.user) {
    if (createError?.message?.toLowerCase().includes('already')) return json({ error: 'Account already exists' }, 409);
    return json({ error: createError?.message || 'Could not create account' }, 400);
  }

  const authUserId = createdUserData.user.id;

  const { data: orgRow, error: orgError } = await clients.service
    .from('organizations')
    .insert({ name: orgName, owner_user_id: authUserId, timezone: DEFAULT_SETTINGS.timezone })
    .select('id, name')
    .single();

  if (orgError || !orgRow) return json({ error: 'Could not create ministry' }, 500);

  await clients.service.from('profiles').insert({
    user_id: authUserId,
    email,
    name,
    preferences: {},
  });

  await clients.service.from('org_members').insert({
    org_id: orgRow.id,
    user_id: authUserId,
    role: 'admin',
    status: 'approved',
  });

  await clients.service.from('org_settings').upsert({
    org_id: orgRow.id,
    settings: deepMerge(DEFAULT_SETTINGS, { ministryName: orgName, timezone: DEFAULT_SETTINGS.timezone }),
  }, { onConflict: 'org_id' });

  const { data: signInData, error: signInError } = await clients.anon.auth.signInWithPassword({ email, password });
  if (signInError || !signInData?.session) {
    return json({ success: true, onboarding: true, user: safeUser({
      id: authUserId,
      email,
      name,
      orgRole: 'admin',
      orgStatus: 'approved',
      orgId: orgRow.id,
      orgIds: [orgRow.id],
      orgName: orgRow.name,
    }) });
  }

  let response = json({
    success: true,
    onboarding: true,
    user: safeUser({
      id: authUserId,
      email,
      name,
      orgRole: 'admin',
      orgStatus: 'approved',
      orgId: orgRow.id,
      orgIds: [orgRow.id],
      orgName: orgRow.name,
    }),
  });

  response = attachSessionCookies(response, env, signInData.session, orgRow.id);
  return response;
}

async function handleLogin(request, env, clients) {
  const body = await parseJsonBody(request);
  if (!body) return json({ error: 'Invalid JSON body' }, 400);

  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  if (!email || !password) return json({ error: 'Invalid email or password' }, 401);

  const ip = getClientIp(request);
  const allowed = await checkRateLimit(clients, `auth:login:${ip}`, 20, 60 * 15);
  if (!allowed) return json({ error: 'Too many login attempts. Please try again later.' }, 429);

  const { data: signInData, error } = await clients.anon.auth.signInWithPassword({ email, password });
  if (error || !signInData?.user || !signInData?.session) return json({ error: 'Invalid email or password' }, 401);

  const cookies = parseCookies(request);
  const user = await loadUserFromAuthId(signInData.user.id, cookies[SESSION_COOKIE_ORG], clients);
  if (!user || !user.orgId) {
    return json({ error: 'Your account is pending approval.' }, 403);
  }

  const requireOrgPicker = (user.orgIds || []).length > 1;
  let response = json({ success: true, user: safeUser(user), orgIds: user.orgIds, requireOrgPicker });
  response = attachSessionCookies(response, env, signInData.session, user.orgId);
  return response;
}

async function handleLogout() {
  return clearSessionCookies(json({ success: true }));
}

async function handleMe(request, env, clients) {
  const session = await getSessionContext(request, env, clients);
  let response = json({ user: safeUser(session.user), isDemoMode: !!session.user?.isDemoMode });
  response = withRefreshedSession(response, session.refreshedSession);
  return response;
}

async function handleProfileUpdate(request, env, clients) {
  const session = await getSessionContext(request, env, clients);
  if (!session.user) return json({ error: 'Not authenticated' }, 401);
  if (session.user.isDemoMode) return json({ error: 'Demo is read-only' }, 403);

  const updates = await parseJsonBody(request);
  if (!updates) return json({ error: 'Invalid JSON body' }, 400);

  const patch = {};
  if (updates.name !== undefined) patch.name = String(updates.name || '').trim();
  if (updates.leaderSince !== undefined) patch.leader_since = String(updates.leaderSince || '').trim();
  if (updates.funFact !== undefined) patch.fun_fact = String(updates.funFact || '').trim();
  if (updates.photoUrl !== undefined) patch.photo_url = String(updates.photoUrl || '').trim() || null;
  if (updates.preferences !== undefined) patch.preferences = updates.preferences || {};

  await clients.service.from('profiles').update(patch).eq('user_id', session.user.id);
  return json({ success: true });
}

async function handleChangePassword(request, env, clients) {
  const session = await getSessionContext(request, env, clients);
  if (!session.user) return json({ error: 'Not authenticated' }, 401);
  if (session.user.isDemoMode) return json({ error: 'Demo is read-only' }, 403);

  const body = await parseJsonBody(request);
  if (!body) return json({ error: 'Invalid JSON body' }, 400);
  const oldPassword = String(body.oldPassword || '');
  const newPassword = String(body.newPassword || '');
  const confirmPassword = String(body.confirmPassword || '');

  if (!oldPassword || !newPassword || !confirmPassword) return json({ error: 'All fields required' }, 400);
  if (newPassword !== confirmPassword) return json({ error: 'New passwords do not match' }, 400);
  if (!validatePasswordStrength(newPassword)) return json({ error: "Your password isn't long enough." }, 400);

  const { error: verifyError } = await clients.anon.auth.signInWithPassword({
    email: session.user.email,
    password: oldPassword,
  });
  if (verifyError) return json({ error: 'Old password incorrect' }, 401);

  const { error: updateError } = await clients.service.auth.admin.updateUserById(session.user.id, { password: newPassword });
  if (updateError) return json({ error: updateError.message || 'Could not update password' }, 400);

  return json({ success: true });
}

async function handleForgotPassword(request, env, clients) {
  const body = await parseJsonBody(request);
  if (!body) return json({ error: 'Invalid JSON body' }, 400);

  const email = normalizeEmail(body.email);
  const generic = { success: true, message: 'If that account exists, a reset link has been sent.' };

  const ip = getClientIp(request);
  const allowed = await checkRateLimit(clients, `auth:forgot:${ip}`, 10, 60 * 15);
  if (!allowed) return json({ error: 'Too many reset requests. Please try again later.' }, 429);

  if (!email) return json(generic);

  const { data: profile } = await clients.service
    .from('profiles')
    .select('user_id, email, name')
    .eq('email', email)
    .maybeSingle();

  if (!profile?.user_id) return json(generic);

  const rawToken = generateToken();
  const tokenHash = await hashToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000).toISOString();

  await clients.service.from('password_reset_tokens').insert({
    user_id: profile.user_id,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  await sendEmail(env, {
    to: profile.email,
    subject: 'Reset your StoryTrackr password',
    html: `<p>Click this link to reset your password (expires in ${RESET_TTL_MINUTES} minutes):</p><p><a href="${env.APP_ORIGIN}/reset-password?token=${rawToken}">Reset Password</a></p>`,
  });

  return json(generic);
}

async function handleResetPassword(request, env, clients) {
  const body = await parseJsonBody(request);
  if (!body) return json({ error: 'Invalid JSON body' }, 400);

  const token = String(body.token || '');
  const newPassword = String(body.newPassword || '');
  const confirmPassword = String(body.confirmPassword || '');

  const ip = getClientIp(request);
  const allowed = await checkRateLimit(clients, `auth:reset:${ip}`, 12, 60 * 15);
  if (!allowed) return json({ error: 'Too many reset attempts. Please try again later.' }, 429);

  if (!token || !newPassword || !confirmPassword || newPassword !== confirmPassword) {
    return json({ error: 'Invalid request' }, 400);
  }

  if (!validatePasswordStrength(newPassword)) return json({ error: "Your password isn't long enough." }, 400);

  const tokenHash = await hashToken(token);
  const nowIso = new Date().toISOString();

  const { data: rec } = await clients.service
    .from('password_reset_tokens')
    .select('id, user_id, expires_at, used_at')
    .eq('token_hash', tokenHash)
    .gt('expires_at', nowIso)
    .is('used_at', null)
    .maybeSingle();

  if (!rec?.user_id) return json({ error: 'Invalid or expired token' }, 400);

  const { error: updateError } = await clients.service.auth.admin.updateUserById(rec.user_id, { password: newPassword });
  if (updateError) return json({ error: updateError.message || 'Could not reset password' }, 400);

  await clients.service
    .from('password_reset_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', rec.id);

  return json({ success: true });
}

async function handleSettingsPublic(request, clients) {
  const url = new URL(request.url);
  const orgId = url.searchParams.get('orgId');
  if (!orgId) {
    const fallback = deepMerge(DEFAULT_SETTINGS);
    return json(publicSettingsView(fallback));
  }

  const settings = await getSettingsForOrg(orgId, clients);
  return json(publicSettingsView(settings));
}

function publicSettingsView(settings) {
  return {
    ministryName: settings.ministryName,
    campus: settings.campus,
    logoUrl: settings.logoEnabled && settings.logoUrl ? settings.logoUrl : '',
    logoTone: settings.logoTone || 'light',
    logoEnabled: !!settings.logoEnabled,
    gradeTabs: settings.gradeTabs,
    tracking: settings.tracking,
    appearance: settings.appearance,
    permissions: settings.permissions,
    accessMode: settings.access?.mode || 'leaders-only',
    inactivityDays: settings.inactivityDays ?? 90,
    statCards: settings.statCards,
    features: settings.features,
    timezone: settings.timezone || 'America/Chicago',
  };
}

async function getSettingsForOrg(orgId, clients) {
  const { data } = await clients.service
    .from('org_settings')
    .select('settings')
    .eq('org_id', orgId)
    .maybeSingle();
  return deepMerge(DEFAULT_SETTINGS, data?.settings || {});
}

async function saveSettingsForOrg(orgId, updates, clients) {
  const current = await getSettingsForOrg(orgId, clients);
  const merged = deepMerge(DEFAULT_SETTINGS, current, updates || {});
  await clients.service.from('org_settings').upsert({ org_id: orgId, settings: merged }, { onConflict: 'org_id' });
  return merged;
}

async function handleSettings(request, pathname, method, env, clients) {
  const perm = await requirePermission(request, env, clients, 'adminland', 'admin');
  if (!perm.ok) return perm.response;

  const orgId = perm.user.orgId;
  if (!orgId) return json({ error: 'Organization not selected' }, 400);

  if (pathname === '/api/settings' && method === 'GET') {
    const settings = await getSettingsForOrg(orgId, clients);
    return json({ settings });
  }

  if (pathname === '/api/settings' && method === 'POST') {
    const updates = await parseJsonBody(request);
    if (!updates) return json({ error: 'Invalid JSON body' }, 400);
    const settings = await saveSettingsForOrg(orgId, updates, clients);
    return json({ success: true, settings });
  }

  return json({ error: 'Not found' }, 404);
}

function mapStudent(row) {
  return {
    id: row.id,
    orgId: row.org_id,
    sk: row.sk,
    section: row.section,
    index: row.roster_index,
    name: row.name,
    grade: row.grade,
    school: row.school,
    birthday: row.birthday,
    group: row.group_sport,
    primaryGoal: row.primary_goal,
    goals: Array.isArray(row.goals) ? row.goals : [],
    photoUrl: row.photo_url,
    familyContacted: !!row.family_contacted,
    connectedThisQuarter: !!row.connected_this_quarter,
    lastInteractionDate: row.last_interaction_date,
    lastInteractionSummary: row.last_interaction_summary,
    lastLeader: row.last_leader,
    interactionCount: row.interaction_count || 0,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    smallGroupId: row.small_group_id || null,
    smallGroupName: row.small_groups?.name || null,
  };
}

async function handleStudents(request, pathname, method, env, clients) {
  if (pathname === '/api/students' && method === 'GET') {
    const perm = await requirePermission(request, env, clients, 'roster', 'view');
    if (!perm.ok) return perm.response;

    const url = new URL(request.url);
    const sk = url.searchParams.get('sk');
    const section = url.searchParams.get('section');

    let query = clients.service
      .from('students')
      .select('*, small_groups(name)')
      .eq('org_id', perm.user.orgId)
      .order('roster_index', { ascending: true });

    if (sk) query = query.eq('sk', sk);
    if (section) query = query.eq('section', section);

    const { data } = await query;
    const students = (data || []).map(mapStudent);

    if (sk && section) return json({ students });

    const roster = { hs: { core: [], loose: [], fringe: [] }, ms: { core: [], loose: [], fringe: [] } };
    for (const s of students) {
      if (!roster[s.sk]) roster[s.sk] = { core: [], loose: [], fringe: [] };
      if (!roster[s.sk][s.section]) roster[s.sk][s.section] = [];
      roster[s.sk][s.section].push(s);
    }

    return json({ roster });
  }

  if (pathname === '/api/students' && method === 'POST') {
    const perm = await requirePermission(request, env, clients, 'roster', 'edit');
    if (!perm.ok) return perm.response;
    if (perm.user.isDemoMode) return json({ error: 'Demo is read-only' }, 403);

    const body = await parseJsonBody(request);
    if (!body) return json({ error: 'Invalid JSON body' }, 400);

    const name = String(body.name || '').trim();
    if (!name) return json({ error: 'Name required' }, 400);

    const sk = body.sk === 'ms' ? 'ms' : 'hs';
    const section = ['core', 'loose', 'fringe'].includes(body.section) ? body.section : 'core';

    const { data: last } = await clients.service
      .from('students')
      .select('roster_index')
      .eq('org_id', perm.user.orgId)
      .eq('sk', sk)
      .eq('section', section)
      .order('roster_index', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextIndex = (last?.roster_index ?? -1) + 1;

    const payload = {
      org_id: perm.user.orgId,
      sk,
      section,
      roster_index: nextIndex,
      name,
      grade: body.grade ? Number(body.grade) : null,
      school: String(body.school || ''),
      birthday: body.birthday || null,
      group_sport: String(body.group || ''),
      primary_goal: String(body.primaryGoal || ''),
      goals: Array.isArray(body.goals) ? body.goals : [],
      photo_url: body.photoUrl || null,
      family_contacted: !!body.familyContacted,
      connected_this_quarter: !!body.connectedThisQuarter,
      small_group_id: body.smallGroupId || null,
    };

    const { data, error } = await clients.service
      .from('students')
      .insert(payload)
      .select('*, small_groups(name)')
      .single();

    if (error || !data) return json({ error: error?.message || 'Could not create student' }, 400);
    return json({ success: true, student: mapStudent(data) }, 201);
  }

  const idMatch = pathname.match(/^\/api\/students\/([^/]+)$/);
  if (!idMatch) return json({ error: 'Not found' }, 404);

  const studentId = idMatch[1];

  if (method === 'GET') {
    const perm = await requirePermission(request, env, clients, 'roster', 'view');
    if (!perm.ok) return perm.response;

    const { data } = await clients.service
      .from('students')
      .select('*, small_groups(name)')
      .eq('org_id', perm.user.orgId)
      .eq('id', studentId)
      .maybeSingle();

    if (!data) return json({ error: 'Not found' }, 404);
    return json({ student: mapStudent(data) });
  }

  if (method === 'PUT') {
    const perm = await requirePermission(request, env, clients, 'roster', 'edit');
    if (!perm.ok) return perm.response;
    if (perm.user.isDemoMode) return json({ error: 'Demo is read-only' }, 403);

    const body = await parseJsonBody(request);
    if (!body) return json({ error: 'Invalid JSON body' }, 400);

    const patch = {};
    if (body.name !== undefined) patch.name = String(body.name || '').trim();
    if (body.grade !== undefined) patch.grade = body.grade ? Number(body.grade) : null;
    if (body.school !== undefined) patch.school = String(body.school || '');
    if (body.birthday !== undefined) patch.birthday = body.birthday || null;
    if (body.group !== undefined) patch.group_sport = String(body.group || '');
    if (body.primaryGoal !== undefined) patch.primary_goal = String(body.primaryGoal || '');
    if (body.goals !== undefined) patch.goals = Array.isArray(body.goals) ? body.goals : [];
    if (body.photoUrl !== undefined) patch.photo_url = body.photoUrl || null;
    if (body.familyContacted !== undefined) patch.family_contacted = !!body.familyContacted;
    if (body.connectedThisQuarter !== undefined) patch.connected_this_quarter = !!body.connectedThisQuarter;
    if (body.lastInteractionDate !== undefined) patch.last_interaction_date = body.lastInteractionDate || null;
    if (body.lastInteractionSummary !== undefined) patch.last_interaction_summary = String(body.lastInteractionSummary || '');
    if (body.lastLeader !== undefined) patch.last_leader = String(body.lastLeader || '');
    if (body.interactionCount !== undefined) patch.interaction_count = Number(body.interactionCount || 0);
    if (body.smallGroupId !== undefined) patch.small_group_id = body.smallGroupId || null;

    const { data, error } = await clients.service
      .from('students')
      .update(patch)
      .eq('org_id', perm.user.orgId)
      .eq('id', studentId)
      .select('*, small_groups(name)')
      .maybeSingle();

    if (error) return json({ error: error.message || 'Update failed' }, 400);
    if (!data) return json({ error: 'Not found' }, 404);
    return json({ success: true, student: mapStudent(data) });
  }

  if (method === 'DELETE') {
    const perm = await requirePermission(request, env, clients, 'roster', 'edit');
    if (!perm.ok) return perm.response;
    if (perm.user.isDemoMode) return json({ error: 'Demo is read-only' }, 403);

    const { data: existing } = await clients.service
      .from('students')
      .select('id, sk, section, roster_index')
      .eq('org_id', perm.user.orgId)
      .eq('id', studentId)
      .maybeSingle();
    if (!existing) return json({ error: 'Not found' }, 404);

    await clients.service.from('students').delete().eq('org_id', perm.user.orgId).eq('id', studentId);

    const { data: siblings } = await clients.service
      .from('students')
      .select('id, roster_index')
      .eq('org_id', perm.user.orgId)
      .eq('sk', existing.sk)
      .eq('section', existing.section)
      .order('roster_index', { ascending: true });

    for (let i = 0; i < (siblings || []).length; i++) {
      if (siblings[i].roster_index !== i) {
        await clients.service
          .from('students')
          .update({ roster_index: i })
          .eq('id', siblings[i].id)
          .eq('org_id', perm.user.orgId);
      }
    }

    return json({ success: true });
  }

  return json({ error: 'Not found' }, 404);
}

async function findStudentByLegacyIndex(orgId, sk, section, index, clients) {
  const { data } = await clients.service
    .from('students')
    .select('id, name, sk, section, roster_index')
    .eq('org_id', orgId)
    .eq('sk', sk)
    .eq('section', section)
    .eq('roster_index', Number(index))
    .maybeSingle();
  return data || null;
}

function mapInteraction(row) {
  return {
    id: row.id,
    summary: row.summary,
    leader: row.leader_name,
    date: row.note_date,
    tags: Array.isArray(row.tags) ? row.tags : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    leaderEmail: row.leader_user_id || null,
  };
}

async function handleInteractions(request, method, env, clients) {
  if (method === 'GET') {
    const perm = await requirePermission(request, env, clients, 'hangoutNotes', 'view');
    if (!perm.ok) return perm.response;

    const url = new URL(request.url);
    const sk = url.searchParams.get('sk');
    const section = url.searchParams.get('section');
    const index = url.searchParams.get('index');

    if (!sk || !section || index === null) {
      return json({ error: 'Missing sk, section, or index query parameter' }, 400);
    }

    const student = await findStudentByLegacyIndex(perm.user.orgId, sk, section, index, clients);
    if (!student) return json({ interactions: [] });

    const { data } = await clients.service
      .from('interactions')
      .select('*')
      .eq('org_id', perm.user.orgId)
      .eq('student_id', student.id)
      .order('created_at', { ascending: true });

    return json({ interactions: (data || []).map(mapInteraction) });
  }

  if (method === 'POST') {
    const perm = await requirePermission(request, env, clients, 'hangoutNotes', 'edit');
    if (!perm.ok) return perm.response;
    if (perm.user.isDemoMode) return json({ error: 'Demo is read-only' }, 403);

    const body = await parseJsonBody(request);
    if (!body) return json({ error: 'Invalid JSON body' }, 400);

    const sk = body.sk;
    const section = body.section;
    const index = body.index;
    const interaction = body.interaction || {};
    const summary = String(interaction.summary || '').trim();

    if (!sk || !section || index === undefined || !summary) return json({ error: 'Invalid request' }, 400);

    const student = await findStudentByLegacyIndex(perm.user.orgId, sk, section, index, clients);
    if (!student) return json({ error: 'Student not found' }, 404);

    const payload = {
      org_id: perm.user.orgId,
      student_id: student.id,
      leader_user_id: perm.user.id,
      leader_name: String(interaction.leader || perm.user.name || 'Leader'),
      summary,
      note_date: asLocalDate(interaction.date) || asLocalDate(new Date().toISOString()),
      tags: Array.isArray(interaction.tags) ? interaction.tags : [],
    };

    const { data: inserted, error } = await clients.service
      .from('interactions')
      .insert(payload)
      .select('*')
      .single();

    if (error || !inserted) return json({ error: error?.message || 'Could not save interaction' }, 400);

    const { data: currentStudent } = await clients.service
      .from('students')
      .select('interaction_count')
      .eq('org_id', perm.user.orgId)
      .eq('id', student.id)
      .single();

    await clients.service
      .from('students')
      .update({
        last_interaction_date: payload.note_date,
        last_interaction_summary: summary.slice(0, 200),
        last_leader: payload.leader_name,
        interaction_count: (currentStudent?.interaction_count || 0) + 1,
        connected_this_quarter: true,
      })
      .eq('org_id', perm.user.orgId)
      .eq('id', student.id);

    await clients.service.from('activity_events').insert({
      org_id: perm.user.orgId,
      type: 'interaction_logged',
      student_id: student.id,
      interaction_id: inserted.id,
      actor_user_id: perm.user.id,
      payload: {
        summary,
        leader: payload.leader_name,
        studentName: body.studentName || student.name,
        date: payload.note_date,
        createdAt: inserted.created_at,
      },
    });

    return json({ success: true });
  }

  if (method === 'PUT' || method === 'DELETE') {
    const perm = await requirePermission(request, env, clients, 'hangoutNotes', 'edit');
    if (!perm.ok) return perm.response;
    if (perm.user.isDemoMode) return json({ error: 'Demo is read-only' }, 403);

    const body = await parseJsonBody(request);
    if (!body) return json({ error: 'Invalid JSON body' }, 400);

    const interactionId = String(body.interactionId || '');
    if (!interactionId) return json({ error: 'interactionId required' }, 400);

    const { data: current } = await clients.service
      .from('interactions')
      .select('*')
      .eq('org_id', perm.user.orgId)
      .eq('id', interactionId)
      .maybeSingle();

    if (!current) return json({ error: 'Note not found' }, 404);
    if (perm.user.orgRole !== 'admin' && current.leader_user_id && current.leader_user_id !== perm.user.id) {
      return json({ error: 'Forbidden' }, 403);
    }

    if (method === 'DELETE') {
      await clients.service.from('interactions').delete().eq('org_id', perm.user.orgId).eq('id', interactionId);
      return json({ success: true });
    }

    const changes = body.changes || {};
    const patch = {};
    if (changes.summary !== undefined) patch.summary = String(changes.summary || '');
    if (changes.date !== undefined) patch.note_date = asLocalDate(changes.date);
    if (changes.tags !== undefined) patch.tags = Array.isArray(changes.tags) ? changes.tags : [];

    await clients.service
      .from('interactions')
      .update(patch)
      .eq('org_id', perm.user.orgId)
      .eq('id', interactionId);

    return json({ success: true });
  }

  return json({ error: 'Not found' }, 404);
}

async function handleActivity(request, pathname, method, env, clients) {
  if (pathname === '/api/activity/recent' && method === 'GET') {
    const perm = await requirePermission(request, env, clients, 'activity', 'view');
    if (!perm.ok) return perm.response;

    const { data } = await clients.service
      .from('activity_events')
      .select('payload, created_at')
      .eq('org_id', perm.user.orgId)
      .order('created_at', { ascending: false })
      .limit(30);

    const items = (data || []).map(row => ({
      ...row.payload,
      createdAt: row.created_at,
      summary: row.payload?.summary || '',
      leader: row.payload?.leader || '',
      studentName: row.payload?.studentName || '',
      date: row.payload?.date || row.created_at,
    }));

    return json({ items });
  }

  if (pathname === '/api/activity/stats' && method === 'GET') {
    const perm = await requirePermission(request, env, clients, 'activity', 'view');
    if (!perm.ok) return perm.response;

    const { data: interactions } = await clients.service
      .from('interactions')
      .select('leader_name, student_id, created_at')
      .eq('org_id', perm.user.orgId)
      .limit(5000);

    const rows = interactions || [];
    const leaderCounts = new Map();
    const studentCounts = new Map();
    const studentIds = new Set();
    let thisMonth = 0;
    const monthStart = startOfMonth(new Date());

    for (const row of rows) {
      const leader = row.leader_name || 'Leader';
      leaderCounts.set(leader, (leaderCounts.get(leader) || 0) + 1);
      if (row.student_id) {
        studentIds.add(row.student_id);
        studentCounts.set(row.student_id, (studentCounts.get(row.student_id) || 0) + 1);
      }
      if (new Date(row.created_at).getTime() >= monthStart.getTime()) thisMonth += 1;
    }

    const ids = [...studentIds];
    let studentMap = new Map();
    if (ids.length) {
      const { data: students } = await clients.service
        .from('students')
        .select('id, name')
        .in('id', ids);
      studentMap = new Map((students || []).map(s => [s.id, s.name]));
    }

    const topLeaders = [...leaderCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));
    const topStudents = [...studentCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([studentId, count]) => ({ name: studentMap.get(studentId) || 'Student', count }));

    return json({
      totalInteractions: rows.length,
      uniqueLeaders: leaderCounts.size,
      uniqueStudents: studentCounts.size,
      thisMonth,
      topLeaders,
      topStudents,
    });
  }

  return json({ error: 'Not found' }, 404);
}

async function requireAdmin(request, env, clients) {
  const perm = await requirePermission(request, env, clients, 'adminland', 'admin');
  if (!perm.ok) return perm;
  return { ok: true, user: perm.user, session: perm.session };
}

async function handleAdmin(request, pathname, method, env, clients) {
  if (pathname === '/api/admin/invite/redeem' && method === 'POST') {
    return handleInviteRedeem(request, env, clients);
  }

  const admin = await requireAdmin(request, env, clients);
  if (!admin.ok) return admin.response;

  if (pathname === '/api/admin/users' && method === 'GET') {
    const { data: members } = await clients.service
      .from('org_members')
      .select('user_id, role, status, joined_at')
      .eq('org_id', admin.user.orgId)
      .order('joined_at', { ascending: true });

    const userIds = (members || []).map(m => m.user_id).filter(Boolean);
    let profiles = [];
    if (userIds.length) {
      const { data } = await clients.service
        .from('profiles')
        .select('user_id, name, email, leader_since')
        .in('user_id', userIds);
      profiles = data || [];
    }
    const profileMap = new Map(profiles.map(p => [p.user_id, p]));

    const users = (members || []).map(member => {
      const profile = profileMap.get(member.user_id);
      return {
        userId: member.user_id,
        name: profile?.name || 'User',
        email: profile?.email || '',
        role: member.role,
        status: member.status,
        createdAt: member.joined_at,
        leaderSince: profile?.leader_since || null,
        orgId: admin.user.orgId,
      };
    });

    return json({ users });
  }

  if (pathname === '/api/admin/update' && method === 'POST') {
    const body = await parseJsonBody(request);
    if (!body) return json({ error: 'Invalid JSON body' }, 400);

    const email = normalizeEmail(body.email);
    const role = String(body.role || '');
    const status = String(body.status || '').trim();
    const notifyUser = !!body.notifyUser;

    if (!email || !['pending', 'approved', 'leader', 'admin'].includes(role)) {
      return json({ error: 'Invalid request' }, 400);
    }

    const { data: profile } = await clients.service
      .from('profiles')
      .select('user_id, email, name')
      .eq('email', email)
      .maybeSingle();
    if (!profile?.user_id) return json({ error: 'User not found' }, 404);

    if (profile.user_id === admin.user.id && role !== 'admin') {
      return json({ error: 'You cannot change your own admin status.' }, 403);
    }

    const nextStatus = status || (role !== 'pending' ? 'approved' : 'pending_approval');

    await clients.service.from('org_members').upsert({
      org_id: admin.user.orgId,
      user_id: profile.user_id,
      role,
      status: nextStatus,
    }, { onConflict: 'org_id,user_id' });

    if (notifyUser) {
      const approved = nextStatus === 'approved' || role !== 'pending';
      await sendEmail(env, {
        to: profile.email,
        subject: approved ? 'Your StoryTrackr account has been approved' : 'StoryTrackr account update',
        html: approved
          ? `<p>Your account has been approved. <a href="${env.APP_ORIGIN}/login">Log in here</a>.</p>`
          : `<p>Your account status was updated. Contact your ministry administrator for details.</p>`,
      });
    }

    await clients.service.from('audit_events').insert({
      org_id: admin.user.orgId,
      actor_user_id: admin.user.id,
      event_type: 'admin.update_user',
      payload: { email, role, status: nextStatus, notifyUser },
    });

    return json({ success: true });
  }

  if (pathname === '/api/admin/permissions' && method === 'GET') {
    const settings = await getSettingsForOrg(admin.user.orgId, clients);
    return json({ permissions: settings.permissions || {} });
  }

  if (pathname === '/api/admin/permissions' && method === 'POST') {
    const body = await parseJsonBody(request);
    if (!body) return json({ error: 'Invalid JSON body' }, 400);
    const settings = await saveSettingsForOrg(admin.user.orgId, { permissions: body.permissions || {} }, clients);
    return json({ success: true, permissions: settings.permissions || {} });
  }

  if (pathname === '/api/admin/invite/manual' && method === 'POST') {
    const body = await parseJsonBody(request);
    if (!body) return json({ error: 'Invalid JSON body' }, 400);

    const name = String(body.name || '').trim();
    const email = normalizeEmail(body.email);
    const role = ['pending', 'approved', 'leader', 'admin'].includes(body.role) ? body.role : 'leader';

    if (!name || !email || !isValidEmail(email)) return json({ error: 'Name and valid email required' }, 400);

    const { data: existingProfile } = await clients.service
      .from('profiles')
      .select('user_id')
      .eq('email', email)
      .maybeSingle();
    if (existingProfile?.user_id) return json({ error: 'Account already exists' }, 409);

    const token = generateToken();
    const tokenHash = await hashToken(token);
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    await clients.service.from('invite_tokens').insert({
      org_id: admin.user.orgId,
      email,
      role,
      token_hash: tokenHash,
      expires_at: expiresAt,
      created_by_user_id: admin.user.id,
    });

    await sendEmail(env, {
      to: email,
      subject: `You've been invited to StoryTrackr`,
      html: `<p>Hi ${name},</p><p>You have been invited to join StoryTrackr.</p><p><a href="${env.APP_ORIGIN}/signup?inviteToken=${token}">Set Up Your Account</a></p>`,
    });

    return json({ success: true });
  }

  if (pathname === '/api/admin/invite/qr' && method === 'POST') {
    const body = (await parseJsonBody(request)) || {};
    const role = ['pending', 'approved', 'leader', 'admin'].includes(body.role) ? body.role : 'leader';
    const hours = Math.min(72, Math.max(24, Number(body.expiresHours) || 48));

    const token = generateToken();
    const tokenHash = await hashToken(token);
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

    await clients.service.from('invite_tokens').insert({
      org_id: admin.user.orgId,
      role,
      token_hash: tokenHash,
      expires_at: expiresAt,
      created_by_user_id: admin.user.id,
    });

    return json({ success: true, inviteLink: `${env.APP_ORIGIN}/signup?inviteToken=${token}`, expiresHours: hours });
  }

  if (pathname === '/api/admin/ministry' && method === 'DELETE') {
    const body = await parseJsonBody(request);
    if (!body) return json({ error: 'Invalid JSON body' }, 400);
    const confirmName = String(body.confirmName || '').trim();

    const { data: org } = await clients.service
      .from('organizations')
      .select('id, name')
      .eq('id', admin.user.orgId)
      .maybeSingle();
    if (!org?.id) return json({ error: 'Organization not found' }, 404);
    if (confirmName !== org.name) return json({ error: 'Ministry name does not match' }, 400);

    await clients.service.from('organizations').delete().eq('id', org.id);
    return clearSessionCookies(json({ success: true, deleted: 1 }));
  }

  if (pathname === '/api/admin/archive-graduates' && method === 'POST') {
    const { data: students } = await clients.service
      .from('students')
      .select('id, grade, archived_at')
      .eq('org_id', admin.user.orgId)
      .eq('grade', 12)
      .is('archived_at', null);

    const ids = (students || []).map(s => s.id);
    if (ids.length) {
      await clients.service
        .from('students')
        .update({ archived_at: new Date().toISOString() })
        .in('id', ids)
        .eq('org_id', admin.user.orgId);
    }

    return json({ success: true, archived: ids.length });
  }

  if (pathname === '/api/admin/analytics' && method === 'GET') {
    const { data: rows } = await clients.service
      .from('interactions')
      .select('leader_name, student_id, note_date, created_at')
      .eq('org_id', admin.user.orgId)
      .limit(10000);

    const interactions = rows || [];
    const leaderCounts = new Map();
    const studentCounts = new Map();
    const monthlyCounts = new Map();

    for (const row of interactions) {
      const leader = row.leader_name || 'Leader';
      leaderCounts.set(leader, (leaderCounts.get(leader) || 0) + 1);
      if (row.student_id) studentCounts.set(row.student_id, (studentCounts.get(row.student_id) || 0) + 1);
      const month = (row.note_date || row.created_at || '').slice(0, 7);
      if (month) monthlyCounts.set(month, (monthlyCounts.get(month) || 0) + 1);
    }

    const ids = [...studentCounts.keys()];
    let namesMap = new Map();
    if (ids.length) {
      const { data: students } = await clients.service.from('students').select('id, name').in('id', ids);
      namesMap = new Map((students || []).map(s => [s.id, s.name]));
    }

    const topLeaders = [...leaderCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));
    const topStudents = [...studentCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, count]) => ({ name: namesMap.get(id) || 'Student', count }));
    const monthly = [...monthlyCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, count]) => ({ month, count }));

    return json({ topLeaders, topStudents, monthly, total: interactions.length });
  }

  if (pathname === '/api/admin/attendance-schedule' && method === 'GET') {
    const { data } = await clients.service
      .from('attendance_schedules')
      .select('*')
      .eq('org_id', admin.user.orgId)
      .order('created_at', { ascending: false });
    return json({ schedules: data || [] });
  }

  if (pathname === '/api/admin/attendance-schedule' && method === 'POST') {
    const body = await parseJsonBody(request);
    if (!body) return json({ error: 'Invalid JSON body' }, 400);

    const weekday = String(body.weekday || '').toLowerCase();
    const startTimeLocal = String(body.startTimeLocal || '').slice(0, 8);
    const timezone = String(body.timezone || '').trim() || 'America/Chicago';
    const active = body.active !== false;

    if (!DAY_NAMES.includes(weekday)) return json({ error: 'Invalid weekday' }, 400);
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(startTimeLocal)) return json({ error: 'Invalid startTimeLocal (HH:MM or HH:MM:SS)' }, 400);

    if (body.id) {
      const { data, error } = await clients.service
        .from('attendance_schedules')
        .update({ weekday, start_time_local: startTimeLocal, timezone, active })
        .eq('org_id', admin.user.orgId)
        .eq('id', body.id)
        .select('*')
        .maybeSingle();
      if (error || !data) return json({ error: error?.message || 'Could not update schedule' }, 400);
      await saveSettingsForOrg(admin.user.orgId, { timezone }, clients);
      return json({ success: true, schedule: data });
    }

    const { data, error } = await clients.service
      .from('attendance_schedules')
      .insert({
        org_id: admin.user.orgId,
        weekday,
        start_time_local: startTimeLocal,
        timezone,
        active,
      })
      .select('*')
      .single();

    if (error || !data) return json({ error: error?.message || 'Could not create schedule' }, 400);
    await saveSettingsForOrg(admin.user.orgId, { timezone }, clients);
    return json({ success: true, schedule: data });
  }

  if (pathname === '/api/admin/groups' && method === 'GET') {
    const { data: groups } = await clients.service
      .from('small_groups')
      .select('*')
      .eq('org_id', admin.user.orgId)
      .order('name', { ascending: true });

    const groupRows = groups || [];
    const groupIds = groupRows.map(g => g.id);

    let leaderLinks = [];
    if (groupIds.length) {
      const { data } = await clients.service
        .from('small_group_leaders')
        .select('group_id, user_id')
        .in('group_id', groupIds);
      leaderLinks = data || [];
    }

    const leaderIds = [...new Set(leaderLinks.map(l => l.user_id))];
    let profiles = [];
    if (leaderIds.length) {
      const { data } = await clients.service
        .from('profiles')
        .select('user_id, name, email')
        .in('user_id', leaderIds);
      profiles = data || [];
    }
    const profileMap = new Map(profiles.map(p => [p.user_id, p]));

    const groupsWithLeaders = groupRows.map(group => ({
      ...group,
      leaders: leaderLinks
        .filter(link => link.group_id === group.id)
        .map(link => {
          const p = profileMap.get(link.user_id);
          return {
            userId: link.user_id,
            name: p?.name || 'Leader',
            email: p?.email || '',
          };
        }),
    }));

    return json({ groups: groupsWithLeaders });
  }

  if (pathname === '/api/admin/groups' && method === 'POST') {
    const body = await parseJsonBody(request);
    if (!body) return json({ error: 'Invalid JSON body' }, 400);

    const name = String(body.name || '').trim();
    if (!name) return json({ error: 'Group name required' }, 400);

    const sk = body.sk === 'ms' ? 'ms' : 'hs';
    const section = ['core', 'loose', 'fringe'].includes(body.section) ? body.section : 'core';
    const active = body.active !== false;

    const { data, error } = await clients.service
      .from('small_groups')
      .insert({ org_id: admin.user.orgId, name, sk, section, active })
      .select('*')
      .single();

    if (error || !data) return json({ error: error?.message || 'Could not create group' }, 400);
    return json({ success: true, group: data });
  }

  const groupUpdateMatch = pathname.match(/^\/api\/admin\/groups\/([^/]+)$/);
  if (groupUpdateMatch && method === 'PUT') {
    const groupId = groupUpdateMatch[1];
    const body = await parseJsonBody(request);
    if (!body) return json({ error: 'Invalid JSON body' }, 400);

    const patch = {};
    if (body.name !== undefined) patch.name = String(body.name || '').trim();
    if (body.sk !== undefined) patch.sk = body.sk === 'ms' ? 'ms' : 'hs';
    if (body.section !== undefined) patch.section = ['core', 'loose', 'fringe'].includes(body.section) ? body.section : 'core';
    if (body.active !== undefined) patch.active = !!body.active;

    const { data, error } = await clients.service
      .from('small_groups')
      .update(patch)
      .eq('org_id', admin.user.orgId)
      .eq('id', groupId)
      .select('*')
      .maybeSingle();

    if (error || !data) return json({ error: error?.message || 'Could not update group' }, 400);
    return json({ success: true, group: data });
  }

  const groupLeadersMatch = pathname.match(/^\/api\/admin\/groups\/([^/]+)\/leaders$/);
  if (groupLeadersMatch && method === 'POST') {
    const groupId = groupLeadersMatch[1];
    const body = await parseJsonBody(request);
    if (!body) return json({ error: 'Invalid JSON body' }, 400);

    const leaderUserIds = Array.isArray(body.leaderUserIds) ? [...new Set(body.leaderUserIds.map(String))] : [];

    const { data: group } = await clients.service
      .from('small_groups')
      .select('id')
      .eq('org_id', admin.user.orgId)
      .eq('id', groupId)
      .maybeSingle();

    if (!group?.id) return json({ error: 'Group not found' }, 404);

    await clients.service.from('small_group_leaders').delete().eq('group_id', groupId);

    if (leaderUserIds.length) {
      await clients.service.from('small_group_leaders').insert(leaderUserIds.map(userId => ({ group_id: groupId, user_id: userId })));
    }

    return json({ success: true, leaderUserIds });
  }

  return json({ error: 'Not found' }, 404);
}

async function handleInviteRedeem(request, env, clients) {
  const body = await parseJsonBody(request);
  if (!body) return json({ error: 'Invalid JSON body' }, 400);

  const token = String(body.token || '');
  const name = String(body.name || '').trim();
  const password = String(body.password || '');
  let email = normalizeEmail(body.email);

  if (!token || !name || !password) return json({ error: 'Missing fields' }, 400);
  if (!validatePasswordStrength(password)) return json({ error: 'Weak password' }, 400);

  const tokenHash = await hashToken(token);
  const nowIso = new Date().toISOString();

  const { data: invite } = await clients.service
    .from('invite_tokens')
    .select('*')
    .eq('token_hash', tokenHash)
    .gt('expires_at', nowIso)
    .is('used_at', null)
    .maybeSingle();

  if (!invite) return json({ error: 'Invite invalid or expired' }, 400);

  email = email || normalizeEmail(invite.email);
  if (!email || !isValidEmail(email)) return json({ error: 'Valid email required' }, 400);

  const { data: existingProfile } = await clients.service
    .from('profiles')
    .select('user_id')
    .eq('email', email)
    .maybeSingle();
  if (existingProfile?.user_id) return json({ error: 'Account already exists' }, 409);

  const { data: createdUserData, error: createError } = await clients.service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });

  if (createError || !createdUserData?.user) return json({ error: createError?.message || 'Could not create account' }, 400);

  const userId = createdUserData.user.id;

  await clients.service.from('profiles').insert({
    user_id: userId,
    email,
    name,
    preferences: {},
  });

  await clients.service.from('org_members').upsert({
    org_id: invite.org_id,
    user_id: userId,
    role: invite.role || 'leader',
    status: 'approved',
  }, { onConflict: 'org_id,user_id' });

  await clients.service.from('invite_tokens').update({ used_at: nowIso }).eq('id', invite.id);

  const { data: signInData } = await clients.anon.auth.signInWithPassword({ email, password });
  let response = json({ success: true, message: 'Account created.' });
  if (signInData?.session) {
    response = attachSessionCookies(response, env, signInData.session, invite.org_id);
  }
  return response;
}

async function handleOwner(request, pathname, method, env, clients) {
  const auth = request.headers.get('authorization') || '';
  if (!env.OWNER_SECRET || auth !== `Bearer ${env.OWNER_SECRET}`) {
    return json({ error: 'Unauthorized' }, 403);
  }

  if (pathname === '/api/owner/ministries' && method === 'GET') {
    const { data: orgs } = await clients.service
      .from('organizations')
      .select('id, name, created_at, owner_user_id')
      .order('created_at', { ascending: true });

    const ministries = [];

    for (const org of orgs || []) {
      const [{ count: studentCount }, { count: leaderCount }, { count: activityCount }] = await Promise.all([
        clients.service.from('students').select('*', { count: 'exact', head: true }).eq('org_id', org.id),
        clients.service.from('org_members').select('*', { count: 'exact', head: true }).eq('org_id', org.id),
        clients.service.from('activity_events').select('*', { count: 'exact', head: true }).eq('org_id', org.id),
      ]);

      ministries.push({
        id: org.id,
        name: org.name,
        createdAt: org.created_at,
        ownerId: org.owner_user_id,
        studentCount: studentCount || 0,
        leaderCount: leaderCount || 0,
        activityCount: activityCount || 0,
      });
    }

    return json({ ministries });
  }

  const deleteMatch = pathname.match(/^\/api\/owner\/ministry\/([^/]+)$/);
  if (deleteMatch && method === 'DELETE') {
    const orgId = deleteMatch[1];
    if (!orgId) return json({ error: 'Invalid org id' }, 400);

    await clients.service.from('organizations').delete().eq('id', orgId);
    return json({ success: true, deleted: 1, orgId });
  }

  return json({ error: 'Not found' }, 404);
}

async function handleBrainDump(request, env, clients) {
  const perm = await requirePermission(request, env, clients, 'brainDump', 'edit');
  if (!perm.ok) return perm.response;

  const body = await parseJsonBody(request);
  if (!body) return json({ error: 'Invalid JSON body' }, 400);

  const text = String(body.text || '').trim();
  const roster = Array.isArray(body.roster) ? body.roster : [];
  if (!text) return json({ error: 'No text provided' }, 400);

  const parsed = parseTextForStudents(text, roster);
  return json({ parsed });
}

function parseTextForStudents(text, roster) {
  const results = new Map();
  const sentences = text
    .split(/(?<=[.!?\n])/)
    .map(s => s.trim())
    .filter(s => s.length > 5);

  const nameIndex = roster.map(name => ({
    canonical: name,
    parts: String(name).toLowerCase().split(/\s+/).filter(p => p.length > 2),
  }));

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    for (const { canonical, parts } of nameIndex) {
      if (parts.some(p => lower.includes(p))) {
        if (!results.has(canonical)) results.set(canonical, []);
        results.get(canonical).push(sentence);
        break;
      }
    }
  }

  return [...results.entries()].map(([name, matchedSentences]) => ({
    name,
    summary: matchedSentences.join(' ').slice(0, 500),
    matched: true,
  }));
}

async function handleUpload(request, env, clients) {
  const session = await getSessionContext(request, env, clients);
  if (!session.user) return json({ error: 'Not authenticated' }, 401);
  if (session.user.isDemoMode) return json({ error: 'Demo is read-only' }, 403);

  const ip = getClientIp(request);
  const allowed = await checkRateLimit(clients, `upload:${ip}`, 30, 60 * 15);
  if (!allowed) return json({ error: 'Too many upload attempts. Please try again later.' }, 429);

  const url = new URL(request.url);
  const type = String(url.searchParams.get('type') || 'student').toLowerCase();
  if (!ALLOWED_UPLOAD_TYPES.has(type)) return json({ error: 'Invalid upload type' }, 400);

  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') return json({ error: 'No file provided' }, 400);

  const mime = String(file.type || '').toLowerCase();
  if (!ALLOWED_UPLOAD_MIME.has(mime)) return json({ error: 'Unsupported file type' }, 400);
  if (file.size > MAX_UPLOAD_BYTES) return json({ error: 'File too large (max 5MB)' }, 400);

  const buffer = new Uint8Array(await file.arrayBuffer());
  const ext = mime.includes('png') ? 'png' : mime.includes('svg') ? 'svg' : mime.includes('webp') ? 'webp' : 'jpg';
  const random = Math.random().toString(36).slice(2, 9);
  const timestamp = Date.now();

  let key;
  if (type === 'logo') key = `logos/logo_${timestamp}.${ext}`;
  else if (type === 'leader') key = `photos/leader_${timestamp}_${random}.${ext}`;
  else key = `photos/student_${timestamp}_${random}.${ext}`;

  const { error } = await clients.service.storage.from('media').upload(key, buffer, {
    contentType: mime,
    upsert: false,
  });

  if (error) return json({ error: error.message || 'Upload failed' }, 400);

  const { data } = clients.service.storage.from('media').getPublicUrl(key);

  let logoTone = null;
  if (type === 'logo' && !mime.includes('svg')) {
    const slice = buffer.slice(0, Math.min(2048, buffer.length));
    const avg = slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : 128;
    logoTone = avg < 127 ? 'dark' : 'light';
  }

  return json({ url: data.publicUrl, logoTone });
}

async function handleDemoSessionCreate(request, env, clients) {
  const ip = getClientIp(request);
  const allowed = await checkRateLimit(clients, `demo:create:${ip}`, 10, 60 * 60);
  if (!allowed) return json({ error: 'Too many demo requests. Try again later.' }, 429);

  const rawToken = generateToken();
  const tokenHash = await hashToken(rawToken);
  const expiresAt = new Date(Date.now() + DEMO_TOKEN_TTL_SECONDS * 1000).toISOString();

  await clients.service.from('demo_tokens').insert({ token_hash: tokenHash, expires_at: expiresAt });

  return json({ ok: true, token: rawToken, redirect: `${env.APP_ORIGIN}/demo?token=${rawToken}` });
}

async function ensureDemoOrg(orgId, clients) {
  const { data: existing } = await clients.service
    .from('organizations')
    .select('id')
    .eq('id', orgId)
    .maybeSingle();

  if (!existing?.id) {
    await clients.service.from('organizations').insert({
      id: orgId,
      name: 'StoryTrackr Demo Ministry',
      timezone: 'America/Chicago',
      owner_user_id: null,
    });

    await clients.service.from('org_settings').upsert({
      org_id: orgId,
      settings: deepMerge(DEFAULT_SETTINGS, { ministryName: 'StoryTrackr Demo Ministry' }),
    }, { onConflict: 'org_id' });
  }
}

async function seedDemoData(orgId, clients) {
  await ensureDemoOrg(orgId, clients);

  const { data: existing } = await clients.service
    .from('students')
    .select('id')
    .eq('org_id', orgId)
    .limit(1);

  if (existing && existing.length > 0) return;

  await clients.service.from('students').insert(DEMO_STUDENTS.map(s => ({
    id: s.id,
    org_id: orgId,
    sk: s.sk,
    section: s.section,
    roster_index: s.roster_index,
    name: s.name,
    grade: s.grade,
    school: s.school,
    birthday: s.birthday,
    group_sport: s.group_sport,
    primary_goal: s.primary_goal,
    goals: s.goals,
    photo_url: s.photo_url,
    connected_this_quarter: s.connected_this_quarter,
    last_interaction_date: s.last_interaction_date,
    last_interaction_summary: s.last_interaction_summary,
    last_leader: s.last_leader,
    interaction_count: s.interaction_count,
  })));
}

async function handleDemoSessionRedeem(request, env, clients) {
  const body = await parseJsonBody(request);
  if (!body) return json({ error: 'Invalid JSON body' }, 400);

  const token = String(body.token || '');
  if (!token) return json({ error: 'Token required' }, 400);

  const tokenHash = await hashToken(token);
  const nowIso = new Date().toISOString();

  const { data: demoToken } = await clients.service
    .from('demo_tokens')
    .select('token_hash, expires_at, used_at')
    .eq('token_hash', tokenHash)
    .gt('expires_at', nowIso)
    .is('used_at', null)
    .maybeSingle();

  if (!demoToken) return json({ error: 'Demo token invalid or already used' }, 400);

  await clients.service
    .from('demo_tokens')
    .update({ used_at: nowIso })
    .eq('token_hash', tokenHash);

  const sessionRaw = generateToken();
  const sessionHash = await hashToken(sessionRaw);
  const expiresAt = new Date(Date.now() + DEMO_SESSION_TTL_SECONDS * 1000).toISOString();
  const orgId = env.DEMO_TENANT_ID || DEMO_ORG_ID_FALLBACK;

  await clients.service.from('demo_sessions').insert({
    token_hash: sessionHash,
    org_id: orgId,
    expires_at: expiresAt,
  });

  await seedDemoData(orgId, clients);

  let response = json({ ok: true });
  const headers = new Headers(response.headers);
  headers.append('Set-Cookie', buildCookie(DEMO_COOKIE, sessionRaw, { maxAge: DEMO_SESSION_TTL_SECONDS }));
  headers.append('Set-Cookie', clearCookie(SESSION_COOKIE_ACCESS));
  headers.append('Set-Cookie', clearCookie(SESSION_COOKIE_REFRESH));
  headers.append('Set-Cookie', clearCookie(SESSION_COOKIE_ORG));
  response = new Response(response.body, { status: response.status, headers });
  return response;
}

async function handleNotifications(request, pathname, method, env, clients) {
  const session = await getSessionContext(request, env, clients);
  if (!session.user || !session.user.id || session.user.isDemoMode) return json({ notifications: [] });

  if (pathname === '/api/notifications' && method === 'GET') {
    const { data } = await clients.service
      .from('notifications')
      .select('*')
      .eq('org_id', session.user.orgId)
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    return json({ notifications: data || [] });
  }

  if (pathname === '/api/notifications/read' && method === 'POST') {
    const body = (await parseJsonBody(request)) || {};
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];

    if (!ids.length) {
      await clients.service
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('org_id', session.user.orgId)
        .eq('user_id', session.user.id)
        .is('read_at', null);
      return json({ success: true, updated: 'all' });
    }

    await clients.service
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('org_id', session.user.orgId)
      .eq('user_id', session.user.id)
      .in('id', ids);

    return json({ success: true, ids });
  }

  return json({ error: 'Not found' }, 404);
}

async function handleAttendance(request, pathname, method, env, clients) {
  if (pathname === '/api/attendance/checkin/current' && method === 'GET') {
    const perm = await requirePermission(request, env, clients, 'attendance', 'edit');
    if (!perm.ok) return perm.response;

    const currentEvent = await getCurrentAttendanceEvent(perm.user.orgId, clients);
    if (!currentEvent) return json({ event: null, groups: [] });

    const groupIds = await getLeaderGroupIds(perm.user, clients);
    if (!groupIds.length && perm.user.orgRole !== 'admin') return json({ event: currentEvent, groups: [] });

    const studentsQuery = clients.service
      .from('students')
      .select('id, name, photo_url, small_group_id, small_groups(name)')
      .eq('org_id', perm.user.orgId)
      .is('archived_at', null)
      .order('name', { ascending: true });

    const { data: students } = perm.user.orgRole === 'admin'
      ? await studentsQuery
      : await studentsQuery.in('small_group_id', groupIds);

    const studentRows = students || [];
    const studentIds = studentRows.map(s => s.id);

    let recordMap = new Map();
    if (studentIds.length) {
      const { data: records } = await clients.service
        .from('attendance_records')
        .select('student_id, present, note, marked_at')
        .eq('event_id', currentEvent.id)
        .in('student_id', studentIds);

      recordMap = new Map((records || []).map(r => [r.student_id, r]));
    }

    const groups = new Map();
    for (const student of studentRows) {
      const groupId = student.small_group_id || 'ungrouped';
      if (!groups.has(groupId)) {
        groups.set(groupId, {
          groupId: student.small_group_id,
          groupName: student.small_groups?.name || 'Unassigned',
          students: [],
        });
      }

      const record = recordMap.get(student.id);
      groups.get(groupId).students.push({
        studentId: student.id,
        name: student.name,
        photoUrl: student.photo_url,
        present: record ? !!record.present : null,
        note: record?.note || '',
        markedAt: record?.marked_at || null,
      });
    }

    return json({ event: currentEvent, groups: [...groups.values()] });
  }

  if (pathname === '/api/attendance/events' && method === 'GET') {
    const perm = await requirePermission(request, env, clients, 'attendance', 'view');
    if (!perm.ok) return perm.response;

    const { data: events } = await clients.service
      .from('attendance_events')
      .select('*')
      .eq('org_id', perm.user.orgId)
      .order('event_date_local', { ascending: false })
      .limit(24);

    const list = [];
    for (const event of events || []) {
      const { data: records } = await clients.service
        .from('attendance_records')
        .select('present')
        .eq('event_id', event.id);
      const total = (records || []).length;
      const present = (records || []).filter(r => r.present).length;
      list.push({ ...event, totalRecords: total, presentCount: present });
    }

    return json({ events: list });
  }

  const eventMatch = pathname.match(/^\/api\/attendance\/events\/([^/]+)$/);
  if (eventMatch && method === 'GET') {
    const perm = await requirePermission(request, env, clients, 'attendance', 'view');
    if (!perm.ok) return perm.response;

    const eventId = eventMatch[1];
    const { data: event } = await clients.service
      .from('attendance_events')
      .select('*')
      .eq('org_id', perm.user.orgId)
      .eq('id', eventId)
      .maybeSingle();
    if (!event) return json({ error: 'Event not found' }, 404);

    const { data: records } = await clients.service
      .from('attendance_records')
      .select('student_id, present, note, marked_at, students(name, photo_url, small_group_id, small_groups(name))')
      .eq('event_id', eventId);

    const { data: guests } = await clients.service
      .from('attendance_guests')
      .select('id, group_id, guest_name, note, created_at')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });

    return json({
      event,
      records: (records || []).map(r => ({
        studentId: r.student_id,
        present: !!r.present,
        note: r.note || '',
        markedAt: r.marked_at,
        studentName: r.students?.name || 'Student',
        photoUrl: r.students?.photo_url || null,
        smallGroupId: r.students?.small_group_id || null,
        smallGroupName: r.students?.small_groups?.name || null,
      })),
      guests: guests || [],
    });
  }

  const recordsMatch = pathname.match(/^\/api\/attendance\/events\/([^/]+)\/records$/);
  if (recordsMatch && method === 'POST') {
    const perm = await requirePermission(request, env, clients, 'attendance', 'edit');
    if (!perm.ok) return perm.response;
    if (perm.user.isDemoMode) return json({ error: 'Demo is read-only' }, 403);

    const eventId = recordsMatch[1];
    const body = await parseJsonBody(request);
    if (!body) return json({ error: 'Invalid JSON body' }, 400);
    const records = Array.isArray(body.records) ? body.records : [];
    if (!records.length) return json({ error: 'No records provided' }, 400);

    const { data: event } = await clients.service
      .from('attendance_events')
      .select('id')
      .eq('id', eventId)
      .eq('org_id', perm.user.orgId)
      .maybeSingle();
    if (!event?.id) return json({ error: 'Event not found' }, 404);

    let allowedStudentIds = null;
    if (perm.user.orgRole !== 'admin') {
      const groupIds = await getLeaderGroupIds(perm.user, clients);
      if (!groupIds.length) return json({ error: 'No assigned groups for attendance' }, 403);
      const { data: allowedStudents } = await clients.service
        .from('students')
        .select('id')
        .eq('org_id', perm.user.orgId)
        .in('small_group_id', groupIds);
      allowedStudentIds = new Set((allowedStudents || []).map(s => s.id));
    }

    const upserts = [];
    for (const row of records) {
      const studentId = String(row.studentId || '');
      if (!studentId) continue;
      if (allowedStudentIds && !allowedStudentIds.has(studentId)) continue;
      upserts.push({
        event_id: eventId,
        student_id: studentId,
        present: !!row.present,
        note: row.note ? String(row.note) : null,
        marked_by_user_id: perm.user.id,
        marked_at: new Date().toISOString(),
      });
    }

    if (!upserts.length) return json({ error: 'No permitted records to save' }, 400);

    const { error } = await clients.service.from('attendance_records').upsert(upserts, { onConflict: 'event_id,student_id' });
    if (error) return json({ error: error.message || 'Could not save attendance' }, 400);

    return json({ success: true, saved: upserts.length });
  }

  const guestsMatch = pathname.match(/^\/api\/attendance\/events\/([^/]+)\/guests$/);
  if (guestsMatch && method === 'POST') {
    const perm = await requirePermission(request, env, clients, 'attendance', 'edit');
    if (!perm.ok) return perm.response;
    if (perm.user.isDemoMode) return json({ error: 'Demo is read-only' }, 403);

    const eventId = guestsMatch[1];
    const body = await parseJsonBody(request);
    if (!body) return json({ error: 'Invalid JSON body' }, 400);

    const guestName = String(body.guestName || '').trim();
    const note = String(body.note || '').trim();
    const groupId = body.groupId || null;

    if (!guestName) return json({ error: 'Guest name required' }, 400);

    const { data: event } = await clients.service
      .from('attendance_events')
      .select('id')
      .eq('id', eventId)
      .eq('org_id', perm.user.orgId)
      .maybeSingle();
    if (!event?.id) return json({ error: 'Event not found' }, 404);

    if (perm.user.orgRole !== 'admin' && groupId) {
      const groupIds = await getLeaderGroupIds(perm.user, clients);
      if (!groupIds.includes(groupId)) return json({ error: 'Forbidden' }, 403);
    }

    const { data, error } = await clients.service
      .from('attendance_guests')
      .insert({
        event_id: eventId,
        group_id: groupId,
        guest_name: guestName,
        note: note || null,
        added_by_user_id: perm.user.id,
      })
      .select('*')
      .single();

    if (error || !data) return json({ error: error?.message || 'Could not add guest' }, 400);
    return json({ success: true, guest: data });
  }

  return json({ error: 'Not found' }, 404);
}

async function getCurrentAttendanceEvent(orgId, clients) {
  const { data: openEvent } = await clients.service
    .from('attendance_events')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'open')
    .order('starts_at_utc', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openEvent) return openEvent;

  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: latest } = await clients.service
    .from('attendance_events')
    .select('*')
    .eq('org_id', orgId)
    .gte('starts_at_utc', since)
    .order('starts_at_utc', { ascending: false })
    .limit(1)
    .maybeSingle();

  return latest || null;
}

async function getLeaderGroupIds(user, clients) {
  if (user.orgRole === 'admin') {
    const { data: groups } = await clients.service
      .from('small_groups')
      .select('id')
      .eq('org_id', user.orgId)
      .eq('active', true);
    return (groups || []).map(g => g.id);
  }

  const { data: links } = await clients.service
    .from('small_group_leaders')
    .select('group_id')
    .eq('user_id', user.id);

  if (!links?.length) return [];

  const groupIds = [...new Set(links.map(l => l.group_id))];
  const { data: groups } = await clients.service
    .from('small_groups')
    .select('id')
    .eq('org_id', user.orgId)
    .in('id', groupIds)
    .eq('active', true);

  return (groups || []).map(g => g.id);
}

async function handleAttendanceCron(request, env, clients, requestId) {
  const auth = request.headers.get('authorization') || '';
  const vercelHeader = request.headers.get('x-vercel-cron');

  if (!vercelHeader && (!env.CRON_SECRET || auth !== `Bearer ${env.CRON_SECRET}`)) {
    return json({ error: 'Unauthorized' }, 403);
  }

  const now = new Date();
  const { data: schedules } = await clients.service
    .from('attendance_schedules')
    .select('*')
    .eq('active', true);

  let opened = 0;
  let notified = 0;

  for (const schedule of schedules || []) {
    if (!shouldOpenScheduleNow(schedule, now)) continue;

    const localDate = getLocalDateString(now, schedule.timezone);
    const startsAtUtc = localDateTimeToUtc(localDate, String(schedule.start_time_local || '19:00:00'), schedule.timezone).toISOString();

    const { data: existing } = await clients.service
      .from('attendance_events')
      .select('id')
      .eq('schedule_id', schedule.id)
      .eq('event_date_local', localDate)
      .maybeSingle();

    if (existing?.id) continue;

    const { data: created, error } = await clients.service
      .from('attendance_events')
      .insert({
        org_id: schedule.org_id,
        schedule_id: schedule.id,
        event_date_local: localDate,
        starts_at_utc: startsAtUtc,
        status: 'open',
        opened_at: now.toISOString(),
        created_by_system: true,
      })
      .select('*')
      .single();

    if (error || !created?.id) continue;
    opened += 1;

    const { data: groupLinks } = await clients.service
      .from('small_group_leaders')
      .select('user_id, small_groups!inner(org_id)')
      .eq('small_groups.org_id', schedule.org_id);

    const leaderIds = [...new Set((groupLinks || []).map(link => link.user_id))];
    if (!leaderIds.length) continue;

    const { data: profiles } = await clients.service
      .from('profiles')
      .select('user_id, email, name')
      .in('user_id', leaderIds);

    const notifications = leaderIds.map(userId => ({
      org_id: schedule.org_id,
      user_id: userId,
      type: 'attendance_open',
      title: 'Attendance is open',
      body: 'Take attendance for your group tonight.',
      action_url: '/attendance',
    }));

    await clients.service.from('notifications').insert(notifications);

    for (const profile of profiles || []) {
      const sent = await sendEmail(env, {
        to: profile.email,
        subject: 'StoryTrackr attendance is open',
        html: `<p>Hi ${profile.name || 'Leader'},</p><p>Attendance is open for tonight. Please take attendance for your small group.</p><p><a href="${env.APP_ORIGIN}/attendance">Open Attendance</a></p>`,
      });
      if (sent) notified += 1;
    }
  }

  return json({ success: true, opened, notified, requestId });
}

function getZonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const out = {};
  for (const part of parts) {
    if (part.type !== 'literal') out[part.type] = part.value;
  }

  return {
    weekday: String(out.weekday || '').toLowerCase(),
    year: Number(out.year || '0'),
    month: Number(out.month || '1'),
    day: Number(out.day || '1'),
    hour: Number(out.hour || '0'),
    minute: Number(out.minute || '0'),
  };
}

function getLocalDateString(date, timeZone) {
  const p = getZonedParts(date, timeZone);
  const mm = String(p.month).padStart(2, '0');
  const dd = String(p.day).padStart(2, '0');
  return `${p.year}-${mm}-${dd}`;
}

function parseTimeToMinutes(value) {
  const [hh = '0', mm = '0'] = String(value || '').split(':');
  return Number(hh) * 60 + Number(mm);
}

function shouldOpenScheduleNow(schedule, now) {
  const zoned = getZonedParts(now, schedule.timezone || 'America/Chicago');
  if (zoned.weekday !== String(schedule.weekday || '').toLowerCase()) return false;

  const nowMins = zoned.hour * 60 + zoned.minute;
  const startMins = parseTimeToMinutes(schedule.start_time_local || '19:00:00');
  const diff = nowMins - startMins;

  return diff >= 0 && diff <= 70;
}

function localDateTimeToUtc(localDate, localTime, timeZone) {
  const [year, month, day] = localDate.split('-').map(Number);
  const [hour, minute] = String(localTime).split(':').map(Number);

  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour || 0, minute || 0, 0));
  const localFromGuess = new Date(utcGuess.toLocaleString('en-US', { timeZone }));
  const diff = utcGuess.getTime() - localFromGuess.getTime();
  return new Date(utcGuess.getTime() + diff);
}
