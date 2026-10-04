import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card, DataTable, KeyValue, PageHeader, StatusBadge } from '@/components/ui/Data'
import { Alert, EmptyState, QueryState } from '@/components/ui/Feedback'
import { Field, Input, Select, Textarea } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Overlay'
import { useToast } from '@/components/ui/Toast'
import { api, ApiError } from '@/services/api'
import type { Plan, Signup } from '@/services/types'
import { dateTime, money, titleCase } from '@/utils/format'

export function usePlans() {
  return useQuery({ queryKey: ['platform', 'plans'], queryFn: () => api.get<Plan[]>('/api/v1/platform/plans'), staleTime: 300_000 })
}

const limit = (n?: number) => (n == null ? 'No limit' : n.toLocaleString('en-IN'))

/** Plan catalogue (§0B.14); a business's plan is changed on its page. */
export function PlansPage() {
  const plans = usePlans()
  return (
    <div className="stack">
      <PageHeader title="Plans" subtitle="Limits per plan. Existing data above a lower limit stays; only new items are blocked." />
      <Card padded={false}>
        <QueryState query={plans}>
          {(d) => (
            <DataTable rows={d} rowKey={(p) => p.code} columns={[
              { key: 'n', header: 'Plan', render: (p) => <div><strong>{p.name}</strong><div className="xs muted">{p.description}</div></div> },
              { key: 'p', header: 'Price / month', align: 'right', render: (p) => (p.priceMonthly != null ? money(p.priceMonthly) : 'Custom') },
              { key: 's', header: 'Staff', align: 'right', render: (p) => limit(p.maxStaff) },
              { key: 'pr', header: 'Products', align: 'right', render: (p) => limit(p.maxProducts) },
              { key: 'c', header: 'Customers', align: 'right', priority: 'low', render: (p) => limit(p.maxCustomers) },
              { key: 'i', header: 'Invoices / month', align: 'right', priority: 'low', render: (p) => limit(p.maxInvoicesPerMonth) },
              { key: 'b', header: 'Branches', align: 'right', priority: 'low', render: (p) => limit(p.maxBranches) },
              { key: 'st', header: 'Storage', align: 'right', priority: 'low', render: (p) => (p.maxStorageMb == null ? 'No limit' : `${p.maxStorageMb} MB`) },
            ]} />
          )}
        </QueryState>
      </Card>
    </div>
  )
}

