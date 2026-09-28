import { useQuery } from '@tanstack/react-query'
import { Ban, Clock, LogIn, RefreshCw, TimerOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Feedback'
import { api, refreshSession } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { useLogout } from './useSession'

interface RegistrationStatus {
  customerCode: string
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'BLOCKED'
  reason?: string
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-panel" style={{ minHeight: '100vh' }}>
      <div className="card" style={{ width: 'min(460px, 100%)' }}>
        <div className="card-body empty-state" style={{ padding: 36 }}>{children}</div>
      </div>
    </div>
  )
}

/** A05 Registration Pending / A06 Account Blocked. Refreshing the session picks up approval. */
export function RegistrationStatusPage() {
  const navigate = useNavigate()
  const logout = useLogout()
  const q = useQuery({ queryKey: ['registration-status'], queryFn: () => api.get<RegistrationStatus>('/api/v1/customer-registration/status'), refetchInterval: 30_000 })
  const recheck = async () => {
    await refreshSession()
    const user = useAuthStore.getState().user
    if (user?.customer?.status === 'APPROVED') navigate('/shop', { replace: true })
    else q.refetch()
  }
  if (q.isLoading) return <Centered><Spinner /></Centered>
  const status = q.data?.status
  if (status === 'APPROVED') {
    return (
      <Centered>
        <div className="icon-wrap tone-success"><LogIn size={26} /></div>
        <h2>Your account is approved</h2>
        <p className="muted small">You can now browse products and place orders.</p>
        <Button onClick={recheck}>Start shopping</Button>
      </Centered>
    )
  }
  if (status === 'BLOCKED' || status === 'REJECTED') {
    return (
      <Centered>
        <div className="icon-wrap tone-danger"><Ban size={26} /></div>
        <h2>{status === 'BLOCKED' ? 'Account blocked' : 'Registration not approved'}</h2>
        <p className="muted small">{q.data?.reason ?? 'Please contact the shop for help.'}</p>
        <Button variant="secondary" onClick={() => logout.mutate()}>Sign out</Button>
      </Centered>
    )
  }
  return (
    <Centered>
      <div className="icon-wrap tone-warning"><Clock size={26} /></div>
      <h2>Registration received</h2>
      <p className="muted small">Customer code <strong>{q.data?.customerCode}</strong>. The shop will review your details; you will be able to order once approved.</p>
      <div className="row">
        <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={recheck}>Check again</Button>
        <Button variant="ghost" onClick={() => logout.mutate()}>Sign out</Button>
      </div>
    </Centered>
  )
}

/** A07 Session Expired. */
export function SessionExpiredPage() {
  const navigate = useNavigate()
  return (
    <Centered>
      <div className="icon-wrap tone-neutral"><TimerOff size={26} /></div>
      <h2>Session expired</h2>
      <p className="muted small">For your security you were signed out. Sign in again to continue.</p>
      <Button onClick={() => navigate('/login')}>Sign in</Button>
    </Centered>
  )
}
