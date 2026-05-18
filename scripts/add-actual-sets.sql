-- Per-set actuals for completed exercises.
-- До этого exercise_results хранил только агрегат (один actual_reps /
-- actual_weight_kg на упражнение — фактически последний подход).
-- Теперь храним массив подходов, чтобы в истории показывать план/факт
-- по каждому подходу отдельно.
--
-- Формат: jsonb-массив объектов
--   [{ "reps": 10, "weight": 12, "completed": true }, ...]
-- Старые записи без этой колонки → история падает на старый
-- агрегатный вид (обратная совместимость в UI).
--
-- Idempotent. Run in Supabase SQL Editor on BOTH staging and production.

ALTER TABLE public.exercise_results
  ADD COLUMN IF NOT EXISTS actual_sets jsonb;
