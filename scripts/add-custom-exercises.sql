-- Кастомные упражнения тренера в общей библиотеке.
-- Тренер может создать своё упражнение (название) и использовать в шаблонах.
-- Публичные строки free-exercise-db: trainer_id IS NULL.
-- Кастомные: trainer_id = id тренера-владельца, source = 'custom'.
--
-- Idempotent. Run in Supabase SQL Editor on BOTH staging and production.

ALTER TABLE public.exercises_library
  ADD COLUMN IF NOT EXISTS trainer_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Раньше select был using (true) — все видели все строки, включая чужой кастом.
-- Теперь: публичные (trainer_id null) ВСЕМ; кастом — владельцу-тренеру
-- и его клиентам (чтобы клиент видел название упражнения в своей тренировке).
DROP POLICY IF EXISTS "exercises_library_select" ON public.exercises_library;
CREATE POLICY "exercises_library_select" ON public.exercises_library
  FOR SELECT USING (
    trainer_id IS NULL
    OR trainer_id = auth.uid()
    OR trainer_id = (SELECT trainer_id FROM public.profiles WHERE id = auth.uid())
  );

-- Тренер может добавлять только свои кастомные упражнения.
DROP POLICY IF EXISTS "exercises_library_insert" ON public.exercises_library;
CREATE POLICY "exercises_library_insert" ON public.exercises_library
  FOR INSERT WITH CHECK (trainer_id = auth.uid());
