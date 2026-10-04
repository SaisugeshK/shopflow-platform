import { create } from 'zustand'
import type { BusinessInfo, Me } from '@/services/api'

/** Session state. The access token lives in memory; the refresh token is in the secure store (see tokenStorage). */
interface AuthState {
  accessToken: string | null
  user: Me | null
  initialized: boolean
  /** Single-use token for completing customer registration, and the business it registers with; memory only. */
  registration: { token: string; mobile: string; business?: BusinessInfo } | null
  setRegistration: (r: { token: string; mobile: string; business?: BusinessInfo } | null) => void
  setSession: (token: string, user: Me) => void
  setUser: (user: Me) => void
  clear: () => void
  markInitialized: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  initialized: false,
  registration: null,
  setRegistration: (registration) => set({ registration }),
  setSession: (accessToken, user) => set({ accessToken, user }),
  setUser: (user) => set({ user }),
  clear: () => set({ accessToken: null, user: null }),
  markInitialized: () => set({ initialized: true }),
}))

export function useCan(permission: string): boolean {
  return useAuthStore((s) => s.user?.permissions.includes(permission) ?? false)
}

export function useCanAny(permissions: string[]): boolean {
  return useAuthStore((s) => permissions.some((p) => s.user?.permissions.includes(p) ?? false))
}

/** Whether the business has a module switched on (§0B.6). The server enforces the same rule. */
export function useModule(code: string): boolean {
  return useAuthStore((s) => s.user?.modules?.includes(code) ?? false)
}
