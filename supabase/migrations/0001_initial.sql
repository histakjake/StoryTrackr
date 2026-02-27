create extension if not exists pgcrypto;
create extension if not exists citext;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  campus text not null default '',
  timezone text not null default 'America/Chicago',
  owner_user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email citext unique not null,
  name text not null default '',
  photo_url text,
  leader_since text,
  fun_fact text,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'pending' check (role in ('pending', 'approved', 'leader', 'admin', 'demo', 'viewer')),
  status text not null default 'pending_approval' check (status in ('pending_approval', 'approved', 'disabled')),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create table if not exists public.org_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.small_groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  sk text not null default 'hs' check (sk in ('hs', 'ms')),
  section text not null default 'core' check (section in ('core', 'loose', 'fringe')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  sk text not null default 'hs' check (sk in ('hs', 'ms')),
  section text not null default 'core' check (section in ('core', 'loose', 'fringe')),
  roster_index integer not null,
  name text not null,
  grade integer,
  school text not null default '',
  birthday date,
  group_sport text not null default '',
  primary_goal text not null default '',
  goals jsonb not null default '[]'::jsonb,
  photo_url text,
  family_contacted boolean not null default false,
  connected_this_quarter boolean not null default false,
  last_interaction_date date,
  last_interaction_summary text not null default '',
  last_leader text not null default '',
  interaction_count integer not null default 0,
  small_group_id uuid references public.small_groups(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, sk, section, roster_index)
);

create table if not exists public.small_group_leaders (
  group_id uuid not null references public.small_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.interactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  leader_user_id uuid references auth.users(id) on delete set null,
  leader_name text not null,
  summary text not null,
  note_date date,
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  type text not null,
  student_id uuid references public.students(id) on delete set null,
  interaction_id uuid references public.interactions(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance_schedules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  weekday text not null check (weekday in ('sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday')),
  start_time_local time not null,
  timezone text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  schedule_id uuid references public.attendance_schedules(id) on delete set null,
  event_date_local date not null,
  starts_at_utc timestamptz not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_at timestamptz,
  created_by_system boolean not null default false,
  created_at timestamptz not null default now(),
  unique (schedule_id, event_date_local)
);

create table if not exists public.attendance_records (
  event_id uuid not null references public.attendance_events(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  present boolean not null,
  note text,
  marked_by_user_id uuid references auth.users(id) on delete set null,
  marked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, student_id)
);

create table if not exists public.attendance_guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.attendance_events(id) on delete cascade,
  group_id uuid references public.small_groups(id) on delete set null,
  guest_name text not null,
  note text,
  added_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  action_url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.invite_tokens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email citext,
  role text not null default 'leader' check (role in ('pending', 'approved', 'leader', 'admin')),
  token_hash text unique not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text unique not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.rate_limits (
  scope_key text primary key,
  window_start timestamptz not null,
  count integer not null default 0
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.demo_tokens (
  token_hash text primary key,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.demo_sessions (
  token_hash text primary key,
  org_id text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_org_members_org_user on public.org_members (org_id, user_id);
create index if not exists idx_org_members_user on public.org_members (user_id);
create index if not exists idx_students_org_section on public.students (org_id, sk, section, roster_index);
create index if not exists idx_students_org_group on public.students (org_id, small_group_id);
create index if not exists idx_interactions_org_created on public.interactions (org_id, created_at desc);
create index if not exists idx_interactions_student_created on public.interactions (student_id, created_at desc);
create index if not exists idx_activity_org_created on public.activity_events (org_id, created_at desc);
create index if not exists idx_attendance_schedules_org_active on public.attendance_schedules (org_id, active);
create index if not exists idx_attendance_events_org_date on public.attendance_events (org_id, event_date_local desc);
create index if not exists idx_notifications_user_created on public.notifications (user_id, created_at desc);
create index if not exists idx_invite_tokens_org_expires on public.invite_tokens (org_id, expires_at desc);
create index if not exists idx_password_reset_tokens_expires on public.password_reset_tokens (expires_at);
create index if not exists idx_audit_events_org_created on public.audit_events (org_id, created_at desc);
create index if not exists idx_small_groups_org on public.small_groups (org_id, sk, section);

create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger trg_org_members_updated_at
before update on public.org_members
for each row execute function public.set_updated_at();

create trigger trg_org_settings_updated_at
before update on public.org_settings
for each row execute function public.set_updated_at();

create trigger trg_small_groups_updated_at
before update on public.small_groups
for each row execute function public.set_updated_at();

create trigger trg_students_updated_at
before update on public.students
for each row execute function public.set_updated_at();

create trigger trg_interactions_updated_at
before update on public.interactions
for each row execute function public.set_updated_at();

create trigger trg_attendance_schedules_updated_at
before update on public.attendance_schedules
for each row execute function public.set_updated_at();

create trigger trg_attendance_records_updated_at
before update on public.attendance_records
for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.org_members enable row level security;
alter table public.org_settings enable row level security;
alter table public.students enable row level security;
alter table public.small_groups enable row level security;
alter table public.small_group_leaders enable row level security;
alter table public.interactions enable row level security;
alter table public.activity_events enable row level security;
alter table public.attendance_schedules enable row level security;
alter table public.attendance_events enable row level security;
alter table public.attendance_records enable row level security;
alter table public.attendance_guests enable row level security;
alter table public.notifications enable row level security;
alter table public.invite_tokens enable row level security;
alter table public.password_reset_tokens enable row level security;
alter table public.rate_limits enable row level security;
alter table public.audit_events enable row level security;
alter table public.demo_tokens enable row level security;
alter table public.demo_sessions enable row level security;

-- Service role bypasses RLS. End-user policies can be added later if direct client access is introduced.
