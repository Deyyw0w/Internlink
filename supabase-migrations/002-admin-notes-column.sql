-- ============================================================================
-- InternLink — Supabase SQL Migration (002)
-- ============================================================================
-- Adds `admin_notes` to `internship_applications` (admin review decision notes)
-- and `student_requirements` (admin document verification comments) so that
-- coordinator/admin notes entered in both review flows are persisted and
-- visible to students.
-- Run in Supabase Dashboard → SQL Editor.
-- ============================================================================

-- Idempotent: safe to re-run.
ALTER TABLE internship_applications ADD COLUMN IF NOT EXISTS admin_notes text;
ALTER TABLE student_requirements ADD COLUMN IF NOT EXISTS admin_notes text;

-- Column comments for clarity.
COMMENT ON COLUMN internship_applications.admin_notes IS 'Free-form review/decision notes written by the internship coordinator in the Review & Decision modal.';
COMMENT ON COLUMN student_requirements.admin_notes IS 'Admin verification comment written by the internship coordinator when verifying or rejecting a document requirement.';

-- ============================================================================
-- Verification query (run after the migration to confirm):
--
-- SELECT id, reference_number, student_id, status, admin_notes, updated_at
--   FROM internship_applications
--   ORDER BY submitted_at DESC
--   LIMIT 10;
-- ============================================================================
