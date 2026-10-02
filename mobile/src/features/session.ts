import { useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useEffect } from 'react'
import { logout, refreshSession } from '@/services/api'
import { useAuthStore } from '@/store/auth'

/** Restores the session from the refresh token in secure storage on app start. */
export function useBootstrapSession() {
  const initialized = useAuthStore((s) => s.initialized)
  useEffect(() => {
    if (initialized) return
    refreshSession().finally(() => useAuthStore.getState().markInitialized())
  }, [initialized])
  return initialized
}

export function homeFor(role: string | undefined, customerStatus?: string): '/shop' | '/admin' | '/registration-status' | '/login' {
  if (!role) return '/login'
  if (role === 'CUSTOMER') return customerStatus === 'APPROVED' ? '/shop' : '/registration-status'
  return '/admin'
}

export function useSignOut() {
  const qc = useQueryClient()
  return async () => {
    await logout()
    qc.clear()
    router.replace('/login')
  }
}
