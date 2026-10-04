import { useQuery } from '@tanstack/react-query'
import { Link, Navigate, useParams } from 'react-router-dom'
import { EmptyState, Spinner } from '@/components/ui/Feedback'
import { api } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { LoginPage } from './LoginPage'
import { homeFor, useBootstrapSession } from './useSession'

interface PublicTenant {
  id: string
  tenantCode: string
  name: string
  logoUrl?: string
  city?: string
  active: boolean
}

/** Join link /join/{code} (§0B.4): sign in to, or register as a customer of, that business. */
export function JoinPage() {
  const { code = '' } = useParams()
  const initialized = useBootstrapSession()
  const user = useAuthStore((s) => s.user)
  const q = useQuery({ queryKey: ['public-tenant', code], queryFn: () => api.get<PublicTenant>(`/api/v1/public/tenants/${encodeURIComponent(code)}`), retry: false })

  if (!initialized || q.isLoading) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><Spinner size={28} /></div>
  }
  // Already signed in to this business: go straight in.
  if (user && q.data && user.business?.id === q.data.id) return <Navigate to={homeFor(user.role, user.customer?.status)} replace />
  if (q.isError || !q.data || !q.data.active) {
    return (
      <div className="auth-panel" style={{ minHeight: '100vh' }}>
        <div className="card" style={{ width: 'min(460px, 100%)' }}>
          <div className="card-body">
            <EmptyState title={q.data && !q.data.active ? 'This shop is not available' : 'Link not found'}
              description={q.data && !q.data.active ? 'This business is currently not accepting sign-ins. Please contact the shop.'
                : 'Check the link your shop shared with you, or sign in with your mobile number.'}
              action={<Link to="/login" className="btn btn-primary">Go to sign in</Link>} />
          </div>
        </div>
      </div>
    )
  }
  return <LoginPage join={{ tenantCode: q.data.tenantCode, name: q.data.name, logoUrl: q.data.logoUrl, city: q.data.city }} />
}

const APP_HOSTS = /^(localhost|127\.|0\.0\.0\.0|\[::1\])|\.run\.app$/

/**
 * Sign-in page. Opened at a business's own domain (§0B.14) it signs in to, or registers with, that business — the same
 * as its join link; elsewhere it is the general sign-in.
 */
export function DomainLoginPage() {
  const host = window.location.hostname.toLowerCase()
  const custom = !APP_HOSTS.test(host)
  const q = useQuery({
    queryKey: ['public-tenant-host', host], enabled: custom, retry: false, staleTime: 3_600_000,
    queryFn: () => api.get<PublicTenant | null>(`/api/v1/public/tenants/by-host/${encodeURIComponent(host)}`),
  })
  if (custom && q.isLoading) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><Spinner size={28} /></div>
  const t = q.data
  return t && t.active ? <LoginPage join={{ tenantCode: t.tenantCode, name: t.name, logoUrl: t.logoUrl, city: t.city }} /> : <LoginPage />
}
