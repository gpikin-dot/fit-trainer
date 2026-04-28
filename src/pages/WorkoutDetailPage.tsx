import { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Edit, Trash2, Copy } from 'lucide-react'
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

  if (!workout) return <Layout><div className="text-center py-12 text-slate-400">Загрузка...</div></Layout>

  // Уникальные клиенты с количеством использований
  const clientUsage = new Map<string, { name: string; count: number; clientId: string }>()
  for (const a of assignments) {
    const name = a.profile?.name ?? '—'
    const existing = clientUsage.get(a.client_id)
    clientUsage.set(a.client_id, { name, clientId: a.client_id, count: (existing?.count ?? 0) + 1 })
  }

  return (
    <Layout>
      <div className="mb-4">
        <Link to="/trainer" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3">
          <ArrowLeft className="w-4 h-4" /> Назад
        </Link>
        <div className="grid grid-cols-3 gap-2 mb-4">
          <button onClick={() => navigate(`/trainer/workout/${id}/edit`)} className="flex items-center justify-center gap-1 text-sm text-slate-600 hover:text-slate-900 border border-slate-200 px-2 py-2 rounded-lg">
            <Edit className="w-4 h-4 shrink-0" /> <span className="truncate">Изменить</span>
          </button>
          <button onClick={handleCopy} className="flex items-center justify-center gap-1 text-sm text-slate-600 hover:text-slate-900 border border-slate-200 px-2 py-2 rounded-lg">
            <Copy className="w-4 h-4 shrink-0" /> <span className="truncate">Копировать</span>
          </button>
          <button onClick={handleDelete} className="flex items-center justify-center gap-1 text-sm text-red-600 hover:text-red-800 border border-red-200 px-2 py-2 rounded-lg">
            <Trash2 className="w-4 h-4 shrink-0" /> <span className="truncate">Удалить</span>
          </button>
        </div>
      </div>

      <h1 className="text-2xl font-semibold mb-1">{workout.name}</h1>
      <p className="text-sm text-slate-500 mb-4">
        {exercises.length} упражнений · отдых {workout.default_rest_sec} сек
      </p>

      {error && <ErrorMessage text={error} />}

      {/* Главная кнопка */}
      <button
        onClick={() => navigate(`/trainer/assign?workoutId=${id}`)}
        className="w-full mb-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl text-sm">
        Назначить клиенту
      </button>

      {/* Упражнения */}
      <div className="mb-6">
        <h2 className="font-semibold mb-3">Упражнения</h2>
        {exercises.length === 0
          ? <p className="text-sm text-slate-400">Нет упражнений</p>
          : <div className="space-y-2">
            {exercises.map((ex, i) => (
              <div key={ex.id} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="font-medium text-sm mb-1">{i + 1}. {ex.exercise_library.name_ru}</div>
                <div className="text-sm text-slate-500">
                  {ex.sets} × {ex.reps}{ex.weight_kg > 0 ? ` · ${ex.weight_kg} кг` : ''}
                  {ex.rest_sec ? ` · отдых ${ex.rest_sec} сек` : ''}
                </div>
                {ex.trainer_note && <div className="text-xs text-indigo-700 mt-1 italic">{ex.trainer_note}</div>}
              </div>
            ))}
          </div>
        }
      </div>

      {/* Кто использовал */}
      {clientUsage.size > 0 && (
        <div>
          <h2 className="font-semibold mb-3">Кто использовал</h2>
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
            {Array.from(clientUsage.values()).map(({ name, clientId, count }) => (
              <div key={clientId}
                onClick={() => navigate(`/trainer/client/${clientId}`)}
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                    <span className="text-xs font-semibold text-slate-400">{name.charAt(0).toUpperCase()}</span>
                  </div>
                  <span className="text-sm font-medium">{name}</span>
                </div>
                <span className="text-xs text-slate-400">{count} {count === 1 ? 'раз' : 'раза'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Layout>
  )
}
