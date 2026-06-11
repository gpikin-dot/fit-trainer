-- Кастомные упражнения тренера: RLS-политика exercises_library_insert
-- существовала, но табличной привилегии INSERT у authenticated не было —
-- Postgres отклонял вставку до проверки политики
-- («permission denied for table exercises_library»).

grant insert on table public.exercises_library to authenticated;
