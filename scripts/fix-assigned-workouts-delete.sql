-- Allow a trainer to DELETE a single assignment (cancel one
-- assigned_workouts row for their own client). There was no DELETE
-- policy at all, so RLS blocked cancelling an assignment entirely.
-- Scoped to the trainer who owns the underlying template.
--
-- Idempotent. Run in Supabase SQL Editor on BOTH staging and production.

-- Table-level GRANT first: the initial schema has no GRANTs and
-- Supabase auto-grants didn't include DELETE (anon DELETE → 42501
-- "permission denied for table"). Without this even an authenticated
-- trainer can't delete, regardless of RLS.
GRANT DELETE ON public.assigned_workouts TO authenticated;

DROP POLICY IF EXISTS "assigned_workouts_delete" ON public.assigned_workouts;
CREATE POLICY "assigned_workouts_delete" ON public.assigned_workouts FOR DELETE USING (
  workout_id IN (
    SELECT id FROM public.workouts WHERE trainer_id = auth.uid()
  )
);
