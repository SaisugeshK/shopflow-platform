import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { Button } from '@/components/ui/Button'
import { Card, KeyValue, ListRow, StatCard, StatusBadge } from '@/components/ui/Data'
import { Alert, EmptyState, QueryState } from '@/components/ui/Feedback'
import { ChipGroup, Field, Input, SearchBar, Select, SwitchRow } from '@/components/ui/Form'
import { ConfirmDialog, Sheet } from '@/components/ui/Overlay'
import { Screen } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { toast } from '@/components/ui/Toast'
import { BusinessSwitcher } from '@/components/ui/TenantPicker'
import { useSignOut } from '@/features/session'
import { api, ApiError } from '@/services/api'
import type { Plan, Signup } from '@/services/types'
import { useAuthStore } from '@/store/auth'
import { dateTime, money, titleCase } from '@/utils/format'

interface TenantSummary { id: string; tenantCode: string; name: string; industryLabel: string; status: string; city?: string; customers: number; planCode: string }
interface ModuleState { code: string; label: string; enabled: boolean; requires: string[] }
interface TenantDetail {
  id: string; tenantCode: string; name: string; industryLabel: string; status: 'ACTIVE' | 'SUSPENDED'; statusReason?: string
  ownerName?: string; ownerMobile?: string; city?: string; state?: string; gstin?: string; createdAt: string; planCode: string; planName: string; customDomain?: string
  usage: { users: number; customers: number; products: number; invoices: number; salesLast30Days: number; lastActivityAt?: string }
  modules: ModuleState[]
}
interface Overview { tenants: number; activeTenants: number; suspendedTenants: number; users: number; salesLast30Days: number }

function usePlans() {
  return useQuery({ queryKey: ['platform', 'plans'], queryFn: () => api.get<Plan[]>('/api/v1/platform/plans'), staleTime: 300_000 })
}

/** Super Admin home on the app: totals, businesses and pending sign-ups. */
export function PlatformHomeScreen() {
  const user = useAuthStore((s) => s.user)!
  const signOut = useSignOut()
  const [q, setQ] = useState('')
  const overview = useQuery({ queryKey: ['platform', 'overview'], queryFn: () => api.get<Overview>('/api/v1/platform/overview') })
  const tenants = useQuery({ queryKey: ['platform', 'tenants', q], queryFn: () => api.get<TenantSummary[]>('/api/v1/platform/tenants', { q: q || undefined }) })
  const pending = useQuery({ queryKey: ['platform', 'signups', 'PENDING'], queryFn: () => api.get<Signup[]>('/api/v1/platform/signups', { status: 'PENDING' }) })
  return (
    <Screen onRefresh={() => { overview.refetch(); tenants.refetch(); pending.refetch() }} refreshing={tenants.isRefetching}>
      <Text variant="small" color="muted">Signed in as {user.fullName} · Super Admin</Text>
      {overview.data && (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><StatCard label="Businesses" value={overview.data.tenants} isMoney={false} compact hint={`${overview.data.suspendedTenants} suspended`} /></View>
          <View style={{ flex: 1 }}><StatCard label="Sales, 30 days" value={overview.data.salesLast30Days} tone="success" compact /></View>
        </View>
      )}
      {(pending.data?.length ?? 0) > 0 && (
        <Card onPress={() => router.push('/platform/signups')} accessibilityLabel="Sign-up requests">
          <Text weight="700">{pending.data!.length} sign-up request{pending.data!.length === 1 ? '' : 's'} waiting</Text>
          <Text variant="small" color="muted">Tap to review</Text>
        </Card>
      )}
      <SearchBar value={q} onChangeText={setQ} placeholder="Business, code, owner or city" />
      <QueryState query={tenants} isEmpty={(d) => d.length === 0} empty={<EmptyState icon="briefcase" title="No businesses match" />}>
        {(d) => (
          <Card padded={false}>
            {d.map((t) => (
              <ListRow key={t.id} title={t.name} subtitle={`${t.industryLabel} · ${titleCase(t.planCode)}${t.city ? ` · ${t.city}` : ''}`}
                meta={<View style={{ marginTop: 4, flexDirection: 'row' }}><StatusBadge status={t.status} /></View>}
                right={<Text variant="small" color="muted">{t.customers} customers</Text>} onPress={() => router.push(`/platform/tenant/${t.id}`)} />
            ))}
          </Card>
        )}
      </QueryState>
      <Button variant="secondary" icon="inbox" onPress={() => router.push('/platform/signups')}>All sign-up requests</Button>
      <BusinessSwitcher />
      <Button variant="ghost" icon="log-out" onPress={signOut}>Sign out</Button>
    </Screen>
  )
}

