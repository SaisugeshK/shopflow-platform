import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { PermissionDenied, Spinner } from '@/components/ui/Feedback'
import { useAuthStore } from '@/stores/auth'
import { homeFor, useBootstrapSession } from './useSession'

/** Waits for session restore, then requires a signed-in user of the given kind. UI checks mirror, never replace, server authorization. */
export function RequireAuth({ kind, children }: { kind: 'staff' | 'customer' | 'any'; children: ReactNode }) {
  const initialized = useBootstrapSession()
  const user = useAuthStore((s) => s.user)
  const location = useLocation()
  if (!initialized) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><Spinner size={28} label="Restoring session" /></div>
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (kind === 'staff' && user.role === 'CUSTOMER') return <Navigate to={homeFor(user.role, user.customer?.status)} replace />
  if (kind === 'customer') {
    if (user.role !== 'CUSTOMER') return <Navigate to="/app" replace />
    if (user.customer?.status !== 'APPROVED') return <Navigate to="/registration-status" replace />
  }
  return <>{children}</>
}

export function RequirePermission({ anyOf, children }: { anyOf: string[]; children: ReactNode }) {
  const perms = useAuthStore((s) => s.user?.permissions ?? [])
  if (!anyOf.some((p) => perms.includes(p))) return <PermissionDenied />
  return <>{children}</>
}

export function PublicOnly({ children }: { children: ReactNode }) {
  const initialized = useBootstrapSession()
  const user = useAuthStore((s) => s.user)
  if (!initialized) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><Spinner size={28} /></div>
  if (user) return <Navigate to={homeFor(user.role, user.customer?.status)} replace />
  return <>{children}</>
}
