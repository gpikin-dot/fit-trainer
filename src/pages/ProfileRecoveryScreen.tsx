import type { ProfileError } from '../hooks/useAuth'

// Показывается, когда auth-сессия есть, а профиль не загрузился.
// Раньше в этом состоянии человека молча выбрасывало на /login без объяснений.
export default function ProfileRecoveryScreen({
  kind,
  onRetry,
  onSignOut,
}: {
  kind: Exclude<ProfileError, null>
  onRetry: () => void
  onSignOut: () => void
}) {
  const missing = kind === 'missing'
  return (
    <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center px-[16px]">
      <div className="max-w-[390px] w-full">
        <div className="text-center mb-[20px]">
          <div className="text-[24px] font-extrabold text-[var(--blue-600)]">FitTrainer</div>
        </div>
        <div className="bg-white rounded-[10px] px-[20px] py-[22px] border border-[var(--border)] text-center">
          <h1 className="text-[18px] font-bold text-[var(--slate-900)] mb-[8px]">
            {missing ? 'Профиль не найден' : 'Не удалось загрузить профиль'}
          </h1>
          <p className="text-[14px] text-[var(--slate-500)] leading-[1.5] mb-[16px]">
            {missing
              ? 'Аккаунт существует, но профиль к нему не привязан. Напишите своему тренеру или попробуйте зарегистрироваться по ссылке-приглашению заново.'
              : 'Похоже, проблема с соединением. Проверьте интернет и попробуйте ещё раз.'}
          </p>
          {!missing && (
            <button
              onClick={onRetry}
              className="w-full bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white text-[15px] font-semibold rounded-[10px] py-[12px] mb-[8px]"
            >
              Попробовать снова
            </button>
          )}
          <button
            onClick={onSignOut}
            className="w-full bg-white border border-[var(--slate-200)] text-[var(--slate-600)] text-[15px] font-semibold rounded-[10px] py-[12px]"
          >
            Выйти из аккаунта
          </button>
        </div>
      </div>
    </div>
  )
}
