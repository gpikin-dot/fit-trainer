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

  // Таймер привязан к реальному времени (endAt), а не к тикам setInterval:
  // в свёрнутой вкладке браузер замораживает интервалы, и счёт «вставал».
  // Теперь при возврате в приложение остаток времени всегда честный.
  const endAtRef = useRef<number | null>(null)
  const pausedRemainMsRef = useRef<number>(0)
  const firedRef = useRef({ warn: false, end: false })
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const soundEnabledRef = useRef(true)
  soundEnabledRef.current = soundEnabled

  // count: 1 — предупреждение (10 сек до конца), 2 — отдых окончен
  const playBeep = useCallback((count: number) => {
    if (!soundEnabledRef.current) return
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
      const ctx = audioCtxRef.current
      if (ctx.state === 'suspended') ctx.resume()
      for (let i = 0; i < count; i++) {
        const t0 = ctx.currentTime + i * 0.45
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.value = 880
        gain.gain.setValueAtTime(0.3, t0)
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4)
        osc.start(t0)
        osc.stop(t0 + 0.4)
      }
    } catch { /* ignore */ }
  }, [])

  const tick = useCallback(() => {
    const endAt = endAtRef.current
    if (endAt == null) return
    const diffMs = endAt - Date.now()
    const remain = Math.max(0, Math.ceil(diffMs / 1000))
    setTimerSec(remain)
    setTimerOvertime(diffMs <= 0 ? Math.floor(-diffMs / 1000) : 0)

    if (remain > 10) firedRef.current.warn = false
    if (remain <= 10 && remain > 0 && !firedRef.current.warn) {
      firedRef.current.warn = true
      playBeep(1)
    }
    if (remain === 0 && !firedRef.current.end) {
      firedRef.current.end = true
      playBeep(2)
    }
  }, [playBeep])

  useEffect(() => {
    if (timerActive && !timerPaused) {
      tick()
      timerRef.current = setInterval(tick, 250)
      // при возврате из фона сразу пересчитываем от реального времени
      const onVisible = () => { if (!document.hidden) tick() }
      document.addEventListener('visibilitychange', onVisible)
      return () => {
        if (timerRef.current) clearInterval(timerRef.current)
        document.removeEventListener('visibilitychange', onVisible)
      }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [timerActive, timerPaused, tick])

  function startTimer(secs: number, nextExName: string | null, assignedId: string, exId: string) {
    endAtRef.current = Date.now() + secs * 1000
    firedRef.current = { warn: secs <= 10, end: false }
    setTimerSec(secs)
    setTimerTotal(secs)
    setTimerOvertime(0)
    setTimerActive(true)
    setTimerPaused(false)
    setTimerNextEx(nextExName)
    setAssignedWorkoutId(assignedId)
    setTimerExerciseId(exId)
  }

  function togglePause() {
    setTimerPaused(prev => {
      if (!prev) {
        // пауза: запоминаем остаток (может быть отрицательным в овертайме)
        pausedRemainMsRef.current = (endAtRef.current ?? Date.now()) - Date.now()
      } else {
        endAtRef.current = Date.now() + pausedRemainMsRef.current
      }
      return !prev
    })
  }

  // Добавляем время: если уже в овертайме — снова уходим в обратный отсчёт
  function addTime(secs: number) {
    const base = Math.max(endAtRef.current ?? Date.now(), Date.now())
    endAtRef.current = base + secs * 1000
    if (timerPaused) pausedRemainMsRef.current = endAtRef.current - Date.now()
    firedRef.current.end = false
    setTimerOvertime(0)
    tick()
  }

  function skipTimer() {
    endAtRef.current = null
    setTimerActive(false)
    setTimerOvertime(0)
  }

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
