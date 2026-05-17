import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Layout from '../components/Layout'

export default function ProfilePage() {
  const navigate = useNavigate()
  const { user, profile, signOut, refetchProfile } = useAuth()

  const [name, setName] = useState(profile?.name ?? '')
  const [savedName, setSavedName] = useState(false)
  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState('')

  const [pwd, setPwd] = useState('')
  const [pwd2, setPwd2] = useState('')
  const [pwdMsg, setPwdMsg] = useState('')
  const [pwdErr, setPwdErr] = useState('')
  const [savingPwd, setSavingPwd] = useState(false)

  const initials = (profile?.name ?? '?').slice(0, 2).toUpperCase()

  async function saveName() {
    if (!profile || !name.trim()) { setNameError('Введите имя'); return }
    setNameError('')
    setSavingName(true)
    const { error } = await supabase
      .from('profiles')
      .update({ name: name.trim() })
      .eq('id', profile.id)
    if (error) {
      setNameError('Не удалось сохранить')
    } else {
      await supabase.auth.updateUser({ data: { name: name.trim() } })
      await refetchProfile()
      setSavedName(true)
      setTimeout(() => setSavedName(false), 2000)
    }
    setSavingName(false)
  }

  async function changePassword() {
    setPwdErr('')
    setPwdMsg('')
    if (pwd.length < 6) { setPwdErr('Пароль не короче 6 символов'); return }
    if (pwd !== pwd2) { setPwdErr('Пароли не совпадают'); return }
    setSavingPwd(true)
    const { error } = await supabase.auth.updateUser({ password: pwd })
    if (error) {
      setPwdErr(error.message)
    } else {
      setPwd('')
      setPwd2('')
      setPwdMsg('Пароль изменён')
      setTimeout(() => setPwdMsg(''), 2500)
    }
    setSavingPwd(false)
  }

  return (
    <Layout>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white -mx-[13px] px-[16px] py-[14px] border-b border-[var(--border)] flex items-center gap-[10px]">
        <button
          onClick={() => navigate(-1)}
          className="text-[20px] text-[var(--blue-600)] leading-none"
          title="Назад"
        >
          ‹
        </button>
        <div className="text-[17px] font-semibold text-[var(--slate-900)]">Профиль</div>
      </div>

      <div className="pt-[16px] pb-[32px]">
        {/* Avatar */}
        <div className="flex flex-col items-center mb-[24px]">
          <div className="w-[72px] h-[72px] rounded-full bg-[var(--blue-50)] text-[var(--blue-600)] flex items-center justify-center text-[24px] font-bold border-[1.5px] border-[var(--blue-200)] mb-[8px]">
            {initials}
          </div>
          <div className="text-[12px] text-[var(--slate-400)]">
            {profile?.role === 'trainer' ? 'Тренер' : 'Клиент'}
          </div>
        </div>

        {/* Editable fields */}
        <div className="flex flex-col gap-[12px] mb-[16px]">
          <div>
            <label className="block text-[11px] font-semibold text-[var(--slate-500)] uppercase tracking-[0.05em] mb-[6px]">
              Имя
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border border-[var(--slate-200)] rounded-[8px] px-[12px] py-[10px] text-[15px] text-[var(--slate-900)] bg-white outline-none focus:border-[var(--blue-500)] focus:ring-2 focus:ring-[var(--blue-100)]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[var(--slate-500)] uppercase tracking-[0.05em] mb-[6px]">
              Email
            </label>
            <input
              type="email"
              value={user?.email ?? ''}
              readOnly
              className="w-full border border-[var(--slate-200)] rounded-[8px] px-[12px] py-[10px] text-[15px] text-[var(--slate-400)] bg-[var(--slate-50)] outline-none cursor-default"
            />
          </div>
        </div>

        {nameError && <div className="text-[13px] text-[var(--red-500)] mb-[8px]">{nameError}</div>}

        <button
          onClick={saveName}
          disabled={savingName}
          className="w-full bg-[var(--blue-600)] hover:bg-[var(--blue-700)] disabled:opacity-50 text-white text-[15px] font-semibold rounded-[10px] py-[12px]"
        >
          {savedName ? '✓ Сохранено' : savingName ? 'Сохранение...' : 'Сохранить изменения'}
        </button>

        <div className="h-[1px] bg-[var(--border)] my-[20px]" />

        {/* Password change */}
        <div className="text-[15px] font-semibold text-[var(--slate-900)] mb-[12px]">Смена пароля</div>
        <div className="flex flex-col gap-[10px] mb-[12px]">
          <div>
            <label className="block text-[11px] font-semibold text-[var(--slate-500)] uppercase tracking-[0.05em] mb-[6px]">
              Новый пароль
            </label>
            <input
              type="password"
              value={pwd}
              onChange={e => setPwd(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              className="w-full border border-[var(--slate-200)] rounded-[8px] px-[12px] py-[10px] text-[15px] text-[var(--slate-900)] bg-white outline-none focus:border-[var(--blue-500)] focus:ring-2 focus:ring-[var(--blue-100)]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[var(--slate-500)] uppercase tracking-[0.05em] mb-[6px]">
              Повторите новый пароль
            </label>
            <input
              type="password"
              value={pwd2}
              onChange={e => setPwd2(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              className="w-full border border-[var(--slate-200)] rounded-[8px] px-[12px] py-[10px] text-[15px] text-[var(--slate-900)] bg-white outline-none focus:border-[var(--blue-500)] focus:ring-2 focus:ring-[var(--blue-100)]"
            />
          </div>
        </div>

        {pwdErr && <div className="text-[13px] text-[var(--red-500)] mb-[8px]">{pwdErr}</div>}
        {pwdMsg && <div className="text-[13px] text-[var(--green-600)] mb-[8px]">{pwdMsg}</div>}

        <button
          onClick={changePassword}
          disabled={savingPwd || !pwd}
          className="w-full bg-white border border-[var(--slate-200)] text-[var(--slate-700)] text-[15px] font-semibold rounded-[10px] py-[12px] disabled:opacity-50"
        >
          {savingPwd ? 'Сохранение...' : 'Изменить пароль'}
        </button>

        <div className="h-[1px] bg-[var(--border)] my-[20px]" />

        <button
          onClick={() => signOut()}
          className="w-full bg-white border-[1.5px] border-[var(--red-200)] text-[var(--red-500)] text-[15px] font-semibold rounded-[10px] py-[12px]"
        >
          Выйти из аккаунта
        </button>
      </div>
    </Layout>
  )
}
