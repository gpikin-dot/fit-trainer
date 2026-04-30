import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Layout from '../components/Layout'
import type { AssignedWorkout, Workout } from '../types/database'

// ─── Helpers ────────────────────────────────────────────────────────────────

const DAYS_RU = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

function fmtDate(iso: string): string {
  const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00')
  return `${DAYS_RU[d.getDay()]}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}.`
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h >= 5 && h < 12) return 'Доброе утро,'
  if (h >= 12 && h < 18) return 'Добрый день,'
  return 'Добрый вечер,'
}

function shortName(full: string): string {
  const parts = full.trim().split(/\s+/)
  if (parts.length >= 2) return `${parts[0]} ${parts[1][0]}.`
  return full
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface AssignmentData extends AssignedWorkout {
  workout: Workout
  exerciseCount: number
  completedCount: number
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ClientDashboardPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [assignments, setAssignments] = useState<AssignmentData[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'today' | 'history'>('today')

  useEffect(() => { if (profile) loadData() }, [profile])

  async function loadData() {
    if (!profile) return
    const { data } = await supabase
      .from('assigned_workouts')
      .select('*, workout:workouts(*)')
      .eq('client_id', profile.id)
      .order('assigned_at', { ascending: false })

    const enriched = await Promise.all((data ?? []).map(async a => {
      const [{ count }, { data: res }] = await Promise.all([
        supabase.from('exercises').select('*', { count: 'exact', head: true }).eq('workout_id', a.workout_id),
        supabase.from('exercise_results').select('completed').eq('assigned_workout_id', a.id),
      ])
      return {
        ...a,
        exerciseCount: count ?? 0,
        completedCount: (res ?? []).filter(r => r.completed).length,
      }
    }))
    setAssignments(enriched)
    setLoading(false)
  }

  const today = toDateStr(new Date())
  const pending = assignments.filter(a => a.status === 'pending')
  const history = assignments.filter(a => a.status === 'completed')

  const todayWorkout = pending.find(a => a.planned_date === today)
  const upcoming = pending
    .filter(a => a.id !== todayWorkout?.id)
    .sort((a, b) => {
      if (!a.planned_date && !b.planned_date) return 0
      if (!a.planned_date) return 1
      if (!b.planned_date) return -1
      return a.planned_date.localeCompare(b.planned_date)
    })

  const inProgress = todayWorkout && todayWorkout.completedCount > 0
  const progressPct = todayWorkout && todayWorkout.exerciseCount > 0
    ? Math.round(todayWorkout.completedCount / todayWorkout.exerciseCount * 100)
    : 0

  if (loading) {
    return (
      <Layout>
        <div style={{ textAlign: 'center', padding: '48px 0', fontSize: 17, color: 'var(--slate-400)' }}>
          Загрузка...
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      {/* ── Sticky header ─────────────────────────────────── */}
      <div
        className="sticky top-0 z-10 -mx-[13px] px-[14px]"
        style={{ background: 'var(--white)' }}
      >
        {/* Greeting + name */}
        <div style={{ paddingTop: 11 }}>
          <div style={{ fontSize: 15, color: 'var(--slate-400)' }}>
            {getGreeting()}
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--slate-900)', marginTop: 1, marginBottom: 11, letterSpacing: '-0.01em' }}>
            {profile?.name ? shortName(profile.name) : ''}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex" style={{ borderBottom: '1.5px solid var(--border-light)' }}>
          {(['today', 'history'] as const).map(key => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                flex: 1,
                padding: '8px 4px',
                fontSize: 16,
                fontWeight: 600,
                color: tab === key ? 'var(--indigo-500)' : 'var(--slate-400)',
                textAlign: 'center',
                background: 'none',
                border: 'none',
                borderBottom: tab === key ? '2px solid var(--indigo-500)' : '2px solid transparent',
                marginBottom: -1.5,
                cursor: 'pointer',
                fontFamily: 'var(--font)',
              }}
            >
              {key === 'today' ? 'Сегодня' : 'История'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────── */}
      <div style={{ padding: '11px 0 14px' }}>

        {/* ══ СЕГОДНЯ ══════════════════════════════════════ */}
        {tab === 'today' && (
          <>
            {todayWorkout ? (
              /* Today block */
              <div style={{
                background: 'var(--white)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '13px 13px 11px',
                marginBottom: 10,
              }}>
                {/* Label */}
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--slate-400)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 5 }}>
                  {inProgress ? 'В процессе' : 'Тренировка сегодня'}
                </div>
                {/* Name */}
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--slate-900)', letterSpacing: '-0.01em', marginBottom: 3 }}>
                  {todayWorkout.workout?.name}
                </div>
                {/* Meta */}
                <div style={{ fontSize: 15, color: 'var(--slate-400)', marginBottom: inProgress ? 8 : 10 }}>
                  {todayWorkout.exerciseCount} упражнений · {fmtDate(today)}
                </div>

                {/* Progress (in-progress state) */}
                {inProgress && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 15, color: 'var(--slate-400)' }}>Упражнений</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--indigo-500)' }}>
                        {todayWorkout.completedCount} / {todayWorkout.exerciseCount}
                      </span>
                    </div>
                    <div style={{ height: 4, background: 'var(--slate-100)', borderRadius: 2, overflow: 'hidden', marginBottom: 10 }}>
                      <div style={{ height: '100%', borderRadius: 2, background: 'var(--indigo-500)', width: `${progressPct}%` }} />
                    </div>
                  </>
                )}

                {/* CTA */}
                <button
                  onClick={() => navigate(`/client/workout/${todayWorkout.id}`)}
                  style={{
                    width: '100%',
                    background: 'var(--indigo-500)',
                    color: 'var(--white)',
                    border: 'none',
                    borderRadius: 9,
                    padding: 10,
                    fontSize: 17,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'var(--font)',
                    letterSpacing: '0.01em',
                  }}
                >
                  {inProgress ? 'Продолжить' : 'Начать тренировку'}
                </button>
              </div>
            ) : null}

            {/* Ближайшие */}
            {upcoming.length > 0 && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--slate-400)', textTransform: 'uppercase', letterSpacing: '.08em', margin: '10px 0 6px' }}>
                  Ближайшие
                </div>
                {upcoming.map(a => (
                  <button
                    key={a.id}
                    onClick={() => navigate(`/client/workout/${a.id}`)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      textAlign: 'left',
                      background: 'var(--white)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: '9px 11px',
                      marginBottom: 5,
                      cursor: 'pointer',
                      fontFamily: 'var(--font)',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--slate-900)' }}>
                        {a.workout?.name}
                      </div>
                      <div style={{ fontSize: 15, color: 'var(--slate-400)', marginTop: 1 }}>
                        {a.planned_date ? fmtDate(a.planned_date) : 'Без даты'}
                      </div>
                    </div>
                    <span style={{ color: 'var(--slate-300)', fontSize: 16, flexShrink: 0 }}>›</span>
                  </button>
                ))}
              </>
            )}

            {/* Empty */}
            {!todayWorkout && upcoming.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 0 16px', fontSize: 17, color: 'var(--slate-400)', lineHeight: 1.6 }}>
                Тренировок на сегодня нет.<br />Тренер скоро назначит.
              </div>
            )}
          </>
        )}

        {/* ══ ИСТОРИЯ ══════════════════════════════════════ */}
        {tab === 'history' && (
          history.length === 0
            ? (
              <div style={{ textAlign: 'center', padding: '32px 0 16px', fontSize: 17, color: 'var(--slate-400)', lineHeight: 1.6 }}>
                История пуста
              </div>
            )
            : history.map(a => {
                const pct = a.exerciseCount > 0 ? a.completedCount / a.exerciseCount : 0
                const dateLabel = a.completed_at
                  ? fmtDate(a.completed_at)
                  : a.planned_date ? fmtDate(a.planned_date) : '—'

                const badgeStyle: React.CSSProperties = pct === 1
                  ? { background: 'var(--green-100)', color: 'var(--green-700)' }
                  : pct >= 0.6
                  ? { background: 'var(--amber-100)', color: 'var(--amber-800)' }
                  : { background: 'var(--red-100)', color: 'var(--red-800)' }

                return (
                  <button
                    key={a.id}
                    onClick={() => navigate(`/client/session/${a.id}`)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 6,
                      textAlign: 'left',
                      background: 'var(--white)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: '9px 11px',
                      marginBottom: 5,
                      cursor: 'pointer',
                      fontFamily: 'var(--font)',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--slate-900)' }}>
                        {a.workout?.name}
                      </div>
                      <div style={{ fontSize: 15, color: 'var(--slate-400)', marginTop: 2 }}>
                        {dateLabel}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                      <span style={{
                        ...badgeStyle,
                        fontSize: 15,
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: 20,
                        whiteSpace: 'nowrap',
                      }}>
                        {a.completedCount}/{a.exerciseCount}
                      </span>
                      <span style={{ color: 'var(--slate-300)', fontSize: 16, flexShrink: 0 }}>›</span>
                    </div>
                  </button>
                )
              })
        )}

      </div>
    </Layout>
  )
}
