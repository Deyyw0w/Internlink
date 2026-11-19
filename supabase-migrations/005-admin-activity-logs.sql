-- ============================================================================
-- InternLink — Supabase SQL Migration (005)
-- ============================================================================
-- Creates the admin_activity_logs table for audit logging every admin CRUD
-- operation (add / update / delete) across the admin dashboard.
--
-- Each row records: who performed it, what action, which table + record,
-- before/after snapshots (jsonb), and when. The log is append-only — there
-- are no UPDATE or DELETE policies on this table so the trail stays intact.
--
-- RLS policies are non-recursive (USING (true) / auth.uid() comparisons only)
-- to avoid PostgreSQL 42P17 recursion.
--
-- Run in Supabase Dashboard → SQL Editor. Idempotent where possible.
-- ============================================================================

-- 1. admin_activity_logs table (append-only audit trail)
CREATE TABLE IF NOT EXISTS admin_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL CHECK (action_type IN ('create', 'update', 'delete')),
  table_name text NOT NULL,
  record_id text NOT NULL,
  old_values jsonb,
  new_values jsonb,
  performed_by uuid,
  performed_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE admin_activity_logs ENABLE ROW LEVEL SECURITY;

-- 3. RLS policies — non-recursive.
--    Everyone (anon + authenticated) can read the logs.
--    Authenticated users can insert their own log entries (performed_by = auth.uid()).
--    Nobody can update or delete log entries — the trail is immutable.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'admin_activity_logs' AND policyname = 'Admin activity logs are viewable by everyone'
  ) THEN DROP POLICY "Admin activity logs are viewable by everyone" ON admin_activity_logs; END IF;
  CREATE POLICY "Admin activity logs are viewable by everyone"
    ON admin_activity_logs FOR SELECT
    TO anon
    USING (true);
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'admin_activity_logs' AND policyname = 'Authenticated users can view admin activity logs'
  ) THEN DROP POLICY "Authenticated users can view admin activity logs" ON admin_activity_logs; END IF;
  CREATE POLICY "Authenticated users can view admin activity logs"
    ON admin_activity_logs FOR SELECT
    TO authenticated
    USING (true);
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'admin_activity_logs' AND policyname = 'Authenticated users can insert admin activity logs'
  ) THEN DROP POLICY "Authenticated users can insert admin activity logs" ON admin_activity_logs; END IF;
  CREATE POLICY "Authenticated users can insert admin activity logs"
    ON admin_activity_logs FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = performed_by);
END $$;

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_performed_at ON admin_activity_logs(performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_table_name ON admin_activity_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_performed_by ON admin_activity_logs(performed_by);

-- ============================================================================
-- Verification queries (run after the migration to confirm):
--
-- SELECT * FROM admin_activity_logs ORDER BY performed_at DESC LIMIT 20;
-- SELECT action_type, count(*) FROM admin_activity_logs GROUP BY action_type;
-- ============================================================================
