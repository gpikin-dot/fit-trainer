import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Plus, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Layout from '../components/Layout'
import { TabButton, EmptyState, formatDate, plural } from '../components/UI'
import type { Profile, AssignedWorkout, Workout, Exercise, ExerciseLibrary, ExerciseResult } from '../types/database'

interface ExerciseHistory {
  library: ExerciseLibrary
  results: Array<{
    date: string
    sets: number
    reps: number | null
    weight: number | null
    note: string | null
  }>
  totalCount: number
}

export default function ClientCardPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [client, setClient] = useState<Profile | null>(null)
  const [tab, setTab] = useState<'exercises' | 'workouts'>('exercises')
  const [exerciseHistory, setExerciseHistory] = useState<ExerciseHistory[]>([])
  const [assignments, setAssignments] = useState<(AssignedWorkout & { workout: Workout; exercises: (Exercise & { exercise_library: ExerciseLibrary })[]; results: ExerciseResult[] })[]>([])
  const [totalWorkouts, setTotalWorkouts] = useState(0)
  const [completedWorkouts, setCompletedWorkouts] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    loadData(id)
  }, [id])

  async function loadData(clientId: string) {
    const { data: clientData } = await supabase.from('profiles').select('*').eq('id', clientId).single()
    setClient(clientData)

    const { data: assignedData } = await supabase
      .from('assigned_workouts')
      .select('*, workout:workouts(*)')
      .eq('client_id', clientId)
      .order('assigned_at', { ascending: false })

    const all = assignedData ?? []
    setTotalWorkouts(all.length)
    setCompletedWorkouts(all.filter(a => a.status === 'completed').length)

    // Load exercises and results for each assignment
    const enriched = await Promise.all(all.map(async (a) => {
      const [{ data: exs }, { data: res }] = await Promise.all([
        supabase.from('exercises').select('*, exercise_library:exercises_library(*)').eq('workout_id', a.workout_id).order('order'),
        supabase.from('exercise_results').select('*').eq('assigned_workout_id', a.id),
      ])
      return { ...a, exercises: exs ?? [], results: res ?? [] }
    }))
    setAssignments(enriched)

    // Build per-exercise history
    const historyMap = new Map<string, ExerciseHistory>()
    for (const a of enriched) {
      if (a.status !== 'completed') continue
      for (const ex of a.exercises) {
        const lib = ex.exercise_library
        const result = a.results.find(r => r.exercise_id === ex.id)
        if (!historyMap.has(lib.id)) {
          historyMap.set(lib.id, { library: lib, results: [], totalCount: 0 })
        }
        const entry = historyMap.get(lib.id)!
        entry.totalCount++
        entry.results.push({
          date: a.completed_at ?? '',
          sets: ex.sets,
          reps: result?.actual_reps ?? null,
          weight: result?.actual_weight_kg ?? null,
          note: result?.client_note ?? null,
        })
      }
    }

    // Sort results newest first, keep last 3 for display
    const historyList = Array.from(historyMap.values()).map(h => ({
      ...h,
      results: h.results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    }))
    setExerciseHistory(historyList)
    setLoading(false)
  }

  function getTrend(results: ExerciseHistory['results']): 'up' | 'down' | 'flat' | null {
    const withWeight = results.filter(r => r.weight !== null)
    if (withWeight.length < 2) return null
    const last = withWeight[0].weight!
    const prev = withWeight[1].weight!
    if (last > prev) return 'up'
    if (last < prev) return 'down'
    return 'flat'
  }

  if (loading) return <Layout><div className="text-center py-12 text-slate-400">Загрузка...</div></Layout>
  if (!client) return <Layout><div className="text-center py-12 text-slate-400">Клиент не найден</div></Layout>

  return (
    <Layout>
      <Link to="/trainer" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> К списку клиентов
      </Link>

      <div className="mb-5 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{client.name}</h1>
          <div className="text-sm text-slate-500 mt-0.5">
            {plural(completedWorkouts, 'тренировка выполнена', 'тренировки выполнены', 'тренировок выполнено')} из {totalWorkouts}
            {' · '}{exerciseHistory.length} {plural(exerciseHistory.length, 'упражнение', 'упражнения', 'упражнений')} в истории
          </div>
        </div>
        <button
          onClick={() => navigate(`/trainer/workout/new?client=${client.id}`)}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-2 rounded-lg"
        >
          <Plus className="w-4 h-4" /> Создать тренировку для клиента
        </button>
      </div>

      <div className="flex gap-1 mb-5 border-b border-slate-200">
        <TabButton active={tab === 'exercises'} onClick={() => setTab('exercises')}>По упражнениям</TabButton>
        <TabButton active={tab === 'workouts'} onClick={() => setTab('workouts')}>По тренировкам</TabButton>
      </div>

      {tab === 'exercises' && (
        exerciseHistory.length === 0
          ? <EmptyState text="История упражнений пуста" />
          : <div className="space-y-3">
            {exerciseHistory.map(h => {
              const trend = getTrend(h.results)
              const displayed = h.results.slice(0, 3)
              const rest = h.totalCount - displayed.length
              return (
                <div key={h.library.id} className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{h.library.name_ru}</span>
                    {trend === 'up' && <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full flex items-center gap-1"><TrendingUp className="w-3 h-3" /> прогресс</span>}
                    {trend === 'down' && <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full flex items-center gap-1"><TrendingDown className="w-3 h-3" /> снижение</span>}
                    {trend === 'flat' && <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full flex items-center gap-1"><Minus className="w-3 h-3" /> застой</span>}
                  </div>
                  <div className="space-y-1">
                    {displayed.map((r, i) => (
                      <div key={i} className="text-sm flex gap-3 text-slate-600">
                        <span className="text-slate-400 w-24 shrink-0">{r.date ? new Date(r.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '—'}</span>
                        <span>{r.sets}×{r.reps ?? '?'}{r.weight ? ` · ${r.weight} кг` : ''}</span>
                        {r.note && <span className="italic text-slate-400 text-xs">{r.note}</span>}
                      </div>
                    ))}
                    {rest > 0 && <div className="text-xs text-slate-400">и ещё {rest} {plural(rest, 'раз', 'раза', 'раз')} раньше</div>}
                  </div>
                </div>
              )
            })}
          </div>
      )}

      {tab === 'workouts' && (
        assignments.length === 0
          ? <EmptyState text="Нет назначенных тренировок" />
          : <div className="space-y-3">
            {assignments.map(a => (
              <div key={a.id} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2 gap-2 flex-wrap">
                  <div>
                    <div className="font-medium">{a.workout?.name ?? '—'}</div>
                    <div className="text-xs text-slate-500">Назначена: {formatDate(a.assigned_at)}{a.completed_at && ` · Выполнена: ${formatDate(a.completed_at)}`}</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${a.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {a.status === 'completed' ? '✓ Выполнена' : 'В процессе'}
                  </span>
                </div>
                {a.status === 'completed' && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-slate-500 border-b border-slate-200">
                          <th className="text-left py-1.5 pr-2">Упражнение</th>
                          <th className="text-left py-1.5 px-2">План</th>
                          <th className="text-left py-1.5 px-2">Факт</th>
                          <th className="text-left py-1.5 pl-2">Комментарий</th>
                        </tr>
                      </thead>
                      <tbody>
                        {a.exercises.map(ex => {
                          const res = a.results.find(r => r.exercise_id === ex.id)
                          return (
                            <tr key={ex.id} className="border-b border-slate-100 last:border-0">
                              <td className="py-1.5 pr-2">{ex.exercise_library.name_ru}</td>
                              <td className="py-1.5 px-2 text-slate-600">{ex.sets}×{ex.reps}{ex.weight_kg > 0 ? ` · ${ex.weight_kg}кг` : ''}</td>
                              <td className={`py-1.5 px-2 font-medium ${res?.completed ? 'text-green-700' : 'text-slate-400'}`}>
                                {res?.completed ? `${ex.sets}×${res.actual_reps ?? '?'}${res.actual_weight_kg ? ` · ${res.actual_weight_kg}кг` : ''}` : '—'}
                              </td>
                              <td className="py-1.5 pl-2 text-slate-500 italic text-xs">{res?.client_note ?? ''}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
      )}
    </Layout>
  )
}
