-- ============================================================================
-- InternLink — Supabase Migration (013)
-- ============================================================================
-- Creates the `news` table for dashboard news & updates.
-- Admin imports USL programs; they show live in dashboard carousel.
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

ALTER TABLE news ADD COLUMN IF NOT EXISTS image_label text NOT NULL DEFAULT 'News';
ALTER TABLE news ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE news ADD COLUMN IF NOT EXISTS link_url text;
ALTER TABLE news ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT true;
ALTER TABLE news ADD COLUMN IF NOT EXISTS published_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_news_is_published ON news(is_published);
CREATE INDEX IF NOT EXISTS idx_news_published_at ON news(published_at DESC);

ALTER TABLE news ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'news' AND policyname = 'News is viewable by everyone'
  ) THEN
    CREATE POLICY "News is viewable by everyone"
      ON news FOR SELECT
      TO anon, authenticated
      USING (is_published = true);
  END IF;

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