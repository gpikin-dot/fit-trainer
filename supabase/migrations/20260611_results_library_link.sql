-- Связь результатов с упражнением библиотеки.
-- exercise_results.exercise_id указывает либо на session_exercises.id,
-- либо на exercises.id (legacy) — без FK. Для истории «прошлые выполнения
-- этого упражнения» нужен стабильный ключ: library_exercise_id.

-- Санация: строки старше констрейнта exercise_results_num_chk (NOT VALID)
-- могут нарушать его, а UPDATE при backfill их перепроверит
update public.exercise_results set actual_reps = null
  where actual_reps < 0 or actual_reps > 3600;
update public.exercise_results set actual_weight_kg = null
  where actual_weight_kg < 0 or actual_weight_kg > 1000;

alter table public.exercise_results
  add column if not exists library_exercise_id uuid references public.exercises_library(id);

-- Backfill обоих путей
update public.exercise_results er
  set library_exercise_id = se.library_exercise_id
  from public.session_exercises se
  where er.exercise_id = se.id and er.library_exercise_id is null;

update public.exercise_results er
  set library_exercise_id = e.library_exercise_id
  from public.exercises e
  where er.exercise_id = e.id and er.library_exercise_id is null;

create index if not exists exercise_results_library_ex_idx
  on public.exercise_results (library_exercise_id);
