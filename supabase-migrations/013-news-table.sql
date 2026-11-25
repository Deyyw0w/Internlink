-- ============================================================================
-- InternLink — Supabase Migration (013)
-- ============================================================================
-- Creates the `news` table for admin-managed news & updates that appear in the
-- student/admin dashboard carousel. Admins can CRUD news items; changes sync
-- in realtime via Supabase Realtime.
-- ============================================================================

CREATE TABLE IF NOT EXISTS news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  excerpt text NOT NULL,
  image_label text NOT NULL DEFAULT 'News',
  image_url text,
  link_url text,
  is_published boolean NOT NULL DEFAULT true,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotent column additions for tables created before this migration.
ALTER TABLE news ADD COLUMN IF NOT EXISTS image_label text NOT NULL DEFAULT 'News';
ALTER TABLE news ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE news ADD COLUMN IF NOT EXISTS link_url text;
ALTER TABLE news ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT true;
ALTER TABLE news ADD COLUMN IF NOT EXISTS published_at timestamptz NOT NULL DEFAULT now();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_news_is_published ON news(is_published);
CREATE INDEX IF NOT EXISTS idx_news_published_at ON news(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_created_at ON news(created_at DESC);

-- Enable RLS
ALTER TABLE news ENABLE ROW LEVEL SECURITY;

-- RLS policies (non-recursive to avoid PostgreSQL 42P17 recursion).
DO $$
BEGIN
  -- Everyone can read published news
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'news' AND policyname = 'News is viewable by everyone'
  ) THEN
    CREATE POLICY "News is viewable by everyone"
      ON news FOR SELECT
      TO anon, authenticated
      USING (is_published = true);
  END IF;

  -- Authenticated users can manage news (CRUD)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'news' AND policyname = 'Authenticated users can manage news'
  ) THEN
    CREATE POLICY "Authenticated users can manage news"
      ON news FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Indexes for realtime performance
CREATE INDEX IF NOT EXISTS idx_news_updated_at ON news(updated_at DESC);

-- ============================================================================
-- Verification:
--   SELECT * FROM news ORDER BY published_at DESC LIMIT 10;
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'news';
-- ============================================================================
