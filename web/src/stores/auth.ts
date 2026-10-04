import { create } from 'zustand'
import type { BusinessInfo, Me } from '@/services/api'

/**
 * Session state. The access token lives only in memory; the refresh token is an HttpOnly cookie the page cannot read,
 * so a reload restores the session through /auth/refresh.
 */
/** Single-use token for completing customer registration, and the business it registers with. */
interface Registration {
  token: string
  mobile: string
  business?: BusinessInfo
}

interface AuthState {
  accessToken: string | null
  user: Me | null
  initialized: boolean
  /** Memory only. */
  registration: Registration | null
  setRegistration: (r: Registration | null) => void
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

/** Whether the business has a module switched on (§0B.6). The server enforces the same rule. */
export function useModule(code: string): boolean {
  return useAuthStore((s) => s.user?.modules?.includes(code) ?? false)
}