/** Businesses that asked for an account through the public sign-up page. */
export function SignupsPage() {
  const [status, setStatus] = useState('PENDING')
  const [open, setOpen] = useState<Signup | null>(null)
  const q = useQuery({ queryKey: ['platform', 'signups', status], queryFn: () => api.get<Signup[]>('/api/v1/platform/signups', { status: status || undefined }) })
  return (
    <div className="stack">
      <PageHeader title="Sign-up requests" subtitle="Approve to create the business and its owner login; the owner signs in with the verified number" />
      <Card padded={false}>
        <div className="toolbar">
          <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 180 }}
            options={[{ value: 'PENDING', label: 'Pending' }, { value: 'APPROVED', label: 'Approved' }, { value: 'REJECTED', label: 'Rejected' }, { value: '', label: 'All' }]} />
        </div>
        <QueryState query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No sign-up requests" />}>
          {(d) => (
            <DataTable rows={d} rowKey={(s) => s.id} onRowClick={setOpen} columns={[
              { key: 'n', header: 'Business', render: (s) => <div><strong>{s.businessName}</strong><div className="xs muted">{titleCase(s.industry)} · {s.city ? `${s.city}, ` : ''}{s.state}</div></div> },
              { key: 'o', header: 'Owner', render: (s) => <div>{s.ownerName}<div className="xs muted">{s.ownerMobile}</div></div> },
              { key: 'p', header: 'Plan', priority: 'low', render: (s) => titleCase(s.planCode) },
              { key: 'd', header: 'Received', priority: 'low', render: (s) => dateTime(s.createdAt) },
              { key: 's', header: 'Status', render: (s) => <StatusBadge status={s.status} /> },
            ]} />
          )}
        </QueryState>
      </Card>
      {open && <SignupDialog signup={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function SignupDialog({ signup, onClose }: { signup: Signup; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const plans = usePlans()
  const [planCode, setPlanCode] = useState(signup.planCode)
  const [tenantCode, setTenantCode] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const m = useMutation({
    mutationFn: (action: 'approve' | 'reject') => api.post<Signup>(`/api/v1/platform/signups/${signup.id}/${action}`,
      action === 'approve' ? { planCode, tenantCode: tenantCode || undefined } : { reason }),
    onSuccess: (s) => {
      toast.success(s.status === 'APPROVED' ? 'Business created' : 'Request rejected', s.status === 'APPROVED' ? `Code ${s.tenantCode}` : undefined)
      qc.invalidateQueries({ queryKey: ['platform'] })
      onClose()
    },
  })
  const err = m.error instanceof ApiError ? m.error : null
  const pending = signup.status === 'PENDING'
  return (
    <Modal open onClose={onClose} wide title={signup.businessName}
      footer={pending ? (rejecting
        ? <><Button variant="secondary" onClick={() => setRejecting(false)}>Back</Button><Button variant="danger" icon={<X size={16} />} loading={m.isPending} disabled={reason.trim().length < 5} onClick={() => m.mutate('reject')}>Reject</Button></>
        : <><Button variant="ghost" onClick={() => setRejecting(true)}>Reject…</Button><Button icon={<Check size={16} />} loading={m.isPending} onClick={() => m.mutate('approve')}>Approve & create business</Button></>)
        : <Button variant="secondary" onClick={onClose}>Close</Button>}>
      <div className="stack">
        <KeyValue items={[['Owner', `${signup.ownerName} · ${signup.ownerMobile} (verified by OTP)`], ['Legal name', signup.legalName], ['Email', signup.email],
          ['Address', [signup.city, signup.state].filter(Boolean).join(', ')], ['GSTIN', signup.gstin ?? 'Not given'], ['Trade', titleCase(signup.industry)],
          ['Plan asked for', titleCase(signup.planCode)], ['Message', signup.message], ['Received', dateTime(signup.createdAt)],
          ['Business', signup.businessId ? <Link key="b" to={`/platform/tenants/${signup.businessId}`}>{signup.tenantCode}</Link> : undefined],
          ['Reason', signup.decisionReason]]} />
        {pending && !rejecting && (
          <div className="form-grid">
            <Field label="Plan" htmlFor="sg-plan"><Select id="sg-plan" value={planCode} onChange={(e) => setPlanCode(e.target.value)} options={(plans.data ?? []).map((p) => ({ value: p.code, label: p.name }))} /></Field>
            <Field label="Join-link code" htmlFor="sg-code" hint="Optional; made from the name if empty">
              <Input id="sg-code" value={tenantCode} onChange={(e) => setTenantCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} maxLength={40} />
            </Field>
          </div>
        )}
        {pending && rejecting && <Field label="Reason (shown in the audit log)" htmlFor="sg-reason" required><Textarea id="sg-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}
        {err && <Alert tone="danger">{err.message}</Alert>}
      </div>
    </Modal>
  )
}

/** Plan and custom domain of one business (tenant page). */
export function TenantPlanCard<T extends { id: string; planCode: string; planName: string; customDomain?: string }>({ tenant, onChanged }: { tenant: T; onChanged: (t: T) => void }) {
  const toast = useToast()
  const plans = usePlans()
  const [plan, setPlan] = useState(tenant.planCode)
  const [domain, setDomain] = useState(tenant.customDomain ?? '')
  const savePlan = useMutation({
    mutationFn: () => api.put<T>(`/api/v1/platform/tenants/${tenant.id}/plan`, { planCode: plan }),
    onSuccess: (t) => { toast.success('Plan changed'); onChanged(t) },
    onError: (e) => toast.error(e),
  })
  const saveDomain = useMutation({
    mutationFn: () => api.put<T>(`/api/v1/platform/tenants/${tenant.id}/domain`, { domain: domain.trim().toLowerCase() }),
    onSuccess: (t) => { toast.success(t.customDomain ? 'Domain saved' : 'Domain removed'); onChanged(t) },
    onError: (e) => toast.error(e),
  })
  return (
    <Card title="Plan & domain">
      <div className="stack">
        <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
          <Field label="Plan" htmlFor="tp-plan"><Select id="tp-plan" value={plan} onChange={(e) => setPlan(e.target.value)} style={{ minWidth: 160 }} options={(plans.data ?? []).map((p) => ({ value: p.code, label: p.name }))} /></Field>
          <Button size="sm" disabled={plan === tenant.planCode} loading={savePlan.isPending} onClick={() => savePlan.mutate()}>Change plan</Button>
        </div>
        <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
          <Field label="Custom domain" htmlFor="tp-domain" hint="Point the domain's DNS at ShopFlow; sign-in there goes straight to this business">
            <Input id="tp-domain" value={domain} placeholder="shop.example.com" onChange={(e) => setDomain(e.target.value)} />
          </Field>
          <Button size="sm" variant="secondary" disabled={domain.trim().toLowerCase() === (tenant.customDomain ?? '')} loading={saveDomain.isPending} onClick={() => saveDomain.mutate()}>Save</Button>
        </div>
      </div>
    </Card>
  )
}
