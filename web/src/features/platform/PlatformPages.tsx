import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Building2, Copy, Eye, Factory, PauseCircle, PlayCircle, Plus, ShieldCheck, UserPlus, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Badge, Card, DataTable, KeyValue, PageHeader, StatCard, StatusBadge } from '@/components/ui/Data'
import { Alert, EmptyState, QueryState } from '@/components/ui/Feedback'
import { Field, Input, SearchInput, Select, Switch, Textarea } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Overlay'
import { PageActions } from '@/components/ui/PageActions'
import { useToast } from '@/components/ui/Toast'
import { api, ApiError } from '@/services/api'
import type { Me } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { date, dateTime, titleCase } from '@/utils/format'
import { GST_STATES, stateCodeOf } from '@/utils/india'
import { TenantDomainCard } from './PlatformSaasPages'

// ---------------------------------------------------------------- types (Super Admin console API, §0B.5)

interface TenantSummary {
  id: string
  tenantCode: string
  name: string
  industry: string
  industryLabel: string
  status: 'ACTIVE' | 'SUSPENDED'
  ownerName?: string
  ownerMobile?: string
  city?: string
  state?: string
  users: number
  customers: number
  products: number
  invoices: number
  lastActivityAt?: string
  createdAt: string
}

interface ModuleState {
  code: string
  label: string
  enabled: boolean
  enabledByDefault: boolean
  requires: string[]
}

interface TenantDetail {
  id: string
  tenantCode: string
  name: string
  legalName?: string
  industry: string
  industryLabel: string
  status: 'ACTIVE' | 'SUSPENDED'
  statusReason?: string
  ownerName?: string
  ownerMobile?: string
  gstin?: string
  addressLine1?: string
  city?: string
  state?: string
  stateCode?: string
  email?: string
  createdAt: string
  usage: {
    users: number
    staff: number
    customers: number
    suppliers: number
    products: number
    orders: number
    invoices: number
    salesLast30Days: number
    storageBytes: number
    lastActivityAt?: string
  }
  modules: ModuleState[]
  owners: { userId: string; fullName: string; mobileNumber: string; email?: string; status: string; lastLoginAt?: string }[]
  joinPath: string
  customDomain?: string
}

interface IndustryOption {
  code: string
  label: string
  description: string
  modules: string[]
  units: string[]
  categories: string[]
}

interface PlatformAdmin {
  id: string
  fullName: string
  mobileNumber: string
  status: 'ACTIVE' | 'INACTIVE'
  lastLoginAt?: string
  createdAt: string
}

interface AuditEntry {
  id: string
  businessId?: string
  businessName?: string
  action: string
  entityType: string
  entityId?: string
  actorRole?: string
  actorName?: string
  newValue?: string
  createdAt: string
}

interface Overview {
  tenants: number
  activeTenants: number
  suspendedTenants: number
  users: number
  invoicesLast30Days: number
  salesLast30Days: number
  tenantsByIndustry: Record<string, number>
  newestTenants: TenantSummary[]
}

const count = (n: number) => String(Math.round(n))

function useIndustries() {
  return useQuery({ queryKey: ['platform', 'industries'], queryFn: () => api.get<IndustryOption[]>('/api/v1/platform/industries'), staleTime: 3_600_000 })
}

function joinUrl(path: string) {
  return `${window.location.origin}${path}`
}

// ---------------------------------------------------------------- overview