/** One business: usage, status, plan and modules. */
export function PlatformTenantScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const qc = useQueryClient()
  const plans = usePlans()
  const [confirm, setConfirm] = useState(false)
  const q = useQuery({ queryKey: ['platform', 'tenant', id], queryFn: () => api.get<TenantDetail>(`/api/v1/platform/tenants/${id}`) })
  const done = (t: TenantDetail, msg: string) => { toast.success(msg); setConfirm(false); qc.setQueryData(['platform', 'tenant', id], t); qc.invalidateQueries({ queryKey: ['platform', 'tenants'] }) }
  const status = useMutation({
    mutationFn: (reason: string) => api.post<TenantDetail>(`/api/v1/platform/tenants/${id}/${q.data?.status === 'ACTIVE' ? 'suspend' : 'reactivate'}`, { reason }),
    onSuccess: (t) => done(t, t.status === 'ACTIVE' ? 'Business reactivated' : 'Business suspended'),
    onError: (e) => toast.error(e),
  })
  const plan = useMutation({
    mutationFn: (planCode: string) => api.put<TenantDetail>(`/api/v1/platform/tenants/${id}/plan`, { planCode }),
    onSuccess: (t) => done(t, `Plan changed to ${t.planName}`),
    onError: (e) => toast.error(e),
  })
  const modules = useMutation({
    mutationFn: (change: Record<string, boolean>) => api.put<ModuleState[]>(`/api/v1/platform/tenants/${id}/modules`, { modules: change }),
    onSuccess: (m) => { qc.setQueryData<TenantDetail>(['platform', 'tenant', id], (t) => (t ? { ...t, modules: m } : t)); toast.success('Modules updated') },
    onError: (e) => toast.error(e),
  })
  return (
    <>
      <Stack.Screen options={{ title: q.data?.name ?? 'Business' }} />
      <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}
        footer={q.data ? <Button block variant={q.data.status === 'ACTIVE' ? 'danger' : 'primary'} onPress={() => setConfirm(true)}>{q.data.status === 'ACTIVE' ? 'Suspend business' : 'Reactivate business'}</Button> : undefined}>
        <QueryState query={q}>
          {(t) => (
            <>
              <View style={{ gap: 6 }}>
                <Text variant="small" color="muted">{t.industryLabel} · code {t.tenantCode}</Text>
                <View style={{ flexDirection: 'row' }}><StatusBadge status={t.status} /></View>
              </View>
              {t.status === 'SUSPENDED' && <Alert tone="danger" title="Suspended">{t.statusReason ?? 'Nobody can sign in.'}</Alert>}
              <Card title="Usage">
                <KeyValue items={[['Users', String(t.usage.users)], ['Customers', String(t.usage.customers)], ['Products', String(t.usage.products)],
                  ['Invoices', String(t.usage.invoices)], ['Sales, 30 days', money(t.usage.salesLast30Days)], ['Last activity', t.usage.lastActivityAt ? dateTime(t.usage.lastActivityAt) : 'None']]} />
              </Card>
              <Card title="Plan">
                <Select label="Plan" value={t.planCode} onChange={(v) => v !== t.planCode && plan.mutate(v)} options={(plans.data ?? []).map((p) => ({ value: p.code, label: p.name }))} />
                {t.customDomain && <Text variant="xs" color="muted" style={{ marginTop: 6 }}>Custom domain: {t.customDomain}</Text>}
              </Card>
              <Card title="Owner">
                <KeyValue items={[['Name', t.ownerName], ['Mobile', t.ownerMobile], ['GSTIN', t.gstin], ['Place', [t.city, t.state].filter(Boolean).join(', ')]]} />
              </Card>
              <Card title="Modules">
                {t.modules.map((m) => (
                  <SwitchRow key={m.code} label={m.label} hint={m.requires.length ? `Needs ${m.requires.map(titleCase).join(', ')}` : undefined}
                    value={m.enabled} disabled={modules.isPending || t.status !== 'ACTIVE'} onChange={(on) => modules.mutate({ [m.code]: on })} />
                ))}
              </Card>
            </>
          )}
        </QueryState>
        <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} requireReason tone={q.data?.status === 'ACTIVE' ? 'danger' : 'primary'} loading={status.isPending}
          title={q.data?.status === 'ACTIVE' ? 'Suspend this business?' : 'Reactivate this business?'}
          message={q.data?.status === 'ACTIVE' ? 'Everyone in it is signed out at once. No data is deleted.' : 'Its users can sign in again.'}
          confirmLabel={q.data?.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'} onConfirm={(reason) => status.mutate(reason ?? '')} />
      </Screen>
    </>
  )
}

