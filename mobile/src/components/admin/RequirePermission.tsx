import type { ReactNode } from 'react'
import { EmptyState } from '@/components/ui/Feedback'
import { useAuthStore } from '@/store/auth'

/** Hides a screen the user may not open (the API rejects the calls anyway). */
export function RequirePermission({ anyOf, children }: { anyOf: string[]; children: ReactNode }) {
  const allowed = useAuthStore((s) => anyOf.some((p) => s.user?.permissions.includes(p) ?? false))
  if (!allowed) return <EmptyState icon="lock" title="No access" description="Your account does not have permission to open this screen. Ask the owner if you need it." />
  return <>{children}</>
}
