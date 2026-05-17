-- Allow a trainer to write exercise_results for their own clients'
-- assignments — required for "совместная тренировка" (trainer runs the
-- workout together with the client). Previously INSERT/UPDATE were
-- limited to client_id = auth.uid(), so a trainer-driven session got
-- "row-level security policy" errors.
--
-- Idempotent. Run in Supabase SQL Editor on BOTH staging and production.

DROP POLICY IF EXISTS "exercise_results_insert" ON public.exercise_results;
CREATE POLICY "exercise_results_insert" ON public.exercise_results FOR INSERT WITH CHECK (
  assigned_workout_id IN (
    SELECT id FROM public.assigned_workouts WHERE client_id = auth.uid()
  )
  OR assigned_workout_id IN (
    SELECT aw.id FROM public.assigned_workouts aw
    JOIN public.workouts w ON w.id = aw.workout_id
    WHERE w.trainer_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "exercise_results_update" ON public.exercise_results;
CREATE POLICY "exercise_results_update" ON public.exercise_results FOR UPDATE USING (
  assigned_workout_id IN (
    SELECT id FROM public.assigned_workouts WHERE client_id = auth.uid()
  )
  OR assigned_workout_id IN (
    SELECT aw.id FROM public.assigned_workouts aw
    JOIN public.workouts w ON w.id = aw.workout_id
    WHERE w.trainer_id = auth.uid()
  )
);
