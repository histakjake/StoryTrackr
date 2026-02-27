# Deployment Troubleshooting (Vercel + Supabase)

## 1) Wrong site changed after deploy

There are two separate Vercel projects:
- `storytrackr.app` -> marketing project (`marketing/`)
- `dashboard.storytrackr.app` -> dashboard project (repo root)

If you deploy one and expect changes in the other, verify project root directory and domain mapping in Vercel.

## 2) API works locally but fails in production

Check Dashboard project environment variables:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_ORIGIN=https://dashboard.storytrackr.app`
- `MARKETING_ORIGIN=https://storytrackr.app`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `CRON_SECRET`

Then redeploy.

## 3) Login succeeds but `/api/me` returns null

Usually cookie scope/origin mismatch.

Confirm:
- Requests are made from `dashboard.storytrackr.app`.
- Browser allows secure cookies.
- `APP_ORIGIN` is set exactly to `https://dashboard.storytrackr.app`.

## 4) Upload endpoint errors

Verify in Supabase Storage:
- bucket `media` exists
- bucket is public

If migration was not run, execute `supabase/migrations/0001_initial.sql` in Supabase SQL Editor.

## 5) Password reset or invites not sending

Check Resend:
- domain verified
- API key valid
- sender address matches verified domain

Check env vars:
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

## 6) Attendance events not opening automatically

Cron is daily via `vercel.json` (Hobby-compatible default):
- path: `/api/cron/attendance`
- schedule: `0 6 * * *`

Checks:
- Cron is enabled in Dashboard Vercel project.
- Attendance schedule exists and is active in AdminLand.
- Schedule timezone/day/time are valid.
- `CRON_SECRET` exists (if you call endpoint manually with bearer auth).

## 7) In-app attendance notifications missing

Notifications only appear when:
- a schedule-generated event is newly opened
- leaders are assigned to small groups

Verify leader assignment in AdminLand -> Attendance Settings -> Small Groups.

## 8) Domain redirects wrong on marketing pages

Marketing redirects are controlled by `marketing/vercel.json`:
- `/login` -> `https://dashboard.storytrackr.app/login`
- `/signup` -> `https://dashboard.storytrackr.app/signup`
- `/demo` -> `https://dashboard.storytrackr.app/demo`

Ensure Marketing Vercel project root is set to `marketing/`.

## 9) Dashboard returns 404

Most common cause is dashboard project settings mismatch.

In Vercel Dashboard project settings, confirm:
- Root Directory is repository root (`.`), not `app`.
- Framework preset is `Other`.
- Build Command is `npm run build`.
- Output Directory is `public` (not `app`).
- `dashboard.storytrackr.app` is attached to the Dashboard project (not Marketing).

Then run a fresh redeploy from the latest commit.
