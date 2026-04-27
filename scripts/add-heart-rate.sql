-- Target heart rate set by trainer per exercise
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS target_heart_rate_bpm INTEGER;

-- Actual heart rate recorded by client
ALTER TABLE exercise_results ADD COLUMN IF NOT EXISTS actual_heart_rate_bpm INTEGER;
