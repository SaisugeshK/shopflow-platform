import { useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useEffect } from 'react'
import { logout, refreshSession } from '@/services/api'
import { useAuthStore } from '@/store/auth'
import { useBranchStore } from '@/store/branch'

/** Restores the session from the refresh token in secure storage on app start. */
export function useBootstrapSession() {
  const initialized = useAuthStore((s) => s.initialized)
  useEffect(() => {
    if (initialized) return
    refreshSession().finally(() => useAuthStore.getState().markInitialized())
  }, [initialized])
  return initialized
}

export function homeFor(role: string | undefined, customerStatus?: string): '/shop' | '/admin' | '/registration-status' | '/login' | '/platform' | '/supplier' {
  if (!role) return '/login'
  if (role === 'CUSTOMER') return customerStatus === 'APPROVED' ? '/shop' : '/registration-status'
  // The Super Admin console is web-first (§0B.5): the app explains that and offers the other businesses.
  if (role === 'SUPER_ADMIN') return '/platform'
  if (role === 'SUPPLIER') return '/supplier'
  return '/admin'
}

export function useSignOut() {
  const qc = useQueryClient()
  return async () => {
    await logout()
    useBranchStore.getState().choose(null)
    qc.clear()
    router.replace('/login')
  }
}
