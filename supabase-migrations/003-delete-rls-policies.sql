-- ============================================================================
-- InternLink — Supabase SQL Migration (003)
-- ============================================================================
-- Adds DELETE RLS policies on `internship_applications` and `student_requirements`
-- so the admin delete buttons (student applicants + document verification) work
-- through the anon key. Runs idempotently.
-- Run in Supabase Dashboard → SQL Editor.
-- ============================================================================

-- DELETE on internship_applications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'internship_applications'
      AND policyname = 'Authenticated users can delete internship applications'
  ) THEN
    CREATE POLICY "Authenticated users can delete internship applications"
      ON internship_applications FOR DELETE
      TO authenticated
      USING (true);
  END IF;
END $$;

-- DELETE on student_requirements
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'student_requirements'
      AND policyname = 'Authenticated users can delete student requirements'
  ) THEN
    CREATE POLICY "Authenticated users can delete student requirements"
      ON student_requirements FOR DELETE
      TO authenticated
      USING (true);
  END IF;
END $$;

-- ============================================================================
-- Verification queries (run after the migration to confirm):
--
-- SELECT policyname, cmd FROM pg_policies
--   WHERE tablename IN ('internship_applications', 'student_requirements')
--   ORDER BY tablename, policyname;
-- ============================================================================
