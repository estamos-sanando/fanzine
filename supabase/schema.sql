-- =============================================================================
-- FANZINE RUNNER · "¡NO TE RINDAS!" — Global Arcade Leaderboard Schema
-- Compatible con Supabase (PostgreSQL 15+) + Supabase Realtime
-- Ejecutá este script completo en el SQL Editor de tu proyecto Supabase.
-- =============================================================================

-- Extensión para generación de UUIDs v4 criptográficos
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Tabla principal del Leaderboard Global
CREATE TABLE IF NOT EXISTS public.leaderboard_scores (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  initials    VARCHAR(3) NOT NULL,
  score      INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  -- Reglas de integridad a nivel de motor de base de datos
  CONSTRAINT chk_leaderboard_initials_format
    CHECK (initials ~ '^[A-Z0-9]{3}$'),
  CONSTRAINT chk_leaderboard_score_bounds
    CHECK (score > 0 AND score <= 250000)
);

-- Índice compuesto para lecturas O(log N) del Top N y desempate cronológico
CREATE INDEX IF NOT EXISTS idx_leaderboard_scores_top
  ON public.leaderboard_scores (score DESC, created_at ASC);

-- Índice por fecha para auditoría / limpieza administrativa
CREATE INDEX IF NOT EXISTS idx_leaderboard_scores_created_at
  ON public.leaderboard_scores (created_at DESC);

-- =============================================================================
-- Row Level Security (RLS)
-- =============================================================================
ALTER TABLE public.leaderboard_scores ENABLE ROW LEVEL SECURITY;

-- 1. Lectura pública permitida (necesaria para leaderboard global y Realtime)
DROP POLICY IF EXISTS "leaderboard_public_select" ON public.leaderboard_scores;
CREATE POLICY "leaderboard_public_select"
  ON public.leaderboard_scores
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- 2. Inserción restringida: recomendada vía /api/scores con SUPABASE_SERVICE_ROLE_KEY.
--    Si solo se configura SUPABASE_ANON_KEY, esta política valida formato y rango.
DROP POLICY IF EXISTS "leaderboard_validated_insert" ON public.leaderboard_scores;
CREATE POLICY "leaderboard_validated_insert"
  ON public.leaderboard_scores
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    initials ~ '^[A-Z0-9]{3}$'
    AND score > 0
    AND score <= 250000
  );

-- =============================================================================
-- Tiempo Real (Supabase Realtime WebSockets)
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'leaderboard_scores'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leaderboard_scores;
  END IF;
END
$$;