export function PlatformOverviewPage() {
  const navigate = useNavigate()
  const q = useQuery({ queryKey: ['platform', 'overview'], queryFn: () => api.get<Overview>('/api/v1/platform/overview') })
  const industries = useIndustries()
  const label = (code: string) => industries.data?.find((i) => i.code === code)?.label ?? titleCase(code)
  return (
    <div className="stack">
      <PageHeader title="Platform overview" subtitle="Every business on ShopFlow"
        actions={<Button icon={<Plus size={16} />} onClick={() => navigate('/platform/tenants/new')}>Register business</Button>} />
      <QueryState query={q}>
        {(o) => (
          <>
            <div className="kpi-grid">
              <StatCard index={0} label="Businesses" value={o.tenants} format={count} icon={<Building2 size={18} />} hint={`${o.activeTenants} active · ${o.suspendedTenants} suspended`} />
              <StatCard index={1} label="Users (all businesses)" value={o.users} format={count} tone="accent" icon={<Users size={18} />} />
              <StatCard index={2} label="Invoices, last 30 days" value={o.invoicesLast30Days} format={count} tone="purple" icon={<Factory size={18} />} />
              <StatCard index={3} label="Sales, last 30 days" value={o.salesLast30Days} tone="success" icon={<ShieldCheck size={18} />} />
            </div>
            <div className="grid-2">
              <Card title="Businesses by industry" padded={false}>
                <DataTable rows={Object.entries(o.tenantsByIndustry).map(([k, v]) => ({ k, v }))} rowKey={(r) => r.k}
                  onRowClick={(r) => navigate(`/platform/tenants?industry=${r.k}`)}
                  columns={[
                    { key: 'i', header: 'Industry', render: (r) => label(r.k) },
                    { key: 'n', header: 'Businesses', align: 'right', render: (r) => r.v },
                  ]} />
              </Card>
              <Card title="Newest businesses" padded={false} actions={<Link to="/platform/tenants" className="small">View all</Link>}>
                <DataTable rows={o.newestTenants} rowKey={(t) => t.id} onRowClick={(t) => navigate(`/platform/tenants/${t.id}`)}
                  columns={[
                    { key: 'n', header: 'Business', render: (t) => <strong>{t.name}</strong> },
                    { key: 'i', header: 'Industry', render: (t) => t.industryLabel },
                    { key: 'c', header: 'Registered', render: (t) => date(t.createdAt) },
                  ]} />
              </Card>
            </div>
          </>
        )}
      </QueryState>
    </div>
  )
}

// ---------------------------------------------------------------- tenants list