/** Sign-up requests: approve (creates the business) or reject. */
export function PlatformSignupsScreen() {
  const [status, setStatus] = useState('PENDING')
  const [open, setOpen] = useState<Signup | null>(null)
  const q = useQuery({ queryKey: ['platform', 'signups', status], queryFn: () => api.get<Signup[]>('/api/v1/platform/signups', { status: status || undefined }) })
  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <ChipGroup value={status} onChange={setStatus} options={[{ value: 'PENDING', label: 'Pending' }, { value: 'APPROVED', label: 'Approved' }, { value: 'REJECTED', label: 'Rejected' }]} />
      <QueryState query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState icon="inbox" title="No sign-up requests" />}>
        {(d) => (
          <Card padded={false}>
            {d.map((s) => (
              <ListRow key={s.id} title={s.businessName} subtitle={`${s.ownerName} · ${s.ownerMobile} · ${titleCase(s.industry)}`}
                meta={<View style={{ marginTop: 4, flexDirection: 'row' }}><StatusBadge status={s.status} /></View>} onPress={() => setOpen(s)} />
            ))}
          </Card>
        )}
      </QueryState>
      {open && <SignupSheet signup={open} onClose={() => setOpen(null)} />}
    </Screen>
  )
}

function SignupSheet({ signup, onClose }: { signup: Signup; onClose: () => void }) {
  const qc = useQueryClient()
  const plans = usePlans()
  const [planCode, setPlanCode] = useState(signup.planCode)
  const [reason, setReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const m = useMutation({
    mutationFn: (action: 'approve' | 'reject') => api.post<Signup>(`/api/v1/platform/signups/${signup.id}/${action}`, action === 'approve' ? { planCode } : { reason }),
    onSuccess: (s) => { toast.success(s.status === 'APPROVED' ? 'Business created' : 'Request rejected', s.tenantCode); qc.invalidateQueries({ queryKey: ['platform'] }); onClose() },
  })
  const err = m.error instanceof ApiError ? m.error : null
  const pending = signup.status === 'PENDING'
  return (
    <Sheet open onClose={onClose} title={signup.businessName}
      footer={pending ? (rejecting
        ? <Button block variant="danger" loading={m.isPending} disabled={reason.trim().length < 5} onPress={() => m.mutate('reject')}>Reject request</Button>
        : <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button variant="ghost" onPress={() => setRejecting(true)}>Reject…</Button>
          <Button icon="check" style={{ flex: 1 }} loading={m.isPending} onPress={() => m.mutate('approve')}>Approve</Button>
        </View>) : undefined}>
      <KeyValue items={[['Owner', `${signup.ownerName} · ${signup.ownerMobile}`], ['Place', [signup.city, signup.state].filter(Boolean).join(', ')],
        ['Trade', titleCase(signup.industry)], ['GSTIN', signup.gstin], ['Message', signup.message], ['Received', dateTime(signup.createdAt)],
        ['Business code', signup.tenantCode], ['Reason', signup.decisionReason]]} />
      {pending && !rejecting && <Field label="Plan"><Select label="Plan" value={planCode} onChange={setPlanCode} options={(plans.data ?? []).map((p) => ({ value: p.code, label: p.name }))} /></Field>}
      {pending && rejecting && <Field label="Reason" required><Input value={reason} onChangeText={setReason} multiline accessibilityLabel="Reason" /></Field>}
      {err && <Alert tone="danger">{err.message}</Alert>}
    </Sheet>
  )
}
