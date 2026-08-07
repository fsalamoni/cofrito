/**
 * useAdminStatus — verifica se o user é admin ou master admin.
 */
import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { firestore } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'

export type AdminRole = 'admin' | 'master' | null

export function useAdminStatus(): { role: AdminRole; loading: boolean } {
  const { user } = useAuth()
  const [role, setRole] = useState<AdminRole>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setRole(null)
      setLoading(false)
      return
    }
    const ref = doc(firestore, `admins/${user.uid}`)
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as { role?: string; active?: boolean }
          if (data.active === false) {
            setRole(null)
          } else if (data.role === 'master') {
            setRole('master')
          } else if (data.role === 'admin') {
            setRole('admin')
          } else {
            setRole(null)
          }
        } else {
          setRole(null)
        }
        setLoading(false)
      },
      (err) => {
        console.warn('useAdminStatus erro:', err)
        setLoading(false)
      },
    )
    return unsub
  }, [user])

  return { role, loading }
}

export function useIsAdminMaster(): boolean {
  const { role } = useAdminStatus()
  return role === 'master'
}
