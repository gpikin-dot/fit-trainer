-- Migration: session_exercises table
-- При назначении тренировки клиенту упражнения копируются сюда из шаблона.
-- Редактирование шаблона после этого не затрагивает уже созданные сессии.

CREATE TABLE IF NOT EXISTS session_exercises (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  assigned_workout_id uuid NOT NULL REFERENCES assigned_workouts(id) ON DELETE CASCADE,
  library_exercise_id uuid NOT NULL REFERENCES exercises_library(id),
  "order"             integer NOT NULL DEFAULT 0,
  sets                integer NOT NULL DEFAULT 3,
  reps                integer NOT NULL DEFAULT 10,
  weight_kg           numeric NOT NULL DEFAULT 0,
  rest_sec            integer,
  trainer_note        text,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE session_exercises ENABLE ROW LEVEL SECURITY;

-- Тренер видит session_exercises своих клиентов
CREATE POLICY "trainer_manage_session_exercises" ON session_exercises
  FOR ALL
  USING (
    assigned_workout_id IN (
      SELECT aw.id
      FROM assigned_workouts aw
      JOIN profiles p ON p.id = aw.client_id
      WHERE p.trainer_id = auth.uid()
    )
  );

-- Клиент видит только свои сессии
CREATE POLICY "client_read_own_session_exercises" ON session_exercises
  FOR SELECT
  USING (
    assigned_workout_id IN (
      SELECT id FROM assigned_workouts WHERE client_id = auth.uid()
    )
  );

-- Индекс для быстрого поиска по assigned_workout_id
CREATE INDEX IF NOT EXISTS session_exercises_assigned_workout_id_idx
  ON session_exercises(assigned_workout_id);
