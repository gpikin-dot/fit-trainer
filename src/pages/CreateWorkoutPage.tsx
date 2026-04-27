import { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Layout from '../components/Layout'
import { Input, Modal, ErrorMessage } from '../components/UI'
import { canAddExercise } from '../lib/planLimits'
import type { ExerciseLibrary, Profile, ExerciseResult, AssignedWorkout, Exercise } from '../types/database'

const CATEGORIES = ['Все', 'Ноги', 'Грудь', 'Спина', 'Плечи', 'Руки', 'Кор', 'Кардио']

interface WorkoutExercise {
  tempId: string
  library_exercise_id: string
  library: ExerciseLibrary
  sets: number
  reps: number
  weight_kg: number
  rest_sec: number | null
  trainer_note: string
  order: number
}

interface ClientHistory {
  exerciseId: string
  results: Array<{ date: string; reps: number | null; weight: number | null; note: string | null }>
}

export default function CreateWorkoutPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id
  const { profile } = useAuth()

  const [name, setName] = useState('')
  const [defaultRest, setDefaultRest] = useState('90')
  const [contextClientId, setContextClientId] = useState('')
  const [exercises, setExercises] = useState<WorkoutExercise[]>([])
  const [clients, setClients] = useState<Profile[]>([])
  const [library, setLibrary] = useState<ExerciseLibrary[]>([])
  const [showLibraryModal, setShowLibraryModal] = useState(false)
  const [librarySearch, setLibrarySearch] = useState('')
  const [libraryCategory, setLibraryCategory] = useState('Все')
  const [clientHistory, setClientHistory] = useState<ClientHistory[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!profile) return
    supabase.from('profiles').select('*').eq('trainer_id', profile.id).then(({ data }) => setClients(data ?? []))
    supabase.from('exercises_library').select('*').order('category').then(({ data }) => setLibrary(data ?? []))

    if (isEdit) {
      supabase.from('workouts').select('*').eq('id', id).single().then(({ data: w }) => {
        if (w) { setName(w.name); setDefaultRest(String(w.default_rest_sec)) }
      })
      supabase.from('exercises').select('*, exercise_library:exercises_library(*)').eq('workout_id', id).order('order').then(({ data }) => {
        setExercises((data ?? []).map((e: Exercise & { exercise_library: ExerciseLibrary }) => ({
          tempId: e.id,
          library_exercise_id: e.library_exercise_id,
          library: e.exercise_library,
          sets: e.sets,
          reps: e.reps,
          weight_kg: e.weight_kg,
          rest_sec: e.rest_sec,
          trainer_note: e.trainer_note ?? '',
          order: e.order,
        })))
      })
    }
  }, [profile, id, isEdit])

  useEffect(() => {
    if (!contextClientId || exercises.length === 0) { setClientHistory([]); return }
    loadClientHistory(contextClientId, exercises.map(e => e.library_exercise_id))
  }, [contextClientId, exercises.map(e => e.library_exercise_id).join(',')])

  async function loadClientHistory(clientId: string, libraryIds: string[]) {
    if (libraryIds.length === 0) return
    const { data: assignments } = await supabase
      .from('assigned_workouts').select('id').eq('client_id', clientId).eq('status', 'completed')
    if (!assignments?.length) return

    const assignedIds = assignments.map(a => a.id)
    const { data: results } = await supabase
      .from('exercise_results')
      .select('*, exercise:exercises(library_exercise_id), assigned_workout:assigned_workouts(completed_at)')
      .in('assigned_workout_id', assignedIds)
      .eq('completed', true)

    const history: ClientHistory[] = libraryIds.map(libId => ({
      exerciseId: libId,
      results: (results ?? [])
        .filter((r: ExerciseResult & { exercise: { library_exercise_id: string }; assigned_workout: AssignedWorkout }) =>
          r.exercise?.library_exercise_id === libId)
        .sort((a: ExerciseResult & { assigned_workout: AssignedWorkout }, b: ExerciseResult & { assigned_workout: AssignedWorkout }) =>
          new Date(b.assigned_workout?.completed_at ?? 0).getTime() - new Date(a.assigned_workout?.completed_at ?? 0).getTime())
        .slice(0, 3)
        .map((r: ExerciseResult & { assigned_workout: AssignedWorkout }) => ({
          date: r.assigned_workout?.completed_at ?? '',
          reps: r.actual_reps,
          weight: r.actual_weight_kg,
          note: r.client_note,
        })),
    }))
    setClientHistory(history)
  }

  async function addExercise(lib: ExerciseLibrary) {
    if (!profile) return
    const check = await canAddExercise(profile.id, id ?? 'new')
    if (!check.allowed) { setError(check.reason ?? ''); return }

    setExercises(prev => [...prev, {
      tempId: `tmp-${Date.now()}`,
      library_exercise_id: lib.id,
      library: lib,
      sets: 3,
      reps: 10,
      weight_kg: 0,
      rest_sec: null,
      trainer_note: '',
      order: prev.length,
    }])
    setShowLibraryModal(false)
  }

  function updateExercise(tempId: string, patch: Partial<WorkoutExercise>) {
    setExercises(prev => prev.map(e => e.tempId === tempId ? { ...e, ...patch } : e))
  }

  function removeExercise(tempId: string) {
    setExercises(prev => prev.filter(e => e.tempId !== tempId).map((e, i) => ({ ...e, order: i })))
  }

  async function handleSave() {
    if (!name.trim()) { setError('Введите название тренировки'); return }
    if (!profile) return
    setError('')
    setSaving(true)

    if (isEdit) {
      await supabase.from('workouts').update({ name: name.trim(), default_rest_sec: parseInt(defaultRest) || 90 }).eq('id', id)
      await supabase.from('exercises').delete().eq('workout_id', id)
    }

    const workoutId = isEdit ? id! : (await supabase.from('workouts').insert({
      trainer_id: profile.id,
      name: name.trim(),
      default_rest_sec: parseInt(defaultRest) || 90,
    }).select().single()).data?.id

    if (!workoutId) { setError('Ошибка сохранения'); setSaving(false); return }

    if (exercises.length > 0) {
      await supabase.from('exercises').insert(exercises.map(e => ({
        workout_id: workoutId,
        library_exercise_id: e.library_exercise_id,
        sets: e.sets,
        reps: e.reps,
        weight_kg: e.weight_kg,
        rest_sec: e.rest_sec,
        trainer_note: e.trainer_note || null,
        order: e.order,
      })))
    }

    navigate(`/trainer/workout/${workoutId}`)
  }

  const filteredLibrary = library.filter(l => {
    const matchCat = libraryCategory === 'Все' || l.category === libraryCategory
    const matchSearch = !librarySearch || l.name_ru.toLowerCase().includes(librarySearch.toLowerCase())
    return matchCat && matchSearch
  })

  return (
    <Layout>
      <Link to={isEdit ? `/trainer/workout/${id}` : '/trainer'} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Назад
      </Link>
      <h1 className="text-2xl font-semibold mb-5">{isEdit ? 'Редактировать тренировку' : 'Новая тренировка'}</h1>

      <div className="space-y-4 mb-6">
        <Input label="Название" value={name} onChange={setName} placeholder="Например: Ноги. День 1" />
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Время отдыха между подходами (сек)</label>
          <input type="text" inputMode="numeric" value={defaultRest}
            onChange={e => setDefaultRest(e.target.value)}
            onBlur={() => { if (!defaultRest || parseInt(defaultRest) < 1) setDefaultRest('90') }}
            onFocus={e => e.target.select()}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>

        {clients.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Контекст клиента (для подсказок по истории)
            </label>
            <select
              value={contextClientId}
              onChange={e => setContextClientId(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— Не выбран —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">Упражнения ({exercises.length})</h2>
        <button onClick={() => setShowLibraryModal(true)} className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800">
          <Plus className="w-4 h-4" /> Добавить
        </button>
      </div>

      {error && <ErrorMessage text={error} />}

      <div className="space-y-3 mb-6">
        {exercises.map((ex, idx) => {
          const hist = clientHistory.find(h => h.exerciseId === ex.library_exercise_id)
          return (
            <div key={ex.tempId} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="font-medium text-sm">{idx + 1}. {ex.library.name_ru}</span>
                <button onClick={() => removeExercise(ex.tempId)} className="text-slate-400 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-slate-500">Подходы</label>
                  <input type="text" inputMode="numeric" value={isNaN(ex.sets) ? '' : ex.sets}
                    onChange={e => updateExercise(ex.tempId, { sets: parseInt(e.target.value) })}
                    onBlur={() => { if (!ex.sets || ex.sets < 1) updateExercise(ex.tempId, { sets: 1 }) }}
                    onFocus={e => e.target.select()} className="w-full border border-slate-300 rounded px-2 py-1 text-sm mt-1" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Повторения</label>
                  <input type="text" inputMode="numeric" value={isNaN(ex.reps) ? '' : ex.reps}
                    onChange={e => updateExercise(ex.tempId, { reps: parseInt(e.target.value) })}
                    onBlur={() => { if (!ex.reps || ex.reps < 1) updateExercise(ex.tempId, { reps: 1 }) }}
                    onFocus={e => e.target.select()} className="w-full border border-slate-300 rounded px-2 py-1 text-sm mt-1" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Вес (кг)</label>
                  <input type="text" inputMode="decimal" value={isNaN(ex.weight_kg) ? '' : ex.weight_kg}
                    onChange={e => updateExercise(ex.tempId, { weight_kg: parseFloat(e.target.value.replace(',', '.')) })}
                    onBlur={() => { if (isNaN(ex.weight_kg)) updateExercise(ex.tempId, { weight_kg: 0 }) }}
                    onFocus={e => e.target.select()} className="w-full border border-slate-300 rounded px-2 py-1 text-sm mt-1" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Отдых (сек)</label>
                  <input type="text" inputMode="numeric" value={ex.rest_sec ?? ''}
                    onChange={e => updateExercise(ex.tempId, { rest_sec: e.target.value ? parseInt(e.target.value) : null })}
                    onFocus={e => e.target.select()} placeholder="по умолчанию" className="w-full border border-slate-300 rounded px-2 py-1 text-sm mt-1" />
                </div>
              </div>
              <div className="mt-2">
                <label className="text-xs text-slate-500">Комментарий тренера</label>
                <input type="text" value={ex.trainer_note} onChange={e => updateExercise(ex.tempId, { trainer_note: e.target.value })}
                  placeholder="Необязательно" className="w-full border border-slate-300 rounded px-2 py-1 text-sm mt-1" />
              </div>

              {contextClientId && hist && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <p className="text-xs font-medium text-slate-500 mb-1">История клиента по этому упражнению:</p>
                  {hist.results.length === 0
                    ? <p className="text-xs text-slate-400">Это упражнение ещё не выполнялось</p>
                    : hist.results.map((r, i) => (
                      <div key={i} className="text-xs text-slate-600 flex gap-2">
                        <span className="text-slate-400">{r.date ? new Date(r.date).toLocaleDateString('ru-RU') : '—'}</span>
                        <span>{r.reps !== null ? `${r.reps} повт.` : '—'}{r.weight !== null ? ` · ${r.weight} кг` : ''}</span>
                        {r.note && <span className="italic text-slate-400">{r.note}</span>}
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
          )
        })}
      </div>

      <button onClick={handleSave} disabled={saving} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-3 rounded-xl">
        {saving ? 'Сохранение...' : (isEdit ? 'Сохранить изменения' : 'Создать тренировку')}
      </button>

      {showLibraryModal && (
        <Modal onClose={() => setShowLibraryModal(false)}>
          <h2 className="text-lg font-semibold mb-3">Выберите упражнение</h2>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input value={librarySearch} onChange={e => setLibrarySearch(e.target.value)} placeholder="Поиск..."
              className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm" />
          </div>
          <div className="flex gap-1 flex-wrap mb-3">
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setLibraryCategory(cat)}
                className={`text-xs px-2.5 py-1 rounded-full border ${libraryCategory === cat ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-300 text-slate-600 hover:border-indigo-400'}`}>
                {cat}
              </button>
            ))}
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {filteredLibrary.map(lib => (
              <button key={lib.id} onClick={() => addExercise(lib)}
                className="w-full text-left px-3 py-2 hover:bg-indigo-50 rounded-lg text-sm">
                <span className="font-medium">{lib.name_ru}</span>
                <span className="text-slate-400 ml-2 text-xs">{lib.category} · {lib.equipment}</span>
              </button>
            ))}
            {filteredLibrary.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Ничего не найдено</p>}
          </div>
        </Modal>
      )}
    </Layout>
  )
}
