import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, ChevronRight, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/Data'
import { Spinner } from '@/components/ui/Feedback'
import { useToast } from '@/components/ui/Toast'
import { API_BASE, api } from '@/services/api'
import type { AuthResponse, TenantChoice } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { initials, titleCase } from '@/utils/format'
import { homeFor } from './useSession'

/** Stable key of a choice (the console has no business id). */
export function choiceKey(c: TenantChoice) {
  return c.platform ? 'platform' : c.businessId!
}

function ChoiceLogo({ choice }: { choice: TenantChoice }) {
  const [broken, setBroken] = useState(false)
  if (choice.platform) return <span className="brand-mark tenant-choice-logo" aria-hidden><ShieldCheck size={16} /></span>
  if (choice.logoUrl && !broken) {
    return <img className="brand-logo tenant-choice-logo" src={`${API_BASE}${choice.logoUrl}`} alt="" width={36} height={36} onError={() => setBroken(true)} />
  }
  return <span className="brand-mark tenant-choice-logo" aria-hidden>{initials(choice.name)}</span>
}

/** The list of businesses (and the Super Admin console) a mobile number can enter (§0B.4). */
export function TenantPicker({ choices, current, busyKey, onPick }: {
  choices: TenantChoice[]
  current?: string
  busyKey?: string | null
  onPick: (c: TenantChoice) => void
}) {
  return (
    <ul className="tenant-choices" role="list">
      {choices.map((c) => {
        const key = choiceKey(c)
        const active = key === current
        return (
          <li key={key}>
            <button type="button" className={`tenant-choice${active ? ' active' : ''}`} disabled={active || !!busyKey}
              onClick={() => onPick(c)} aria-current={active ? 'true' : undefined}>
              <ChoiceLogo choice={c} />
              <span className="tenant-choice-text">
                <strong>{c.name}</strong>
                <span className="xs muted">{c.platform ? 'Register businesses, modules and platform admins' : titleCase(c.role)}</span>
              </span>
              {active ? <Badge tone="success">Current</Badge> : busyKey === key ? <Spinner size={16} label="Opening" /> : <ChevronRight size={16} className="muted" />}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** Finishes a sign-in response: session → home, selection → caller shows the picker, registration → register page. */
export function useCompleteSignIn() {
  const navigate = useNavigate()
  return (r: AuthResponse, mobile: string): 'selection' | 'done' => {
    if (r.selectionRequired) return 'selection'
    if (r.registrationRequired) {
      useAuthStore.getState().setRegistration({ token: r.registrationToken!, mobile, business: r.registrationBusiness })
      navigate('/register', { replace: true })
      return 'done'
    }
    useAuthStore.getState().setSession(r.accessToken!, r.user!)
    navigate(homeFor(r.user!.role, r.user!.customer?.status), { replace: true })
    return 'done'
  }
}

/** Switches the signed-in number to another of its businesses (or the console); the old session ends. */
export function useSwitchTenant() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (c: TenantChoice) => api.post<AuthResponse>('/api/v1/auth/switch-tenant', c.platform ? { platform: true } : { businessId: c.businessId }),
    onSuccess: (r) => {
      qc.clear()
      useAuthStore.getState().setSession(r.accessToken!, r.user!)
      navigate(homeFor(r.user!.role, r.user!.customer?.status), { replace: true })
      toast.show('success', r.user!.business ? `Switched to ${r.user!.business.name}` : 'Opened the platform console')
    },
    onError: (e) => toast.error(e),
  })
}

/** Header control: current business + a menu of the others this number belongs to. */
export function BusinessSwitcherList({ onDone }: { onDone?: () => void }) {
  const user = useAuthStore((s) => s.user)
  const switcher = useSwitchTenant()
  const choices = user?.memberships ?? []
  if (choices.length < 2) return null
  const current = user?.role === 'SUPER_ADMIN' ? 'platform' : user?.business?.id
  return (
    <div className="stack-sm">
      <div className="row xs muted" style={{ gap: 6, padding: '4px 4px 0' }}><Building2 size={14} /> Switch business</div>
      <TenantPicker choices={choices} current={current} busyKey={switcher.isPending ? choiceKey(switcher.variables!) : null}
        onPick={(c) => switcher.mutate(c, { onSuccess: () => onDone?.() })} />
    </div>
  )
}
