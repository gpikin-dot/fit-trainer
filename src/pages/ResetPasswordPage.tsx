import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { logError, isNetworkError } from '../lib/logError'

// Сюда ведёт ссылка из письма Supabase (type=recovery).
// SDK сам обменивает токен из URL на сессию (detectSessionInUrl).
export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [hasSession, setHasSession] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Даём SDK время обработать токен из URL, затем проверяем сессию
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setHasSession(true)
    })
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setHasSession(true)
      } else {
        // Токен из письма SDK обрабатывает асинхронно — даём ему секунду,
        // прежде чем показать «ссылка не сработала»
        setTimeout(() => setHasSession(prev => prev ?? false), 1200)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('Пароль должен быть не короче 6 символов')
      return
    }
    if (password !== password2) {
      setError('Пароли не совпадают')
      return
    }
    setLoading(true)

    const { error: updErr } = await supabase.auth.updateUser({ password })
    if (updErr) {
      if (isNetworkError(updErr)) {
        setError('Нет соединения с сервером. Проверьте интернет и попробуйте ещё раз.')
      } else if (/same.*password|different from the old/i.test(updErr.message)) {
        setError('Новый пароль совпадает со старым — придумайте другой.')
      } else {
        logError('auth.reset-password-update', updErr)
        setError('Не удалось сменить пароль. Запросите новую ссылку и попробуйте ещё раз.')
      }
      setLoading(false)
      return
    }

    navigate('/', { replace: true })
  }

  if (hasSession === null) {
    return (
      <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center">
        <div className="text-[var(--slate-400)] text-[15px]">Загрузка...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center px-[16px]">
      <div className="max-w-[390px] w-full">
        <div className="text-center mb-[20px]">
          <div className="text-[24px] font-extrabold text-[var(--blue-600)]">FitTrainer</div>
        </div>

        <div className="bg-white rounded-[10px] px-[20px] py-[22px] border border-[var(--border)]">
          {!hasSession ? (
            <>
              <h1 className="text-[20px] font-bold text-[var(--slate-900)] mb-[8px]">Ссылка не сработала</h1>
              <p className="text-[14px] text-[var(--slate-500)] leading-[1.5] mb-[16px]">
                Ссылка для смены пароля устарела или уже была использована. Запросите новую.
              </p>
              <Link
                to="/forgot-password"
                className="w-full bg-[var(--blue-600)] hover:bg-[var(--blue-700)] text-white text-[15px] font-semibold rounded-[10px] py-[13px] block text-center"
              >
                Запросить новую ссылку
              </Link>
            </>
          ) : (
            <>
              <h1 className="text-[20px] font-bold text-[var(--slate-900)] mb-[2px]">Новый пароль</h1>
              <p className="text-[13px] text-[var(--slate-400)] mb-[16px]">Придумайте новый пароль для входа</p>

              <form onSubmit={handleSubmit}>
                <div className="mb-[12px]">
                  <label className="block text-[11px] font-semibold text-[var(--slate-500)] uppercase tracking-[0.05em] mb-[6px]">
                    Новый пароль
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="w-full border border-[var(--slate-200)] rounded-[8px] px-[12px] py-[10px] text-[15px] text-[var(--slate-900)] bg-white outline-none focus:border-[var(--blue-500)] focus:ring-2 focus:ring-[var(--blue-100)]"
                  />
                </div>
                <div className="mb-[14px]">
                  <label className="block text-[11px] font-semibold text-[var(--slate-500)] uppercase tracking-[0.05em] mb-[6px]">
                    Повторите пароль
                  </label>
                  <input
                    type="password"
                    value={password2}
                    onChange={e => setPassword2(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="w-full border border-[var(--slate-200)] rounded-[8px] px-[12px] py-[10px] text-[15px] text-[var(--slate-900)] bg-white outline-none focus:border-[var(--blue-500)] focus:ring-2 focus:ring-[var(--blue-100)]"
                  />
                </div>

                {error && (
                  <div className="text-[13px] text-[var(--red-500)] mb-[10px]">{error}</div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[var(--blue-600)] hover:bg-[var(--blue-700)] disabled:opacity-50 text-white text-[15px] font-semibold rounded-[10px] py-[13px]"
                >
                  {loading ? 'Сохраняем...' : 'Сменить пароль и войти'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
