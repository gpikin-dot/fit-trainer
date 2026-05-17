import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react'

interface TimerContextValue {
  timerSec: number
  timerTotal: number
  timerOvertime: number
  timerActive: boolean
  timerPaused: boolean
  timerNextEx: string | null
  timerExerciseId: string | null
  assignedWorkoutId: string | null
  soundEnabled: boolean
  startTimer: (secs: number, nextExName: string | null, assignedId: string, exId: string) => void
  togglePause: () => void
  addTime: (secs: number) => void
  skipTimer: () => void
  setSoundEnabled: (fn: (prev: boolean) => boolean) => void
}

const TimerContext = createContext<TimerContextValue | null>(null)

export function TimerProvider({ children }: { children: ReactNode }) {
  const [timerSec, setTimerSec] = useState(0)
  const [timerTotal, setTimerTotal] = useState(0)
  const [timerOvertime, setTimerOvertime] = useState(0)
  const [timerActive, setTimerActive] = useState(false)
  const [timerPaused, setTimerPaused] = useState(false)
  const [timerNextEx, setTimerNextEx] = useState<string | null>(null)
  const [timerExerciseId, setTimerExerciseId] = useState<string | null>(null)
  const [assignedWorkoutId, setAssignedWorkoutId] = useState<string | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

  const playBeep = useCallback(() => {
    if (!soundEnabled) return
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
      const ctx = audioCtxRef.current
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.5)
    } catch { /* ignore */ }
  }, [soundEnabled])

  useEffect(() => {
    if (timerActive && !timerPaused) {
      timerRef.current = setInterval(() => {
        setTimerSec(prev => {
          if (prev > 1) return prev - 1
          if (prev === 1) { playBeep(); return 0 }
          // prev === 0 → отдых окончен, считаем овертайм вверх
          setTimerOvertime(o => o + 1)
          return 0
        })
      }, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [timerActive, timerPaused, playBeep])

  function startTimer(secs: number, nextExName: string | null, assignedId: string, exId: string) {
    setTimerSec(secs)
    setTimerTotal(secs)
    setTimerOvertime(0)
    setTimerActive(true)
    setTimerPaused(false)
    setTimerNextEx(nextExName)
    setAssignedWorkoutId(assignedId)
    setTimerExerciseId(exId)
  }

  function togglePause() { setTimerPaused(p => !p) }
  // Добавляем время: если уже в овертайме — снова уходим в обратный отсчёт
  function addTime(secs: number) {
    setTimerSec(s => s + secs)
    setTimerOvertime(0)
  }
  function skipTimer() { setTimerActive(false); setTimerOvertime(0) }

  return (
    <TimerContext.Provider value={{
      timerSec, timerTotal, timerOvertime, timerActive, timerPaused, timerNextEx,
      timerExerciseId, assignedWorkoutId, soundEnabled,
      startTimer, togglePause, addTime, skipTimer, setSoundEnabled,
    }}>
      {children}
    </TimerContext.Provider>
  )
}

export function useTimer() {
  const ctx = useContext(TimerContext)
  if (!ctx) throw new Error('useTimer must be used within TimerProvider')
  return ctx
}
