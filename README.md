# StoryTrackr (Supabase + Vercel)

StoryTrackr is a youth ministry SaaS for tracking:
- Student roster
- Attendance (event-based, small-group-led)
- Interaction stories / notes
- Leader activity and admin controls

This repo now runs on:
- Supabase (Auth, Postgres, Storage)
- Vercel (Dashboard app + API + Cron, plus Marketing site)

No legacy Cloudflare/KV/R2 data migration is required.

---

## Current Deployment Topology

- Marketing site: `https://storytrackr.app`
- Dashboard app: `https://dashboard.storytrackr.app`

Two Vercel projects:
1. **Dashboard Project** (repo root): serves `/app` SPA + `/api/*` endpoints + daily cron
2. **Marketing Project** (`marketing/` directory): serves static marketing pages

---

## Project Structure

```txt
.
├── api/
│   ├── [...route].js            # Main API router (/api/*)
│   ├── cron/attendance.js       # Scheduled cron endpoint (/api/cron/attendance)
│   └── manifest.js              # Dynamic manifest endpoint
├── app/
│   ├── index.html               # Dashboard SPA shell
│   └── assets/
│       ├── app.js               # Frontend SPA logic
│       └── styles.css           # Frontend styling
├── marketing/
│   ├── index.html
│   ├── assets/
│   └── vercel.json              # Marketing-only Vercel config
├── server/
│   └── api-router.js            # Supabase-backed API implementation
├── supabase/
│   └── migrations/
│       └── 0001_initial.sql     # Full schema + indexes + triggers + media bucket
├── vercel.json                  # Dashboard Vercel config + rewrites + cron
├── .env.example
└── package.json
```

---

## Features Included

### Existing feature parity
- Email/password signup/login/logout
- Profile update + password change/reset
- Multi-tenant org membership and admin roles
- Student CRUD (HS/MS + sections)
- Story/interaction logging per student
- Activity feed + analytics
- Brain dump parser
- Admin invites (manual + link/QR)
- Demo mode (token + seeded demo roster)
- Photo upload (`student`, `leader`, `logo`) to Supabase Storage

### New attendance system
- Recurring attendance schedule per org (day/time/timezone)
- Small groups
- Leaders assigned to groups
- Attendance check-in screen (present/absent binary)
- Guest capture with notes
- Admin attendance controls in AdminLand
- In-app notifications + email reminders when attendance opens
- Scheduled cron to auto-open sessions

---

## 1. Prerequisites

Install locally:
- Node.js 20+
- npm
- Vercel account + CLI (`npm i -g vercel`) optional but helpful
- Supabase account
- Resend account

---

## 2. Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and create a new project.
2. In Supabase dashboard, copy:
   - **Project URL**
   - **Anon key**
   - **Service role key**

### Run the schema migration

1. Open `supabase/migrations/0001_initial.sql`.
2. In Supabase Dashboard → **SQL Editor** → New query.
3. Paste the full SQL file and run it.

This creates all required tables, indexes, triggers, and the `media` storage bucket.

---

## 3. Configure Auth in Supabase

In Supabase Dashboard:

1. **Authentication → Providers → Email**
   - Enable Email provider.
2. **Authentication → URL Configuration**
   - Add Site URL: `https://dashboard.storytrackr.app`
   - Add redirect URLs:
     - `https://dashboard.storytrackr.app/reset-password`
     - `http://localhost:3000/reset-password`

---

## 4. Configure Storage

Migration creates bucket `media`.

Verify in **Storage → Buckets**:
- Bucket name: `media`
- Public: enabled

Uploads are performed server-side through API using service role credentials.

---

## 5. Configure Resend

