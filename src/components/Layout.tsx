import { Dumbbell, LogOut, Volume2, VolumeX, Plus, Pause, Play, SkipForward } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTimer } from '../contexts/TimerContext'

const RING_C = 220
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export default function Layout({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const {
    timerSec, timerTotal, timerActive, timerPaused, timerNextEx,
    assignedWorkoutId, soundEnabled,
    togglePause, addTime, skipTimer, setSoundEnabled,
  } = useTimer()

  const homeUrl = profile?.role === 'client' ? '/client' : '/trainer'
  const isOnWorkoutPage = location.pathname.startsWith('/client/workout/')
  const showCompactTimer = timerActive && !isOnWorkoutPage

  const ringOffset = timerTotal > 0 ? RING_C * (1 - timerSec / timerTotal) : 0

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => navigate(homeUrl)} className="flex items-center gap-2 hover:opacity-75 transition-opacity">
            <Dumbbell className={`w-6 h-6 ${profile?.role === 'client' ? 'text-emerald-600' : 'text-indigo-600'}`} />
            <span className="font-semibold">FitTrainer</span>
          </button>
          {profile && (
            <div className="flex items-center gap-3">
              <div className="text-sm text-slate-600 hidden sm:block">
                {profile.name}
                <span className="text-slate-400 ml-1">
                  · {profile.role === 'trainer' ? 'тренер' : 'клиент'}
                </span>
              </div>
              <button
                onClick={signOut}
                className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
              >
                <LogOut className="w-4 h-4" /> Выйти
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">
        {children}
      </main>

      {/* Compact floating timer — shown on all pages except the workout page itself */}
      {showCompactTimer && (
        <div
          className="fixed bottom-4 right-4 z-50 bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.14)] border border-slate-100 overflow-hidden"
          style={{ transform: 'translateZ(0)', willChange: 'transform' }}
        >
          {/* Tap area → go back to workout */}
          <button
            onClick={() => assignedWorkoutId && navigate(`/client/workout/${assignedWorkoutId}`)}
            className="flex items-center gap-3 px-4 py-3 w-full"
          >
            {/* Mini ring */}
            <div className="relative w-10 h-10 shrink-0">
              <svg width="40" height="40" viewBox="0 0 80 80" className="-rotate-90">
                <circle cx="40" cy="40" r="35" fill="none" stroke="#f1f5f9" strokeWidth="8" />
                <circle
                  cx="40" cy="40" r="35"
                  fill="none"
                  stroke={timerPaused ? '#94a3b8' : '#10b981'}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={RING_C}
                  strokeDashoffset={ringOffset}
                  style={{ transition: 'stroke-dashoffset 1s linear' }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-900">
                {fmt(timerSec)}
              </div>
            </div>
            <div className="text-left">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider">отдых</div>
              {timerNextEx && (
                <div className="text-xs text-slate-600 max-w-[120px] truncate">{timerNextEx}</div>
              )}
              <div className="text-[10px] text-emerald-600 mt-0.5">вернуться →</div>
            </div>
          </button>

          {/* Quick controls row */}
          <div className="flex border-t border-slate-100">
            <button
              onClick={() => setSoundEnabled(e => !e)}
              className="flex-1 py-2 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-50"
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => addTime(30)}
              className="flex-1 py-2 flex items-center justify-center gap-1 text-[10px] text-slate-500 hover:bg-slate-50 border-l border-slate-100"
            >
              <Plus className="w-3 h-3" />30
            </button>
            <button
              onClick={togglePause}
              className="flex-1 py-2 flex items-center justify-center text-slate-500 hover:bg-slate-50 border-l border-slate-100"
            >
              {timerPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={skipTimer}
              className="flex-1 py-2 flex items-center justify-center text-emerald-600 hover:bg-emerald-50 border-l border-slate-100"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
