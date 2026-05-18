-- DATA-LOSS FIX.
-- exercise_results.exercise_id had a FK to exercises(id). But workouts
-- assigned via the wizard store their exercises in session_exercises,
-- and the app writes results with exercise_id = session_exercises.id.
-- That violated the FK, the INSERT failed, and the workout was marked
-- completed with ZERO saved results.
--
-- Fix: drop the rigid FK. exercise_id stays a uuid NOT NULL and simply
-- holds whichever id the session used (session_exercises.id for the
-- new flow, exercises.id for legacy) — the display layer already
-- matches results by that same id. Row cleanup is still guaranteed by
-- the assigned_workout_id FK (ON DELETE CASCADE).
--
-- Idempotent. Run in Supabase SQL Editor on BOTH staging and production.

ALTER TABLE public.exercise_results
  DROP CONSTRAINT IF EXISTS exercise_results_exercise_id_fkey;
