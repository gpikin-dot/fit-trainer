import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Layout from '../components/Layout'
import { Modal, ErrorMessage } from '../components/UI'
import { canAddExercise } from '../lib/planLimits'
import { clampSets, clampReps, clampWeight, clampRest } from '../lib/numeric'
import { defaultMode, modeOf } from '../lib/workoutMode'
import type { ExerciseLibrary, Exercise, WorkoutMode } from '../types/database'

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
  mode: WorkoutMode
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
  const [customName, setCustomName] = useState('')
  const [customSaving, setCustomSaving] = useState(false)
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
          mode: modeOf(e.mode, e.exercise_library),
          order: e.order,
        })))
      })
    }
  }, [profile, id, isEdit])

  function toggleLibrarySelect(id: string) {
    setSelectedLibraryIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
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
        const m = defaultMode(lib)
        return {
          tempId: `tmp-${Date.now()}-${i}`,
          library_exercise_id: lib.id,
          library: lib,
          sets: 3,
          reps: m === 'time' ? 30 : 10,
          weight_kg: '0',
          rest_sec: null,
          trainer_note: '',
          target_heart_rate_bpm: null,
          mode: m,
          order: prev.length + i,
        }
      }),
    ])
    setSelectedLibraryIds(new Set())
    setShowLibraryModal(false)
    setError('')
  }

  async function createCustomExercise() {
    const trimmed = customName.trim()
    if (!trimmed || !profile) return
    setCustomSaving(true)
    setError('')

    const { data: lib, error: insErr } = await supabase
      .from('exercises_library')
      .insert({
        external_id: `custom-${crypto.randomUUID()}`,
        name_ru: trimmed,
        name_en: trimmed,
        category: 'Своё',
        equipment: null,
        image_urls: [],
        source: 'custom',
        exercise_type: 'strength',
        trainer_id: profile.id,
      })
      .select()
      .single()

    if (insErr || !lib) {
      setError(insErr?.message ?? 'Не удалось создать упражнение')
      setCustomSaving(false)
      return
    }

    const newLib = lib as ExerciseLibrary
    setLibrary(prev => [...prev, newLib])
    setExercises(prev => [
      ...prev,
      {
        tempId: `tmp-${Date.now()}`,
        library_exercise_id: newLib.id,
        library: newLib,
        sets: 3,
        reps: 10,
        weight_kg: '0',
        rest_sec: null,
        trainer_note: '',
        target_heart_rate_bpm: null,
        mode: defaultMode(newLib),
        order: prev.length,
      },
    ])
    setCustomName('')
    setCustomSaving(false)
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
    if (exercises.length === 0) { setError('Добавьте хотя бы одно упражнение'); return }
    if (!profile) return
    setError('')
    setSaving(true)

    const restClamped = clampRest(parseInt(defaultRest) || 90) ?? 90

    if (isEdit) {
      await supabase.from('workouts').update({ name: name.trim(), default_rest_sec: restClamped }).eq('id', id)
      await supabase.from('exercises').delete().eq('workout_id', id)
    }

    const workoutId = isEdit ? id! : (await supabase.from('workouts').insert({
      trainer_id: profile.id,
      name: name.trim(),
      default_rest_sec: restClamped,
    }).select().single()).data?.id

    if (!workoutId) { setError('Ошибка сохранения'); setSaving(false); return }

    if (exercises.length > 0) {
      await supabase.from('exercises').insert(exercises.map(e => ({
        workout_id: workoutId,
        library_exercise_id: e.library_exercise_id,
        sets: clampSets(e.sets),
        reps: clampReps(e.reps),
        weight_kg: clampWeight(parseFloat(e.weight_kg.replace(',', '.')) || 0),
        rest_sec: clampRest(e.rest_sec),
        trainer_note: e.trainer_note || null,
        target_heart_rate_bpm: e.target_heart_rate_bpm ?? null,
        mode: e.mode,
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

  const numInput = 'bg-white border border-[var(--slate-200)] rounded-[6px] px-[4px] py-[6px] text-[15px] font-semibold text-[var(--slate-900)] text-center w-full outline-none focus:border-[var(--blue-500)]'
  const noteInput = 'bg-white border border-[var(--slate-200)] rounded-[6px] px-[7px] py-[6px] text-[14px] text-[var(--slate-600)] w-full outline-none focus:border-[var(--blue-500)] text-left'

  return (
    <Layout>
      <div className="pt-[11px] pb-[14px]">
        <button
          onClick={() => navigate(-1)}
          className="text-[14px] font-semibold text-[var(--blue-600)] flex items-center gap-1 mb-[10px]"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Назад
        </button>

        {/* Form fields */}
        <div className="mb-[10px]">
          <label className="block text-[11px] font-semibold text-[var(--slate-500)] uppercase tracking-[0.05em] mb-[6px]">
            Название
          </label>
          <input
            type="text"
            value={name}
            onChange={e => { setName(e.target.value); setError('') }}
            placeholder="Например: Ноги. День 1"
            className="w-full border border-[var(--slate-200)] rounded-[7px] px-[12px] py-[10px] text-[15px] text-[var(--slate-900)] bg-white outline-none focus:border-[var(--blue-500)]"
          />
        </div>

        <div className="mb-[13px]">
          <label className="block text-[11px] font-semibold text-[var(--slate-500)] uppercase tracking-[0.05em] mb-[6px]">
            Отдых между подходами (сек)
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={defaultRest}
            onChange={e => setDefaultRest(e.target.value)}
            onBlur={() => { if (!defaultRest || parseInt(defaultRest) < 1) setDefaultRest('90') }}
            onFocus={e => e.target.select()}
            className="w-full border border-[var(--slate-200)] rounded-[7px] px-[12px] py-[10px] text-[15px] text-[var(--slate-900)] bg-white outline-none focus:border-[var(--blue-500)]"
          />
        </div>

        {/* Exercises */}
        {exercises.map((ex, idx) => {
          const labelCls = 'block text-[11px] font-semibold text-[var(--slate-400)] uppercase tracking-[0.05em] mb-[3px]'
          return (
            <div key={ex.tempId} className="bg-white border border-[var(--border)] rounded-[10px] px-[11px] py-[9px] mb-[5px]">
              {/* Header */}
              <div className="flex justify-between mb-[8px]">
                <span className="text-[15px] font-bold text-[var(--slate-900)]">{idx + 1}. {ex.library.name_ru}</span>
                <button
                  onClick={() => removeExercise(ex.tempId)}
                  className="text-[var(--slate-300)] hover:text-[var(--red-500)] text-[17px] bg-transparent border-none p-0 leading-none"
                >
                  ✕
                </button>
              </div>

              {/* Mode selector */}
              <div className="flex gap-[4px] mb-[8px]">
                {([
                  { m: 'weight', label: 'Вес' },
                  { m: 'reps', label: 'Повторы' },
                  { m: 'time', label: 'На время' },
                ] as const).map(({ m, label }) => (
                  <button
                    key={m}
                    onClick={() => updateExercise(ex.tempId, {
                      mode: m,
                      reps: m === 'time' && ex.mode !== 'time' ? 30
                          : m !== 'time' && ex.mode === 'time' ? 10
                          : ex.reps,
                    })}
                    className={`flex-1 text-[12px] font-semibold py-[6px] rounded-[7px] border ${
                      ex.mode === m
                        ? 'bg-[var(--blue-600)] text-white border-[var(--blue-600)]'
                        : 'bg-white text-[var(--slate-500)] border-[var(--slate-200)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {ex.mode === 'time' ? (
                <div className="grid grid-cols-2 gap-[4px] mb-[4px]">
                  <div>
                    <label className={labelCls}>Подходы</label>
                    <input type="text" inputMode="numeric" value={isNaN(ex.sets) ? '' : ex.sets}
                      onChange={e => updateExercise(ex.tempId, { sets: parseInt(e.target.value) })}
                      onBlur={() => { if (!ex.sets || ex.sets < 1) updateExercise(ex.tempId, { sets: 1 }) }}
                      onFocus={e => e.target.select()} className={numInput} />
                  </div>
                  <div>
                    <label className={labelCls}>Секунды</label>
                    <input type="text" inputMode="numeric" value={isNaN(ex.reps) ? '' : ex.reps}
                      onChange={e => updateExercise(ex.tempId, { reps: parseInt(e.target.value) })}
                      onBlur={() => { if (!ex.reps || ex.reps < 1) updateExercise(ex.tempId, { reps: 30 }) }}
                      onFocus={e => e.target.select()} className={numInput} />
                  </div>
                </div>
              ) : ex.mode === 'reps' ? (
                <div className="grid grid-cols-2 gap-[4px] mb-[4px]">
                  <div>
                    <label className={labelCls}>Подходы</label>
                    <input type="text" inputMode="numeric" value={isNaN(ex.sets) ? '' : ex.sets}
                      onChange={e => updateExercise(ex.tempId, { sets: parseInt(e.target.value) })}
                      onBlur={() => { if (!ex.sets || ex.sets < 1) updateExercise(ex.tempId, { sets: 1 }) }}
                      onFocus={e => e.target.select()} className={numInput} />
                  </div>
                  <div>
                    <label className={labelCls}>Повторы</label>
                    <input type="text" inputMode="numeric" value={isNaN(ex.reps) ? '' : ex.reps}
                      onChange={e => updateExercise(ex.tempId, { reps: parseInt(e.target.value) })}
                      onBlur={() => { if (!ex.reps || ex.reps < 1) updateExercise(ex.tempId, { reps: 1 }) }}
                      onFocus={e => e.target.select()} className={numInput} />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-[4px] mb-[4px]">
                  <div>
                    <label className={labelCls}>Подходы</label>
                    <input type="text" inputMode="numeric" value={isNaN(ex.sets) ? '' : ex.sets}
                      onChange={e => updateExercise(ex.tempId, { sets: parseInt(e.target.value) })}
                      onBlur={() => { if (!ex.sets || ex.sets < 1) updateExercise(ex.tempId, { sets: 1 }) }}
                      onFocus={e => e.target.select()} className={numInput} />
                  </div>
                  <div>
                    <label className={labelCls}>Повторы</label>
                    <input type="text" inputMode="numeric" value={isNaN(ex.reps) ? '' : ex.reps}
                      onChange={e => updateExercise(ex.tempId, { reps: parseInt(e.target.value) })}
                      onBlur={() => { if (!ex.reps || ex.reps < 1) updateExercise(ex.tempId, { reps: 1 }) }}
                      onFocus={e => e.target.select()} className={numInput} />
                  </div>
                  <div>
                    <label className={labelCls}>Вес, кг</label>
                    <input type="text" inputMode="decimal" value={ex.weight_kg}
                      onChange={e => updateExercise(ex.tempId, { weight_kg: e.target.value })}
                      onFocus={e => e.target.select()} className={numInput} />
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '4px' }}>
                <div>
                  <label className={labelCls}>Отдых (сек)</label>
                  <input type="text" inputMode="numeric" value={ex.rest_sec ?? ''}
                    onChange={e => updateExercise(ex.tempId, { rest_sec: e.target.value ? parseInt(e.target.value) : null })}
                    onFocus={e => e.target.select()} placeholder="—" className={numInput} />
                </div>
                <div>
                  <label className={labelCls}>Комментарий</label>
                  <input type="text" value={ex.trainer_note}
                    onChange={e => updateExercise(ex.tempId, { trainer_note: e.target.value })}
                    placeholder="Необязательно" className={noteInput} />
                </div>
              </div>
            </div>
          )
        })}

        <button
          onClick={() => { setError(''); setShowLibraryModal(true) }}
          className="border-[1.5px] border-dashed border-[var(--blue-400)] bg-white rounded-[8px] py-[10px] text-[15px] font-semibold text-[var(--blue-600)] w-full flex items-center justify-center gap-1 mt-[6px] mb-[10px]"
        >
          <Plus className="w-3.5 h-3.5" /> Добавить упражнение
        </button>

        {!showLibraryModal && error && <ErrorMessage text={error} />}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-[var(--blue-600)] hover:bg-[var(--blue-700)] disabled:opacity-50 text-white text-[15px] font-semibold rounded-[10px] py-[13px]"
        >
          {saving ? 'Сохранение...' : (isEdit ? 'Сохранить изменения' : 'Создать тренировку')}
        </button>
      </div>

      {showLibraryModal && (
        <Modal onClose={() => { setShowLibraryModal(false); setSelectedLibraryIds(new Set()) }}>
          <p className="text-[16px] font-bold text-[var(--slate-900)] mb-[4px]">Выберите упражнения</p>
          <p className="text-[13px] text-[var(--slate-500)] mb-[10px]">Выбрано: {selectedLibraryIds.size}</p>

          <div className="flex gap-[6px] mb-[10px]">
            <input
              value={customName}
              onChange={e => { setCustomName(e.target.value); setError('') }}
              onKeyDown={e => { if (e.key === 'Enter') createCustomExercise() }}
              placeholder="Своё упражнение — введите название"
              className="flex-1 border border-[var(--slate-200)] rounded-[8px] px-[9px] py-[7px] text-[15px] bg-white outline-none focus:border-[var(--blue-500)]"
            />
            <button
              onClick={createCustomExercise}
              disabled={!customName.trim() || customSaving}
              className="shrink-0 bg-[var(--blue-600)] hover:bg-[var(--blue-700)] disabled:opacity-40 text-white text-[14px] font-semibold px-[12px] rounded-[8px]"
            >
              {customSaving ? '...' : 'Создать'}
            </button>
          </div>
          {error && <ErrorMessage text={error} />}

          <input
            value={librarySearch}
            onChange={e => setLibrarySearch(e.target.value)}
            placeholder="🔍 Поиск..."
            className="w-full border border-[var(--slate-200)] rounded-[8px] px-[9px] py-[7px] text-[15px] bg-white outline-none focus:border-[var(--blue-500)] mb-[9px]"
          />
          <div className="flex gap-[4px] flex-wrap mb-[9px]">
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setLibraryCategory(cat)}
                className={`text-[13px] font-semibold px-[8px] py-[3px] rounded-[20px] transition-colors ${
                  libraryCategory === cat
                    ? 'bg-[var(--blue-600)] text-white'
                    : 'bg-[var(--slate-100)] text-[var(--slate-500)]'
                }`}>
                {cat}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain mb-[9px]">
            {filteredLibrary.map(lib => {
              const selected = selectedLibraryIds.has(lib.id)
              return (
                <button key={lib.id} onClick={() => toggleLibrarySelect(lib.id)}
                  className={`w-full text-left px-[9px] py-[7px] flex items-center gap-[8px] border-b border-[var(--slate-100)] transition-colors ${selected ? 'bg-[var(--blue-50)]' : 'hover:bg-[var(--slate-50)]'}`}>
                  <div className={`w-[15px] h-[15px] rounded-[3px] border shrink-0 flex items-center justify-center transition-colors ${selected ? 'bg-[var(--blue-600)] border-[var(--blue-600)]' : 'border-[var(--slate-300)] bg-white'}`}>
                    {selected && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  <div>
                    <div className="text-[15px] font-semibold text-[var(--slate-900)]">{lib.name_ru}</div>
                    <div className="text-[13px] text-[var(--slate-400)]">{lib.category}</div>
                  </div>
                </button>
              )
            })}
            {filteredLibrary.length === 0 && <p className="text-[14px] text-[var(--slate-400)] text-center py-4">Ничего не найдено</p>}
          </div>
          <button
            onClick={addSelectedExercises}
            disabled={selectedLibraryIds.size === 0}
            className="shrink-0 w-full bg-[var(--blue-600)] hover:bg-[var(--blue-700)] disabled:opacity-40 text-white text-[15px] font-semibold py-[10px] rounded-[8px] transition-colors"
          >
            {selectedLibraryIds.size === 0 ? 'Выберите упражнения' : `Добавить (${selectedLibraryIds.size})`}
          </button>
        </Modal>
      )}
    </Layout>
  )
}
