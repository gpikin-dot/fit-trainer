import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Layout from '../components/Layout'
import { Modal, ErrorMessage } from '../components/UI'
import type { ExerciseLibrary, SessionExercise } from '../types/database'

const CATEGORIES = ['Все', 'Ноги', 'Грудь', 'Спина', 'Плечи', 'Руки', 'Кор', 'Кардио']

function localDate(offsetDays: number) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface Row {
  tempId: string
  library_exercise_id: string
  library: ExerciseLibrary
  sets: number
  reps: number
  weight_kg: string
  rest_sec: number | null
  trainer_note: string
  order: number
}

type DateChoice = 'today' | 'tomorrow' | 'pick' | 'none'

export default function AssignmentEditPage() {
  const navigate = useNavigate()
  const { assignedId } = useParams<{ assignedId: string }>()

  const [clientId, setClientId] = useState<string | null>(null)
  const [clientName, setClientName] = useState('')
  const [workoutName, setWorkoutName] = useState('')
  const [status, setStatus] = useState<string>('pending')
  const [dateChoice, setDateChoice] = useState<DateChoice>('none')
  const [pickedDate, setPickedDate] = useState('')

  const [rows, setRows] = useState<Row[]>([])
  const [library, setLibrary] = useState<ExerciseLibrary[]>([])
  const [showLib, setShowLib] = useState(false)
  const [libSearch, setLibSearch] = useState('')
  const [libCat, setLibCat] = useState('Все')
  const [libSel, setLibSel] = useState<Set<string>>(new Set())

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmCancel, setConfirmCancel] = useState(false)

  useEffect(() => {
    if (!assignedId) return
    ;(async () => {
      supabase.from('exercises_library').select('*').order('category').then(({ data }) => setLibrary(data ?? []))

      const { data: aw } = await supabase
        .from('assigned_workouts')
        .select('*, workout:workouts(name)')
        .eq('id', assignedId)
        .single()
      if (!aw) { setError('Назначение не найдено'); setLoading(false); return }

      setClientId(aw.client_id)
      setWorkoutName((aw.workout as { name: string } | null)?.name ?? '—')
      setStatus(aw.status)

      const today = localDate(0)
      const tomorrow = localDate(1)
      if (!aw.planned_date) setDateChoice('none')
      else if (aw.planned_date === today) setDateChoice('today')
      else if (aw.planned_date === tomorrow) setDateChoice('tomorrow')
      else { setDateChoice('pick'); setPickedDate(aw.planned_date) }

      const { data: prof } = await supabase.from('profiles').select('name').eq('id', aw.client_id).single()
      setClientName(prof?.name ?? '')

      const { data: ses } = await supabase
        .from('session_exercises')
        .select('*, exercise_library:exercises_library(*)')
        .eq('assigned_workout_id', assignedId)
        .order('order')

      setRows((ses ?? []).map((s: SessionExercise & { exercise_library: ExerciseLibrary }) => ({
        tempId: s.id,
        library_exercise_id: s.library_exercise_id,
        library: s.exercise_library,
        sets: s.sets,
        reps: s.reps,
        weight_kg: String(s.weight_kg),
        rest_sec: s.rest_sec,
        trainer_note: s.trainer_note ?? '',
        order: s.order,
      })))
      setLoading(false)
    })()
  }, [assignedId])

  function patch(tempId: string, p: Partial<Row>) {
    setRows(prev => prev.map(r => r.tempId === tempId ? { ...r, ...p } : r))
  }
  function removeRow(tempId: string) {
    setRows(prev => prev.filter(r => r.tempId !== tempId).map((r, i) => ({ ...r, order: i })))
  }
  function toggleLib(id: string) {
    setLibSel(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }
  function addSelected() {
    const toAdd = library.filter(l => libSel.has(l.id))
    setRows(prev => [
      ...prev,
      ...toAdd.map((lib, i) => ({
        tempId: `tmp-${Date.now()}-${i}`,
        library_exercise_id: lib.id,
        library: lib,
        sets: 3, reps: 10, weight_kg: '0',
        rest_sec: null, trainer_note: '',
        order: prev.length + i,
      })),
    ])
    setLibSel(new Set())
    setShowLib(false)
  }

  async function handleSave() {
    if (!assignedId) return
    setError('')
    setSaving(true)

    const plannedDate =
      dateChoice === 'today' ? localDate(0)
      : dateChoice === 'tomorrow' ? localDate(1)
      : dateChoice === 'pick' ? (pickedDate || null)
      : null

    const { error: awErr } = await supabase
      .from('assigned_workouts')
      .update({ planned_date: plannedDate })
      .eq('id', assignedId)
    if (awErr) { setError(awErr.message); setSaving(false); return }

    // Replace session_exercises snapshot for THIS assignment only
    const { error: delErr } = await supabase
      .from('session_exercises').delete().eq('assigned_workout_id', assignedId)
    if (delErr) { setError(delErr.message); setSaving(false); return }

    if (rows.length > 0) {
      const { error: insErr } = await supabase.from('session_exercises').insert(
        rows.map((r, i) => ({
          assigned_workout_id: assignedId,
          library_exercise_id: r.library_exercise_id,
          order: i,
          sets: r.sets,
          reps: r.reps,
          weight_kg: parseFloat(r.weight_kg.replace(',', '.')) || 0,
          rest_sec: r.rest_sec,
          trainer_note: r.trainer_note || null,
        }))
      )
      if (insErr) { setError(insErr.message); setSaving(false); return }
    }

    navigate(clientId ? `/trainer/client/${clientId}` : '/trainer')
  }

  async function handleCancelAssignment() {
    if (!assignedId) return
    setSaving(true)
    const { error: err } = await supabase.from('assigned_workouts').delete().eq('id', assignedId)
    if (err) { setError(err.message); setSaving(false); setConfirmCancel(false); return }
    navigate(clientId ? `/trainer/client/${clientId}` : '/trainer')
  }

  const filteredLib = library.filter(l => {
    const mc = libCat === 'Все' || l.category === libCat
    const ms = !libSearch || l.name_ru.toLowerCase().includes(libSearch.toLowerCase())
    return mc && ms
  })

  const numInput = 'bg-white border border-[var(--slate-200)] rounded-[6px] px-[4px] py-[6px] text-[15px] font-semibold text-[var(--slate-900)] text-center w-full outline-none focus:border-[var(--blue-500)]'
  const noteInput = 'bg-white border border-[var(--slate-200)] rounded-[6px] px-[7px] py-[6px] text-[14px] text-[var(--slate-600)] w-full outline-none focus:border-[var(--blue-500)]'

  if (loading) return (
    <Layout><div className="text-center py-12 text-[var(--slate-400)] text-[15px]">Загрузка...</div></Layout>
  )

  return (
    <Layout>
      <div className="pt-[11px] pb-[24px]">
        <button
          onClick={() => navigate(clientId ? `/trainer/client/${clientId}` : '/trainer')}
          className="text-[15px] font-semibold text-[var(--blue-600)] mb-[10px]"
        >
          ← К клиенту
        </button>

        <h1 className="text-[20px] font-bold text-[var(--slate-900)]">{workoutName}</h1>
        <p className="text-[13px] text-[var(--slate-400)] mb-[14px]">
          Назначение для {clientName} · изменения не затронут шаблон
        </p>

        {status === 'completed' && (
          <div className="bg-[var(--amber-100)] text-[var(--amber-800)] text-[13px] rounded-[8px] px-[12px] py-[9px] mb-[12px]">
            Тренировка уже выполнена. Изменение перезапишет её состав.
          </div>
        )}

        {error && <ErrorMessage text={error} />}

        {/* Date */}
        <div className="text-[11px] font-semibold text-[var(--slate-400)] uppercase tracking-[0.05em] mb-[6px]">
          Дата
        </div>
        <div className="flex flex-col gap-[5px] mb-[16px]">
          {([
            { k: 'today', label: 'Сегодня' },
            { k: 'tomorrow', label: 'Завтра' },
            { k: 'pick', label: 'Выбрать дату' },
            { k: 'none', label: 'Без даты' },
          ] as const).map(({ k, label }) => (
            <button
              key={k}
              onClick={() => setDateChoice(k)}
              className={`flex items-center gap-[10px] rounded-[10px] px-[14px] py-[12px] border text-left ${
                dateChoice === k ? 'bg-[var(--blue-50)] border-[var(--blue-400)]' : 'bg-white border-[var(--border)]'
              }`}
            >
              <span className={`w-[18px] h-[18px] rounded-full border-2 shrink-0 flex items-center justify-center ${
                dateChoice === k ? 'border-[var(--blue-600)]' : 'border-[var(--slate-300)]'
              }`}>
                {dateChoice === k && <span className="w-[9px] h-[9px] rounded-full bg-[var(--blue-600)]" />}
              </span>
              <span className="text-[15px] font-semibold text-[var(--slate-900)]">{label}</span>
              {k === 'pick' && dateChoice === 'pick' && (
                <input
                  type="date"
                  value={pickedDate}
                  onChange={e => setPickedDate(e.target.value)}
                  onClick={e => e.stopPropagation()}
                  className="ml-auto text-[14px] border border-[var(--slate-200)] rounded-[6px] px-[8px] py-[4px]"
                />
              )}
            </button>
          ))}
        </div>

        {/* Exercises */}
        <div className="text-[11px] font-semibold text-[var(--slate-400)] uppercase tracking-[0.05em] mb-[6px]">
          Упражнения ({rows.length})
        </div>
        {rows.map((ex, idx) => (
          <div key={ex.tempId} className="bg-white border border-[var(--border)] rounded-[10px] px-[11px] py-[9px] mb-[5px]">
            <div className="flex justify-between mb-[8px]">
              <span className="text-[15px] font-bold text-[var(--slate-900)]">{idx + 1}. {ex.library.name_ru}</span>
              <button
                onClick={() => removeRow(ex.tempId)}
                className="text-[var(--slate-300)] hover:text-[var(--red-500)] text-[17px] leading-none"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-3 gap-[4px] mb-[4px]">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--slate-400)] uppercase tracking-[0.04em] mb-[3px]">Подходы</label>
                <input type="text" inputMode="numeric" value={isNaN(ex.sets) ? '' : ex.sets}
                  onChange={e => patch(ex.tempId, { sets: parseInt(e.target.value) })}
                  onBlur={() => { if (!ex.sets || ex.sets < 1) patch(ex.tempId, { sets: 1 }) }}
                  onFocus={e => e.target.select()} className={numInput} />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--slate-400)] uppercase tracking-[0.04em] mb-[3px]">Повторы</label>
                <input type="text" inputMode="numeric" value={isNaN(ex.reps) ? '' : ex.reps}
                  onChange={e => patch(ex.tempId, { reps: parseInt(e.target.value) })}
                  onBlur={() => { if (!ex.reps || ex.reps < 1) patch(ex.tempId, { reps: 1 }) }}
                  onFocus={e => e.target.select()} className={numInput} />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--slate-400)] uppercase tracking-[0.04em] mb-[3px]">Вес, кг</label>
                <input type="text" inputMode="decimal" value={ex.weight_kg}
                  onChange={e => patch(ex.tempId, { weight_kg: e.target.value })}
                  onFocus={e => e.target.select()} className={numInput} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '4px' }}>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--slate-400)] uppercase tracking-[0.04em] mb-[3px]">Отдых</label>
                <input type="text" inputMode="numeric" value={ex.rest_sec ?? ''}
                  onChange={e => patch(ex.tempId, { rest_sec: e.target.value ? parseInt(e.target.value) : null })}
                  onFocus={e => e.target.select()} placeholder="—" className={numInput} />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--slate-400)] uppercase tracking-[0.04em] mb-[3px]">Комментарий</label>
                <input type="text" value={ex.trainer_note}
                  onChange={e => patch(ex.tempId, { trainer_note: e.target.value })}
                  placeholder="Необязательно" className={noteInput} />
              </div>
            </div>
          </div>
        ))}

        <button
          onClick={() => setShowLib(true)}
          className="border-[1.5px] border-dashed border-[var(--blue-400)] bg-white rounded-[8px] py-[10px] text-[15px] font-semibold text-[var(--blue-600)] w-full mt-[6px] mb-[14px]"
        >
          + Добавить упражнение
        </button>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-[var(--blue-600)] hover:bg-[var(--blue-700)] disabled:opacity-50 text-white text-[15px] font-semibold rounded-[10px] py-[13px] mb-[8px]"
        >
          {saving ? 'Сохранение...' : 'Сохранить изменения'}
        </button>

        <button
          onClick={() => setConfirmCancel(true)}
          disabled={saving}
          className="w-full bg-white border-[1.5px] border-[var(--red-200)] text-[var(--red-500)] text-[15px] font-semibold rounded-[10px] py-[12px]"
        >
          Отменить тренировку
        </button>
      </div>

      {showLib && (
        <Modal onClose={() => { setShowLib(false); setLibSel(new Set()) }}>
          <p className="text-[16px] font-bold text-[var(--slate-900)] mb-[4px]">Выберите упражнения</p>
          <p className="text-[13px] text-[var(--slate-500)] mb-[10px]">Выбрано: {libSel.size}</p>
          <input
            value={libSearch}
            onChange={e => setLibSearch(e.target.value)}
            placeholder="🔍 Поиск..."
            className="w-full border border-[var(--slate-200)] rounded-[8px] px-[9px] py-[7px] text-[15px] bg-white outline-none focus:border-[var(--blue-500)] mb-[8px]"
          />
          <div className="flex gap-[4px] flex-wrap mb-[8px]">
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setLibCat(cat)}
                className={`text-[13px] font-semibold px-[8px] py-[3px] rounded-[20px] ${
                  libCat === cat ? 'bg-[var(--blue-600)] text-white' : 'bg-[var(--slate-100)] text-[var(--slate-500)]'
                }`}>
                {cat}
              </button>
            ))}
          </div>
          <div className="max-h-[45vh] overflow-y-auto overscroll-contain mb-[8px]">
            {filteredLib.map(lib => {
              const sel = libSel.has(lib.id)
              return (
                <button key={lib.id} onClick={() => toggleLib(lib.id)}
                  className={`w-full text-left px-[9px] py-[7px] flex items-center gap-[8px] border-b border-[var(--slate-100)] ${sel ? 'bg-[var(--blue-50)]' : ''}`}>
                  <div className={`w-[15px] h-[15px] rounded-[3px] border shrink-0 flex items-center justify-center ${sel ? 'bg-[var(--blue-600)] border-[var(--blue-600)]' : 'border-[var(--slate-300)] bg-white'}`}>
                    {sel && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  <div>
                    <div className="text-[15px] font-semibold text-[var(--slate-900)]">{lib.name_ru}</div>
                    <div className="text-[13px] text-[var(--slate-400)]">{lib.category}</div>
                  </div>
                </button>
              )
            })}
            {filteredLib.length === 0 && <p className="text-[14px] text-[var(--slate-400)] text-center py-4">Ничего не найдено</p>}
          </div>
          <button
            onClick={addSelected}
            disabled={libSel.size === 0}
            className="w-full bg-[var(--blue-600)] hover:bg-[var(--blue-700)] disabled:opacity-40 text-white text-[15px] font-semibold py-[10px] rounded-[8px]"
          >
            {libSel.size === 0 ? 'Выберите упражнения' : `Добавить (${libSel.size})`}
          </button>
        </Modal>
      )}

      {confirmCancel && (
        <Modal onClose={() => setConfirmCancel(false)}>
          <p className="text-[16px] font-bold text-[var(--slate-900)] mb-[6px]">Отменить тренировку?</p>
          <p className="text-[13px] text-[var(--slate-500)] leading-[1.5] mb-[14px]">
            Эта назначенная тренировка для {clientName} будет удалена вместе с её
            результатами. Шаблон и другие клиенты не затронуты.
          </p>
          <button
            onClick={handleCancelAssignment}
            disabled={saving}
            className="w-full bg-[var(--red-500)] disabled:opacity-50 text-white text-[15px] font-semibold rounded-[10px] py-[12px] mb-[8px]"
          >
            {saving ? 'Удаление...' : 'Да, отменить тренировку'}
          </button>
          <button
            onClick={() => setConfirmCancel(false)}
            className="w-full bg-white border border-[var(--slate-200)] text-[var(--slate-700)] text-[15px] font-semibold rounded-[10px] py-[12px]"
          >
            Назад
          </button>
        </Modal>
      )}
    </Layout>
  )
}
