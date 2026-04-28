import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Layout from '../components/Layout'
import type { AssignedWorkout, Workout } from '../types/database'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// Short name: "Василий Козлов" → "Василий К."
function shortName(full: string): string {
  const parts = full.trim().split(/\s+/)
  if (parts.length >= 2) return `${parts[0]} ${parts[1][0]}.`
  return full
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AssignmentData extends AssignedWorkout {
  workout: Workout
  exerciseCount: number
  completedCount: number
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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

  const tabs = [
    { key: 'today' as const, label: 'Сегодня' },
    { key: 'history' as const, label: 'История' },
  ]

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-12" style={{ color: 'var(--c-text-muted)', fontSize: 'var(--fs-md)' }}>
          Загрузка...
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      {/* Sticky header */}
      <div className="sticky top-0 z-10 -mx-[13px] px-[14px]" style={{ background: 'var(--c-surface)' }}>
        <div style={{ paddingTop: 11, paddingBottom: 0 }}>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-text-muted)' }}>
            {getGreeting()}
          </div>
          <div style={{ fontSize: 'var(--fs-2xl)', fontWeight: 700, color: 'var(--c-text-primary)', marginTop: 1, marginBottom: 11, letterSpacing: '-0.01em' }}>
            {profile?.name ? shortName(profile.name) : ''}
          </div>

          {/* Tabs */}
          <div className="flex" style={{ borderBottom: '1.5px solid var(--c-border-light)' }}>
            {tabs.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className="flex-1 text-center"
                style={{
                  padding: '8px 4px',
                  fontSize: 'var(--fs-sm)',
                  fontWeight: 600,
                  color: tab === key ? 'var(--c-primary)' : 'var(--c-text-muted)',
                  borderTop: 'none',
                  borderLeft: 'none',
                  borderRight: 'none',
                  borderBottom: tab === key ? '2px solid var(--c-primary)' : '2px solid transparent',
                  marginBottom: '-1.5px',
                  background: 'none',
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '11px 0 14px' }}>

        {/* ── СЕГОДНЯ ─────────────────────────────────────── */}
        {tab === 'today' && (
          <>
            {/* Today block */}
            {todayWorkout ? (
              <div style={{
                background: 'var(--c-surface)',
                border: '1px solid var(--c-border)',
                borderRadius: 'var(--r-xl)',
                padding: '13px 13px 11px',
                marginBottom: 10,
              }}>
                <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 5 }}>
                  {inProgress ? 'В процессе' : 'Тренировка сегодня'}
                </div>
                <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 700, color: 'var(--c-text-primary)', letterSpacing: '-0.01em', marginBottom: 3 }}>
                  {todayWorkout.workout?.name}
                </div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-text-muted)', marginBottom: inProgress ? 8 : 10 }}>
                  {todayWorkout.exerciseCount} упражнений · {fmtDate(today)}
                </div>

                {inProgress && (
                  <>
                    <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                      <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-text-muted)' }}>Упражнений</span>
                      <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--c-primary)' }}>
                        {todayWorkout.completedCount} / {todayWorkout.exerciseCount}
                      </span>
                    </div>
                    <div style={{ height: 4, background: 'var(--c-surface-hover)', borderRadius: 2, overflow: 'hidden', marginBottom: 10 }}>
                      <div style={{ height: '100%', borderRadius: 2, background: 'var(--c-primary)', width: `${progressPct}%` }} />
                    </div>
                  </>
                )}

                <button
                  onClick={() => navigate(`/client/workout/${todayWorkout.id}`)}
                  style={{
                    width: '100%',
                    background: 'var(--c-primary)',
                    color: '#FFF',
                    border: 'none',
                    borderRadius: 'var(--r-md)',
                    padding: 10,
                    fontSize: 'var(--fs-md)',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {inProgress ? 'Продолжить' : 'Начать тренировку'}
                </button>
              </div>
            ) : null}

            {/* Upcoming */}
            {upcoming.length > 0 && (
              <>
                <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', margin: '10px 0 6px' }}>
                  Ближайшие
                </div>
                {upcoming.map(a => (
                  <button
                    key={a.id}
                    onClick={() => navigate(`/client/workout/${a.id}`)}
                    className="w-full flex items-center gap-2 text-left"
                    style={{
                      background: 'var(--c-surface)',
                      border: '1px solid var(--c-border)',
                      borderRadius: 'var(--r-lg)',
                      padding: '9px 11px',
                      marginBottom: 5,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 'var(--fs-md)', fontWeight: 600, color: 'var(--c-text-primary)' }}>
                        {a.workout?.name}
                      </div>
                      <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-text-muted)', marginTop: 1 }}>
                        {a.planned_date ? fmtDate(a.planned_date) : 'Без даты'}
                      </div>
                    </div>
                    <span style={{ color: 'var(--c-text-disabled)', fontSize: 12 }}>›</span>
                  </button>
                ))}
              </>
            )}

            {!todayWorkout && upcoming.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 0 16px', fontSize: 'var(--fs-md)', color: 'var(--c-text-muted)', lineHeight: 1.6 }}>
                Тренер ещё не назначил тренировок.<br />Загляните позже!
              </div>
            )}
          </>
        )}

        {/* ── ИСТОРИЯ ──────────────────────────────────────── */}
        {tab === 'history' && (
          history.length === 0
            ? (
              <div style={{ textAlign: 'center', padding: '32px 0 16px', fontSize: 'var(--fs-md)', color: 'var(--c-text-muted)', lineHeight: 1.6 }}>
                История пуста
              </div>
            )
            : history.map(a => {
                const pct = a.exerciseCount > 0 ? a.completedCount / a.exerciseCount : 0
                const dateLabel = a.completed_at ? fmtDate(a.completed_at) : a.planned_date ? fmtDate(a.planned_date) : '—'
                const badgeStyle: React.CSSProperties =
                  pct === 1
                    ? { background: 'var(--c-success-bg)', color: 'var(--c-success-text)' }
                    : pct >= 0.6
                    ? { background: 'var(--c-warning-bg)', color: 'var(--c-warning-text)' }
                    : { background: 'var(--c-error-bg)', color: 'var(--c-error-text)' }

                return (
                  <button
                    key={a.id}
                    onClick={() => navigate(`/client/session/${a.id}`)}
                    className="w-full flex items-center justify-between gap-2 text-left"
                    style={{
                      background: 'var(--c-surface)',
                      border: '1px solid var(--c-border)',
                      borderRadius: 'var(--r-lg)',
                      padding: '9px 11px',
                      marginBottom: 5,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 'var(--fs-md)', fontWeight: 600, color: 'var(--c-text-primary)' }}>
                        {a.workout?.name}
                      </div>
                      <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-text-muted)', marginTop: 2 }}>
                        {dateLabel}
                      </div>
                    </div>
                    <div className="flex items-center gap-[5px] shrink-0">
                      <span style={{
                        ...badgeStyle,
                        fontSize: 'var(--fs-xs)',
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: 'var(--r-pill)',
                        whiteSpace: 'nowrap',
                      }}>
                        {a.completedCount}/{a.exerciseCount}
                      </span>
                      <span style={{ color: 'var(--c-text-disabled)', fontSize: 12 }}>›</span>
                    </div>
                  </button>
                )
              })
        )}
      </div>
    </Layout>
  )
}
