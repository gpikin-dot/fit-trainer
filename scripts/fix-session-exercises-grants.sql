-- Fix: session_exercises missing table-level GRANTs.
-- Raw-SQL migrations don't get Supabase auto-grants, so the
-- `authenticated` role had no table privileges → PostgREST returned
-- "permission denied for table session_exercises" on workout assign.
--
-- RLS policies already exist (trainer_manage / client_read); grants are
-- the missing piece. Safe + idempotent. Run in Supabase SQL Editor on
-- BOTH staging and production.

GRANT SELECT, INSERT, UPDATE, DELETE ON session_exercises TO authenticated;
GRANT SELECT ON session_exercises TO anon;

-- Ensure the FOR ALL trainer policy also covers INSERT explicitly
-- (USING doubles as WITH CHECK when WITH CHECK is omitted, but make
--  it explicit so inserts are unambiguous).
DROP POLICY IF EXISTS "trainer_manage_session_exercises" ON session_exercises;
CREATE POLICY "trainer_manage_session_exercises" ON session_exercises
  FOR ALL
  USING (
    assigned_workout_id IN (
      SELECT aw.id
      FROM assigned_workouts aw
      JOIN profiles p ON p.id = aw.client_id
      WHERE p.trainer_id = auth.uid()
    )
  )
  WITH CHECK (
    assigned_workout_id IN (
      SELECT aw.id
      FROM assigned_workouts aw
      JOIN profiles p ON p.id = aw.client_id
      WHERE p.trainer_id = auth.uid()
    )
  );
