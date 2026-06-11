-- Суперсеты/трисеты/круги: соседние упражнения с одинаковым
-- superset_group выполняются связкой. NULL — обычное упражнение.
-- Группировка хранится и в шаблоне, и в копии сессии.

alter table public.exercises
  add column if not exists superset_group smallint;

alter table public.session_exercises
  add column if not exists superset_group smallint;
