/**
 * app/assets/app.js — StoryTrackr frontend
 *
 * Calls the following API endpoints:
 *   POST /api/auth/login          - leader email/password login
 *   POST /api/auth/logout         - logout
 *   POST /api/auth/passcode       - quick-view passcode login
 *   GET  /api/sheet/read          - load full roster
 *   POST /api/sheet/write?action= - add | update | delete student
 *   POST /api/demo-session        - redeem demo token (auto-enter from ?demo=TOKEN)
 *
 * P2 fixes applied:
 *   - Loading state shown while roster fetches
 *   - Catch blocks surface errors via showToast (no silent failures)
 *   - Demo auto-login from ?demo= query param
 *   - Forgot password link wired to Supabase reset flow (via /api/auth/reset)
 *   - Empty roster state shows a helpful message
 *   - Error toasts dismiss after 6 s (vs 3 s for success)
 *   - Field-level validation highlights invalid inputs
 *   - Confirmation message shown after password reset email sent
 */

'use strict';

// ── State ──────────────────────────────────────────────────────────────────

const STATE = {
  roster: {
    hs: { core: [], loose: [], fringe: [] },
    ms: { core: [], loose: [], fringe: [] },
  },
  currentSchool: 'hs',
  session:  null,   // { orgId, role, readonly }
  editingId: null,  // student id being edited (null = add)
  canEdit:  false,
};

// ── DOM refs ───────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const els = {
  loader:           $('loader'),
  bootError:        $('boot-error'),
  bootErrorMsg:     $('boot-error-msg'),
  bootDebug:        $('boot-debug'),
  bootRetryBtn:     $('boot-retry-btn'),
  loginGate:        $('login-gate'),
  app:              $('app'),

  // Login
  loginForm:        $('login-form'),
  loginEmail:       $('login-email'),
  loginPassword:    $('login-password'),
  loginBtn:         $('login-btn'),
  errEmail:         $('err-email'),
  errPassword:      $('err-password'),
  forgotBtn:        $('forgot-btn'),
  resetSent:        $('reset-sent'),

  passcodeForm:     $('passcode-form'),
  passcodeInput:    $('passcode-input'),
  passcodeBtn:      $('passcode-btn'),
  errPasscode:      $('err-passcode'),

  // App
  readonlyBadge:    $('readonly-badge'),
  userEmail:        $('user-email'),
  logoutBtn:        $('logout-btn'),
  addStudentBtn:    $('add-student-btn'),
  rosterLoader:     $('roster-loader'),
  rosterGrid:       $('roster-grid'),

  // Student form modal
  studentModal:     $('student-modal'),
  studentModalTitle: $('student-modal-title'),
  studentModalClose: $('student-modal-close'),
  studentModalCancel: $('student-modal-cancel'),
  studentForm:      $('student-form'),
  sfName:           $('sf-name'),
  sfGrade:          $('sf-grade'),
  sfSchool:         $('sf-school'),
  sfSk:             $('sf-sk'),
  sfSection:        $('sf-section'),
  sfBirthday:       $('sf-birthday'),
  sfGoal:           $('sf-goal'),
  errSfName:        $('err-sf-name'),
  studentFormSubmit: $('student-form-submit'),

  // Detail modal
  detailModal:      $('detail-modal'),
  detailModalTitle: $('detail-modal-title'),
  detailModalClose: $('detail-modal-close'),
  detailContent:    $('detail-content'),
  detailFooter:     $('detail-footer'),
};

// ── Toast ─────────────────────────────────────────────────────────────────

