-- ============================================================================
-- InternLink — Supabase Migration 008
-- ============================================================================
-- Adds GLOCAL as a degree program so admin accounts can be assigned to it.
-- The existing sync_profile_department() trigger (migration 006) then
-- automatically populates department_name and department_abbreviation from
-- degree_programs for any profile whose degree_program = 'GLOCAL'.
-- ============================================================================

INSERT INTO public.degree_programs (name, department, department_abbreviation, practicum_hours, is_active)
SELECT 'GLOCAL', 'GLOCAL', 'GLOCAL', NULL, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.degree_programs WHERE name = 'GLOCAL'
);

-- Verification:
-- SELECT * FROM public.degree_programs WHERE name = 'GLOCAL';
