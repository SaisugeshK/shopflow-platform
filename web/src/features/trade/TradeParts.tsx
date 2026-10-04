import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, Truck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, IconButton } from '@/components/ui/Button'
import { Card, DataTable, KeyValue, StatusBadge } from '@/components/ui/Data'
import { Alert, EmptyState } from '@/components/ui/Feedback'
import { Field, Input, PriceInput, Select } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Overlay'
import { useToast } from '@/components/ui/Toast'
import { ProductPicker } from '@/features/products/ProductPicker'
import { unitOptions } from '@/features/products/ProductOptions'
import { api, ApiError } from '@/services/api'
import type { Agent, CustomerDetail, CustomerSummary, Invoice, Product, Project, ProjectStatement } from '@/services/types'
import { useCan, useModule } from '@/stores/auth'
import { date, dateTime, money, quantity, titleCase } from '@/utils/format'

/** Approved-customer chooser with a search box (quotations, challans). */
export function CustomerChooser({ value, onChange, idPrefix }: { value: string; onChange: (id: string) => void; idPrefix: string }) {
  const [search, setSearch] = useState('')
  const customers = useQuery({ queryKey: ['customers', 'picker', search], queryFn: () => api.page<CustomerSummary>('/api/v1/customers', { q: search, status: 'APPROVED', pageSize: 20 }) })
  return (
    <>
      <Field label="Find customer" htmlFor={`${idPrefix}-cs`}><Input id={`${idPrefix}-cs`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, code or mobile" /></Field>
      <Field label="Customer" htmlFor={`${idPrefix}-c`} required>
        <Select id={`${idPrefix}-c`} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Select customer"
          options={(customers.data?.items ?? []).map((c) => ({ value: c.id, label: `${c.shopName} (${c.customerCode})` }))} />
      </Field>
    </>
  )
}

/** Project / site of the chosen customer (PROJECT_ACCOUNTS module). Renders nothing when the module is off. */
export function ProjectChooser({ customerId, value, onChange, idPrefix }: { customerId: string; value: string; onChange: (id: string) => void; idPrefix: string }) {
  const on = useModule('PROJECT_ACCOUNTS')
  const projects = useQuery({
    queryKey: ['projects', customerId], enabled: on && !!customerId,
    queryFn: () => api.get<Project[]>('/api/v1/projects', { customerId, status: 'ACTIVE' }),
  })
  if (!on || !customerId) return null
  return (
    <Field label="Project / site" htmlFor={`${idPrefix}-pj`} hint={projects.data?.length === 0 ? 'No active projects for this customer' : undefined}>
      <Select id={`${idPrefix}-pj`} value={value} onChange={(e) => onChange(e.target.value)} placeholder="No project"
        options={(projects.data ?? []).map((p) => ({ value: p.id, label: p.name }))} />
    </Field>
  )
}

export interface DocLine { key: string; product: Product; quantity: string; unit: string; rate: string; discountPercent: string }

/** Product lines with quantity, unit, rate and (optionally) discount — shared by quotations and challans. */
export function DocLinesCard({ lines, onChange, withDiscount, rateHint }: { lines: DocLine[]; onChange: (l: DocLine[]) => void; withDiscount?: boolean; rateHint: string }) {
  const update = (i: number, patch: Partial<DocLine>) => onChange(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  return (
    <Card title="Items" padded={false}>
      <div style={{ padding: 16 }}><ProductPicker exclude={lines.filter((l) => l.product.units.length === 0).map((l) => l.product.id)}
        onPick={(p) => onChange([...lines, { key: `${p.id}-${Date.now()}`, product: p, quantity: '1', unit: p.unit, rate: '', discountPercent: '' }])} /></div>
      {lines.length === 0 ? <EmptyState title="No items" description="Search and add products." /> : (
        <DataTable rows={lines.map((l, i) => ({ ...l, i }))} rowKey={(l) => l.key} columns={[
          { key: 'p', header: 'Product', render: (l) => <div><strong>{l.product.name}</strong><div className="xs muted">{l.product.sku} · {l.product.gstRate}% GST · {quantity(l.product.available)} {l.product.unit} available</div></div> },
          { key: 'q', header: 'Qty', align: 'right', render: (l) => (
            <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
              <Input aria-label={`Quantity of ${l.product.name}`} type="number" min={0} step={l.product.decimalQuantity ? 'any' : 1} style={{ width: 80, textAlign: 'right' }} value={l.quantity} onChange={(e) => update(l.i, { quantity: e.target.value })} />
              {l.product.units.length > 0 ? <Select aria-label={`Unit of ${l.product.name}`} style={{ width: 110 }} value={l.unit} onChange={(e) => update(l.i, { unit: e.target.value })} options={unitOptions(l.product)} />
                : <span className="xs muted">{l.product.unit}</span>}
            </div>
          ) },
          { key: 'r', header: 'Rate', align: 'right', render: (l) => <PriceInput aria-label={`Rate of ${l.product.name}`} placeholder={rateHint} style={{ width: 140 }} value={l.rate} onChange={(e) => update(l.i, { rate: e.target.value })} /> },
          ...(withDiscount ? [{ key: 'd', header: 'Disc %', align: 'right' as const, render: (l: DocLine & { i: number }) => <Input aria-label={`Discount for ${l.product.name}`} type="number" min={0} max={100} step="0.01" style={{ width: 80, textAlign: 'right' }} value={l.discountPercent} onChange={(e) => update(l.i, { discountPercent: e.target.value })} /> }] : []),
          { key: 'x', header: '', render: (l) => <IconButton label={`Remove ${l.product.name}`} onClick={() => onChange(lines.filter((_, idx) => idx !== l.i))}><Trash2 size={16} /></IconButton> },
        ]} />
      )}
    </Card>
  )
}

export function docLinePayload(l: DocLine, withDiscount = false) {
  return {
    productId: l.product.id, quantity: l.quantity, unit: l.unit !== l.product.unit ? l.unit : undefined, rate: l.rate || undefined,
    ...(withDiscount ? { discountPercent: l.discountPercent || undefined } : {}),
  }
}

/** Project, delivery challan, e-way bill and commission on an invoice (§0B.9). */
export function InvoiceTradeCard({ inv, onChanged }: { inv: Invoice; onChanged: () => void }) {
  const ewayOn = useModule('EWAY_BILL')
  const canWrite = useCan('INVOICE_WRITE')
  const [open, setOpen] = useState(false)
  const t = inv.trade
  const canEway = ewayOn && canWrite && !t?.ewayBillNumber && !['DRAFT', 'CANCELLED'].includes(inv.status)
  if (!t && !canEway) return null
  return (
    <Card title="Trade details" actions={canEway && <Button size="sm" variant="secondary" icon={<Truck size={14} />} onClick={() => setOpen(true)}>E-way bill</Button>}>
      {t?.ewayTestOnly && t.ewayBillNumber && <div style={{ marginBottom: 8 }}><Alert tone="warning" title="TEST ONLY e-way bill">This number comes from the mock provider and is not government-issued.</Alert></div>}
      <KeyValue items={[
        ['Project', t?.projectName],
        ['Delivery challan', t?.deliveryChallanId ? <Link key="dc" to={`/app/delivery-challans/${t.deliveryChallanId}`}>{t.challanNumber}</Link> : undefined],
        ['E-way bill', t?.ewayBillNumber ? <span key="e" className="mono">{t.ewayBillNumber}</span> : undefined],
        ['E-way valid until', t?.ewayValidUntil ? dateTime(t.ewayValidUntil) : undefined],
        ['Distance', t?.ewayDistanceKm ? `${t.ewayDistanceKm} km` : undefined],
        ['Agent', t?.agentName],
        ['Commission', t?.commissionAmount != null ? `${money(t.commissionAmount)} (${t.commissionPercent}%)${t.commissionPaidAt ? ' · paid' : ' · pending'}` : undefined],
      ]} />
      <EwayDialog open={open} inv={inv} onClose={() => setOpen(false)} onDone={() => { setOpen(false); onChanged() }} />
    </Card>
  )
}

function EwayDialog({ open, inv, onClose, onDone }: { open: boolean; inv: Invoice; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [v, setV] = useState({ distanceKm: '', vehicleNumber: inv.vehicleNumber ?? '', transport: inv.transport ?? '' })
  const m = useMutation({
    mutationFn: () => api.post('/api/v1/invoices/' + inv.id + '/eway-bill', { distanceKm: Number(v.distanceKm), vehicleNumber: v.vehicleNumber || undefined, transport: v.transport || undefined }),
    onSuccess: () => { toast.success('E-way bill generated'); onDone() },
  })
  const err = m.error instanceof ApiError ? m.error : null
  return (
    <Modal open={open} onClose={onClose} title="Generate e-way bill"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} disabled={!(Number(v.distanceKm) > 0)} onClick={() => m.mutate()}>Generate</Button></>}>
      <div className="stack">
        <p className="small muted">Needed when goods worth more than ₹50,000 move by road. Validity is one day per 200 km.</p>
        <div className="form-grid">
          <Field label="Distance (km)" htmlFor="ew-d" required><Input id="ew-d" type="number" min={1} max={4000} value={v.distanceKm} onChange={(e) => setV({ ...v, distanceKm: e.target.value })} /></Field>
          <Field label="Vehicle number" htmlFor="ew-v"><Input id="ew-v" value={v.vehicleNumber} onChange={(e) => setV({ ...v, vehicleNumber: e.target.value.toUpperCase() })} /></Field>
          <Field label="Transport" htmlFor="ew-t" className="span-2"><Input id="ew-t" value={v.transport} onChange={(e) => setV({ ...v, transport: e.target.value })} /></Field>
        </div>
        {err && <Alert tone="danger">{err.message}</Alert>}
      </div>
    </Modal>
  )
}

/** Agent link and projects on the customer page (COMMISSION / PROJECT_ACCOUNTS modules). */
export function CustomerTradeCards({ customer, onChanged }: { customer: CustomerDetail; onChanged: () => void }) {
  const commissionOn = useModule('COMMISSION')
  const projectsOn = useModule('PROJECT_ACCOUNTS')
  if (!commissionOn && !projectsOn) return null
  return (
    <div className="grid-2">
      {commissionOn && <AgentCard customer={customer} onChanged={onChanged} />}
      {projectsOn && <ProjectsCard customerId={customer.id} />}
    </div>
  )
}

function AgentCard({ customer, onChanged }: { customer: CustomerDetail; onChanged: () => void }) {
  const toast = useToast()
  const canWrite = useCan('CUSTOMER_WRITE')
  const agents = useQuery({ queryKey: ['agents'], queryFn: () => api.get<Agent[]>('/api/v1/commissions/agents') })
  const m = useMutation({
    mutationFn: (agentId: string) => api.put(`/api/v1/commissions/customers/${customer.id}/agent`, { agentId: agentId || null }),
    onSuccess: () => { toast.success('Agent updated'); onChanged() },
    onError: (e) => toast.error(e),
  })
  const current = agents.data?.find((a) => a.id === customer.agentId)
  return (
    <Card title="Agent / broker">
      {canWrite ? (
        <Field label="Commission goes to" htmlFor="cust-agent" hint={current ? `${current.commissionPercent}% of the taxable value of each invoice` : 'No commission on this customer'}>
          <Select id="cust-agent" value={customer.agentId ?? ''} disabled={m.isPending} onChange={(e) => m.mutate(e.target.value)} placeholder="No agent"
            options={(agents.data ?? []).filter((a) => a.active || a.id === customer.agentId).map((a) => ({ value: a.id, label: `${a.name} (${a.commissionPercent}%)` }))} />
        </Field>
      ) : <p className="small">{current ? `${current.name} · ${current.commissionPercent}%` : 'No agent'}</p>}
    </Card>
  )
}

function ProjectsCard({ customerId }: { customerId: string }) {
  const qc = useQueryClient()
  const toast = useToast()
  const canWrite = useCan('CUSTOMER_WRITE')
  const [adding, setAdding] = useState(false)
  const [statement, setStatement] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', siteAddress: '', budget: '' })
  const projects = useQuery({ queryKey: ['projects', 'customer', customerId], queryFn: () => api.get<Project[]>('/api/v1/projects', { customerId }) })
  const create = useMutation({
    mutationFn: () => api.post('/api/v1/projects', { customerId, name: form.name, siteAddress: form.siteAddress || undefined, budget: form.budget || undefined }),
    onSuccess: () => { toast.success('Project added'); setAdding(false); setForm({ name: '', siteAddress: '', budget: '' }); qc.invalidateQueries({ queryKey: ['projects'] }) },
  })
  const err = create.error instanceof ApiError ? create.error : null
  return (
    <Card title="Projects / sites" padded={false} actions={canWrite && <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>Add project</Button>}>
      {(projects.data ?? []).length === 0 ? <EmptyState title="No projects" description="Track each site's billing separately." /> : (
        <DataTable rows={projects.data!} rowKey={(p) => p.id} onRowClick={(p) => setStatement(p.id)} columns={[
          { key: 'n', header: 'Project', render: (p) => <div><strong>{p.name}</strong><div className="xs muted">{p.siteAddress}</div></div> },
          { key: 'b', header: 'Billed', align: 'right', render: (p) => money(p.billed) },
          { key: 'o', header: 'Due', align: 'right', render: (p) => money(p.outstanding) },
          { key: 's', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
        ]} />
      )}
      <Modal open={adding} onClose={() => setAdding(false)} title="Add project / site"
        footer={<><Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button><Button loading={create.isPending} disabled={!form.name.trim()} onClick={() => create.mutate()}>Add</Button></>}>
        <div className="form-grid">
          <Field label="Project name" htmlFor="pj-n" required className="span-2"><Input id="pj-n" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Site address" htmlFor="pj-a" className="span-2"><Input id="pj-a" value={form.siteAddress} onChange={(e) => setForm({ ...form, siteAddress: e.target.value })} /></Field>
          <Field label="Budget" htmlFor="pj-b"><PriceInput id="pj-b" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} /></Field>
        </div>
        {err && <Alert tone="danger">{err.message}</Alert>}
      </Modal>
      <ProjectStatementDialog id={statement} onClose={() => setStatement(null)} path={(id) => `/api/v1/projects/${id}/statement`} linkBase="/app" />
    </Card>
  )
}

const DOC_PATH: Record<string, string> = { INVOICE: 'invoices', ORDER: 'orders', CHALLAN: 'delivery-challans', QUOTATION: 'quotations' }

/** Everything recorded against a project, with what is billed and still due. */
export function ProjectStatementDialog({ id, onClose, path, linkBase }: { id: string | null; onClose: () => void; path: (id: string) => string; linkBase: '/app' | '/shop' }) {
  const s = useQuery({ queryKey: ['project-statement', id], enabled: !!id, queryFn: () => api.get<ProjectStatement>(path(id!)) })
  const p = s.data?.project
  const link = (type: string, docId: string, number: string) => {
    if (linkBase === '/shop' && (type === 'CHALLAN')) return number
    const base = linkBase === '/shop' ? { INVOICE: 'invoices', ORDER: 'orders', QUOTATION: 'quotations' }[type] : DOC_PATH[type]
    return base ? <Link to={`${linkBase}/${base}/${docId}`}>{number}</Link> : number
  }
  return (
    <Modal open={!!id} onClose={onClose} wide title={p ? `${p.name} · statement` : 'Project statement'}>
      {p && (
        <div className="stack">
          <KeyValue items={[['Customer', p.customerName], ['Site', p.siteAddress], ['Budget', p.budget != null ? money(p.budget) : undefined],
            ['Billed', money(p.billed)], ['Received', money(p.received)], ['Due', <strong key="d">{money(p.outstanding)}</strong>]]} />
          {s.data!.lines.length === 0 ? <EmptyState title="Nothing yet" /> : (
            <DataTable rows={s.data!.lines} rowKey={(l) => `${l.type}-${l.id}`} columns={[
              { key: 'd', header: 'Date', render: (l) => date(l.date) },
              { key: 't', header: 'Document', render: (l) => <div>{link(l.type, l.id, l.number)}<div className="xs muted">{titleCase(l.type)}</div></div> },
              { key: 's', header: 'Status', render: (l) => <StatusBadge status={l.status} /> },
              { key: 'a', header: 'Amount', align: 'right', render: (l) => money(l.amount) },
              { key: 'o', header: 'Due', align: 'right', render: (l) => (l.outstanding != null ? money(l.outstanding) : '—') },
            ]} />
          )}
        </div>
      )}
    </Modal>
  )
}
