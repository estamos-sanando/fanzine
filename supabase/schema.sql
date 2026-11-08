-- =============================================================================
-- FANZINE RUNNER · "¡NO TE RINDAS!" — Esquema endurecido de Producción (RLS)
-- Compatible con Supabase (PostgreSQL 15+) + Supabase Realtime
-- Ejecutá este script completo en el SQL Editor de tu proyecto Supabase.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Tabla principal con restricciones estrictas de dominio e integridad
CREATE TABLE IF NOT EXISTS public.leaderboard_scores (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  initials   VARCHAR(3) NOT NULL,
  score      INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT chk_leaderboard_initials_format
    CHECK (initials ~ '^[A-Z0-9]{3}$'),
  CONSTRAINT chk_leaderboard_score_bounds
    CHECK (score > 0 AND score <= 100000)
);

-- Ajustar límite máximo si la tabla ya existía de una migración previa
ALTER TABLE public.leaderboard_scores
  DROP CONSTRAINT IF EXISTS chk_leaderboard_score_bounds;
ALTER TABLE public.leaderboard_scores
  ADD CONSTRAINT chk_leaderboard_score_bounds
  CHECK (score > 0 AND score <= 100000);

CREATE INDEX IF NOT EXISTS idx_leaderboard_scores_top
  ON public.leaderboard_scores (score DESC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_leaderboard_scores_created_at
  ON public.leaderboard_scores (created_at DESC);

-- =============================================================================
-- 2. Privilegios SQL de Mínimo Privilegio (Bloquea UPDATE / DELETE / TRUNCATE)
-- =============================================================================
REVOKE ALL ON public.leaderboard_scores FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.leaderboard_scores TO anon, authenticated;

-- NOTA ZERO-TRUST (Altamente recomendado cuando SUPABASE_SERVICE_ROLE_KEY está
-- configurada en Vercel): descomentá la siguiente línea para que los clientes
-- anónimos ni siquiera puedan insertar directo por PostgREST y toda escritura
-- deba pasar obligatoriamente por el anti-cheat HMAC de /api/scores:
-- REVOKE INSERT ON public.leaderboard_scores FROM anon, authenticated;

-- =============================================================================
-- 3. Row Level Security (RLS) Forzado y Políticas Restrictivas
-- =============================================================================
ALTER TABLE public.leaderboard_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_scores FORCE ROW LEVEL SECURITY;

-- Lectura pública (SELECT) para consulta del ranking y suscripción Realtime
DROP POLICY IF EXISTS "leaderboard_public_select" ON public.leaderboard_scores;
CREATE POLICY "leaderboard_public_select"
  ON public.leaderboard_scores
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Inserción validada (INSERT): exige 3 alfanuméricos en mayúscula, rango válido
-- y ventana temporal reciente para impedir falsificación de timestamps históricos
DROP POLICY IF EXISTS "leaderboard_validated_insert" ON public.leaderboard_scores;
CREATE POLICY "leaderboard_validated_insert"
  ON public.leaderboard_scores
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    initials ~ '^[A-Z0-9]{3}$'
    AND score > 0
    AND score <= 100000
    AND created_at >= (timezone('utc', now()) - interval '10 minutes')
    AND created_at <= (timezone('utc', now()) + interval '1 minute')
  );

-- Bloqueo explícito total de UPDATE desde clientes
DROP POLICY IF EXISTS "leaderboard_deny_update" ON public.leaderboard_scores;
CREATE POLICY "leaderboard_deny_update"
  ON public.leaderboard_scores
  AS RESTRICTIVE
  FOR UPDATE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- Bloqueo explícito total de DELETE desde clientes
DROP POLICY IF EXISTS "leaderboard_deny_delete" ON public.leaderboard_scores;
CREATE POLICY "leaderboard_deny_delete"
  ON public.leaderboard_scores
  AS RESTRICTIVE
  FOR DELETE
  TO anon, authenticated
  USING (false);

-- =============================================================================
-- 4. Publicación en Tiempo Real (Supabase Realtime WebSockets)
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