export function TenantsPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const status = params.get('status') ?? ''
  const industry = params.get('industry') ?? ''
  const industries = useIndustries()
  const list = useQuery({
    queryKey: ['platform', 'tenants', q, status, industry],
    queryFn: () => api.get<TenantSummary[]>('/api/v1/platform/tenants', { q, status, industry }),
  })
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  return (
    <div className="stack">
      <PageHeader title="Businesses" subtitle="Tenants registered on the platform"
        actions={<Button icon={<Plus size={16} />} onClick={() => navigate('/platform/tenants/new')}>Register business</Button>} />
      <Card padded={false}>
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Name, code, owner, mobile or city" />
          <Select aria-label="Status" value={status} onChange={(e) => setParam('status', e.target.value)}
            options={[{ value: '', label: 'All statuses' }, { value: 'ACTIVE', label: 'Active' }, { value: 'SUSPENDED', label: 'Suspended' }]} />
          <Select aria-label="Industry" value={industry} onChange={(e) => setParam('industry', e.target.value)}
            options={[{ value: '', label: 'All industries' }, ...(industries.data ?? []).map((i) => ({ value: i.code, label: i.label }))]} />
        </div>
        <QueryState query={list} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No businesses match" />}>
          {(rows) => (
            <DataTable rows={rows} rowKey={(t) => t.id} onRowClick={(t) => navigate(`/platform/tenants/${t.id}`)} caption="Businesses" columns={[
              { key: 'n', header: 'Business', render: (t) => <div><strong>{t.name}</strong><div className="xs muted">{t.tenantCode}{t.city ? ` · ${t.city}` : ''}</div></div> },
              { key: 'i', header: 'Industry', render: (t) => t.industryLabel },
              { key: 'o', header: 'Owner', priority: 'low', render: (t) => <div>{t.ownerName ?? '—'}<div className="xs muted">{t.ownerMobile}</div></div> },
              { key: 'u', header: 'Users', align: 'right', priority: 'low', render: (t) => t.users },
              { key: 'c', header: 'Customers', align: 'right', render: (t) => t.customers },
              { key: 'v', header: 'Invoices', align: 'right', priority: 'low', render: (t) => t.invoices },
              { key: 'a', header: 'Last activity', priority: 'low', render: (t) => (t.lastActivityAt ? dateTime(t.lastActivityAt) : '—') },
              { key: 's', header: 'Status', render: (t) => <StatusBadge status={t.status} /> },
            ]} />
          )}
        </QueryState>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------- create tenant

export function CreateTenantPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const industries = useIndustries()
  const [f, setF] = useState({ name: '', legalName: '', tenantCode: '', industry: 'GROCERY', state: 'Tamil Nadu', city: '', gstin: '', ownerName: '', ownerMobile: '', email: '' })
  const template = industries.data?.find((i) => i.code === f.industry)
  const create = useMutation({
    mutationFn: () => api.post<TenantDetail>('/api/v1/platform/tenants', {
      name: f.name, legalName: f.legalName || undefined, tenantCode: f.tenantCode || undefined, industry: f.industry, state: f.state,
      stateCode: stateCodeOf(f.state), city: f.city || undefined, gstin: f.gstin || undefined, ownerName: f.ownerName,
      ownerMobile: f.ownerMobile, email: f.email || undefined,
    }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['platform'] })
      toast.success('Business registered', `${t.name} can now sign in with ${t.owners[0]?.mobileNumber ?? 'the owner mobile'}`)
      navigate(`/platform/tenants/${t.id}`, { replace: true })
    },
  })
  const err = create.error instanceof ApiError ? create.error : null
  const valid = f.name.trim().length >= 2 && f.ownerName.trim().length >= 2 && /^[6-9]\d{9}$/.test(f.ownerMobile)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (valid) create.mutate()
  }
  return (
    <div className="stack">
      <PageHeader breadcrumb={<Link to="/platform/tenants" className="row" style={{ gap: 4 }}><ArrowLeft size={14} /> Businesses</Link>}
        title="Register business" subtitle="Creates the business, its owner login and the industry template" />
      <form className="detail-grid" onSubmit={submit} noValidate>
        <div className="stack">
          <Card title="Business">
            <div className="form-grid">
              <Field label="Business name" htmlFor="t-name" required error={err?.fieldError('name')} className="span-2">
                <Input id="t-name" value={f.name} onChange={set('name')} maxLength={200} />
              </Field>
              <Field label="Legal name" htmlFor="t-legal" hint="As on the GST registration, if different">
                <Input id="t-legal" value={f.legalName} onChange={set('legalName')} maxLength={200} />
              </Field>
              <Field label="Join-link code" htmlFor="t-code" hint="Optional. Lowercase letters, digits and hyphens; made from the name if empty" error={err?.fieldError('tenantCode')}>
                <Input id="t-code" value={f.tenantCode} onChange={(e) => setF({ ...f, tenantCode: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} maxLength={40} />
              </Field>
              <Field label="State" htmlFor="t-state" required hint={`GST state code ${stateCodeOf(f.state) ?? '—'}`}>
                <Select id="t-state" value={f.state} onChange={set('state')} options={GST_STATES.map((s) => ({ value: s.name, label: s.name }))} />
              </Field>
              <Field label="City" htmlFor="t-city">
                <Input id="t-city" value={f.city} onChange={set('city')} maxLength={100} />
              </Field>
              <Field label="GSTIN" htmlFor="t-gstin" error={err?.fieldError('gstin')}>
                <Input id="t-gstin" value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value.toUpperCase() })} maxLength={15} />
              </Field>
              <Field label="Email" htmlFor="t-email">
                <Input id="t-email" type="email" value={f.email} onChange={set('email')} maxLength={200} />
              </Field>
            </div>
          </Card>
          <Card title="Owner">
            <div className="form-grid">
              <Field label="Owner name" htmlFor="t-owner" required>
                <Input id="t-owner" value={f.ownerName} onChange={set('ownerName')} maxLength={200} />
              </Field>
              <Field label="Owner mobile" htmlFor="t-mobile" required hint="The owner signs in with this number" error={err?.fieldError('ownerMobile')}>
                <Input id="t-mobile" inputMode="numeric" value={f.ownerMobile} onChange={(e) => setF({ ...f, ownerMobile: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
              </Field>
            </div>
          </Card>
          {err && !err.details.length && <Alert tone="danger">{err.message}</Alert>}
          <div className="form-actions">
            <Button variant="secondary" onClick={() => navigate('/platform/tenants')}>Cancel</Button>
            <Button type="submit" loading={create.isPending} disabled={!valid}>Register business</Button>
          </div>
        </div>
        <Card title="Industry template">
          <div className="stack">
            <Field label="Industry" htmlFor="t-industry" required>
              <Select id="t-industry" value={f.industry} onChange={set('industry')} options={(industries.data ?? []).map((i) => ({ value: i.code, label: i.label }))} />
            </Field>
            {template && (
              <>
                <p className="small muted">{template.description}</p>
                <KeyValue items={[
                  ['Modules', template.modules.length ? template.modules.map(titleCase).join(', ') : 'Standard modules only'],
                  ['Units', template.units.join(', ')],
                  ['Categories', template.categories.length ? template.categories.join(', ') : '—'],
                ]} />
                <p className="xs muted">Everything stays editable afterwards; modules can be changed on the business page.</p>
              </>
            )}
          </div>
        </Card>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------- tenant detail

export function TenantDetailPage() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const [dialog, setDialog] = useState<'suspend' | 'reactivate' | 'owner' | 'support' | 'edit' | null>(null)
  const q = useQuery({ queryKey: ['platform', 'tenant', id], queryFn: () => api.get<TenantDetail>(`/api/v1/platform/tenants/${id}`) })
  const audit = useQuery({ queryKey: ['platform', 'tenant', id, 'audit'], queryFn: () => api.get<AuditEntry[]>('/api/v1/platform/audit-logs', { businessId: id, limit: 20 }) })
  const refresh = (t: TenantDetail) => {
    qc.setQueryData(['platform', 'tenant', id], t)
    qc.invalidateQueries({ queryKey: ['platform', 'tenants'] })
    qc.invalidateQueries({ queryKey: ['platform', 'tenant', id, 'audit'] })
  }
  const modules = useMutation({
    mutationFn: (change: Record<string, boolean>) => api.put<ModuleState[]>(`/api/v1/platform/tenants/${id}/modules`, { modules: change }),
    onSuccess: (m) => {
      qc.setQueryData<TenantDetail>(['platform', 'tenant', id], (t) => (t ? { ...t, modules: m } : t))
      qc.invalidateQueries({ queryKey: ['platform', 'tenant', id, 'audit'] })
      toast.success('Modules updated')
    },
    onError: (e) => toast.error(e),
  })
  const copyJoin = async (path: string) => {
    try {
      await navigator.clipboard.writeText(joinUrl(path))
      toast.success('Join link copied')
    } catch {
      toast.show('info', 'Join link', joinUrl(path))
    }
  }

  return (
    <QueryState query={q}>
      {(t) => (
        <div className="stack">
          <PageHeader
            breadcrumb={<Link to="/platform/tenants" className="row" style={{ gap: 4 }}><ArrowLeft size={14} /> Businesses</Link>}
            title={<span className="row">{t.name} <StatusBadge status={t.status} /></span>}
            subtitle={`${t.industryLabel} · code ${t.tenantCode} · registered ${date(t.createdAt)}`}
            actions={
              <PageActions
                primary={{ key: 'support', label: 'Support view', icon: <Eye size={16} />, show: t.status === 'ACTIVE', onClick: () => setDialog('support') }}
                actions={[
                  { key: 'edit', label: 'Edit', onClick: () => setDialog('edit') },
                  { key: 'owner', label: 'Add owner', icon: <UserPlus size={16} />, onClick: () => setDialog('owner') },
                  { key: 'copy', label: 'Copy join link', icon: <Copy size={16} />, onClick: () => copyJoin(t.joinPath) },
                  { key: 'suspend', label: 'Suspend', icon: <PauseCircle size={16} />, variant: 'danger', show: t.status === 'ACTIVE', onClick: () => setDialog('suspend') },
                  { key: 'reactivate', label: 'Reactivate', icon: <PlayCircle size={16} />, variant: 'success', show: t.status === 'SUSPENDED', onClick: () => setDialog('reactivate') },
                ]}
              />
            }
          />
          {t.status === 'SUSPENDED' && <Alert tone="danger" title="Suspended">{t.statusReason ?? 'Nobody in this business can sign in.'}</Alert>}
          <div className="kpi-grid">
            <StatCard index={0} label="Users" value={t.usage.users} format={count} icon={<Users size={18} />} hint={`${t.usage.staff} staff`} />
            <StatCard index={1} label="Customers" value={t.usage.customers} format={count} tone="accent" hint={`${t.usage.suppliers} suppliers`} />
            <StatCard index={2} label="Products" value={t.usage.products} format={count} tone="purple" hint={`${t.usage.orders} orders`} />
            <StatCard index={3} label="Sales, 30 days" value={t.usage.salesLast30Days} tone="success" hint={`${t.usage.invoices} invoices in total`} />
          </div>
          <div className="detail-grid">
            <div className="stack">
              <Card title="Modules" actions={modules.isPending ? <span className="xs muted">Saving…</span> : undefined}>
                <p className="small muted" style={{ marginBottom: 12 }}>Switch features on or off for this business. Menus of switched-off features are hidden for its users.</p>
                <ul className="module-list">
                  {t.modules.map((m) => (
                    <li key={m.code}>
                      <Switch checked={m.enabled} label={m.label} disabled={modules.isPending || t.status !== 'ACTIVE'}
                        onChange={(on) => modules.mutate({ [m.code]: on })} />
                      {m.requires.length > 0 && <span className="xs muted">Needs {m.requires.map(titleCase).join(', ')}</span>}
                    </li>
                  ))}
                </ul>
              </Card>
              <Card title="Recent activity" padded={false}>
                <QueryState query={audit} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No activity yet" />}>
                  {(rows) => (
                    <DataTable rows={rows} rowKey={(a) => a.id} columns={[
                      { key: 't', header: 'When', render: (a) => dateTime(a.createdAt) },
                      { key: 'a', header: 'Action', render: (a) => titleCase(a.action) },
                      { key: 'w', header: 'By', priority: 'low', render: (a) => a.actorName ?? titleCase(a.actorRole ?? '') },
                    ]} />
                  )}
                </QueryState>
              </Card>
            </div>
            <div className="stack">
              <Card title="Profile">
                <KeyValue items={[
                  ['Legal name', t.legalName ?? '—'],
                  ['Owner', `${t.ownerName ?? '—'}${t.ownerMobile ? ` · ${t.ownerMobile}` : ''}`],
                  ['GSTIN', t.gstin ?? '—'],
                  ['Address', [t.addressLine1, t.city, t.state].filter(Boolean).join(', ') || '—'],
                  ['Email', t.email ?? '—'],
                  ['Join link', <button key="j" type="button" className="link-btn" onClick={() => copyJoin(t.joinPath)}>{t.joinPath}</button>],
                  ['Last activity', t.usage.lastActivityAt ? dateTime(t.usage.lastActivityAt) : '—'],
                ]} />
              </Card>
              <TenantDomainCard tenant={t} onChanged={refresh} />
              <Card title="Owner logins" padded={false}>
                <DataTable rows={t.owners} rowKey={(o) => o.userId} columns={[
                  { key: 'n', header: 'Name', render: (o) => <div><strong>{o.fullName}</strong><div className="xs muted">{o.mobileNumber}</div></div> },
                  { key: 'l', header: 'Last sign-in', render: (o) => (o.lastLoginAt ? dateTime(o.lastLoginAt) : 'Never') },
                  { key: 's', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
                ]} />
              </Card>
            </div>
          </div>

          <StatusDialog open={dialog === 'suspend' || dialog === 'reactivate'} kind={dialog === 'suspend' ? 'suspend' : 'reactivate'} tenant={t}
            onClose={() => setDialog(null)} onDone={(d) => { refresh(d); setDialog(null) }} />
          <OwnerDialog open={dialog === 'owner'} tenantId={t.id} onClose={() => setDialog(null)} onDone={(d) => { refresh(d); setDialog(null) }} />
          <EditTenantDialog open={dialog === 'edit'} tenant={t} onClose={() => setDialog(null)} onDone={(d) => { refresh(d); setDialog(null) }} />
          <SupportDialog open={dialog === 'support'} tenant={t} onClose={() => setDialog(null)} onStarted={() => navigate('/app', { replace: true })} />
        </div>
      )}
    </QueryState>
  )
}

function StatusDialog({ open, kind, tenant, onClose, onDone }: { open: boolean; kind: 'suspend' | 'reactivate'; tenant: TenantDetail; onClose: () => void; onDone: (t: TenantDetail) => void }) {
  const [reason, setReason] = useState('')
  const toast = useToast()
  const m = useMutation({
    mutationFn: () => api.post<TenantDetail>(`/api/v1/platform/tenants/${tenant.id}/${kind}`, { reason }),
    onSuccess: (t) => {
      toast.success(kind === 'suspend' ? 'Business suspended' : 'Business reactivated')
      setReason('')
      onDone(t)
    },
  })
  const err = m.error instanceof ApiError ? m.error : null
  return (
    <Modal open={open} onClose={onClose} title={kind === 'suspend' ? `Suspend ${tenant.name}?` : `Reactivate ${tenant.name}?`}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant={kind === 'suspend' ? 'danger' : 'primary'} loading={m.isPending} disabled={reason.trim().length < 5} onClick={() => m.mutate()}>
          {kind === 'suspend' ? 'Suspend' : 'Reactivate'}
        </Button>
      </>}>
      <div className="stack">
        <p className="small">{kind === 'suspend'
          ? 'Everyone in this business is signed out immediately and nobody can sign in until it is reactivated. No data is deleted.'
          : 'Users of this business can sign in again.'}</p>
        <Field label="Reason" htmlFor="status-reason" required hint="At least 5 characters; recorded in the audit log">
          <Textarea id="status-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </Field>
        {err && <Alert tone="danger">{err.message}</Alert>}
      </div>
    </Modal>
  )
}

function OwnerDialog({ open, tenantId, onClose, onDone }: { open: boolean; tenantId: string; onClose: () => void; onDone: (t: TenantDetail) => void }) {
  const [f, setF] = useState({ fullName: '', mobileNumber: '' })
  const toast = useToast()
  const m = useMutation({
    mutationFn: () => api.post<TenantDetail>(`/api/v1/platform/tenants/${tenantId}/owners`, f),
    onSuccess: (t) => {
      toast.success('Owner added')
      setF({ fullName: '', mobileNumber: '' })
      onDone(t)
    },
  })
  const err = m.error instanceof ApiError ? m.error : null
  return (
    <Modal open={open} onClose={onClose} title="Add owner login"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button loading={m.isPending} disabled={f.fullName.trim().length < 2 || !/^[6-9]\d{9}$/.test(f.mobileNumber)} onClick={() => m.mutate()}>Add owner</Button>
      </>}>
      <div className="stack">
        <Field label="Name" htmlFor="o-name" required><Input id="o-name" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></Field>
        <Field label="Mobile" htmlFor="o-mobile" required error={err?.fieldError('mobileNumber')}>
          <Input id="o-mobile" inputMode="numeric" value={f.mobileNumber} onChange={(e) => setF({ ...f, mobileNumber: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
        </Field>
        {err && !err.details.length && <Alert tone="danger">{err.message}</Alert>}
      </div>
    </Modal>
  )
}

function EditTenantDialog({ open, tenant, onClose, onDone }: { open: boolean; tenant: TenantDetail; onClose: () => void; onDone: (t: TenantDetail) => void }) {
  const industries = useIndustries()
  const [f, setF] = useState({ name: tenant.name, legalName: tenant.legalName ?? '', industry: tenant.industry, ownerName: tenant.ownerName ?? '' })
  const toast = useToast()
  const m = useMutation({
    mutationFn: () => api.patch<TenantDetail>(`/api/v1/platform/tenants/${tenant.id}`, f),
    onSuccess: (t) => {
      toast.success('Business updated')
      onDone(t)
    },
    onError: (e) => toast.error(e),
  })
  return (
    <Modal open={open} onClose={onClose} title="Edit business"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button loading={m.isPending} disabled={f.name.trim().length < 2} onClick={() => m.mutate()}>Save</Button>
      </>}>
      <div className="stack">
        <Field label="Business name" htmlFor="e-name" required><Input id="e-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Legal name" htmlFor="e-legal"><Input id="e-legal" value={f.legalName} onChange={(e) => setF({ ...f, legalName: e.target.value })} /></Field>
        <Field label="Industry" htmlFor="e-industry" hint="Changing it does not change modules or data">
          <Select id="e-industry" value={f.industry} onChange={(e) => setF({ ...f, industry: e.target.value })} options={(industries.data ?? []).map((i) => ({ value: i.code, label: i.label }))} />
        </Field>
        <Field label="Owner name (contact)" htmlFor="e-owner"><Input id="e-owner" value={f.ownerName} onChange={(e) => setF({ ...f, ownerName: e.target.value })} /></Field>
      </div>
    </Modal>
  )
}

/** Opens the business read-only in this tab; "Exit support view" restores the console session. */
function SupportDialog({ open, tenant, onClose, onStarted }: { open: boolean; tenant: TenantDetail; onClose: () => void; onStarted: () => void }) {
  const [reason, setReason] = useState('')
  const [minutes, setMinutes] = useState('30')
  const qc = useQueryClient()
  const m = useMutation({
    mutationFn: async () => {
      const r = await api.post<{ accessToken: string; expiresAt: string }>(`/api/v1/platform/tenants/${tenant.id}/support-access`, { reason, minutes: Number(minutes) })
      // Load the support identity with the new token before switching the session over.
      const me = await fetchMe(r.accessToken)
      return { token: r.accessToken, me }
    },
    onSuccess: ({ token, me }) => {
      qc.clear()
      useAuthStore.getState().setSession(token, me)
      onStarted()
    },
  })
  const err = m.error instanceof ApiError ? m.error : null
  return (
    <Modal open={open} onClose={onClose} title={`Support view of ${tenant.name}`}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button icon={<Eye size={16} />} loading={m.isPending} disabled={reason.trim().length < 10} onClick={() => m.mutate()}>Open read-only view</Button>
      </>}>
      <div className="stack">
        <Alert tone="info">You will see this business as its owner does, read-only. The access is time-limited and recorded in the business audit log, where the owner can see it.</Alert>
        <Field label="Reason" htmlFor="s-reason" required hint="At least 10 characters">
          <Textarea id="s-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </Field>
        <Field label="Duration" htmlFor="s-minutes">
          <Select id="s-minutes" value={minutes} onChange={(e) => setMinutes(e.target.value)}
            options={[{ value: '15', label: '15 minutes' }, { value: '30', label: '30 minutes' }, { value: '60', label: '1 hour' }, { value: '120', label: '2 hours' }]} />
        </Field>
        {err && <Alert tone="danger">{err.message}</Alert>}
      </div>
    </Modal>
  )
}

async function fetchMe(token: string): Promise<Me> {
  const { API_BASE } = await import('@/services/api')
  const res = await fetch(`${API_BASE}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${token}`, 'X-Client-Type': 'web' }, credentials: 'include' })
  const body = await res.json()
  if (!res.ok) throw new ApiError(res.status, body?.error?.code ?? 'ERROR', body?.error?.message ?? 'Could not open the support view')
  return body.data as Me
}