function showToast(message, type = 'info') {
  const container = $('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);

  // Error toasts stay longer so users can read them (P2 fix)
  const delay = type === 'error' ? 6000 : 3000;
  setTimeout(() => el.remove(), delay);
}

// ── API helpers ───────────────────────────────────────────────────────────

async function apiFetch(url, options = {}) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 10_000);
  try {
    return await fetch(url, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
      signal: controller.signal,
      ...options,
    });
  } finally {
    clearTimeout(tid);
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────

async function tryLeaderLogin(email, password) {
  const res = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Login failed');
  return data;
}

async function tryPasscodeLogin(passcode) {
  const res = await apiFetch('/api/auth/passcode', {
    method: 'POST',
    body: JSON.stringify({ passcode }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Wrong passcode');
  return data;
}

async function tryDemoLogin(token) {
  const res = await apiFetch('/api/demo-session', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Invalid demo token');
  return data;
}

async function doLogout() {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch (err) {
    // P2 fix: never silently swallow logout errors
    showToast('Logout failed. Please try again.', 'error');
    throw err;
  }
}

// ── Roster loading ────────────────────────────────────────────────────────

async function loadRoster() {
  // P2 fix: show loading spinner before fetch
  els.rosterLoader.classList.remove('hidden');
  els.rosterGrid.innerHTML = '';

  try {
    const res = await apiFetch('/api/sheet/read');
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
    const roster = await res.json();
    STATE.roster = roster;
    renderRoster();
  } catch (err) {
    // P2 fix: surface errors instead of silent catch
    showToast(`Failed to load roster: ${err.message}`, 'error');
    renderEmptyState('Could not load roster. Check your connection.');
  } finally {
    els.rosterLoader.classList.add('hidden');
  }
}

// ── Roster rendering ─────────────────────────────────────────────────────────

function renderRoster() {
  const sk   = STATE.currentSchool;
  const data = STATE.roster[sk] ?? { core: [], loose: [], fringe: [] };

  const total = (data.core?.length ?? 0) + (data.loose?.length ?? 0) + (data.fringe?.length ?? 0);

  // P2 fix: empty state instead of blank grid
  if (total === 0) {
    renderEmptyState(
      STATE.canEdit
        ? 'No students yet. Click "+ Add Student" to add your first.'
        : 'No students in this roster.'
    );
    return;
  }

  const sections = [
    { key: 'core',   label: 'Core' },
    { key: 'loose',  label: 'Loose' },
    { key: 'fringe', label: 'Fringe' },
  ];

  const html = sections.map(({ key, label }) => {
    const students = data[key] ?? [];
    const cards = students.map(renderStudentCard).join('');
    return `
      <div class="roster-section">
        <div class="section-header ${key}">${label} — ${students.length}</div>
        <div class="student-grid" data-section="${key}" data-sk="${sk}">
          ${cards || '<div class="text-muted text-sm" style="padding:.5rem">None</div>'}
        </div>
      </div>
    `;
  }).join('');

  els.rosterGrid.innerHTML = html;

  // Attach click listeners to cards
  els.rosterGrid.querySelectorAll('.student-card').forEach(card => {
    card.addEventListener('click', () => openDetailModal(card.dataset.id));
  });
}

function renderEmptyState(message) {
  els.rosterGrid.innerHTML = `
    <div class="empty-state">
      <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="opacity:.35;margin:0 auto">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
      </svg>
      <p>${message}</p>
    </div>
  `;
}

function renderStudentCard(student) {
  const meta = [student.grade ? `Grade ${student.grade}` : '', student.school].filter(Boolean).join(' · ');
  const lastContact = student.lastInteractionDate
    ? `Last contact: ${student.lastInteractionDate}`
    : 'No recorded contact';

  return `
    <div class="student-card" data-id="${student.id}" role="button" tabindex="0"
         aria-label="View ${escHtml(student.name)}">
      <div class="s-name">${escHtml(student.name)}</div>
      ${meta ? `<div class="s-meta">${escHtml(meta)}</div>` : ''}
      <div class="s-last">${escHtml(lastContact)}</div>
    </div>
  `;
}

// ── Student form modal ─────────────────────────────────────────────────────────

function openStudentModal(student = null) {
  STATE.editingId = student?.id ?? null;
  els.studentModalTitle.textContent = student ? 'Edit Student' : 'Add Student';
  els.studentFormSubmit.textContent = student ? 'Save Changes' : 'Add Student';

  // Reset + populate form
  els.studentForm.reset();
  clearFieldErrors();

  if (student) {
    els.sfName.value    = student.name    ?? '';
    els.sfGrade.value   = student.grade   ?? '';
    els.sfSchool.value  = student.school  ?? '';
    els.sfSk.value      = student.sk      ?? 'hs';
    els.sfSection.value = student.section ?? 'core';
    els.sfBirthday.value = student.birthday ?? '';
    els.sfGoal.value    = student.primaryGoal ?? '';
  }

  els.studentModal.classList.remove('hidden');
  els.sfName.focus();
}

function closeStudentModal() {
  els.studentModal.classList.add('hidden');
  STATE.editingId = null;
}

function clearFieldErrors() {
  document.querySelectorAll('.field-error').forEach(el => el.classList.remove('visible'));
  document.querySelectorAll('.form-control').forEach(el => el.classList.remove('error'));
}

function showFieldError(errEl, inputEl) {
  errEl.classList.add('visible');
  inputEl.classList.add('error');    // P2 fix: highlight the field too
  inputEl.focus();
}

async function handleStudentFormSubmit(e) {
  e.preventDefault();
  clearFieldErrors();

  const name = els.sfName.value.trim();
  if (!name) {
    showFieldError(els.errSfName, els.sfName);
    return;
  }

  const payload = {
    name,
    grade:       els.sfGrade.value.trim()   || null,
    school:      els.sfSchool.value.trim()  || null,
    sk:          els.sfSk.value,
    section:     els.sfSection.value,
    birthday:    els.sfBirthday.value       || null,
    primaryGoal: els.sfGoal.value.trim()    || null,
  };

  els.studentFormSubmit.disabled = true;
  els.studentFormSubmit.textContent = 'Saving…';

  try {
    let url = '/api/sheet/write';
    if (STATE.editingId) {
      url += '?action=update';
      payload.id = STATE.editingId;
    } else {
      url += '?action=add';
    }

    const res = await apiFetch(url, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

    showToast(STATE.editingId ? 'Student updated.' : 'Student added.', 'success');
    closeStudentModal();
    await loadRoster();
  } catch (err) {
    // P2 fix: surface error
    showToast(`Could not save: ${err.message}`, 'error');
  } finally {
    els.studentFormSubmit.disabled = false;
    els.studentFormSubmit.textContent = STATE.editingId ? 'Save Changes' : 'Add Student';
  }
}

// ── Student detail modal ──────────────────────────────────────────────────────

function findStudent(id) {
  for (const sk of ['hs', 'ms']) {
    for (const section of ['core', 'loose', 'fringe']) {
      const found = (STATE.roster[sk]?.[section] ?? []).find(s => s.id === id);
      if (found) return found;
    }
  }
  return null;
}

function openDetailModal(id) {
  const student = findStudent(id);
  if (!student) return;

  els.detailModalTitle.textContent = student.name;

  const goals = (student.goals ?? []).map(g => `<li>${escHtml(g)}</li>`).join('');

  els.detailContent.innerHTML = `
    <div class="detail-section">
      <h3>Info</h3>
      <p class="text-sm">${[
        student.grade  ? `Grade ${student.grade}` : '',
        student.school ? student.school : '',
        student.birthday ? `Birthday: ${student.birthday}` : '',
      ].filter(Boolean).join(' · ') || 'No info'}</p>
    </div>
    ${student.primaryGoal ? `
    <div class="detail-section">
      <h3>Primary Goal</h3>
      <p class="text-sm">${escHtml(student.primaryGoal)}</p>
    </div>` : ''}
    ${goals ? `
    <div class="detail-section">
      <h3>Goals</h3>
      <ul class="text-sm" style="padding-left:1.2rem">${goals}</ul>
    </div>` : ''}
    <div class="detail-section">
      <h3>Recent Interaction</h3>
      <p class="text-sm">${student.lastInteractionDate
        ? `${student.lastInteractionDate} — ${escHtml(student.lastInteractionSummary ?? '')} (${escHtml(student.lastLeader ?? '')})`
        : 'No recorded interactions yet.'}</p>
    </div>
    <div class="detail-section">
      <h3>Total Interactions</h3>
      <p class="text-sm">${student.interactionCount ?? 0}</p>
    </div>
  `;

  // Footer actions (only for editors)
  els.detailFooter.innerHTML = '';
  if (STATE.canEdit) {
    els.detailFooter.innerHTML = `
      <button class="btn btn-danger btn-sm" id="delete-student-btn">Delete</button>
      <button class="btn btn-secondary btn-sm" id="edit-student-btn">Edit</button>
    `;
    $('edit-student-btn').addEventListener('click', () => {
      closeDetailModal();
      openStudentModal(student);
    });
    $('delete-student-btn').addEventListener('click', () => handleDeleteStudent(student.id, student.name));
  }

  els.detailModal.classList.remove('hidden');
}

function closeDetailModal() {
  els.detailModal.classList.add('hidden');
}

async function handleDeleteStudent(id, name) {
  if (!confirm(`Delete ${name}? This cannot be undone.`)) return;

  try {
    const res = await apiFetch('/api/sheet/write?action=delete', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

    showToast('Student deleted.', 'success');
    closeDetailModal();
    await loadRoster();
  } catch (err) {
    showToast(`Delete failed: ${err.message}`, 'error');
  }
}

// ── Forgot password ──────────────────────────────────────────────────────────

async function handleForgotPassword() {
  const email = els.loginEmail.value.trim();
  if (!email) {
    showFieldError(els.errEmail, els.loginEmail);
    showToast('Enter your email first.', 'info');
    return;
  }

  try {
    await apiFetch('/api/auth/reset', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    // Show confirmation regardless of whether email exists (security best practice)
    els.resetSent.classList.remove('hidden');
    showToast('If that email exists, a reset link has been sent.', 'info');
  } catch (err) {
    showToast('Could not send reset email. Try again.', 'error');
  }
}

// ── Login flow ───────────────────────────────────────────────────────────────

async function handleLeaderLoginSubmit(e) {
  e.preventDefault();
  clearFieldErrors();

  const email    = els.loginEmail.value.trim();
  const password = els.loginPassword.value;

  let valid = true;
  if (!email || !email.includes('@')) { showFieldError(els.errEmail, els.loginEmail); valid = false; }
  if (!password)                       { showFieldError(els.errPassword, els.loginPassword); valid = false; }
  if (!valid) return;

  els.loginBtn.disabled = true;
  els.loginBtn.textContent = 'Signing in…';

  try {
    const data = await tryLeaderLogin(email, password);
    STATE.session = { orgId: data.orgId, role: data.role, readonly: false };
    STATE.canEdit = true;
    enterApp({ email, readonly: false });
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    els.loginBtn.disabled = false;
    els.loginBtn.textContent = 'Sign in';
  }
}

async function handlePasscodeSubmit(e) {
  e.preventDefault();
  clearFieldErrors();

  const passcode = els.passcodeInput.value.trim();
  if (!passcode) { showFieldError(els.errPasscode, els.passcodeInput); return; }

  els.passcodeBtn.disabled = true;
  els.passcodeBtn.textContent = 'Checking…';

  try {
    const data = await tryPasscodeLogin(passcode);
    STATE.session = { orgId: data.orgId, role: 'readonly', readonly: true };
    STATE.canEdit = false;
    enterApp({ email: '', readonly: true });
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    els.passcodeBtn.disabled = false;
    els.passcodeBtn.textContent = 'Enter';
  }
}

// ── App enter / leave ─────────────────────────────────────────────────────────

function enterApp({ email = '', readonly = false } = {}) {
  els.loginGate.classList.add('hidden');
  els.app.classList.add('visible');

  if (readonly) {
    els.readonlyBadge.classList.remove('hidden');
    els.addStudentBtn.classList.add('hidden');
  } else {
    els.readonlyBadge.classList.add('hidden');
    els.addStudentBtn.classList.remove('hidden');
  }

  if (email) els.userEmail.textContent = email;

  loadRoster();
}

async function handleLogout() {
  els.logoutBtn.disabled = true;
  try {
    await doLogout();
    STATE.session = null;
    STATE.canEdit = false;
    STATE.roster  = { hs: { core: [], loose: [], fringe: [] }, ms: { core: [], loose: [], fringe: [] } };

    els.app.classList.remove('visible');
    els.loginGate.classList.remove('hidden');
    els.loginForm.reset();
    els.passcodeForm.reset();
    els.rosterGrid.innerHTML = '';
    els.readonlyBadge.classList.add('hidden');
    els.addStudentBtn.classList.remove('hidden');
  } catch (_) {
    // error already shown by doLogout
  } finally {
    els.logoutBtn.disabled = false;
  }
}

// ── School tabs ──────────────────────────────────────────────────────────────

function setSchoolTab(sk) {
  STATE.currentSchool = sk;
  document.querySelectorAll('.school-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.school === sk);
  });
  renderRoster();
}

// ── Tab (login form) switching ─────────────────────────────────────────────────

function initLoginTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $(`tab-${tab}`).classList.add('active');
      clearFieldErrors();
    });
  });
}

// ── Security: HTML escaping ───────────────────────────────────────────────────

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Demo auto-login (P2) ───────────────────────────────────────────────────────

async function checkDemoParam() {
  const params = new URLSearchParams(window.location.search);
  const demoToken = params.get('demo');
  if (!demoToken) return false;

  try {
    const data = await tryDemoLogin(demoToken);
    STATE.session = { orgId: data.orgId, role: 'readonly', readonly: true };
    STATE.canEdit = false;
    enterApp({ email: '', readonly: true });
    // Clean up URL
    window.history.replaceState({}, '', window.location.pathname);
    return true;
  } catch (err) {
    showToast(`Demo login failed: ${err.message}`, 'error');
    return false;
  }
}

// ── Init ────────────────────────────────────────────────────────────────────

async function init() {
  // Wire login tabs
  initLoginTabs();

  // Login form events
  els.loginForm.addEventListener('submit', handleLeaderLoginSubmit);
  els.passcodeForm.addEventListener('submit', handlePasscodeSubmit);
  els.forgotBtn.addEventListener('click', handleForgotPassword);

  // App events
  els.logoutBtn.addEventListener('click', handleLogout);
  els.addStudentBtn.addEventListener('click', () => openStudentModal());

  // School tabs
  document.querySelectorAll('.school-tab').forEach(btn => {
    btn.addEventListener('click', () => setSchoolTab(btn.dataset.school));
  });

  // Student form modal
  els.studentForm.addEventListener('submit', handleStudentFormSubmit);
  els.studentModalClose.addEventListener('click', closeStudentModal);
  els.studentModalCancel.addEventListener('click', closeStudentModal);
  els.studentModal.addEventListener('click', e => { if (e.target === els.studentModal) closeStudentModal(); });

  // Detail modal
  els.detailModalClose.addEventListener('click', closeDetailModal);
  els.detailModal.addEventListener('click', e => { if (e.target === els.detailModal) closeDetailModal(); });

  // Keyboard: close modals on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeStudentModal(); closeDetailModal(); }
  });

  // Check for demo token in URL (P2 fix)
  const autologgedIn = await checkDemoParam();

  if (!autologgedIn) {
    // Check if already logged in by probing the roster endpoint
    try {
      const res = await apiFetch('/api/sheet/read');
      if (res.ok) {
        const roster = await res.json();
        STATE.roster = roster;
        STATE.canEdit = true; // assume editable if already logged in
        enterApp({ email: '', readonly: false });
        // Skip loadRoster since we already have data
        els.rosterLoader.classList.add('hidden');
        renderRoster();
        els.loader.classList.add('hidden');
        return;
      }
      // non-200 (e.g. 401) → fall through to show login gate
    } catch (err) {
      if (err.name === 'AbortError') {
        // Timeout — show visible error instead of silent spinner
        els.loader.classList.add('hidden');
        els.bootErrorMsg.textContent = 'The server didn\'t respond within 10 s. Is it running?';
        els.bootDebug.textContent = `Endpoint: /api/sheet/read\nError: timeout`;
        els.bootError.classList.remove('hidden');
        els.bootRetryBtn.addEventListener('click', () => {
          els.bootError.classList.add('hidden');
          els.loader.classList.remove('hidden');
          init();
        }, { once: true });
        return;
      }
      // network error — fall through to show login gate
    }

    els.loader.classList.add('hidden');
    els.loginGate.classList.remove('hidden');
  } else {
    els.loader.classList.add('hidden');
  }
}

// Start
init().catch(err => {
  console.error('[StoryTrackr] Init error:', err);
  els.loader.classList.add('hidden');
  els.loginGate.classList.remove('hidden');
  showToast('App failed to initialise. Please refresh.', 'error');
});
