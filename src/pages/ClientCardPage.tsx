import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Layout from '../components/Layout'
import { Modal } from '../components/UI'
import type { Profile, AssignedWorkout, Workout, Exercise, ExerciseLibrary, ExerciseResult, ActualSet } from '../types/database'
import { fmtExecution, fmtHistDate, maxWeight, type PastExecution } from '../lib/exerciseHistory'
import { plural } from '../lib/plural'

const DAYS_RU = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

function fmtDate(iso: string): string {
  const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00')
  return `${DAYS_RU[d.getDay()]}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}.`
}

type EnrichedAssignment = AssignedWorkout & {
  workout: Workout
  exercises: (Exercise & { exercise_library: ExerciseLibrary })[]
  results: ExerciseResult[]
}

interface ExerciseProgress {
  libId: string
  name: string
  entries: PastExecution[]
}

interface ProgressQueryRow {
  library_exercise_id: string | null
  actual_reps: number | null
  actual_weight_kg: number | null
  actual_sets: ActualSet[] | null
  exercise_library: { name_ru: string | null } | null
  assigned_workout: { id: string; completed_at: string | null } | null
}

export default function ClientCardPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [client, setClient] = useState<Profile | null>(null)
  const [assignments, setAssignments] = useState<EnrichedAssignment[]>([])
  // Вкладка переживает навигацию (открыл тренировку → назад)
  const [tab, setTabState] = useState<'active' | 'history' | 'progress'>(() => {
    const saved = sessionStorage.getItem('client_card_tab')
    return saved === 'history' || saved === 'progress' ? saved : 'active'
  })
  const setTab = (t: 'active' | 'history' | 'progress') => {
    setTabState(t)
    sessionStorage.setItem('client_card_tab', t)
  }
  const [progress, setProgress] = useState<ExerciseProgress[] | null>(null)
  const [cancelTarget, setCancelTarget] = useState<EnrichedAssignment | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    loadData(id)
  }, [id])

  useEffect(() => {
    if (tab !== 'progress' || progress !== null || !id) return
    loadProgress(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, id])

  // Все выполненные упражнения клиента, сгруппированные по упражнению
  // библиотеки, до 4 последних результатов на каждое
  async function loadProgress(clientId: string) {
    const { data } = await supabase
      .from('exercise_results')
      .select('library_exercise_id, actual_reps, actual_weight_kg, actual_sets, exercise_library:exercises_library(name_ru), assigned_workout:assigned_workouts!inner(id, completed_at)')
      .eq('completed', true)
      .eq('assigned_workout.client_id', clientId)
      .eq('assigned_workout.status', 'completed')

    const rows = ((data ?? []) as unknown as ProgressQueryRow[])
      .filter(r => r.library_exercise_id && r.assigned_workout?.completed_at)
      .sort((a, b) => b.assigned_workout!.completed_at!.localeCompare(a.assigned_workout!.completed_at!))

    const map = new Map<string, ExerciseProgress>()
    for (const r of rows) {
      const key = r.library_exercise_id!
      let g = map.get(key)
      if (!g) {
        g = { libId: key, name: r.exercise_library?.name_ru ?? '—', entries: [] }
        map.set(key, g)
      }
      if (g.entries.length >= 4) continue
      g.entries.push({
        date: r.assigned_workout!.completed_at!,
        sets: (r.actual_sets ?? []).filter(s => s.completed),
        reps: r.actual_reps,
        weight: r.actual_weight_kg,
      })
    }
    setProgress([...map.values()])
  }

  async function loadData(clientId: string) {
    const { data: clientData } = await supabase.from('profiles').select('*').eq('id', clientId).single()
    setClient(clientData)

    const { data: assignedData } = await supabase
      .from('assigned_workouts')
      .select('*, workout:workouts(*)')
      .eq('client_id', clientId)
      .order('assigned_at', { ascending: false })

    const enriched = await Promise.all((assignedData ?? []).map(async a => {
      const [{ data: exs }, { data: res }] = await Promise.all([
        supabase.from('exercises').select('*, exercise_library:exercises_library(*)').eq('workout_id', a.workout_id).order('order'),
        supabase.from('exercise_results').select('*').eq('assigned_workout_id', a.id),
      ])
      return {
        ...a,
        exercises: (exs ?? []) as (Exercise & { exercise_library: ExerciseLibrary })[],
        results: (res ?? []) as ExerciseResult[],
      }
    }))
    setAssignments(enriched)
    setLoading(false)
  }

  async function handleCancelAssignment() {
    if (!cancelTarget || !id) return
    setCancelling(true)
    const { error } = await supabase.from('assigned_workouts').delete().eq('id', cancelTarget.id)
    setCancelling(false)
    setCancelTarget(null)
    if (!error) loadData(id)
  }

  if (loading) return (
    <Layout>
      <div className="text-center py-12 text-[var(--slate-400)] text-[15px]">Загрузка...</div>
    </Layout>
  )
  if (!client) return (
    <Layout>
      <div className="text-center py-12 text-[var(--slate-400)] text-[15px]">Клиент не найден</div>
    </Layout>
  )

  const active = assignments.filter(a => a.status === 'pending')
  const history = assignments.filter(a => a.status === 'completed')
  const total = assignments.length
  const compliance = total > 0 ? Math.round(history.length / total * 100) : null

  const today = new Date().toISOString().split('T')[0]

  const tabs = [
    { key: 'active' as const, label: 'Активные' },
    { key: 'history' as const, label: 'История' },
    { key: 'progress' as const, label: 'Прогресс' },
  ]

  return (
    <Layout>
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-white -mx-[13px] px-[13px]">
        <div className="pt-[11px] pb-[10px]">
          <button
            onClick={() => navigate(-1)}
            className="text-[14px] font-semibold text-[var(--blue-600)] flex items-center gap-1 mb-[10px]"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Назад
          </button>

          <div className="flex items-center gap-[8px] mb-[10px]">
            <div className="w-[32px] h-[32px] rounded-full bg-[var(--indigo-50)] border-[1.5px] border-[var(--indigo-200)] flex items-center justify-center shrink-0 text-[17px] font-bold text-[var(--indigo-500)]">
              {client.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="text-[17px] font-bold text-[var(--slate-900)] truncate">{client.name}</div>
              <div className="text-[11px] text-[var(--slate-400)] mt-[1px]">
                {plural(total, 'тренировка', 'тренировки', 'тренировок')}{compliance !== null ? ` · посещаемость ${compliance}%` : ''}
              </div>
            </div>
          </div>

          <button
            onClick={() => navigate(`/trainer/assign?clientId=${client.id}`)}
            className="w-full border-[1.5px] border-dashed border-[var(--indigo-300)] bg-[var(--indigo-50)] rounded-[9px] py-[9px] text-[16px] font-bold text-[var(--indigo-500)] flex items-center justify-center gap-1 mb-[10px]"
          >
            <Plus className="w-3.5 h-3.5" /> Назначить тренировку
          </button>

          {/* Tabs */}
          <div className="flex" style={{ borderBottom: '1.5px solid var(--slate-100)' }}>
            {tabs.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 py-[8px] text-[16px] font-semibold text-center border-b-2 -mb-[1.5px] transition-colors ${
                  tab === key ? 'text-[var(--indigo-500)] border-[var(--indigo-500)]' : 'text-[var(--slate-400)] border-transparent'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-0 pt-[11px] pb-[14px]">
        {/* Active tab */}
        {tab === 'active' && (
          active.length === 0
            ? <div className="text-center text-[15px] text-[var(--slate-400)] leading-[1.6] py-[28px]">Нет активных тренировок</div>
            : active.map(a => {
                const done = a.results.filter(r => r.completed).length
                const totalEx = a.exercises.length
                const started = a.results.length > 0
                const isToday = a.planned_date === today
                const dateLabel = a.planned_date
                  ? (isToday ? 'Сегодня' : fmtDate(a.planned_date))
                  : started ? 'Без даты · в процессе' : 'Без даты'
                const pct = totalEx > 0 ? Math.round((done / totalEx) * 100) : 0

                return (
                  <div
                    key={a.id}
                    className="bg-white border border-[var(--border)] rounded-[10px] px-[11px] py-[9px] mb-[5px]"
                  >
                    <div className="flex items-center justify-between gap-[6px]">
                      <div className="flex-1 min-w-0">
                        <div className="text-[17px] font-semibold text-[var(--slate-900)]">{a.workout?.name ?? '—'}</div>
                        <div className="text-[15px] text-[var(--slate-400)] mt-[2px]">{dateLabel}</div>
                      </div>
                      <span className={`inline-flex items-center text-[13px] font-bold px-[9px] py-[4px] rounded-full shrink-0 ${
                        started ? 'bg-[var(--amber-100)] text-[var(--amber-800)]' : 'bg-[var(--slate-100)] text-[var(--slate-500)]'
                      }`}>
                        {done}/{totalEx}
                      </span>
                    </div>
                    <div className="mt-[7px] h-[3px] bg-[var(--slate-100)] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${pct > 0 ? 'bg-[var(--amber-300)]' : 'bg-[var(--slate-300)]'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <button
                      onClick={() => navigate(`/trainer/workout-session/${a.id}`)}
                      className="w-full mt-[8px] bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white text-[14px] font-semibold rounded-[8px] py-[8px]"
                    >
                      {started ? 'Продолжить совместную тренировку' : 'Начать совместную тренировку'}
                    </button>
                    <div className="flex gap-[6px] mt-[6px]">
                      <button
                        onClick={() => navigate(`/trainer/assignment/${a.id}/edit`)}
                        className="flex-1 bg-white border border-[var(--slate-200)] text-[var(--slate-700)] text-[13px] font-semibold rounded-[8px] py-[7px]"
                      >
                        Изменить
                      </button>
                      <button
                        onClick={() => setCancelTarget(a)}
                        className="flex-1 bg-white border border-[var(--red-200)] text-[var(--red-500)] text-[13px] font-semibold rounded-[8px] py-[7px]"
                      >
                        Отменить
                      </button>
                    </div>
                  </div>
                )
              })
        )}

        {/* History tab */}
        {tab === 'history' && (
          history.length === 0
            ? <div className="text-center text-[15px] text-[var(--slate-400)] leading-[1.6] py-[28px]">История пуста</div>
            : history.map(a => {
                const done = a.results.filter(r => r.completed).length
                const totalEx = a.exercises.length
                const pct = totalEx > 0 ? done / totalEx : 0
                const dateLabel = a.completed_at
                  ? fmtDate(a.completed_at)
                  : a.planned_date ? fmtDate(a.planned_date) : '—'

                return (
                  <div
                    key={a.id}
                    onClick={() => navigate(`/trainer/session/${a.id}`)}
                    className="bg-white border border-[var(--border)] rounded-[10px] px-[11px] py-[9px] mb-[5px] flex items-center gap-[6px] cursor-pointer"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[17px] font-semibold text-[var(--slate-900)]">{a.workout?.name ?? '—'}</div>
                      <div className="text-[15px] text-[var(--slate-400)] mt-[2px]">{dateLabel}</div>
                    </div>
                    <div className="flex gap-[5px] shrink-0 items-center">
                      <span className={`inline-flex items-center text-[13px] font-bold px-[9px] py-[4px] rounded-full ${
                        pct === 1 ? 'bg-[var(--green-100)] text-[var(--green-700)]'
                        : pct >= 0.6 ? 'bg-[var(--amber-100)] text-[var(--amber-800)]'
                        : 'bg-[var(--red-100)] text-[var(--red-800)]'
                      }`}>
                        {done}/{totalEx}
                      </span>
                      <span className="text-[var(--slate-300)] text-[15px]">›</span>
                    </div>
                  </div>
                )
              })
        )}

        {/* Progress tab */}
        {tab === 'progress' && (
          progress === null
            ? <div className="text-center text-[15px] text-[var(--slate-400)] py-[28px]">Загрузка...</div>
            : progress.length === 0
              ? <div className="text-center text-[15px] text-[var(--slate-400)] leading-[1.6] py-[28px]">
                  Пока нет данных.<br />Прогресс появится после первых выполненных тренировок.
                </div>
              : (
                <>
                  {history.length > 0 && (
                    <div className="text-[13px] text-[var(--slate-500)] px-[2px] mb-[8px]">
                      {history.length === 1 ? 'Завершена 1 тренировка' : `Завершено ${plural(history.length, 'тренировка', 'тренировки', 'тренировок')}`}
                      {(() => {
                        const last = history.map(a => a.completed_at).filter(Boolean).sort().at(-1)
                        return last ? ` · последняя — ${fmtDate(last)}` : ''
                      })()}
                    </div>
                  )}
                  {progress.map(g => {
                    const w0 = maxWeight(g.entries[0])
                    const w1 = g.entries.length > 1 ? maxWeight(g.entries[1]) : null
                    const trend = w0 != null && w1 != null
                      ? (w0 > w1 ? 'up' : w0 < w1 ? 'down' : 'flat')
                      : null
                    return (
                      <div key={g.libId} className="bg-white border border-[var(--border)] rounded-[10px] px-[11px] py-[9px] mb-[5px]">
                        <div className="flex items-center justify-between gap-[6px] mb-[5px]">
                          <span className="text-[15px] font-semibold text-[var(--slate-900)] truncate">{g.name}</span>
                          {trend && (
                            <span className={`text-[14px] font-bold shrink-0 ${
                              trend === 'up' ? 'text-[var(--green-600)]'
                              : trend === 'down' ? 'text-[var(--red-500)]'
                              : 'text-[var(--slate-400)]'
                            }`}>
                              {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
                            </span>
                          )}
                        </div>
                        {g.entries.map((e, i) => (
                          <div key={i} className="flex justify-between text-[13px] py-[1px]">
                            <span className="text-[var(--slate-400)]">{fmtHistDate(e.date)}</span>
                            <span className="text-[var(--slate-600)] font-semibold">{fmtExecution(e)}</span>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </>
              )
        )}
      </div>

      {cancelTarget && (
        <Modal onClose={() => setCancelTarget(null)}>
          <p className="text-[16px] font-bold text-[var(--slate-900)] mb-[6px]">Отменить тренировку?</p>
          <p className="text-[14px] text-[var(--slate-500)] leading-[1.5] mb-[14px]">
            «{cancelTarget.workout?.name ?? '—'}» будет убрана из активных у клиента
            {cancelTarget.results.length > 0 ? ' вместе с введёнными результатами' : ''}.
          </p>
          <button
            onClick={handleCancelAssignment}
            disabled={cancelling}
            className="w-full bg-[var(--red-500)] hover:bg-[var(--red-600)] disabled:opacity-50 text-white text-[15px] font-semibold rounded-[10px] py-[12px] mb-[8px]"
          >
            {cancelling ? 'Отменяем...' : 'Да, отменить'}
          </button>
          <button
            onClick={() => setCancelTarget(null)}
            className="w-full bg-white border border-[var(--slate-200)] text-[var(--slate-700)] text-[15px] font-semibold rounded-[10px] py-[12px]"
          >
            Оставить
          </button>
        </Modal>
      )}
    </Layout>
  )
}
