import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { logError, isNetworkError } from '../lib/logError'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: `${window.location.origin}/reset-password` },
    )

    if (resetErr) {
      if (/rate limit/i.test(resetErr.message)) {
        setError('Слишком много запросов. Подождите немного и попробуйте снова.')
      } else if (isNetworkError(resetErr)) {
        setError('Нет соединения с сервером. Проверьте интернет и попробуйте ещё раз.')
      } else if (/invalid/i.test(resetErr.message)) {
        setError('Похоже, в адресе опечатка — проверьте email.')
      } else {
        // Не раскрываем, существует ли email — показываем «отправлено», но логируем
        logError('auth.reset-password-request', resetErr)
        setSent(true)
      }
      setLoading(false)
      return
    }

    setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center px-[16px]">
      <div className="max-w-[390px] w-full">
        <div className="text-center mb-[20px]">
          <div className="text-[24px] font-extrabold text-[var(--blue-600)]">FitTrainer</div>
        </div>

        <div className="bg-white rounded-[10px] px-[20px] py-[22px] border border-[var(--border)]">
          <h1 className="text-[20px] font-bold text-[var(--slate-900)] mb-[2px]">Сброс пароля</h1>

          {sent ? (
            <>
              <p className="text-[14px] text-[var(--slate-500)] leading-[1.5] mt-[10px] mb-[16px]">
                Если аккаунт с адресом <span className="font-semibold text-[var(--slate-700)]">{email.trim()}</span> существует,
                мы отправили на него письмо со ссылкой для смены пароля. Проверьте почту, включая «Спам».
              </p>
              <Link to="/login" className="text-[14px] font-semibold text-[var(--blue-600)] block text-center">
                ← Вернуться ко входу
              </Link>
            </>
          ) : (
            <>
              <p className="text-[13px] text-[var(--slate-400)] mb-[16px]">
                Укажите email — пришлём ссылку для смены пароля
              </p>
              <form onSubmit={handleSubmit}>
                <div className="mb-[14px]">
                  <label className="block text-[11px] font-semibold text-[var(--slate-500)] uppercase tracking-[0.05em] mb-[6px]">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoComplete="email"
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
                  {loading ? 'Отправляем...' : 'Отправить ссылку'}
                </button>
              </form>

              <div className="border-t border-[var(--slate-100)] mt-[16px] pt-[14px]">
                <Link to="/login" className="text-[14px] font-semibold text-[var(--blue-600)] block text-center">
                  ← Вернуться ко входу
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
