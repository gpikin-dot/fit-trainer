-- Add exercise_type column to exercises_library
ALTER TABLE exercises_library ADD COLUMN IF NOT EXISTS exercise_type VARCHAR NOT NULL DEFAULT 'strength';

-- Classify cardio exercises
-- cardio_reps: counted in repetitions (burpees, jumping jacks, etc.)
UPDATE exercises_library SET exercise_type = 'cardio_reps'
WHERE external_id IN ('ex-109', 'ex-112', 'ex-113', 'ex-114');
-- ex-109: Прыжки со скакалкой
-- ex-112: Джампинг джек
-- ex-113: Бёрпи
-- ex-114: Бег с высоким подниманием колен

-- cardio_time: counted in time/distance (treadmill, elliptical, etc.)
UPDATE exercises_library SET exercise_type = 'cardio_time'
WHERE external_id IN ('ex-30', 'ex-107', 'ex-108', 'ex-110', 'ex-111', 'ex-115', 'ex-116');
-- ex-30:  Велотренажёр
-- ex-107: Бег на дорожке
-- ex-108: Эллиптический тренажёр
-- ex-110: Степпер
-- ex-111: Гребной тренажёр
-- ex-115: Ходьба на дорожке
-- ex-116: Интервальный бег
-- ex-107: Бег на дорожке
-- ex-108: Эллиптический тренажёр
-- ex-110: Степпер
-- ex-111: Гребной тренажёр
-- ex-115: Ходьба на дорожке
-- ex-116: Интервальный бег
