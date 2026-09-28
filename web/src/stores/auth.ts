import { create } from 'zustand'
import type { Me } from '@/services/api'

/**
 * Session state. The access token lives only in memory; the refresh token is an HttpOnly cookie the page cannot read,
 * so a reload restores the session through /auth/refresh.
 */
interface AuthState {
  accessToken: string | null
  user: Me | null
  initialized: boolean
  /** Single-use token for completing customer registration; memory only. */
  registration: { token: string; mobile: string } | null
  setRegistration: (r: { token: string; mobile: string } | null) => void
  setSession: (token: string, user: Me) => void
  setUser: (user: Me) => void
  clear: () => void
  markInitialized: () => void
  can: (permission: string) => boolean
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  user: null,
  initialized: false,
  registration: null,
  setRegistration: (registration) => set({ registration }),
  setSession: (accessToken, user) => set({ accessToken, user }),
  setUser: (user) => set({ user }),
  clear: () => set({ accessToken: null, user: null }),
  markInitialized: () => set({ initialized: true }),
  can: (permission) => get().user?.permissions.includes(permission) ?? false,
}))

export function useCan(permission: string): boolean {
  return useAuthStore((s) => s.user?.permissions.includes(permission) ?? false)
}
