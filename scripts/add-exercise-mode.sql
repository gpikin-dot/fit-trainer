-- Per-exercise logging mode (chosen by the trainer in the template).
--   'weight' — подходы × повторы × вес (по умолчанию; как раньше)
--   'reps'   — подходы × повторы (без веса; для упражнений с весом тела)
--   'time'   — подходы × секунды (на время; планка и т.п.)
-- Field reuse: for 'time' the `reps` column stores seconds per set.
--
-- Idempotent. Run in Supabase SQL Editor on BOTH staging and production.

ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'weight';

ALTER TABLE public.session_exercises
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'weight';
