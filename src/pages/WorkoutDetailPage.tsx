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

  if (!workout) return (
    <Layout>
      <div className="text-center py-12 text-[#94A3B8] text-[11px]">Загрузка...</div>
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
          className="text-[10px] font-semibold text-[#6366F1] hover:text-indigo-800 flex items-center gap-1 mb-[9px]"
        >
          <ArrowLeft className="w-3 h-3" /> Шаблоны
        </Link>

        {/* Action buttons */}
        <div className="grid grid-cols-3 gap-[5px] mb-[13px]">
          <button
            onClick={() => navigate(`/trainer/workout/${id}/edit`)}
            className="bg-white border border-[#E2E8F0] rounded-[8px] py-[8px] text-[9px] font-bold text-[#475569] flex items-center justify-center gap-1"
          >
            <Edit className="w-3.5 h-3.5 shrink-0" /> Изменить
          </button>
          <button
            onClick={handleCopy}
            className="bg-white border border-[#E2E8F0] rounded-[8px] py-[8px] text-[9px] font-bold text-[#475569] flex items-center justify-center gap-1"
          >
            <Copy className="w-3.5 h-3.5 shrink-0" /> Копировать
          </button>
          <button
            onClick={handleDelete}
            className="border border-[#FECACA] bg-[#FFF8F8] rounded-[8px] py-[8px] text-[9px] font-bold text-[#EF4444] flex items-center justify-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" /> Удалить
          </button>
        </div>

        <h1 className="text-[16px] font-bold text-[#0F172A] mb-[1px]">{workout.name}</h1>
        <p className="text-[9px] text-[#94A3B8] mb-[13px]">
          {exercises.length} упражнений · отдых {workout.default_rest_sec} сек
        </p>

        {error && <ErrorMessage text={error} />}

        {/* Assign button */}
        <button
          onClick={() => navigate(`/trainer/assign?workoutId=${id}`)}
          className="w-full bg-[#6366F1] hover:bg-[#4338CA] text-white text-[11px] font-bold rounded-[9px] py-[10px] mb-[15px]"
        >
          Назначить клиенту
        </button>

        {/* Exercises */}
        <div className="text-[9px] font-bold text-[#94A3B8] uppercase tracking-[0.07em] mb-[6px]">
          Упражнения
        </div>

        {exercises.length === 0 ? (
          <p className="text-[11px] text-[#94A3B8]">Нет упражнений</p>
        ) : (
          exercises.map((ex, i) => (
            <div key={ex.id} className="bg-white border border-[#E8EDF3] rounded-[10px] px-[11px] py-[9px] mb-[5px]">
              <div className="text-[11px] font-bold text-[#0F172A] mb-[3px]">
                {i + 1}. {ex.exercise_library.name_ru}
              </div>
              <div className="text-[9px] text-[#64748B]">
                {ex.sets} × {ex.reps}{ex.weight_kg > 0 ? ` · ${ex.weight_kg} кг` : ''}
                {ex.rest_sec ? ` · отдых ${ex.rest_sec} сек` : ''}
              </div>
              {ex.trainer_note && (
                <div className="text-[9px] text-[#6366F1] italic mt-[3px]">«{ex.trainer_note}»</div>
              )}
            </div>
          ))
        )}

        {/* Who used */}
        {clientUsage.size > 0 && (
          <div className="mt-[13px]">
            <div className="text-[9px] font-bold text-[#94A3B8] uppercase tracking-[0.07em] mb-[6px]">
              Кто использовал
            </div>
            <div className="bg-white border border-[#E8EDF3] rounded-[10px] overflow-hidden">
              {Array.from(clientUsage.values()).map(({ name, clientId, count }, idx, arr) => (
                <div
                  key={clientId}
                  onClick={() => navigate(`/trainer/client/${clientId}`)}
                  className={`flex gap-[8px] px-[11px] py-[8px] cursor-pointer ${idx < arr.length - 1 ? 'border-b border-[#F8FAFC]' : ''}`}
                >
                  <div className="w-[24px] h-[24px] rounded-full bg-[#EEF2FF] flex items-center justify-center shrink-0 text-[9px] font-bold text-[#6366F1]">
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-[11px] font-semibold text-[#0F172A] flex-1">{name}</span>
                  <span className="text-[9px] text-[#94A3B8]">
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
