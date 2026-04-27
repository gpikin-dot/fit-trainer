import { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Edit, Trash2, UserPlus, Copy } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Layout from '../components/Layout'
import { Modal, ErrorMessage, formatDate } from '../components/UI'
import type { Workout, Exercise, ExerciseLibrary, AssignedWorkout, Profile } from '../types/database'

export default function WorkoutDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const [workout, setWorkout] = useState<Workout | null>(null)
  const [exercises, setExercises] = useState<(Exercise & { exercise_library: ExerciseLibrary })[]>([])
  const [assignments, setAssignments] = useState<(AssignedWorkout & { profile: Profile })[]>([])
  const [clients, setClients] = useState<Profile[]>([])
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [dateType, setDateType] = useState<'open' | 'specific'>('open')
  const [assignDate, setAssignDate] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id || !profile) return
    Promise.all([
      supabase.from('workouts').select('*').eq('id', id).single(),
      supabase.from('exercises').select('*, exercise_library:exercises_library(*)').eq('workout_id', id).order('order'),
      supabase.from('assigned_workouts').select('*, profile:profiles(*)').eq('workout_id', id),
      supabase.from('profiles').select('*').eq('trainer_id', profile.id),
    ]).then(([w, e, a, c]) => {
      setWorkout(w.data)
      setExercises(e.data ?? [])
      setAssignments(a.data ?? [])
      setClients(c.data ?? [])
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

  async function handleAssign(clientId: string) {
    const payload: Record<string, unknown> = { workout_id: id, client_id: clientId }
    if (dateType === 'specific' && assignDate) payload.planned_date = assignDate
    const { data, error: err } = await supabase.from('assigned_workouts').insert(payload).select('*, profile:profiles(*)').single()
    if (err) { setError(err.message); return }
    if (data) setAssignments(prev => [...prev, data])
    setShowAssignModal(false)
    setDateType('open')
    setAssignDate('')
  }

  const assignedClientIds = assignments.map(a => a.client_id)
  const availableClients = clients.filter(c => !assignedClientIds.includes(c.id))

  if (!workout) return <Layout><div className="text-center py-12 text-slate-400">Загрузка...</div></Layout>

  return (
    <Layout>
      <div className="mb-4">
        <Link to="/trainer" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3">
          <ArrowLeft className="w-4 h-4" /> Назад
        </Link>
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => navigate(`/trainer/workout/${id}/edit`)} className="flex items-center justify-center gap-1 text-sm text-slate-600 hover:text-slate-900 border border-slate-200 px-2 py-2 rounded-lg">
            <Edit className="w-4 h-4 shrink-0" /> <span className="truncate">Редактировать</span>
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
      <p className="text-sm text-slate-500 mb-5">Отдых по умолчанию: {workout.default_rest_sec} сек · {formatDate(workout.created_at)}</p>

      {error && <ErrorMessage text={error} />}

      <div className="mb-6">
        <h2 className="font-semibold mb-3">Упражнения ({exercises.length})</h2>
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

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Назначена клиентам ({assignments.length})</h2>
          <button onClick={() => setShowAssignModal(true)} className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800">
            <UserPlus className="w-4 h-4" /> Назначить
          </button>
        </div>
        {assignments.length === 0
          ? <p className="text-sm text-slate-400">Ещё никому не назначена</p>
          : <div className="space-y-1">
            {assignments.map(a => (
              <div key={a.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 text-sm">
                <span>{a.profile?.name ?? '—'}</span>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 text-xs">{formatDate(a.assigned_at)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${a.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {a.status === 'completed' ? '✓ Выполнена' : 'В процессе'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        }
      </div>

      {showAssignModal && (
        <Modal onClose={() => setShowAssignModal(false)}>
          <h2 className="text-xl font-semibold mb-4">Назначить клиенту</h2>

          {/* Date type toggle */}
          <div className="flex gap-2 mb-3">
            <button onClick={() => setDateType('open')}
              className={`flex-1 py-2 text-xs rounded-lg border transition-colors ${dateType === 'open' ? 'bg-indigo-50 border-indigo-400 text-indigo-700 font-medium' : 'border-slate-200 text-slate-500'}`}>
              Открытая дата
            </button>
            <button onClick={() => setDateType('specific')}
              className={`flex-1 py-2 text-xs rounded-lg border transition-colors ${dateType === 'specific' ? 'bg-indigo-50 border-indigo-400 text-indigo-700 font-medium' : 'border-slate-200 text-slate-500'}`}>
              Конкретная дата
            </button>
          </div>
          {dateType === 'specific' && (
            <input type="date" value={assignDate}
              onChange={e => setAssignDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3 font-[inherit]" />
          )}

          {availableClients.length === 0
            ? <p className="text-sm text-slate-500">Все ваши клиенты уже получили эту тренировку.</p>
            : <div className="space-y-1">
              {availableClients.map(c => (
                <button key={c.id} onClick={() => handleAssign(c.id)}
                  className="w-full text-left border border-slate-200 rounded-lg p-3 hover:border-indigo-400 hover:bg-indigo-50">
                  <div className="font-medium text-sm">{c.name}</div>
                </button>
              ))}
            </div>
          }
          <button onClick={() => setShowAssignModal(false)} className="mt-4 w-full text-sm text-slate-500 hover:text-slate-700">Закрыть</button>
        </Modal>
      )}
    </Layout>
  )
}
