import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react'

interface TimerContextValue {
  timerSec: number
  timerTotal: number
  timerActive: boolean
  timerPaused: boolean
  timerNextEx: string | null
  assignedWorkoutId: string | null
  soundEnabled: boolean
  startTimer: (secs: number, nextExName: string | null, assignedId: string) => void
  togglePause: () => void
  addTime: (secs: number) => void
  skipTimer: () => void
  setSoundEnabled: (fn: (prev: boolean) => boolean) => void
}

const TimerContext = createContext<TimerContextValue | null>(null)

export function TimerProvider({ children }: { children: ReactNode }) {
  const [timerSec, setTimerSec] = useState(0)
  const [timerTotal, setTimerTotal] = useState(0)
  const [timerActive, setTimerActive] = useState(false)
  const [timerPaused, setTimerPaused] = useState(false)
  const [timerNextEx, setTimerNextEx] = useState<string | null>(null)
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
          if (prev <= 1) {
            clearInterval(timerRef.current!)
            setTimerActive(false)
            playBeep()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [timerActive, timerPaused, playBeep])

  function startTimer(secs: number, nextExName: string | null, assignedId: string) {
    setTimerSec(secs)
    setTimerTotal(secs)
    setTimerActive(true)
    setTimerPaused(false)
    setTimerNextEx(nextExName)
    setAssignedWorkoutId(assignedId)
  }

  function togglePause() { setTimerPaused(p => !p) }
  function addTime(secs: number) { setTimerSec(s => s + secs) }
  function skipTimer() { setTimerActive(false) }

  return (
    <TimerContext.Provider value={{
      timerSec, timerTotal, timerActive, timerPaused, timerNextEx,
      assignedWorkoutId, soundEnabled,
      startTimer, togglePause, addTime, skipTimer,
      setSoundEnabled,
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