// ---------------------------------------------------------------- industries

export function IndustriesPage() {
  const q = useIndustries()
  return (
    <div className="stack">
      <PageHeader title="Industry templates" subtitle="Chosen when a business is registered; everything stays editable afterwards" />
      <QueryState query={q}>
        {(rows) => (
          <div className="grid-3">
            {rows.map((i) => (
              <Card key={i.code} title={i.label}>
                <div className="stack-sm">
                  <p className="small muted">{i.description}</p>
                  <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                    {i.modules.length ? i.modules.map((m) => <Badge key={m} tone="primary">{titleCase(m)}</Badge>) : <Badge>Standard</Badge>}
                  </div>
                  <div className="xs muted">Units: {i.units.join(', ')}</div>
                  {i.categories.length > 0 && <div className="xs muted">Categories: {i.categories.join(', ')}</div>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </QueryState>
    </div>
  )
}

// ---------------------------------------------------------------- platform admins

export function PlatformAdminsPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const me = useAuthStore((s) => s.user)
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState({ fullName: '', mobileNumber: '' })
  const q = useQuery({ queryKey: ['platform', 'admins'], queryFn: () => api.get<PlatformAdmin[]>('/api/v1/platform/admins') })
  const create = useMutation({
    mutationFn: () => api.post<PlatformAdmin>('/api/v1/platform/admins', f),
    onSuccess: () => {
      toast.success('Platform admin added')
      setAdding(false)
      setF({ fullName: '', mobileNumber: '' })
      qc.invalidateQueries({ queryKey: ['platform', 'admins'] })
    },
  })
  const toggle = useMutation({
    mutationFn: (a: PlatformAdmin) => api.patch<PlatformAdmin>(`/api/v1/platform/admins/${a.id}`, { status: a.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform', 'admins'] }),
    onError: (e) => toast.error(e),
  })
  const err = create.error instanceof ApiError ? create.error : null
  return (
    <div className="stack">
      <PageHeader title="Platform admins" subtitle="People who can register businesses and change modules"
        actions={<Button icon={<Plus size={16} />} onClick={() => setAdding(true)}>Add admin</Button>} />
      <Card padded={false}>
        <QueryState query={q}>
          {(rows) => (
            <DataTable rows={rows} rowKey={(a) => a.id} columns={[
              { key: 'n', header: 'Name', render: (a) => <div><strong>{a.fullName}</strong><div className="xs muted">{a.mobileNumber}</div></div> },
              { key: 'l', header: 'Last sign-in', render: (a) => (a.lastLoginAt ? dateTime(a.lastLoginAt) : 'Never') },
              { key: 's', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
              { key: 'x', header: '', render: (a) => a.id !== me?.id && (
                <Button size="sm" variant="ghost" loading={toggle.isPending && toggle.variables?.id === a.id} onClick={(e) => { e.stopPropagation(); toggle.mutate(a) }}>
                  {a.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                </Button>
              ) },
            ]} />
          )}
        </QueryState>
      </Card>
      <Modal open={adding} onClose={() => setAdding(false)} title="Add platform admin"
        footer={<>
          <Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
          <Button loading={create.isPending} disabled={f.fullName.trim().length < 2 || !/^[6-9]\d{9}$/.test(f.mobileNumber)} onClick={() => create.mutate()}>Add</Button>
        </>}>
        <div className="stack">
          <Field label="Name" htmlFor="pa-name" required><Input id="pa-name" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></Field>
          <Field label="Mobile" htmlFor="pa-mobile" required error={err?.fieldError('mobileNumber')}>
            <Input id="pa-mobile" inputMode="numeric" value={f.mobileNumber} onChange={(e) => setF({ ...f, mobileNumber: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
          </Field>
          {err && !err.details.length && <Alert tone="danger">{err.message}</Alert>}
        </div>
      </Modal>
    </div>
  )
}

// ---------------------------------------------------------------- audit

export function PlatformAuditPage() {
  const [action, setAction] = useState('')
  const q = useQuery({ queryKey: ['platform', 'audit', action], queryFn: () => api.get<AuditEntry[]>('/api/v1/platform/audit-logs', { action, limit: 200 }) })
  const actions = useMemo(() => ['TENANT_CREATED', 'TENANT_UPDATED', 'TENANT_SUSPENDED', 'TENANT_REACTIVATED', 'TENANT_MODULES_CHANGED',
    'TENANT_OWNER_ADDED', 'PLATFORM_ADMIN_CREATED', 'PLATFORM_ADMIN_UPDATED', 'SUPPORT_ACCESS_STARTED', 'LOGIN'], [])
  return (
    <div className="stack">
      <PageHeader title="Audit log" subtitle="Console actions and Super Admin activity across all businesses" />
      <Card padded={false}>
        <div className="toolbar">
          <Select aria-label="Action" value={action} onChange={(e) => setAction(e.target.value)}
            options={[{ value: '', label: 'All actions' }, ...actions.map((a) => ({ value: a, label: titleCase(a) }))]} />
        </div>
        <QueryState query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No entries" />}>
          {(rows) => (
            <DataTable rows={rows} rowKey={(a) => a.id} columns={[
              { key: 't', header: 'When', render: (a) => dateTime(a.createdAt) },
              { key: 'a', header: 'Action', render: (a) => titleCase(a.action) },
              { key: 'b', header: 'Business', render: (a) => (a.businessId ? <Link to={`/platform/tenants/${a.businessId}`}>{a.businessName}</Link> : 'Platform') },
              { key: 'w', header: 'By', render: (a) => a.actorName ?? titleCase(a.actorRole ?? '') },
              { key: 'd', header: 'Details', priority: 'low', render: (a) => <span className="xs muted" style={{ wordBreak: 'break-word' }}>{a.newValue?.slice(0, 160)}</span> },
            ]} />
          )}
        </QueryState>
      </Card>
    </div>
  )
}

