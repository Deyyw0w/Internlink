-- ============================================================================
-- InternLink — Supabase SQL Migration (010)
-- ============================================================================
-- Adds an UPDATE RLS policy on `internship_applications` (`USING (true)`)
-- so a student can set `status = 'removal-requested'` on their own application
-- row (request-and-approve flow). The admin delete path (approve removal) is
-- already covered by migration 003's DELETE policy. Runs idempotently.
--
-- RLS note: uses `USING (true)` only — no self-join / `auth.uid()` on the same
-- table — to avoid PostgreSQL 42P17 recursive-policy errors (login 500).
-- Run in Supabase Dashboard → SQL Editor.
-- ============================================================================

-- UPDATE on internship_applications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'internship_applications'
      AND policyname = 'Authenticated users can update internship applications'
  ) THEN
    CREATE POLICY "Authenticated users can update internship applications"
      ON internship_applications FOR UPDATE
      TO authenticated
      USING (true);
  END IF;
END $$;

-- ============================================================================
-- Verification queries (run after the migration to confirm):
--
-- SELECT policyname, cmd FROM pg_policies
--   WHERE tablename = 'internship_applications'
--   ORDER BY policyname;
-- ============================================================================
