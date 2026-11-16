-- ============================================================================
-- InternLink — Supabase SQL Migration (004)
-- ============================================================================
-- Creates contract_categories and contracts_moas tables for the Contracts & MOAs page,
-- plus RLS policies so the admin page (anon key) can read/write both tables.
--
-- Default categories were inserted separately, so this migration does NOT seed them.
--
-- After running this, also create a public storage bucket named `contracts-moas`
-- in Supabase Dashboard → Storage.
--
-- Run in Supabase Dashboard → SQL Editor. Idempotent where possible.
-- ============================================================================

-- 1. contract_categories table (category management: add/update/delete)
CREATE TABLE IF NOT EXISTS contract_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT '#1E3A5F',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. contracts_moas table (contracts with category reference)
CREATE TABLE IF NOT EXISTS contracts_moas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES contract_categories(id) ON DELETE SET NULL,
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  contract_type text NOT NULL DEFAULT 'MOA',
  file_url text,
  file_path text,
  file_type text,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Enable RLS
ALTER TABLE contract_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts_moas ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies — non-recursive (USING (true) only).
--    Everyone can read; authenticated users can write.
--    Idempotent: drops any existing policy before recreating.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'contract_categories' AND policyname = 'Contract categories are viewable by everyone'
  ) THEN DROP POLICY "Contract categories are viewable by everyone" ON contract_categories; END IF;
  CREATE POLICY "Contract categories are viewable by everyone"
    ON contract_categories FOR SELECT
    TO anon
    USING (true);
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'contract_categories' AND policyname = 'Authenticated users can view contract categories'
  ) THEN DROP POLICY "Authenticated users can view contract categories" ON contract_categories; END IF;
  CREATE POLICY "Authenticated users can view contract categories"
    ON contract_categories FOR SELECT
    TO authenticated
    USING (true);
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'contract_categories' AND policyname = 'Authenticated users can insert contract categories'
  ) THEN DROP POLICY "Authenticated users can insert contract categories" ON contract_categories; END IF;
  CREATE POLICY "Authenticated users can insert contract categories"
    ON contract_categories FOR INSERT
    TO authenticated
    WITH CHECK (true);
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'contract_categories' AND policyname = 'Authenticated users can update contract categories'
  ) THEN DROP POLICY "Authenticated users can update contract categories" ON contract_categories; END IF;
  CREATE POLICY "Authenticated users can update contract categories"
    ON contract_categories FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'contract_categories' AND policyname = 'Authenticated users can delete contract categories'
  ) THEN DROP POLICY "Authenticated users can delete contract categories" ON contract_categories; END IF;
  CREATE POLICY "Authenticated users can delete contract categories"
    ON contract_categories FOR DELETE
    TO authenticated
    USING (true);
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'contracts_moas' AND policyname = 'Contracts & MOAs are viewable by everyone'
  ) THEN DROP POLICY "Contracts & MOAs are viewable by everyone" ON contracts_moas; END IF;
  CREATE POLICY "Contracts & MOAs are viewable by everyone"
    ON contracts_moas FOR SELECT
    TO anon
    USING (true);
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'contracts_moas' AND policyname = 'Authenticated users can view contracts & MOAs'
  ) THEN DROP POLICY "Authenticated users can view contracts & MOAs" ON contracts_moas; END IF;
  CREATE POLICY "Authenticated users can view contracts & MOAs"
    ON contracts_moas FOR SELECT
    TO authenticated
    USING (true);
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'contracts_moas' AND policyname = 'Authenticated users can insert contracts & MOAs'
  ) THEN DROP POLICY "Authenticated users can insert contracts & MOAs" ON contracts_moas; END IF;
  CREATE POLICY "Authenticated users can insert contracts & MOAs"
    ON contracts_moas FOR INSERT
    TO authenticated
    WITH CHECK (true);
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'contracts_moas' AND policyname = 'Authenticated users can update contracts & MOAs'
  ) THEN DROP POLICY "Authenticated users can update contracts & MOAs" ON contracts_moas; END IF;
  CREATE POLICY "Authenticated users can update contracts & MOAs"
    ON contracts_moas FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'contracts_moas' AND policyname = 'Authenticated users can delete contracts & MOAs'
  ) THEN DROP POLICY "Authenticated users can delete contracts & MOAs" ON contracts_moas; END IF;
  CREATE POLICY "Authenticated users can delete contracts & MOAs"
    ON contracts_moas FOR DELETE
    TO authenticated
    USING (true);
END $$;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_contracts_moas_category_id ON contracts_moas(category_id);
CREATE INDEX IF NOT EXISTS idx_contracts_moas_status ON contracts_moas(status);
CREATE INDEX IF NOT EXISTS idx_contracts_moas_end_date ON contracts_moas(end_date);
CREATE INDEX IF NOT EXISTS idx_contract_categories_is_active ON contract_categories(is_active);

-- ============================================================================
-- Verification queries (run after the migration to confirm):
--
-- SELECT * FROM contract_categories ORDER BY name;
-- SELECT c.title, cat.name AS category, c.status, c.end_date
--   FROM contracts_moas c
--   LEFT JOIN contract_categories cat ON cat.id = c.category_id
--   ORDER BY c.created_at DESC;
-- ============================================================================
