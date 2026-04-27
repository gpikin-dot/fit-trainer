-- Add planned_date to assigned_workouts (null = open date, client decides when)
ALTER TABLE assigned_workouts ADD COLUMN IF NOT EXISTS planned_date DATE;
