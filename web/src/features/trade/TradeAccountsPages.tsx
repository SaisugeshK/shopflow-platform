import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, PackageCheck, Plus, Trash2, Wallet, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, IconButton } from '@/components/ui/Button'
import { Card, DataTable, KeyValue, PageHeader, StatusBadge, Tabs } from '@/components/ui/Data'
import { Alert, EmptyState, QueryState } from '@/components/ui/Feedback'
import { Checkbox, Field, Input, PriceInput, Select, Switch, Textarea } from '@/components/ui/Form'
import { ConfirmDialog, Modal } from '@/components/ui/Overlay'
import { PageActions } from '@/components/ui/PageActions'
import { useToast } from '@/components/ui/Toast'
import { ProductPicker } from '@/features/products/ProductPicker'
import { api, ApiError } from '@/services/api'
import type { Agent, CommissionReport, JobWork, Product, Project, Supplier } from '@/services/types'
import { useCan } from '@/stores/auth'
import { date, money, quantity, titleCase, today } from '@/utils/format'
import { ProjectStatementDialog } from './TradeParts'

// ---------------------------------------------------------------- job work

/** Job work (§0B.9, JOB_WORK module): material out to a job worker, finished goods back. */
export function JobWorkPage() {
  const navigate = useNavigate()
  const canWrite = useCan('STOCK_WRITE')
  const [status, setStatus] = useState('')
  const [adding, setAdding] = useState(false)
  const q = useQuery({ queryKey: ['job-work', status], queryFn: () => api.get<JobWork[]>('/api/v1/job-work', { status: status || undefined }) })
  return (
    <div className="stack">
      <PageHeader title="Job work" subtitle="Send material for processing (dyeing, cutting, polishing) and receive the finished goods back"
        actions={canWrite && <Button icon={<Plus size={16} />} onClick={() => setAdding(true)}>Send for job work</Button>} />
      <Card padded={false}>
        <div className="toolbar">
          <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 200 }} placeholder="Any status"
            options={['OPEN', 'PARTIAL', 'CLOSED', 'CANCELLED'].map((s) => ({ value: s, label: titleCase(s) }))} />
        </div>
        <QueryState query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No job work" />}>
          {(d) => (
            <DataTable rows={d} rowKey={(x) => x.id} onRowClick={(x) => navigate(`/app/job-work/${x.id}`)} columns={[
              { key: 'n', header: 'Job', render: (x) => <div><strong>{x.jobNumber}</strong><div className="xs muted">{date(x.issueDate)}</div></div> },
              { key: 'w', header: 'Job worker', render: (x) => <div>{x.jobWorkerName}<div className="xs muted">{x.process}</div></div> },
              { key: 'e', header: 'Expected', priority: 'low', render: (x) => date(x.expectedDate) },
              { key: 's', header: 'Status', render: (x) => <StatusBadge status={x.status} /> },
            ]} />
          )}
        </QueryState>
      </Card>
      <NewJobWorkDialog open={adding} onClose={() => setAdding(false)} onDone={(j) => { setAdding(false); navigate(`/app/job-work/${j.id}`) }} />
    </div>
  )
}

interface QtyLine { product: Product; quantity: string }

function QtyLines({ lines, onChange, label }: { lines: QtyLine[]; onChange: (l: QtyLine[]) => void; label: string }) {
  return (
    <div className="stack-sm">
      <ProductPicker placeholder={label} exclude={lines.map((l) => l.product.id)} onPick={(p) => onChange([...lines, { product: p, quantity: '1' }])} />
      {lines.map((l, i) => (
        <div key={l.product.id} className="row" style={{ gap: 8 }}>
          <span className="grow">{l.product.name} <span className="xs muted">({quantity(l.product.available)} {l.product.unit} in stock)</span></span>
          <Input aria-label={`Quantity of ${l.product.name}`} type="number" min={0} step="any" style={{ width: 100, textAlign: 'right' }} value={l.quantity}
            onChange={(e) => onChange(lines.map((x, idx) => (idx === i ? { ...x, quantity: e.target.value } : x)))} />
          <span className="xs muted" style={{ width: 40 }}>{l.product.unit}</span>
          <IconButton label={`Remove ${l.product.name}`} onClick={() => onChange(lines.filter((_, idx) => idx !== i))}><Trash2 size={16} /></IconButton>
        </div>
      ))}
    </div>
  )
}

function NewJobWorkDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (j: JobWork) => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const suppliers = useQuery({ queryKey: ['suppliers', 'all'], enabled: open, queryFn: () => api.page<Supplier>('/api/v1/suppliers', { active: true, pageSize: 100 }) })
  const [v, setV] = useState({ supplierId: '', jobWorkerName: '', process: '', expectedDate: '', notes: '' })
  const [lines, setLines] = useState<QtyLine[]>([])
  const m = useMutation({
    mutationFn: () => api.post<JobWork>('/api/v1/job-work', {
      ...Object.fromEntries(Object.entries(v).filter(([, x]) => x)), items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
    }),
    onSuccess: (j) => { toast.success('Material sent', j.jobNumber); qc.invalidateQueries({ queryKey: ['job-work'] }); setLines([]); setV({ supplierId: '', jobWorkerName: '', process: '', expectedDate: '', notes: '' }); onDone(j) },
  })
  const err = m.error instanceof ApiError ? m.error : null
  const valid = v.process.trim() && (v.supplierId || v.jobWorkerName.trim()) && lines.length > 0 && lines.every((l) => Number(l.quantity) > 0)
  return (
    <Modal open={open} onClose={onClose} wide title="Send for job work"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} disabled={!valid} onClick={() => m.mutate()}>Send material</Button></>}>
      <div className="stack">
        <div className="form-grid">
          <Field label="Supplier (optional)" htmlFor="jw-s"><Select id="jw-s" value={v.supplierId} onChange={(e) => setV({ ...v, supplierId: e.target.value })} placeholder="Not a supplier"
            options={(suppliers.data?.items ?? []).map((s) => ({ value: s.id, label: s.name }))} /></Field>
          <Field label="Job worker name" htmlFor="jw-w" hint={v.supplierId ? 'Defaults to the supplier name' : undefined}><Input id="jw-w" value={v.jobWorkerName} onChange={(e) => setV({ ...v, jobWorkerName: e.target.value })} /></Field>
          <Field label="Process" htmlFor="jw-p" required><Input id="jw-p" placeholder="Dyeing, stitching, cutting…" value={v.process} onChange={(e) => setV({ ...v, process: e.target.value })} /></Field>
          <Field label="Expected back" htmlFor="jw-e"><Input id="jw-e" type="date" min={today()} value={v.expectedDate} onChange={(e) => setV({ ...v, expectedDate: e.target.value })} /></Field>
          <Field label="Notes" htmlFor="jw-n" className="span-2"><Textarea id="jw-n" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
        </div>
        <strong className="small">Material sent (stock goes out now)</strong>
        <QtyLines lines={lines} onChange={setLines} label="Add material…" />
        {err && <Alert tone="danger">{err.message}</Alert>}
      </div>
    </Modal>
  )
}

