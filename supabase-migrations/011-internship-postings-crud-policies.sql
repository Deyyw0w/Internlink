-- ============================================================================
-- InternLink — Supabase Migration (011)
-- ============================================================================
-- Adds UPDATE and INSERT RLS policies on `internship_postings` so admins can
-- edit/create internship posting cards from the Partner Agencies page.
--
-- Currently migration 001 only creates SELECT policies. This migration adds
-- write policies using the non-recursive USING (true) pattern to avoid
-- PostgreSQL 42P17 recursion errors.
-- ============================================================================

ALTER TABLE internship_postings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- UPDATE on internship_postings
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'internship_postings'
      AND policyname = 'Authenticated users can update internship postings'
  ) THEN
    CREATE POLICY "Authenticated users can update internship postings"
      ON internship_postings FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

  -- INSERT on internship_postings
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'internship_postings'
      AND policyname = 'Authenticated users can insert internship postings'
  ) THEN
    CREATE POLICY "Authenticated users can insert internship postings"
      ON internship_postings FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- Verification queries:
--
-- SELECT policyname, cmd FROM pg_policies
--   WHERE tablename = 'internship_postings'
--   ORDER BY policyname;
-- ============================================================================
