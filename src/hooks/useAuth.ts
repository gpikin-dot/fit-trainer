import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { logError, isNetworkError } from '../lib/logError'
import type { Profile } from '../types/database'
import type { User } from '@supabase/supabase-js'

// 'missing' — auth-пользователь есть, а строки в profiles нет (битый аккаунт)
// 'failed'  — профиль не удалось прочитать (сеть, RLS, прочее)
export type ProfileError = 'missing' | 'failed' | null

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileError, setProfileError] = useState<ProfileError>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
        setProfileError(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (error) {
      // PGRST116 — ноль строк при .single(): профиля нет
      if (error.code === 'PGRST116') {
        setProfileError('missing')
        logError('auth.profile-missing', error, { userId })
      } else {
        setProfileError('failed')
        if (!isNetworkError(error)) logError('auth.profile-fetch', error, { userId })
      }
    } else {
      setProfileError(null)
    }
    setProfile(data)
    setLoading(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return { user, profile, profileError, loading, signOut, refetchProfile: () => user && fetchProfile(user.id) }
}