export function JobWorkDetailPage() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const toast = useToast()
  const canWrite = useCan('STOCK_WRITE')
  const [dialog, setDialog] = useState<'receive' | 'cancel' | null>(null)
  const q = useQuery({ queryKey: ['job', id], queryFn: () => api.get<JobWork>(`/api/v1/job-work/${id}`) })
  const refresh = (j: JobWork) => { qc.setQueryData(['job', id], j); qc.invalidateQueries({ queryKey: ['job-work'] }) }
  const cancel = useMutation({
    mutationFn: () => api.post<JobWork>(`/api/v1/job-work/${id}/cancel`),
    onSuccess: (j) => { toast.success('Job work cancelled; material is back in stock'); setDialog(null); refresh(j) },
    onError: (e) => toast.error(e),
  })
  return (
    <QueryState query={q}>
      {(j) => {
        const issued = (j.lines ?? []).filter((l) => l.direction === 'ISSUE')
        const received = (j.lines ?? []).filter((l) => l.direction === 'RECEIVE')
        const open = j.status === 'OPEN' || j.status === 'PARTIAL'
        return (
          <div className="stack">
            <PageHeader breadcrumb={<Link to="/app/job-work" className="row" style={{ gap: 4 }}><ArrowLeft size={14} /> Job work</Link>}
              title={<span className="row">{j.jobNumber} <StatusBadge status={j.status} /></span>}
              subtitle={`${j.jobWorkerName} · ${j.process} · sent ${date(j.issueDate)}`}
              actions={canWrite && open && (
                <PageActions primary={{ key: 'receive', label: 'Receive back', icon: <PackageCheck size={16} />, onClick: () => setDialog('receive') }}
                  actions={[{ key: 'cancel', label: 'Cancel', icon: <X size={16} />, variant: 'ghost', show: j.status === 'OPEN', onClick: () => setDialog('cancel') }]} />
              )}
            />
            <div className="detail-grid">
              <div className="stack">
                <Card title="Material sent" padded={false}>
                  <DataTable rows={issued} rowKey={(l) => l.id} columns={[
                    { key: 'p', header: 'Material', render: (l) => l.productName },
                    { key: 'q', header: 'Sent', align: 'right', render: (l) => `${quantity(l.quantity)} ${l.unit}` },
                    { key: 'r', header: 'Returned', align: 'right', render: (l) => quantity(l.returnedQuantity) },
                    { key: 'c', header: 'Used up', align: 'right', render: (l) => quantity(l.consumedQuantity) },
                    { key: 'o', header: 'Still out', align: 'right', render: (l) => <strong>{quantity(l.pendingQuantity)}</strong> },
                  ]} />
                </Card>
                <Card title="Finished goods received" padded={false}>
                  {received.length === 0 ? <EmptyState title="Nothing received yet" /> : (
                    <DataTable rows={received} rowKey={(l) => l.id} columns={[
                      { key: 'd', header: 'Date', render: (l) => date(l.lineDate) },
                      { key: 'p', header: 'Product', render: (l) => l.productName },
                      { key: 'q', header: 'Quantity', align: 'right', render: (l) => `${quantity(l.quantity)} ${l.unit}` },
                    ]} />
                  )}
                </Card>
              </div>
              <Card title="Summary">
                <KeyValue items={[['Job worker', j.jobWorkerName], ['Process', j.process], ['Sent', date(j.issueDate)], ['Expected back', date(j.expectedDate)],
                  ['Job work charges', money(j.charges)], ['Notes', j.notes]]} />
              </Card>
            </div>
            <ReceiveJobWorkDialog open={dialog === 'receive'} job={j} onClose={() => setDialog(null)} onDone={(x) => { toast.success('Received'); setDialog(null); refresh(x) }} />
            <ConfirmDialog open={dialog === 'cancel'} onClose={() => setDialog(null)} tone="danger" loading={cancel.isPending} title="Cancel this job work?"
              confirmLabel="Cancel job work" message="All material comes back into stock." onConfirm={() => cancel.mutate()} />
          </div>
        )
      }}
    </QueryState>
  )
}

