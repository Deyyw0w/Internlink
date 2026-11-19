-- ============================================================================
-- InternLink — Supabase Migration 007
-- ============================================================================
-- Adds `must_change_password` flag to profiles. New student registrations get
-- true (must change default password on first login). Admins who set their own
-- password get false.
-- ============================================================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT true;

-- Index for quick first-login checks.
CREATE INDEX IF NOT EXISTS idx_profiles_must_change_password
ON public.profiles (must_change_password)
WHERE must_change_password = true;

-- ============================================================================
-- Verification:
--   SELECT id, student_id, role, must_change_password FROM public.profiles
--   LIMIT 10;
-- ============================================================================
