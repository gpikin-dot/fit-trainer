import { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Layout from '../components/Layout'
import { Modal, ErrorMessage } from '../components/UI'
import { canAddExercise } from '../lib/planLimits'
import type { ExerciseLibrary, Exercise } from '../types/database'

const CATEGORIES = ['Все', 'Ноги', 'Грудь', 'Спина', 'Плечи', 'Руки', 'Кор', 'Кардио']

interface WorkoutExercise {
  tempId: string
  library_exercise_id: string
  library: ExerciseLibrary
  sets: number
  reps: number
  weight_kg: string
  rest_sec: number | null
  trainer_note: string
  target_heart_rate_bpm: number | null
  order: number
}

export default function CreateWorkoutPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id
  const { profile } = useAuth()

  const [name, setName] = useState('')
  const [defaultRest, setDefaultRest] = useState('90')
  const [exercises, setExercises] = useState<WorkoutExercise[]>([])
  const [library, setLibrary] = useState<ExerciseLibrary[]>([])
  const [showLibraryModal, setShowLibraryModal] = useState(false)
  const [librarySearch, setLibrarySearch] = useState('')
  const [libraryCategory, setLibraryCategory] = useState('Все')
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!profile) return
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
          weight_kg: String(e.weight_kg),
          rest_sec: e.rest_sec,
          trainer_note: e.trainer_note ?? '',
          target_heart_rate_bpm: e.target_heart_rate_bpm ?? null,
          order: e.order,
        })))
      })
    }
  }, [profile, id, isEdit])

  function toggleLibrarySelect(id: string) {
    setSelectedLibraryIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function addSelectedExercises() {
    if (!profile || selectedLibraryIds.size === 0) return
    const check = await canAddExercise(profile.id, id ?? 'new')
    if (!check.allowed) { setError(check.reason ?? ''); return }

    const toAdd = library.filter(l => selectedLibraryIds.has(l.id))
    setExercises(prev => [
      ...prev,
      ...toAdd.map((lib, i) => {
        const t = lib.exercise_type
        return {
          tempId: `tmp-${Date.now()}-${i}`,
          library_exercise_id: lib.id,
          library: lib,
          sets: t === 'cardio_time' ? 1 : 3,
          reps: t === 'cardio_time' ? 30 : 10,
          weight_kg: '0',
          rest_sec: null,
          trainer_note: '',
          target_heart_rate_bpm: null,
          order: prev.length + i,
        }
      }),
    ])
    setSelectedLibraryIds(new Set())
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
        weight_kg: parseFloat(e.weight_kg.replace(',', '.')) || 0,
        rest_sec: e.rest_sec,
        trainer_note: e.trainer_note || null,
        target_heart_rate_bpm: e.target_heart_rate_bpm ?? null,
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

  const numInput = 'bg-[var(--slate-50)] border border-[var(--slate-200)] rounded-[6px] px-[4px] py-[5px] text-[var(--fs-xs)] font-bold text-[var(--slate-900)] text-center w-full outline-none focus:border-indigo-400'
  const noteInput = 'bg-[var(--slate-50)] border border-[var(--slate-200)] rounded-[6px] px-[7px] py-[5px] text-[var(--fs-2xs)] text-[var(--slate-600)] italic w-full outline-none focus:border-indigo-400 text-left'

  return (
    <Layout>
      <div className="pt-[11px] pb-[14px]">
        <Link
          to={isEdit ? `/trainer/workout/${id}` : '/trainer'}
          className="text-[var(--fs-2xs)] font-semibold text-[var(--indigo-500)] hover:text-indigo-800 flex items-center gap-1 mb-[9px]"
        >
          <ArrowLeft className="w-3 h-3" /> {isEdit ? 'К шаблону' : 'Шаблоны'}
        </Link>

        {/* Form fields */}
        <div className="mb-[10px]">
          <label className="block text-[var(--fs-2xs)] font-bold text-[var(--slate-500)] uppercase tracking-[0.04em] mb-1">
            Название
          </label>
          <input
            type="text"
            value={name}
            onChange={e => { setName(e.target.value); setError('') }}
            placeholder="Например: Ноги. День 1"
            className="w-full border border-[var(--slate-200)] rounded-[7px] px-[9px] py-[7px] text-[var(--fs-xs)] text-[var(--slate-900)] bg-[var(--slate-50)] outline-none focus:border-indigo-400"
          />
        </div>

        <div className="mb-[13px]">
          <label className="block text-[var(--fs-2xs)] font-bold text-[var(--slate-500)] uppercase tracking-[0.04em] mb-1">
            Отдых между подходами (сек)
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={defaultRest}
            onChange={e => setDefaultRest(e.target.value)}
            onBlur={() => { if (!defaultRest || parseInt(defaultRest) < 1) setDefaultRest('90') }}
            onFocus={e => e.target.select()}
            className="w-full border border-[var(--slate-200)] rounded-[7px] px-[9px] py-[7px] text-[var(--fs-xs)] text-[var(--slate-900)] bg-[var(--slate-50)] outline-none focus:border-indigo-400"
          />
        </div>

        {error && <ErrorMessage text={error} />}

        {/* Exercises */}
        {exercises.map((ex, idx) => {
          const exType = ex.library.exercise_type ?? 'strength'
          return (
            <div key={ex.tempId} className="bg-white border border-[var(--border)] rounded-[10px] px-[11px] py-[9px] mb-[5px]">
              {/* Header */}
              <div className="flex justify-between mb-[8px]">
                <span className="text-[var(--fs-xs)] font-bold text-[var(--slate-900)]">{idx + 1}. {ex.library.name_ru}</span>
                <button
                  onClick={() => removeExercise(ex.tempId)}
                  className="text-[var(--slate-300)] hover:text-[var(--red-500)] text-[var(--fs-md)] bg-transparent border-none p-0 leading-none"
                >
                  ✕
                </button>
              </div>

              {exType === 'cardio_time' ? (
                <>
                  <div className="grid grid-cols-3 gap-[4px] mb-[4px]">
                    <div>
                      <label className="block text-[0.5rem] font-bold text-[var(--slate-400)] uppercase tracking-[0.04em] mb-[3px]">Интервалы</label>
                      <input type="text" inputMode="numeric" value={isNaN(ex.sets) ? '' : ex.sets}
                        onChange={e => updateExercise(ex.tempId, { sets: parseInt(e.target.value) })}
                        onBlur={() => { if (!ex.sets || ex.sets < 1) updateExercise(ex.tempId, { sets: 1 }) }}
                        onFocus={e => e.target.select()} className={numInput} />
                    </div>
                    <div>
                      <label className="block text-[0.5rem] font-bold text-[var(--slate-400)] uppercase tracking-[0.04em] mb-[3px]">Длит. (мин)</label>
                      <input type="text" inputMode="numeric" value={isNaN(ex.reps) ? '' : ex.reps}
                        onChange={e => updateExercise(ex.tempId, { reps: parseInt(e.target.value) })}
                        onBlur={() => { if (!ex.reps || ex.reps < 1) updateExercise(ex.tempId, { reps: 1 }) }}
                        onFocus={e => e.target.select()} className={numInput} />
                    </div>
                    <div>
                      <label className="block text-[0.5rem] font-bold text-[var(--slate-400)] uppercase tracking-[0.04em] mb-[3px]">Дистанция (км)</label>
                      <input type="text" inputMode="decimal" value={ex.weight_kg}
                        onChange={e => updateExercise(ex.tempId, { weight_kg: e.target.value })}
                        onFocus={e => e.target.select()} placeholder="0" className={numInput} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '4px' }}>
                    <div>
                      <label className="block text-[0.5rem] font-bold text-[var(--slate-400)] uppercase tracking-[0.04em] mb-[3px]">Отдых (сек)</label>
                      <input type="text" inputMode="numeric" value={ex.rest_sec ?? ''}
                        onChange={e => updateExercise(ex.tempId, { rest_sec: e.target.value ? parseInt(e.target.value) : null })}
                        onFocus={e => e.target.select()} placeholder="—" className={numInput} />
                    </div>
                    <div>
                      <label className="block text-[0.5rem] font-bold text-[var(--slate-400)] uppercase tracking-[0.04em] mb-[3px]">Комментарий</label>
                      <input type="text" value={ex.trainer_note}
                        onChange={e => updateExercise(ex.tempId, { trainer_note: e.target.value })}
                        placeholder="Необязательно" className={noteInput} />
                    </div>
                  </div>
                  <div className="mt-[4px]">
                    <label className="block text-[0.5rem] font-bold text-[var(--slate-400)] uppercase tracking-[0.04em] mb-[3px]">Целевой пульс (уд/мин)</label>
                    <input type="text" inputMode="numeric"
                      value={ex.target_heart_rate_bpm ?? ''}
                      onChange={e => updateExercise(ex.tempId, { target_heart_rate_bpm: e.target.value ? parseInt(e.target.value) : null })}
                      onFocus={e => e.target.select()} placeholder="Не задан"
                      className={numInput} />
                  </div>
                </>
              ) : exType === 'cardio_reps' ? (
                <>
                  <div className="grid grid-cols-3 gap-[4px] mb-[4px]">
                    <div>
                      <label className="block text-[0.5rem] font-bold text-[var(--slate-400)] uppercase tracking-[0.04em] mb-[3px]">Подходы</label>
                      <input type="text" inputMode="numeric" value={isNaN(ex.sets) ? '' : ex.sets}
                        onChange={e => updateExercise(ex.tempId, { sets: parseInt(e.target.value) })}
                        onBlur={() => { if (!ex.sets || ex.sets < 1) updateExercise(ex.tempId, { sets: 1 }) }}
                        onFocus={e => e.target.select()} className={numInput} />
                    </div>
                    <div>
                      <label className="block text-[0.5rem] font-bold text-[var(--slate-400)] uppercase tracking-[0.04em] mb-[3px]">Повторения</label>
                      <input type="text" inputMode="numeric" value={isNaN(ex.reps) ? '' : ex.reps}
                        onChange={e => updateExercise(ex.tempId, { reps: parseInt(e.target.value) })}
                        onBlur={() => { if (!ex.reps || ex.reps < 1) updateExercise(ex.tempId, { reps: 1 }) }}
                        onFocus={e => e.target.select()} className={numInput} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '4px' }}>
                    <div>
                      <label className="block text-[0.5rem] font-bold text-[var(--slate-400)] uppercase tracking-[0.04em] mb-[3px]">Отдых (сек)</label>
                      <input type="text" inputMode="numeric" value={ex.rest_sec ?? ''}
                        onChange={e => updateExercise(ex.tempId, { rest_sec: e.target.value ? parseInt(e.target.value) : null })}
                        onFocus={e => e.target.select()} placeholder="—" className={numInput} />
                    </div>
                    <div>
                      <label className="block text-[0.5rem] font-bold text-[var(--slate-400)] uppercase tracking-[0.04em] mb-[3px]">Комментарий</label>
                      <input type="text" value={ex.trainer_note}
                        onChange={e => updateExercise(ex.tempId, { trainer_note: e.target.value })}
                        placeholder="Необязательно" className={noteInput} />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-[4px] mb-[4px]">
                    <div>
                      <label className="block text-[0.5rem] font-bold text-[var(--slate-400)] uppercase tracking-[0.04em] mb-[3px]">Подходы</label>
                      <input type="text" inputMode="numeric" value={isNaN(ex.sets) ? '' : ex.sets}
                        onChange={e => updateExercise(ex.tempId, { sets: parseInt(e.target.value) })}
                        onBlur={() => { if (!ex.sets || ex.sets < 1) updateExercise(ex.tempId, { sets: 1 }) }}
                        onFocus={e => e.target.select()} className={numInput} />
                    </div>
                    <div>
                      <label className="block text-[0.5rem] font-bold text-[var(--slate-400)] uppercase tracking-[0.04em] mb-[3px]">Повторы</label>
                      <input type="text" inputMode="numeric" value={isNaN(ex.reps) ? '' : ex.reps}
                        onChange={e => updateExercise(ex.tempId, { reps: parseInt(e.target.value) })}
                        onBlur={() => { if (!ex.reps || ex.reps < 1) updateExercise(ex.tempId, { reps: 1 }) }}
                        onFocus={e => e.target.select()} className={numInput} />
                    </div>
                    <div>
                      <label className="block text-[0.5rem] font-bold text-[var(--slate-400)] uppercase tracking-[0.04em] mb-[3px]">Вес, кг</label>
                      <input type="text" inputMode="decimal" value={ex.weight_kg}
                        onChange={e => updateExercise(ex.tempId, { weight_kg: e.target.value })}
                        onFocus={e => e.target.select()} className={numInput} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '4px' }}>
                    <div>
                      <label className="block text-[0.5rem] font-bold text-[var(--slate-400)] uppercase tracking-[0.04em] mb-[3px]">Отдых</label>
                      <input type="text" inputMode="numeric" value={ex.rest_sec ?? ''}
                        onChange={e => updateExercise(ex.tempId, { rest_sec: e.target.value ? parseInt(e.target.value) : null })}
                        onFocus={e => e.target.select()} placeholder="—" className={numInput} />
                    </div>
                    <div>
                      <label className="block text-[0.5rem] font-bold text-[var(--slate-400)] uppercase tracking-[0.04em] mb-[3px]">Комментарий</label>
                      <input type="text" value={ex.trainer_note}
                        onChange={e => updateExercise(ex.tempId, { trainer_note: e.target.value })}
                        placeholder="Необязательно" className={noteInput} />
                    </div>
                  </div>
                </>
              )}
            </div>
          )
        })}

        <button
          onClick={() => setShowLibraryModal(true)}
          className="border-[1.5px] border-dashed border-[var(--indigo-200)] bg-white rounded-[8px] py-[8px] text-[var(--fs-2xs)] font-bold text-[var(--indigo-500)] w-full flex items-center justify-center gap-1 mt-[6px] mb-[8px]"
        >
          <Plus className="w-3.5 h-3.5" /> Добавить упражнение
        </button>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-[var(--indigo-500)] hover:bg-[var(--indigo-700)] disabled:opacity-50 text-white text-[var(--fs-xs)] font-bold rounded-[9px] py-[10px]"
        >
          {saving ? 'Сохранение...' : (isEdit ? 'Сохранить изменения' : 'Создать тренировку')}
        </button>
      </div>

      {showLibraryModal && (
        <Modal onClose={() => { setShowLibraryModal(false); setSelectedLibraryIds(new Set()) }}>
          <p className="text-[var(--fs-md)] font-bold text-[var(--slate-900)] mb-[4px]">Выберите упражнения</p>
          <p className="text-[var(--fs-3xs)] text-[var(--slate-500)] mb-[12px]">Выбрано: {selectedLibraryIds.size}</p>
          <input
            value={librarySearch}
            onChange={e => setLibrarySearch(e.target.value)}
            placeholder="🔍 Поиск..."
            className="w-full border border-[var(--slate-200)] rounded-[8px] px-[9px] py-[7px] text-[var(--fs-xs)] bg-[var(--slate-50)] outline-none focus:border-[var(--indigo-300)] mb-[9px]"
          />
          <div className="flex gap-[4px] flex-wrap mb-[9px]">
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setLibraryCategory(cat)}
                className={`text-[var(--fs-3xs)] font-semibold px-[8px] py-[3px] rounded-[20px] transition-colors ${
                  libraryCategory === cat
                    ? 'bg-[var(--indigo-500)] text-white'
                    : 'bg-[var(--slate-100)] text-[var(--slate-500)]'
                }`}>
                {cat}
              </button>
            ))}
          </div>
          <div className="max-h-[45vh] overflow-y-auto overscroll-contain mb-[9px]">
            {filteredLibrary.map(lib => {
              const selected = selectedLibraryIds.has(lib.id)
              return (
                <button key={lib.id} onClick={() => toggleLibrarySelect(lib.id)}
                  className={`w-full text-left px-[9px] py-[7px] flex items-center gap-[8px] border-b border-[var(--slate-100)] transition-colors ${selected ? 'bg-[var(--indigo-50)]' : 'hover:bg-[var(--slate-50)]'}`}>
                  <div className={`w-[15px] h-[15px] rounded-[3px] border shrink-0 flex items-center justify-center transition-colors ${selected ? 'bg-[var(--indigo-500)] border-[var(--indigo-500)]' : 'border-[var(--slate-300)] bg-white'}`}>
                    {selected && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  <div>
                    <div className="text-[var(--fs-2xs)] font-semibold text-[var(--slate-900)]">{lib.name_ru}</div>
                    <div className="text-[var(--fs-3xs)] text-[var(--slate-400)]">{lib.category}</div>
                  </div>
                </button>
              )
            })}
            {filteredLibrary.length === 0 && <p className="text-[var(--fs-xs)] text-[var(--slate-400)] text-center py-4">Ничего не найдено</p>}
          </div>
          <button
            onClick={addSelectedExercises}
            disabled={selectedLibraryIds.size === 0}
            className="w-full bg-[var(--indigo-500)] hover:bg-[var(--indigo-700)] disabled:opacity-40 text-white text-[var(--fs-2xs)] font-bold py-[9px] rounded-[8px] transition-colors"
          >
            {selectedLibraryIds.size === 0 ? 'Выберите упражнения' : `Добавить (${selectedLibraryIds.size})`}
          </button>
        </Modal>
      )}
    </Layout>
  )
}
