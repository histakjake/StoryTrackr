-- StoryTrackr initial schema
-- Run against your Supabase project via the SQL editor or CLI

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- orgs — one row per organisation (school/ministry)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orgs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- org_settings — per-org configuration stored as JSONB
--
-- Expected shape of `settings`:
--   {
--     "passcode": "abc123",          -- Quick View passcode (optional)
--     "demoEnabled": true,           -- whether /api/demo-session is active
--     "timezone": "America/Chicago"
--   }
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS org_settings (
  org_id      UUID PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  settings    JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- users — leaders who log in with email + password (managed by Supabase Auth)
--
-- We mirror only the minimal profile info we need here; auth lives in
-- Supabase's auth.users table.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY,   -- same UUID as auth.users.id
  org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email       TEXT NOT NULL UNIQUE,
  role        TEXT NOT NULL DEFAULT 'leader' CHECK (role IN ('admin', 'leader', 'readonly')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- students — core roster table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS students (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id                  UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,

  -- Identity
  name                    TEXT NOT NULL,
  grade                   TEXT,                        -- e.g. "9", "10", "6"
  school                  TEXT,
  birthday                DATE,

  -- Roster classification
  sk                      TEXT NOT NULL DEFAULT 'hs'   -- school-kind: 'hs' | 'ms'
                            CHECK (sk IN ('hs', 'ms')),
  section                 TEXT NOT NULL DEFAULT 'core' -- 'core' | 'loose' | 'fringe'
                            CHECK (section IN ('core', 'loose', 'fringe')),
  roster_index            INTEGER NOT NULL DEFAULT 0,  -- sort order within section

  -- Goals
  primary_goal            TEXT,
  goals                   JSONB NOT NULL DEFAULT '[]'::JSONB,

  -- Media
  photo_url               TEXT,

  -- Interaction summary (denormalised for fast reads)
  last_interaction_date   DATE,
  last_interaction_summary TEXT,
  last_leader             TEXT,
  interaction_count       INTEGER NOT NULL DEFAULT 0,

  -- Soft delete
  archived_at             TIMESTAMPTZ,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_students_org_id ON students(org_id);
CREATE INDEX IF NOT EXISTS idx_students_archived ON students(org_id, archived_at) WHERE archived_at IS NULL;

-- ---------------------------------------------------------------------------
-- interactions — hangout / contact log entries
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS interactions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  leader      TEXT,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  summary     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interactions_student ON interactions(student_id, date DESC);

-- ---------------------------------------------------------------------------
-- Trigger: keep students.updated_at current
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_students_updated_at ON students;
CREATE TRIGGER trg_students_updated_at
  BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS policies (Row-Level Security)
-- Enable RLS so service-role key bypasses but anon key cannot
-- ---------------------------------------------------------------------------
ALTER TABLE orgs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE students     ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;

-- Service role (used by our server) bypasses RLS automatically.
-- No additional policies needed for server-side usage.
