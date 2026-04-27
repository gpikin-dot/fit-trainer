import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Layout from '../components/Layout'
import { Card, EmptyState, formatDate, plural } from '../components/UI'
import type { AssignedWorkout, Workout } from '../types/database'

export default function ClientDashboardPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [assignments, setAssignments] = useState<(AssignedWorkout & { workout: Workout; exerciseCount: number })[]>([])
  const [trainerName, setTrainerName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return

    if (profile.trainer_id) {
      supabase.from('profiles').select('name').eq('id', profile.trainer_id).single()
        .then(({ data }) => setTrainerName(data?.name ?? ''))
    }

    supabase.from('assigned_workouts')
      .select('*, workout:workouts(*)')
      .eq('client_id', profile.id)
      .order('assigned_at', { ascending: false })
      .then(async ({ data }) => {
        const all = data ?? []
        const enriched = await Promise.all(all.map(async a => {
          const { count } = await supabase
            .from('exercises')
            .select('*', { count: 'exact', head: true })
            .eq('workout_id', a.workout_id)
          return { ...a, exerciseCount: count ?? 0 }
        }))
        // pending first, then by date
        enriched.sort((a, b) => {
          if (a.status !== b.status) return a.status === 'pending' ? -1 : 1
          return new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime()
        })
        setAssignments(enriched)
        setLoading(false)
      })
  }, [profile])

  if (loading) return <Layout><div className="text-center py-12 text-slate-400">Загрузка...</div></Layout>

  return (
    <Layout>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">Мои тренировки</h1>
        {trainerName && <div className="text-sm text-slate-500 mt-0.5">Тренер: {trainerName}</div>}
      </div>

      {assignments.length === 0
        ? <EmptyState text="Тренер ещё не назначил тренировок. Загляните позже!" />
        : <div className="space-y-2">
          {assignments.map(a => (
            <Card key={a.id} variant="emerald" onClick={() => navigate(`/client/workout/${a.id}`)}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{a.workout?.name ?? '—'}</div>
                  <div className="text-sm text-slate-500 mt-0.5 flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDate(a.assigned_at)} · {plural(a.exerciseCount, 'упражнение', 'упражнения', 'упражнений')}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${a.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {a.status === 'completed' ? '✓ Выполнена' : 'Открыть'}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      }
    </Layout>
  )
}
