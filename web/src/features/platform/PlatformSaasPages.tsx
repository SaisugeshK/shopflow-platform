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
import type { Signup } from '@/services/types'
import { dateTime, titleCase } from '@/utils/format'

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
  const [tenantCode, setTenantCode] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const m = useMutation({
    mutationFn: (action: 'approve' | 'reject') => api.post<Signup>(`/api/v1/platform/signups/${signup.id}/${action}`,
      action === 'approve' ? { tenantCode: tenantCode || undefined } : { reason }),
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
          ['Message', signup.message], ['Received', dateTime(signup.createdAt)],
          ['Business', signup.businessId ? <Link key="b" to={`/platform/tenants/${signup.businessId}`}>{signup.tenantCode}</Link> : undefined],
          ['Reason', signup.decisionReason]]} />
        {pending && !rejecting && (
          <div className="form-grid">
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

/** Custom domain of one business (tenant page). */
export function TenantDomainCard<T extends { id: string; customDomain?: string }>({ tenant, onChanged }: { tenant: T; onChanged: (t: T) => void }) {
  const toast = useToast()
  const [domain, setDomain] = useState(tenant.customDomain ?? '')
  const save = useMutation({
    mutationFn: () => api.put<T>(`/api/v1/platform/tenants/${tenant.id}/domain`, { domain: domain.trim().toLowerCase() }),
    onSuccess: (t) => { toast.success(t.customDomain ? 'Domain saved' : 'Domain removed'); onChanged(t) },
    onError: (e) => toast.error(e),
  })
  return (
    <Card title="Custom domain">
      <div className="row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Field label="Domain" htmlFor="tp-domain" hint="Point the domain's DNS at ShopFlow; sign-in there goes straight to this business">
          <Input id="tp-domain" value={domain} placeholder="shop.example.com" onChange={(e) => setDomain(e.target.value)} />
        </Field>
        <Button size="sm" variant="secondary" disabled={domain.trim().toLowerCase() === (tenant.customDomain ?? '')} loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
      </div>
    </Card>
  )
}
