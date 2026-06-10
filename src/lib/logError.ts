import { supabase } from './supabase'

// Лимит на сессию — защита от шторма ошибок (например, циклического ре-рендера)
const MAX_PER_SESSION = 20
let sent = 0

export function logError(context: string, error: unknown, details?: Record<string, unknown>) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[${context}]`, error)

  if (sent >= MAX_PER_SESSION) return
  sent++

  supabase
    .from('client_errors')
    .insert({
      context: context.slice(0, 100),
      message: message.slice(0, 500),
      details: details ?? null,
      url: window.location.pathname,
      user_agent: navigator.userAgent.slice(0, 200),
    })
    .then(({ error: insErr }) => {
      // Таблицы может ещё не быть (миграция не применена) — не падаем
      if (insErr) console.warn('logError: запись не удалась —', insErr.message)
    })
}

export function isNetworkError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  return /failed to fetch|networkerror|load failed|fetch failed/i.test(msg)
}

export function installGlobalErrorLogging() {
  window.addEventListener('error', e => {
    logError('window.onerror', e.error ?? e.message)
  })
  window.addEventListener('unhandledrejection', e => {
    logError('unhandledrejection', e.reason)
  })
}