1. Create account at [https://resend.com](https://resend.com).
2. Verify your sending domain (recommended: `storytrackr.app`).
3. Create API key.
4. Choose a sender identity, for example:
   - `StoryTrackr <noreply@storytrackr.app>`

Used for:
- Password reset emails
- Leader invite emails
- Attendance-open reminder emails

---

## 6. Local Environment Setup

1. Copy env template:

```bash
cp .env.example .env.local
```

2. Fill all values in `.env.local`:

```bash
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
APP_ORIGIN=http://localhost:3000
MARKETING_ORIGIN=http://localhost:3000
OWNER_SECRET=...
CRON_SECRET=...
RESEND_API_KEY=...
RESEND_FROM_EMAIL="StoryTrackr <noreply@storytrackr.app>"
DEMO_TENANT_ID=00000000-0000-0000-0000-000000000001
```

3. Install deps:

```bash
npm install
```

4. Run local dev:

```bash
npm run dev
```

5. Open:
- Dashboard: `http://localhost:3000`
- API routes under `http://localhost:3000/api/*`

---

## 7. Deploy Dashboard Project on Vercel

1. In Vercel, **Add New Project**.
2. Import this repository.
3. Project settings:
   - Root Directory: repository root (`.`)
   - Framework preset: Other
   - Build Command: `npm run build`
   - Output Directory: `public`
4. Add Environment Variables (Production + Preview):
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `APP_ORIGIN=https://dashboard.storytrackr.app`
   - `MARKETING_ORIGIN=https://storytrackr.app`
   - `OWNER_SECRET`
   - `CRON_SECRET`
   - `RESEND_API_KEY`
   - `RESEND_FROM_EMAIL`
   - `DEMO_TENANT_ID` (UUID value)
5. Deploy.
6. Add custom domain `dashboard.storytrackr.app` to this project.

`vercel.json` already defines:
- API routing
- SPA rewrites
- Security headers
- Daily cron (`/api/cron/attendance`) for Vercel Hobby compatibility

Important:
- Do not set Dashboard Root Directory to `app`.
- Do not set Dashboard Output Directory to `app`.
- `npm run build` generates `public/` static files (and `public/app` for backward compatibility).
- If Root Directory is set to `app`, `/login` and other SPA routes can return 404.

---

## 8. Deploy Marketing Project on Vercel

1. Add **another** Vercel project from same repo.
2. Set Root Directory to `marketing`.
3. Deploy.
4. Add custom domain `storytrackr.app`.

`marketing/vercel.json` handles:
- Static marketing routes
- Security headers
- Redirects `/login`, `/signup`, `/demo` to dashboard domain

---

## 9. DNS Setup

In your DNS provider:
- Point `storytrackr.app` to Marketing Vercel project.
- Point `dashboard.storytrackr.app` to Dashboard Vercel project.

Use Vercel-provided DNS targets exactly as shown in each project’s Domain settings.

---

## 10. Verify After Deploy

### Auth
- Signup creates ministry + admin membership.
- Login/logout works with cookies on `dashboard.storytrackr.app`.
- Forgot/reset email arrives and reset link works.

### Core app
- Add/edit/delete student.
- Add interaction note.
- Activity stats update.
- Upload student and leader photos.

### Attendance
- In AdminLand: set event day/time/timezone.
- Create small group(s).
- Assign leaders to groups.
- Wait for cron window or manually call cron endpoint with secret for testing.
- Leader sees attendance screen and can mark present/absent.
- Guest note save works.

### Notifications
- Attendance-open notification appears in app.
- Attendance-open email is delivered.

---

## 11. API Surface

Existing routes kept:
- `/api/auth/*`, `/api/me`, `/api/profile/update`
- `/api/students*`
- `/api/student/interactions`
- `/api/activity/*`
- `/api/admin/*`
- `/api/settings*`
- `/api/brain-dump`
- `/api/upload-photo`
- `/api/demo-session*`
- `/api/owner/*`

New routes:
- `/api/attendance/events`
- `/api/attendance/events/:eventId`
- `/api/attendance/events/:eventId/records`
- `/api/attendance/events/:eventId/guests`
- `/api/attendance/checkin/current`
- `/api/admin/attendance-schedule`
- `/api/admin/groups`
- `/api/admin/groups/:groupId`
- `/api/admin/groups/:groupId/leaders`
- `/api/notifications`
- `/api/notifications/read`

---

## 12. Notes

- Worker/KV/R2 code still exists in legacy folders for reference, but active runtime is now Vercel + Supabase.
- This implementation assumes a clean start (no legacy data migration).
