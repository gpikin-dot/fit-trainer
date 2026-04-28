import { Volume2, VolumeX, Plus, Pause, Play, SkipForward } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTimer } from '../contexts/TimerContext'

const RING_C = 220
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export default function Layout({ children, fullHeight = false }: {
  children: React.ReactNode
  fullHeight?: boolean
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    timerSec, timerTotal, timerActive, timerPaused, timerNextEx,
    assignedWorkoutId, soundEnabled,
    togglePause, addTime, skipTimer, setSoundEnabled,
  } = useTimer()

  const isOnWorkoutPage = location.pathname.startsWith('/client/workout/')
  const showCompactTimer = timerActive && !isOnWorkoutPage

  const ringOffset = timerTotal > 0 ? RING_C * (1 - timerSec / timerTotal) : 0

  return (
    <div className={`${fullHeight ? 'h-dvh flex flex-col' : 'min-h-screen'} bg-[#EEF1F6] text-[#0F172A]`}>
      <main className={
        fullHeight
          ? 'flex-1 min-h-0 flex flex-col max-w-[390px] mx-auto w-full'
          : 'max-w-[390px] mx-auto px-[13px]'
      }>
        {children}
      </main>

      {/* Compact floating timer — shown on all pages except the workout page */}
      {showCompactTimer && (
        <div
          className="fixed bottom-4 right-4 z-50 bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.14)] border border-[#F1F5F9] overflow-hidden"
          style={{ transform: 'translateZ(0)', willChange: 'transform' }}
        >
          <button
            onClick={() => assignedWorkoutId && navigate(`/client/workout/${assignedWorkoutId}`)}
            className="flex items-center gap-3 px-4 py-3 w-full"
          >
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
              <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-[#0F172A]">
                {fmt(timerSec)}
              </div>
            </div>
            <div className="text-left">
              <div className="text-[10px] text-[#94A3B8] uppercase tracking-wider">отдых</div>
              {timerNextEx && (
                <div className="text-xs text-[#64748B] max-w-[120px] truncate">{timerNextEx}</div>
              )}
              <div className="text-[10px] text-emerald-600 mt-0.5">вернуться →</div>
            </div>
          </button>

          <div className="flex border-t border-[#F1F5F9]">
            <button
              onClick={() => setSoundEnabled(e => !e)}
              className="flex-1 py-2 flex items-center justify-center text-[#94A3B8] hover:text-[#64748B] hover:bg-[#F8FAFC]"
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => addTime(30)}
              className="flex-1 py-2 flex items-center justify-center gap-1 text-[10px] text-[#64748B] hover:bg-[#F8FAFC] border-l border-[#F1F5F9]"
            >
              <Plus className="w-3 h-3" />30
            </button>
            <button
              onClick={togglePause}
              className="flex-1 py-2 flex items-center justify-center text-[#64748B] hover:bg-[#F8FAFC] border-l border-[#F1F5F9]"
            >
              {timerPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => { skipTimer(); assignedWorkoutId && navigate(`/client/workout/${assignedWorkoutId}`) }}
              className="flex-1 py-2 flex items-center justify-center text-emerald-600 hover:bg-emerald-50 border-l border-[#F1F5F9]"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
