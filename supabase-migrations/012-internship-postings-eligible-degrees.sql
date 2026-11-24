-- ============================================================================
-- InternLink — Supabase Migration (012)
-- ============================================================================
-- Adds `eligible_degrees` to `internship_postings` so admins can set exactly
-- which degree programs/courses can apply to each posting (e.g. "BS in Computer Science, BS in Information Technology").
--
-- If empty on a posting, the student page falls back to deriving tags from the
-- company's industry field (existing behavior).
-- ============================================================================

ALTER TABLE internship_postings
ADD COLUMN IF NOT EXISTS eligible_degrees text;

-- Index for filtering by eligible degree.
CREATE INDEX IF NOT EXISTS idx_internship_postings_eligible_degrees
ON internship_postings USING GIN (string_to_array(eligible_degrees, ','));

-- ============================================================================
-- Verification:
--   SELECT id, position_title, eligible_degrees FROM internship_postings LIMIT 10;
-- ============================================================================
