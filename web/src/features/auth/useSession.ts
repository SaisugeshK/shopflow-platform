import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, refreshSession } from '@/services/api'
import { useAuthStore } from '@/stores/auth'

/** On first load, restores the session from the HttpOnly refresh cookie. */
export function useBootstrapSession() {
  const initialized = useAuthStore((s) => s.initialized)
  useEffect(() => {
    if (initialized) return
    refreshSession().finally(() => useAuthStore.getState().markInitialized())
  }, [initialized])
  return initialized
}

export function useLogout() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/api/v1/auth/logout'),
    onSettled: () => {
      useAuthStore.getState().clear()
      qc.clear()
      navigate('/login', { replace: true })
    },
  })
}

export function homeFor(role: string | undefined, customerStatus?: string): string {
  if (role === 'CUSTOMER') return customerStatus === 'APPROVED' ? '/shop' : '/registration-status'
  if (role === 'SUPER_ADMIN') return '/platform'
  if (role === 'SUPPLIER') return '/supplier'
  return '/app'
}
