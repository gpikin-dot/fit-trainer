import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Layout from '../components/Layout'
import { ErrorMessage } from '../components/UI'
import { plural } from '../lib/plural'
import { groupInfoFor } from '../lib/superset'
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
    // ЗАЩИТА ОТ КАСКАДНОГО УДАЛЕНИЯ:
    // assigned_workouts.workout_id имеет ON DELETE CASCADE — удаление
    // шаблона стёрло бы ВСЕ назначения этого шаблона всем клиентам
    // вместе с историей. Блокируем, если шаблон где-то назначен.
    if (assignments.length > 0) {
      const clientCount = new Set(assignments.map(a => a.client_id)).size
      setError(
        `Нельзя удалить: шаблон назначен ${assignments.length} ` +
        `${plural(assignments.length, 'раз', 'раза', 'раз').replace(/^\d+ /, '')} ` +
        `(${clientCount} ${clientCount === 1 ? 'клиенту' : 'клиентам'}). ` +
        `Удаление стёрло бы все эти тренировки и историю. ` +
        `Сначала отмените назначения или используйте «Копировать» для новой версии.`
      )
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    if (!confirm('Удалить шаблон тренировки? Это действие нельзя отменить.')) return
    const { error: err } = await supabase.from('workouts').delete().eq('id', id)
    if (err) { setError(err.message); return }
    navigate('/trainer')
  }

  if (!workout) return (
    <Layout>
      <div className="text-center py-12 text-[var(--slate-400)] text-[15px]">Загрузка...</div>
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
        <button
          onClick={() => navigate(-1)}
          className="text-[14px] font-semibold text-[var(--blue-600)] flex items-center gap-1 mb-[10px]"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Назад
        </button>

        {/* Action buttons */}
        <div className="grid grid-cols-3 gap-[6px] mb-[14px]">
          <button
            onClick={() => navigate(`/trainer/workout/${id}/edit`)}
            className="bg-white border border-[var(--slate-200)] rounded-[8px] py-[9px] text-[13px] font-semibold text-[var(--slate-700)]"
          >
            Изменить
          </button>
          <button
            onClick={handleCopy}
            className="bg-white border border-[var(--slate-200)] rounded-[8px] py-[9px] text-[13px] font-semibold text-[var(--slate-700)]"
          >
            Копировать
          </button>
          <button
            onClick={handleDelete}
            className="bg-white border border-[var(--red-200)] rounded-[8px] py-[9px] text-[13px] font-semibold text-[var(--red-500)]"
          >
            Удалить
          </button>
        </div>

        <h1 className="text-[20px] font-bold text-[var(--slate-900)] mb-[2px]">{workout.name}</h1>
        <p className="text-[13px] text-[var(--slate-400)] mb-[14px]">
          {plural(exercises.length, 'упражнение', 'упражнения', 'упражнений')} · отдых {workout.default_rest_sec} сек
        </p>

        {error && <ErrorMessage text={error} />}

        {/* Assign button */}
        <button
          onClick={() => {
            if (exercises.length === 0) {
              setError('В шаблоне нет упражнений — добавьте хотя бы одно, чтобы назначить клиенту.')
              return
            }
            navigate(`/trainer/assign?workoutId=${id}`)
          }}
          className="w-full bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white text-[15px] font-semibold rounded-[10px] py-[13px] mb-[16px]"
        >
          Назначить клиенту
        </button>

        {/* Exercises */}
        <div className="text-[11px] font-semibold text-[var(--slate-400)] uppercase tracking-[0.05em] mb-[6px]">
          Упражнения
        </div>

        {exercises.length === 0 ? (
          <p className="text-[14px] text-[var(--slate-400)]">Нет упражнений</p>
        ) : (
          exercises.map((ex, i) => {
            const gInfo = groupInfoFor(exercises, i)
            return (
            <div key={ex.id} className={`bg-white border rounded-[10px] px-[12px] py-[10px] mb-[5px] ${
              gInfo ? 'border-[var(--green-300)] border-l-[3px]' : 'border-[var(--border)]'
            }`}>
              {gInfo && (
                <div className="text-[11px] font-bold text-[var(--green-700)] uppercase tracking-[0.05em] mb-[2px]">
                  {gInfo.label} · {gInfo.pos} из {gInfo.size}
                </div>
              )}
              <div className="text-[15px] font-semibold text-[var(--slate-900)] mb-[3px]">
                {i + 1}. {ex.exercise_library.name_ru}
              </div>
              <div className="text-[13px] text-[var(--slate-500)]">
                {ex.sets} × {ex.reps}{ex.weight_kg > 0 ? ` · ${ex.weight_kg} кг` : ''}
                {ex.rest_sec ? ` · отдых ${ex.rest_sec} сек` : ''}
              </div>
              {ex.trainer_note && (
                <div className="text-[13px] text-[var(--blue-600)] italic mt-[3px]">«{ex.trainer_note}»</div>
              )}
            </div>
            )
          })
        )}

        {/* Who used */}
        {clientUsage.size > 0 && (
          <div className="mt-[13px]">
            <div className="text-[11px] font-semibold text-[var(--slate-400)] uppercase tracking-[0.05em] mb-[6px]">
              Кто использовал
            </div>
            <div className="bg-white border border-[var(--border)] rounded-[10px] overflow-hidden">
              {Array.from(clientUsage.values()).map(({ name, clientId, count }, idx, arr) => (
                <div
                  key={clientId}
                  onClick={() => navigate(`/trainer/client/${clientId}`)}
                  className={`flex items-center gap-[8px] px-[12px] py-[9px] cursor-pointer ${idx < arr.length - 1 ? 'border-b border-[var(--slate-50)]' : ''}`}
                >
                  <div className="w-[28px] h-[28px] rounded-full bg-[var(--blue-50)] flex items-center justify-center shrink-0 text-[12px] font-bold text-[var(--blue-600)]">
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-[15px] font-semibold text-[var(--slate-900)] flex-1">{name}</span>
                  <span className="text-[13px] text-[var(--slate-400)]">
                    {plural(count, 'раз', 'раза', 'раз')}
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
