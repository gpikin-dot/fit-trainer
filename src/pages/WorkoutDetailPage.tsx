import { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Layout from '../components/Layout'
import { ErrorMessage } from '../components/UI'
import type { Workout, Exercise, ExerciseLibrary, AssignedWorkout, Profile } from '../types/database'

export default function WorkoutDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const [workout, setWorkout] = useState<Workout | null>(null)
  const [exercises, setExercises] = useState<(Exercise & { exercise_library: ExerciseLibrary })[]>([])
  const [assignments, setAssignments] = useState<(AssignedWorkout & { profile: Profile })[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id || !profile) return
    Promise.all([
      supabase.from('workouts').select('*').eq('id', id).single(),
      supabase.from('exercises').select('*, exercise_library:exercises_library(*)').eq('workout_id', id).order('order'),
      supabase.from('assigned_workouts').select('*, profile:profiles(*)').eq('workout_id', id),
    ]).then(([w, e, a]) => {
      setWorkout(w.data)
      setExercises(e.data ?? [])
      setAssignments(a.data ?? [])
    })
  }, [id, profile])

  async function handleCopy() {
    if (!profile || !workout) return
    const { data: newWorkout } = await supabase.from('workouts').insert({
      trainer_id: profile.id,
      name: `${workout.name} (копия)`,
      default_rest_sec: workout.default_rest_sec,
    }).select().single()
    if (!newWorkout) { setError('Ошибка копирования'); return }

    if (exercises.length > 0) {
      await supabase.from('exercises').insert(exercises.map(e => ({
        workout_id: newWorkout.id,
        library_exercise_id: e.library_exercise_id,
        sets: e.sets,
        reps: e.reps,
        weight_kg: e.weight_kg,
        rest_sec: e.rest_sec,
        trainer_note: e.trainer_note,
        order: e.order,
      })))
    }
    navigate(`/trainer/workout/${newWorkout.id}/edit`)
  }

  async function handleDelete() {
    if (!confirm('Удалить тренировку? Это действие нельзя отменить.')) return
    const { error: err } = await supabase.from('workouts').delete().eq('id', id)
    if (err) { setError(err.message); return }
    navigate('/trainer')
  }

  if (!workout) return (
    <Layout>
      <div className="text-center py-12 text-[var(--slate-400)] text-[var(--text-sub)]">Загрузка...</div>
    </Layout>
  )

  const clientUsage = new Map<string, { name: string; count: number; clientId: string }>()
  for (const a of assignments) {
    const name = a.profile?.name ?? '—'
    const existing = clientUsage.get(a.client_id)
    clientUsage.set(a.client_id, { name, clientId: a.client_id, count: (existing?.count ?? 0) + 1 })
  }

  return (
    <Layout>
      <div className="pt-[11px] pb-[14px]">
        <Link
          to="/trainer"
          className="text-[var(--text-sub)] font-semibold text-[var(--indigo-500)] hover:text-indigo-800 flex items-center gap-1 mb-[9px]"
        >
          <ArrowLeft className="w-3 h-3" /> Шаблоны
        </Link>

        {/* Action buttons */}
        <div className="grid grid-cols-3 gap-[5px] mb-[13px]">
          <button
            onClick={() => navigate(`/trainer/workout/${id}/edit`)}
            className="bg-white border border-[var(--slate-200)] rounded-[8px] py-[8px] text-[var(--text-label)] font-bold text-[var(--slate-600)] flex items-center justify-center"
          >
            Изменить
          </button>
          <button
            onClick={handleCopy}
            className="bg-white border border-[var(--slate-200)] rounded-[8px] py-[8px] text-[var(--text-label)] font-bold text-[var(--slate-600)] flex items-center justify-center"
          >
            Копировать
          </button>
          <button
            onClick={handleDelete}
            className="border border-[var(--red-200)] bg-[var(--red-50)] rounded-[8px] py-[8px] text-[var(--text-label)] font-bold text-[var(--red-500)] flex items-center justify-center"
          >
            Удалить
          </button>
        </div>

        <h1 className="text-[var(--text-heading)] font-bold text-[var(--slate-900)] mb-[1px]">{workout.name}</h1>
        <p className="text-[var(--text-label)] text-[var(--slate-400)] mb-[13px]">
          {exercises.length} упражнений · отдых {workout.default_rest_sec} сек
        </p>

        {error && <ErrorMessage text={error} />}

        {/* Assign button */}
        <button
          onClick={() => navigate(`/trainer/assign?workoutId=${id}`)}
          className="w-full bg-[var(--indigo-500)] hover:bg-[var(--indigo-700)] text-white text-[var(--text-sub)] font-bold rounded-[9px] py-[10px] mb-[15px]"
        >
          Назначить клиенту
        </button>

        {/* Exercises */}
        <div className="text-[var(--text-label)] font-bold text-[var(--slate-400)] uppercase tracking-[0.07em] mb-[6px]">
          Упражнения
        </div>

        {exercises.length === 0 ? (
          <p className="text-[var(--text-sub)] text-[var(--slate-400)]">Нет упражнений</p>
        ) : (
          exercises.map((ex, i) => (
            <div key={ex.id} className="bg-white border border-[var(--border)] rounded-[10px] px-[11px] py-[9px] mb-[5px]">
              <div className="text-[var(--text-sub)] font-bold text-[var(--slate-900)] mb-[3px]">
                {i + 1}. {ex.exercise_library.name_ru}
              </div>
              <div className="text-[var(--text-label)] text-[var(--slate-500)]">
                {ex.sets} × {ex.reps}{ex.weight_kg > 0 ? ` · ${ex.weight_kg} кг` : ''}
                {ex.rest_sec ? ` · отдых ${ex.rest_sec} сек` : ''}
              </div>
              {ex.trainer_note && (
                <div className="text-[var(--text-label)] text-[var(--indigo-500)] italic mt-[3px]">«{ex.trainer_note}»</div>
              )}
            </div>
          ))
        )}

        {/* Who used */}
        {clientUsage.size > 0 && (
          <div className="mt-[13px]">
            <div className="text-[var(--text-label)] font-bold text-[var(--slate-400)] uppercase tracking-[0.07em] mb-[6px]">
              Кто использовал
            </div>
            <div className="bg-white border border-[var(--border)] rounded-[10px] overflow-hidden">
              {Array.from(clientUsage.values()).map(({ name, clientId, count }, idx, arr) => (
                <div
                  key={clientId}
                  onClick={() => navigate(`/trainer/client/${clientId}`)}
                  className={`flex gap-[8px] px-[11px] py-[8px] cursor-pointer ${idx < arr.length - 1 ? 'border-b border-[var(--slate-50)]' : ''}`}
                >
                  <div className="w-[24px] h-[24px] rounded-full bg-[var(--indigo-50)] flex items-center justify-center shrink-0 text-[var(--text-sub)] font-bold text-[var(--indigo-500)]">
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-[var(--text-sub)] font-semibold text-[var(--slate-900)] flex-1">{name}</span>
                  <span className="text-[var(--text-label)] text-[var(--slate-400)]">
                    {count} {count === 1 ? 'раз' : 'раза'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
