-- ============================================================================
-- InternLink — Supabase Migration 009
-- ============================================================================
-- Widens profiles.mobile from integer to bigint so 11-digit Philippine mobile
-- numbers (e.g. 09123456789) fit without overflowing integer's ~2.1B max.
-- Run this in Supabase Dashboard → SQL Editor.
-- ============================================================================

alter table public.profiles
  alter column mobile type bigint using mobile::bigint;

-- ============================================================================
-- Verification:
--
-- select data_type from information_schema.columns
--   where table_schema = 'public' and table_name = 'profiles' and column_name = 'mobile';
-- ============================================================================
