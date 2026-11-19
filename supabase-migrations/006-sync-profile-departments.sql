-- ============================================================================
-- InternLink — Supabase Migration 006
-- ============================================================================
-- Auto-populates profiles.department_name, department_abbreviation, and
-- practicum_hours from degree_programs whenever a profile is inserted or
-- degree_program changes. Runs as SECURITY DEFINER so RLS on degree_programs
-- cannot block the lookup. Covers every write path (registration, admin
-- account edit, student profile edit) instead of relying on Angular to do it.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_profile_department()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.degree_program IS NOT NULL THEN
    SELECT
      dp.department,
      dp.department_abbreviation,
      dp.practicum_hours
    INTO
      NEW.department_name,
      NEW.department_abbreviation,
      NEW.practicum_hours
    FROM public.degree_programs dp
    WHERE dp.name = NEW.degree_program;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop any existing trigger with the same name to allow re-running this migration.
DROP TRIGGER IF EXISTS trigger_sync_profile_department ON public.profiles;

CREATE TRIGGER trigger_sync_profile_department
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_department();

-- ============================================================================
-- Verification queries (run these after the migration to confirm):
--
-- SELECT p.student_id, p.degree_program, p.department_name, p.department_abbreviation
--   FROM public.profiles p
--   WHERE p.department_name IS NULL
--   ORDER BY p.student_id
--   LIMIT 20;
--
-- SELECT p.student_id, p.degree_program, p.department_name, p.department_abbreviation
--   FROM public.profiles p
--   JOIN public.degree_programs dp ON dp.name = p.degree_program
--   ORDER BY p.student_id
--   LIMIT 20;
-- ============================================================================
