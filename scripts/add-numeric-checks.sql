-- ============================================================
-- Data-integrity: CHECK-констрейнты на числовые поля
-- Закрывает BUG-005/UX-003 (принимались отрицательные/абсурдные
-- значения reps/weight/sets/rest напрямую через API).
--
-- NOT VALID: новые/изменённые строки проверяются, но старые
-- (возможно битые из QA-проб) не валят применение. После очистки
-- битых данных можно VALIDATE CONSTRAINT отдельно.
--
-- Идемпотентно. Прогонять в Supabase SQL Editor (staging → prod).
-- Лимиты из QA-отчёта: sets 1–20, reps/сек 1–3600,
-- weight 0–1000, rest 0–3600.
-- ============================================================

do $$
begin
  -- exercises (шаблонные упражнения)
  if not exists (select 1 from pg_constraint where conname = 'exercises_num_chk') then
    alter table public.exercises add constraint exercises_num_chk
      check (
        sets between 1 and 20
        and reps between 1 and 3600
        and weight_kg between 0 and 1000
        and (rest_sec is null or rest_sec between 0 and 3600)
      ) not valid;
  end if;

  -- session_exercises (упражнения конкретного назначения)
  if not exists (select 1 from pg_constraint where conname = 'session_exercises_num_chk') then
    alter table public.session_exercises add constraint session_exercises_num_chk
      check (
        sets between 1 and 20
        and reps between 1 and 3600
        and weight_kg between 0 and 1000
        and (rest_sec is null or rest_sec between 0 and 3600)
      ) not valid;
  end if;

  -- workouts.default_rest_sec
  if not exists (select 1 from pg_constraint where conname = 'workouts_rest_chk') then
    alter table public.workouts add constraint workouts_rest_chk
      check (default_rest_sec between 0 and 3600) not valid;
  end if;

  -- exercise_results: фактические значения клиента
  if not exists (select 1 from pg_constraint where conname = 'exercise_results_num_chk') then
    alter table public.exercise_results add constraint exercise_results_num_chk
      check (
        (actual_reps is null or actual_reps between 0 and 3600)
        and (actual_weight_kg is null or actual_weight_kg between 0 and 1000)
      ) not valid;
  end if;
end $$;
