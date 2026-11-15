-- ============================================================================
-- InternLink — Supabase SQL Migration
-- ============================================================================
-- Run this entire script in Supabase Dashboard → SQL Editor.
--
-- This migration:
-- 1. Adds the `slots` column to `companies` (needed by admin Partner Agencies CRUD)
-- 2. Ensures all internship_postings have status = 'open' (so student page shows them)
-- 3. Ensures companies are active (is_active = true) so student join filter passes
-- 4. Creates anon/authenticated SELECT RLS policies on `companies` and `internship_postings`
-- ============================================================================

-- 1. Add `slots` column to companies (idempotent)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS slots integer DEFAULT 0;

-- 2. Mark all postings as open so the student filter (status = 'open') returns rows
UPDATE internship_postings SET status = 'open';

-- 3. Mark all companies as active so the student filter (companies.is_active = true) returns rows
UPDATE companies SET is_active = true;

-- 4. Ensure RLS is enabled on both tables
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE internship_postings ENABLE ROW LEVEL SECURITY;

-- 5. Drop any existing SELECT policies so we can recreate them cleanly (idempotent-ish)
DO $$
BEGIN
  -- companies SELECT policies
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'companies' AND policyname = 'Companies are viewable by everyone'
  ) THEN
    DROP POLICY "Companies are viewable by everyone" ON companies;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'companies' AND policyname = 'Authenticated users can view companies'
  ) THEN
    DROP POLICY "Authenticated users can view companies" ON companies;
  END IF;

  -- internship_postings SELECT policies
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'internship_postings' AND policyname = 'Postings are viewable by everyone'
  ) THEN
    DROP POLICY "Postings are viewable by everyone" ON internship_postings;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'internship_postings' AND policyname = 'Authenticated users can view open postings'
  ) THEN
    DROP POLICY "Authenticated users can view open postings" ON internship_postings;
  END IF;
END $$;

-- 6. CREATE SELECT policies
--    - anon role: can read all companies and all open postings (public-facing)
--    - authenticated role: same read access
CREATE POLICY "Companies are viewable by everyone"
  ON companies FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Authenticated users can view companies"
  ON companies FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Postings are viewable by everyone"
  ON internship_postings FOR SELECT
  TO anon
  USING (status = 'open');

CREATE POLICY "Authenticated users can view open postings"
  ON internship_postings FOR SELECT
  TO authenticated
  USING (status = 'open');

-- 5. Add `degree_program` and `student_name` columns to internship_applications
--    so admin pages can display student info without joining `profiles` (avoids
--    RLS recursion on the profiles table).
ALTER TABLE internship_applications ADD COLUMN IF NOT EXISTS degree_program text;
ALTER TABLE internship_applications ADD COLUMN IF NOT EXISTS student_name text;

-- Backfill existing applications from the linked profile.
UPDATE internship_applications a
SET degree_program = p.degree_program,
    student_name = p.full_name
FROM profiles p
WHERE a.student_id = p.student_id
  AND (a.degree_program IS NULL OR a.student_name IS NULL);

-- ============================================================================
-- Verification queries (run these after the migration to confirm):
--
-- SELECT count(*) FROM companies WHERE is_active = true;
-- SELECT count(*) FROM internship_postings WHERE status = 'open';
-- SELECT p.id, p.position_title, c.name, c.address, c.is_active
--   FROM internship_postings p
--   LEFT JOIN companies c ON c.id = p.company_id
--   WHERE p.status = 'open' AND c.is_active = true;
-- SELECT id, reference_number, host_company, student_id, degree_program, status
--   FROM internship_applications
--   ORDER BY submitted_at DESC
--   LIMIT 10;
-- ============================================================================