function ReceiveJobWorkDialog({ open, job, onClose, onDone }: { open: boolean; job: JobWork; onClose: () => void; onDone: (j: JobWork) => void }) {
  const issued = (job.lines ?? []).filter((l) => l.direction === 'ISSUE' && l.pendingQuantity > 0)
  const [finished, setFinished] = useState<QtyLine[]>([])
  const [returned, setReturned] = useState<Record<string, string>>({})
  const [consumed, setConsumed] = useState<Record<string, string>>({})
  const [charges, setCharges] = useState('')
  const toLines = (r: Record<string, string>) => Object.entries(r).filter(([, q]) => Number(q) > 0).map(([productId, q]) => ({ productId, quantity: q }))
  const m = useMutation({
    mutationFn: () => api.post<JobWork>(`/api/v1/job-work/${job.id}/receive`, {
      finished: finished.map((l) => ({ productId: l.product.id, quantity: l.quantity })), returned: toLines(returned), consumed: toLines(consumed), charges: charges || undefined,
    }),
    onSuccess: (j) => { setFinished([]); setReturned({}); setConsumed({}); setCharges(''); onDone(j) },
  })
  const err = m.error instanceof ApiError ? m.error : null
  return (
    <Modal open={open} onClose={onClose} wide title="Receive from job work"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={<PackageCheck size={16} />} loading={m.isPending} onClick={() => m.mutate()}>Save</Button></>}>
      <div className="stack">
        <strong className="small">Finished goods (into stock)</strong>
        <QtyLines lines={finished} onChange={setFinished} label="Add finished product…" />
        {issued.length > 0 && <strong className="small">Material settled</strong>}
        {issued.map((l) => (
          <div key={l.id} className="quote-line">
            <span>{l.productName} <span className="xs muted">· {quantity(l.pendingQuantity)} {l.unit} still out</span></span>
            <div className="form-grid">
              <Field label="Returned unused (into stock)" htmlFor={`jr-${l.id}`}><Input id={`jr-${l.id}`} type="number" min={0} step="any" value={returned[l.productId] ?? ''} onChange={(e) => setReturned({ ...returned, [l.productId]: e.target.value })} /></Field>
              <Field label="Used up in the process" htmlFor={`jc-${l.id}`}><Input id={`jc-${l.id}`} type="number" min={0} step="any" value={consumed[l.productId] ?? ''} onChange={(e) => setConsumed({ ...consumed, [l.productId]: e.target.value })} /></Field>
            </div>
          </div>
        ))}
        <Field label="Job work charges" htmlFor="jw-ch"><PriceInput id="jw-ch" value={charges} onChange={(e) => setCharges(e.target.value)} /></Field>
        {err && <Alert tone="danger">{err.message}</Alert>}
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- agents and commission

/** Agents / brokers and their commission (§0B.9, COMMISSION module). */
export function AgentsPage() {
  const canWrite = useCan('CUSTOMER_WRITE')
  const canReport = useCan('REPORT_FINANCIAL')
  const [tab, setTab] = useState<'agents' | 'commission'>('agents')
  const [editing, setEditing] = useState<Agent | 'new' | null>(null)
  const agents = useQuery({ queryKey: ['agents'], queryFn: () => api.get<Agent[]>('/api/v1/commissions/agents') })
  return (
    <div className="stack">
      <PageHeader title="Agents & commission" subtitle="Brokers earn a percentage of the taxable value of their customers' invoices"
        actions={canWrite && <Button icon={<Plus size={16} />} onClick={() => setEditing('new')}>Add agent</Button>} />
      {canReport && <Tabs label="Sections" value={tab} onChange={setTab} tabs={[{ value: 'agents', label: 'Agents' }, { value: 'commission', label: 'Commission' }]} />}
      {tab === 'agents' && (
        <Card padded={false}>
          <QueryState query={agents} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No agents" description="Add an agent, then link customers to them from the customer page." />}>
            {(d) => (
              <DataTable rows={d} rowKey={(a) => a.id} onRowClick={canWrite ? (a) => setEditing(a) : undefined} columns={[
                { key: 'n', header: 'Agent', render: (a) => <div><strong>{a.name}</strong><div className="xs muted">{a.mobileNumber}</div></div> },
                { key: 'p', header: 'Rate', align: 'right', render: (a) => `${a.commissionPercent}%` },
                { key: 'c', header: 'Customers', align: 'right', priority: 'low', render: (a) => a.customerCount },
                { key: 'd', header: 'Pending', align: 'right', render: (a) => money(a.pendingCommission) },
                { key: 'pd', header: 'Paid', align: 'right', priority: 'low', render: (a) => money(a.paidCommission) },
                { key: 's', header: 'Status', render: (a) => <StatusBadge status={a.active ? 'ACTIVE' : 'INACTIVE'} /> },
              ]} />
            )}
          </QueryState>
        </Card>
      )}
      {tab === 'commission' && <CommissionReportCard agents={agents.data ?? []} />}
      <AgentDialog agent={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

function AgentDialog({ agent, onClose }: { agent: Agent | 'new' | null; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const existing = agent && agent !== 'new' ? agent : null
  const [v, setV] = useState<{ name: string; mobileNumber: string; commissionPercent: string; active: boolean } | null>(null)
  const form = v ?? { name: existing?.name ?? '', mobileNumber: existing?.mobileNumber?.replace('+91', '') ?? '', commissionPercent: existing ? String(existing.commissionPercent) : '', active: existing?.active ?? true }
  const close = () => { setV(null); onClose() }
  const m = useMutation({
    mutationFn: () => {
      const body = { name: form.name, mobileNumber: form.mobileNumber || undefined, commissionPercent: form.commissionPercent, active: form.active }
      return existing ? api.put<Agent>(`/api/v1/commissions/agents/${existing.id}`, body) : api.post<Agent>('/api/v1/commissions/agents', body)
    },
    onSuccess: () => { toast.success('Agent saved'); qc.invalidateQueries({ queryKey: ['agents'] }); close() },
  })
  const err = m.error instanceof ApiError ? m.error : null
  return (
    <Modal open={!!agent} onClose={close} title={existing ? 'Edit agent' : 'Add agent'}
      footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button loading={m.isPending} disabled={!form.name.trim() || form.commissionPercent === ''} onClick={() => m.mutate()}>Save</Button></>}>
      <div className="form-grid">
        <Field label="Name" htmlFor="ag-n" required className="span-2"><Input id="ag-n" value={form.name} onChange={(e) => setV({ ...form, name: e.target.value })} /></Field>
        <Field label="Mobile" htmlFor="ag-m"><Input id="ag-m" inputMode="numeric" value={form.mobileNumber} onChange={(e) => setV({ ...form, mobileNumber: e.target.value })} /></Field>
        <Field label="Commission %" htmlFor="ag-p" required hint="Applies to invoices generated from now on"><Input id="ag-p" type="number" min={0} max={100} step="0.01" value={form.commissionPercent} onChange={(e) => setV({ ...form, commissionPercent: e.target.value })} /></Field>
        {existing && <Switch label="Active" checked={form.active} onChange={(on) => setV({ ...form, active: on })} />}
      </div>
      {err && <Alert tone="danger">{err.message}</Alert>}
    </Modal>
  )
}

function CommissionReportCard({ agents }: { agents: Agent[] }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [agentId, setAgentId] = useState('')
  const [status, setStatus] = useState('PENDING')
  const [selected, setSelected] = useState<string[]>([])
  const report = useQuery({ queryKey: ['commission', agentId, status], queryFn: () => api.get<CommissionReport>('/api/v1/commissions/report', { agentId: agentId || undefined, status: status || undefined }) })
  const pay = useMutation({
    mutationFn: () => api.post<{ marked: number }>('/api/v1/commissions/pay', { invoiceIds: selected }),
    onSuccess: (r) => { toast.success(`Commission marked paid on ${r.marked} invoice${r.marked === 1 ? '' : 's'}`); setSelected([]); qc.invalidateQueries({ queryKey: ['commission'] }); qc.invalidateQueries({ queryKey: ['agents'] }) },
    onError: (e) => toast.error(e),
  })
  const total = (report.data?.rows ?? []).filter((r) => selected.includes(r.invoiceId)).reduce((s, r) => s + r.commissionAmount, 0)
  return (
    <Card padded={false}>
      <div className="toolbar">
        <Select aria-label="Agent" value={agentId} onChange={(e) => setAgentId(e.target.value)} style={{ width: 220 }} placeholder="All agents" options={agents.map((a) => ({ value: a.id, label: a.name }))} />
        <Select aria-label="Commission status" value={status} onChange={(e) => { setStatus(e.target.value); setSelected([]) }} style={{ width: 160 }} placeholder="Paid and pending"
          options={[{ value: 'PENDING', label: 'Pending' }, { value: 'PAID', label: 'Paid' }]} />
        <div className="grow" />
        {selected.length > 0 && <Button icon={<Wallet size={16} />} loading={pay.isPending} onClick={() => pay.mutate()}>Mark {money(total)} paid</Button>}
      </div>
      <QueryState query={report} isEmpty={(d) => d.rows.length === 0} empty={<EmptyState title="No commission" />}>
        {(d) => (
          <>
            <DataTable rows={d.rows} rowKey={(r) => r.invoiceId} columns={[
              { key: 'x', header: '', render: (r) => (r.paidAt ? null : <Checkbox label={<span className="sr-only">Select {r.invoiceNumber}</span>} checked={selected.includes(r.invoiceId)}
                onChange={(on) => setSelected(on ? [...selected, r.invoiceId] : selected.filter((s) => s !== r.invoiceId))} />) },
              { key: 'i', header: 'Invoice', render: (r) => <div><Link to={`/app/invoices/${r.invoiceId}`}>{r.invoiceNumber}</Link><div className="xs muted">{date(r.invoiceDate)}</div></div> },
              { key: 'c', header: 'Customer', render: (r) => <div>{r.customerName}<div className="xs muted">{r.agentName}</div></div> },
              { key: 't', header: 'Taxable', align: 'right', priority: 'low', render: (r) => money(r.taxableTotal) },
              { key: 'a', header: 'Commission', align: 'right', render: (r) => <div>{money(r.commissionAmount)}<div className="xs muted">{r.commissionPercent}%</div></div> },
              { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.paidAt ? 'PAID' : 'PENDING'} /> },
            ]} />
            <div className="card-body"><KeyValue items={[['Pending', money(d.pending)], ['Paid', money(d.paid)]]} /></div>
          </>
        )}
      </QueryState>
    </Card>
  )
}

// ---------------------------------------------------------------- projects

/** All project / site accounts (§0B.9, PROJECT_ACCOUNTS module). Add projects from the customer page. */
export function ProjectsPage() {
  const [status, setStatus] = useState('ACTIVE')
  const [statement, setStatement] = useState<string | null>(null)
  const q = useQuery({ queryKey: ['projects', 'all', status], queryFn: () => api.get<Project[]>('/api/v1/projects', { status: status || undefined }) })
  return (
    <div className="stack">
      <PageHeader title="Projects / sites" subtitle="Billing and dues per site for contractor customers. Add a project from the customer's page." />
      <Card padded={false}>
        <div className="toolbar">
          <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 180 }} placeholder="Any status"
            options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'CLOSED', label: 'Closed' }]} />
        </div>
        <QueryState query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No projects" />}>
          {(d) => (
            <DataTable rows={d} rowKey={(p) => p.id} onRowClick={(p) => setStatement(p.id)} columns={[
              { key: 'n', header: 'Project', render: (p) => <div><strong>{p.name}</strong><div className="xs muted">{p.siteAddress}</div></div> },
              { key: 'c', header: 'Customer', render: (p) => <Link to={`/app/customers/${p.customerId}`} onClick={(e) => e.stopPropagation()}>{p.customerName}</Link> },
              { key: 'b', header: 'Billed', align: 'right', render: (p) => money(p.billed) },
              { key: 'o', header: 'Due', align: 'right', render: (p) => money(p.outstanding) },
              { key: 'g', header: 'Budget', align: 'right', priority: 'low', render: (p) => (p.budget != null ? money(p.budget) : '—') },
              { key: 's', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
            ]} />
          )}
        </QueryState>
      </Card>
      <ProjectStatementDialog id={statement} onClose={() => setStatement(null)} path={(id) => `/api/v1/projects/${id}/statement`} linkBase="/app" />
    </div>
  )
}
