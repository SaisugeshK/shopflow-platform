import clsx from 'clsx'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ClipboardList, LogOut, Plus, Send, Trash2, Truck, User, X } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom'
import { AnimatedOutlet } from '@/components/layout/AnimatedOutlet'
import { BusinessBrand, PoweredBy, useBusinessTitle } from '@/components/layout/BusinessBrand'
import { Button, IconButton } from '@/components/ui/Button'
import { Card, DataTable, KeyValue, PageHeader, StatusBadge, Tabs } from '@/components/ui/Data'
import { Alert, EmptyState, QueryState } from '@/components/ui/Feedback'
import { Field, Input, PriceInput, Select, Textarea } from '@/components/ui/Form'
import { ConfirmDialog } from '@/components/ui/Overlay'
import { useToast } from '@/components/ui/Toast'
import { BusinessSwitchButton } from '@/features/auth/BusinessSwitchButton'
import { useLogout } from '@/features/auth/useSession'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { AttachmentsCard, PoLinesTable, ReceiptsCard, RevisionsCard } from '@/features/procurement/PoParts'
import { api, ApiError } from '@/services/api'
import type { GoodsReceipt, PoLine, PurchaseOrder } from '@/services/types'
import { useAuthStore } from '@/stores/auth'
import { date, money, quantity, titleCase, today } from '@/utils/format'

const NAV = [
  { to: '/supplier', label: 'Purchase orders', icon: ClipboardList, end: true },
  { to: '/supplier/deliveries', label: 'Deliveries', icon: Truck },
  { to: '/supplier/profile', label: 'Profile', icon: User },
]

/** Supplier portal layout (§0B.8): the buying business's branding, own orders only. */
export function SupplierShell() {
  useBusinessTitle('Supplier portal')
  const logout = useLogout()
  const supplier = useAuthStore((s) => s.user?.supplier)
  return (
    <div className="portal">
      <a href="#main" className="sr-only">Skip to content</a>
      <header className="portal-header">
        <div className="portal-header-inner">
          <NavLink to="/supplier" className="row" style={{ fontWeight: 700, color: 'var(--color-text)' }}>
            <BusinessBrand nameClassName="portal-brand-name" />
          </NavLink>
          <nav className="portal-nav" aria-label="Main">
            {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => clsx(isActive && 'active')}>{n.label}</NavLink>)}
          </nav>
          <div className="grow" />
          <span className="small muted desktop-only" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{supplier?.name}</span>
          <BusinessSwitchButton />
          <NotificationBell />
          <IconButton label="Sign out" onClick={() => logout.mutate()}><LogOut size={18} /></IconButton>
        </div>
      </header>
      <main id="main" className="portal-main" tabIndex={-1}>
        <AnimatedOutlet />
        <div className="portal-credit"><PoweredBy /></div>
      </main>
      <nav className="bottom-nav" aria-label="Bottom navigation">
        {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => clsx(isActive && 'active')}><n.icon size={20} />{n.label === 'Purchase orders' ? 'Orders' : n.label}</NavLink>)}
      </nav>
    </div>
  )
}

type Filter = 'OPEN' | 'ALL'
const WAITING = ['SENT', 'COUNTERED']

export function SupplierOrdersPage() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('OPEN')
  const q = useQuery({ queryKey: ['supplier-pos'], queryFn: () => api.page<PurchaseOrder>('/api/v1/supplier-portal/purchase-orders', { pageSize: 100 }) })
  return (
    <div className="stack">
      <PageHeader title="Purchase orders" subtitle="Orders from this business: quote your prices, availability and delivery dates" />
      <Tabs label="Orders" value={filter} onChange={setFilter} tabs={[{ value: 'OPEN', label: 'Waiting for me' }, { value: 'ALL', label: 'All orders' }]} />
      <Card padded={false}>
        <QueryState query={q} isEmpty={(d) => d.items.filter((p) => filter === 'ALL' || WAITING.includes(p.status)).length === 0}
          empty={<EmptyState title={filter === 'OPEN' ? 'Nothing waiting for your quotation' : 'No purchase orders yet'} />}>
          {(d) => (
            <DataTable rows={d.items.filter((p) => filter === 'ALL' || WAITING.includes(p.status))} rowKey={(p) => p.id}
              onRowClick={(p) => navigate(`/supplier/orders/${p.id}`)} columns={[
                { key: 'n', header: 'PO', render: (p) => <div><strong>{p.poNumber}</strong><div className="xs muted">{date(p.orderDate)}{p.expectedDate ? ` · needed by ${date(p.expectedDate)}` : ''}</div></div> },
                { key: 't', header: 'Value', align: 'right', render: (p) => money(p.grandTotal) },
                { key: 's', header: 'Status', render: (p) => <StatusBadge status={WAITING.includes(p.status) ? 'PENDING' : p.status} /> },
              ]} />
          )}
        </QueryState>
      </Card>
    </div>
  )
}

interface QuoteLine { quantity: string; rate: string; availability: string; deliveryDate: string; note: string; substituteNote: string }
interface Extra { description: string; quantity: string; unit: string; rate: string; taxRate: string }

export function SupplierOrderPage() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const toast = useToast()
  const [values, setValues] = useState<Record<string, QuoteLine>>({})
  const [extras, setExtras] = useState<Extra[]>([])
  const [header, setHeader] = useState({ quoteValidUntil: '', expectedDate: '', note: '' })
  const [declining, setDeclining] = useState(false)
  const q = useQuery({ queryKey: ['po', id], queryFn: () => api.get<PurchaseOrder>(`/api/v1/supplier-portal/purchase-orders/${id}`) })
  const lineValue = (l: PoLine): QuoteLine => values[l.id] ?? { quantity: String(l.quantity), rate: String(l.rate), availability: l.availability,
    deliveryDate: l.deliveryDate ?? '', note: l.lineNote ?? '', substituteNote: l.substituteNote ?? '' }
  const quote = useMutation({
    mutationFn: (po: PurchaseOrder) => api.put<PurchaseOrder>(`/api/v1/supplier-portal/purchase-orders/${id}/quote`, {
      lines: (po.lines ?? []).filter((l) => l.status === 'OPEN').map((l) => {
        const v = lineValue(l)
        return { lineId: l.id, quantity: v.quantity, rate: v.rate, availability: v.availability, deliveryDate: v.deliveryDate || undefined,
          note: v.note, substituteNote: v.substituteNote }
      }),
      extraLines: extras.filter((e) => e.description.trim() && Number(e.quantity) > 0).map((e) => ({ description: e.description, quantity: e.quantity, unit: e.unit || undefined, rate: e.rate || '0', taxRate: e.taxRate || '0' })),
      quoteValidUntil: header.quoteValidUntil || undefined, expectedDate: header.expectedDate || undefined, note: header.note || undefined,
    }),
    onSuccess: (po) => { toast.success('Quotation sent', `${po.poNumber} · ${money(po.grandTotal)}`); setValues({}); setExtras([]); qc.setQueryData(['po', id], po); qc.invalidateQueries({ queryKey: ['supplier-pos'] }) },
  })
  const decline = useMutation({
    mutationFn: (reason: string) => api.post<PurchaseOrder>(`/api/v1/supplier-portal/purchase-orders/${id}/decline`, { reason }),
    onSuccess: (po) => { toast.success('Order declined'); setDeclining(false); qc.setQueryData(['po', id], po); qc.invalidateQueries({ queryKey: ['supplier-pos'] }) },
    onError: (e) => toast.error(e),
  })
  const err = quote.error instanceof ApiError ? quote.error : null
  return (
    <QueryState query={q}>
      {(po) => {
        const canQuote = WAITING.includes(po.status)
        const set = (l: PoLine, patch: Partial<QuoteLine>) => setValues({ ...values, [l.id]: { ...lineValue(l), ...patch } })
        return (
          <div className="stack">
            <PageHeader breadcrumb={<Link to="/supplier" className="row" style={{ gap: 4 }}><ArrowLeft size={14} /> Purchase orders</Link>}
              title={<span className="row">{po.poNumber} <StatusBadge status={po.status} /></span>}
              subtitle={`${po.businessName} · ${date(po.orderDate)}${po.expectedDate ? ` · needed by ${date(po.expectedDate)}` : ''}`}
              actions={canQuote && <Button variant="danger" icon={<X size={16} />} onClick={() => setDeclining(true)}>Decline</Button>} />
            {po.notes && <Alert tone="info" title="Note from the buyer">{po.notes}</Alert>}
            {po.status === 'COUNTERED' && <Alert tone="warning" title="Counter-offer">The buyer changed some terms. Review the lines and send your quotation again.</Alert>}
            {po.status === 'QUOTED' && <Alert tone="success">Your quotation was sent. The buyer can accept, counter or reject it.</Alert>}
            {po.status === 'ACCEPTED' && <Alert tone="success" title="Accepted">Please deliver the accepted lines.</Alert>}
            {canQuote ? (
              <Card title="Your quotation">
                <div className="stack">
                  {(po.lines ?? []).filter((l) => l.status === 'OPEN').map((l) => {
                    const v = lineValue(l)
                    return (
                      <div key={l.id} className="quote-line">
                        <div className="row-between"><strong>{l.lineNumber}. {l.description}</strong><span className="xs muted">asked {quantity(l.quantity)} {l.unit} at {money(l.rate)}</span></div>
                        {l.lineNote && <span className="xs muted">Note: {l.lineNote}</span>}
                        <div className="form-grid">
                          <Field label={`Quantity (${l.unit})`} htmlFor={`sq-${l.id}`}><Input id={`sq-${l.id}`} type="number" min={0} step="any" value={v.quantity} onChange={(e) => set(l, { quantity: e.target.value })} /></Field>
                          <Field label="Your rate" htmlFor={`sr-${l.id}`}><PriceInput id={`sr-${l.id}`} value={v.rate} onChange={(e) => set(l, { rate: e.target.value })} /></Field>
                          <Field label="Availability" htmlFor={`sa-${l.id}`}>
                            <Select id={`sa-${l.id}`} value={v.availability} onChange={(e) => set(l, { availability: e.target.value })}
                              options={[{ value: 'AVAILABLE', label: 'Available' }, { value: 'PARTIAL', label: 'Partly available' }, { value: 'UNAVAILABLE', label: 'Not available' }]} />
                          </Field>
                          <Field label="Delivery date" htmlFor={`sd-${l.id}`}><Input id={`sd-${l.id}`} type="date" min={today()} value={v.deliveryDate} onChange={(e) => set(l, { deliveryDate: e.target.value })} /></Field>
                          <Field label="Note" htmlFor={`sn-${l.id}`}><Input id={`sn-${l.id}`} value={v.note} onChange={(e) => set(l, { note: e.target.value })} /></Field>
                          <Field label="Substitute suggestion" htmlFor={`ss-${l.id}`}><Input id={`ss-${l.id}`} value={v.substituteNote} onChange={(e) => set(l, { substituteNote: e.target.value })} /></Field>
                        </div>
                      </div>
                    )
                  })}
                  <div className="stack-sm">
                    <div className="row-between"><strong className="small">Suggest more items</strong>
                      <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setExtras([...extras, { description: '', quantity: '1', unit: 'PCS', rate: '', taxRate: '18' }])}>Add item</Button></div>
                    {extras.map((e, i) => (
                      <div key={i} className="charge-row">
                        <Input aria-label="Item description" placeholder="Item" value={e.description} onChange={(ev) => setExtras(extras.map((x, idx) => (idx === i ? { ...x, description: ev.target.value } : x)))} />
                        <Input aria-label="Item quantity" type="number" min={0} value={e.quantity} onChange={(ev) => setExtras(extras.map((x, idx) => (idx === i ? { ...x, quantity: ev.target.value } : x)))} />
                        <PriceInput aria-label="Item rate" placeholder="Rate" value={e.rate} onChange={(ev) => setExtras(extras.map((x, idx) => (idx === i ? { ...x, rate: ev.target.value } : x)))} />
                        <Select aria-label="Item GST" value={e.taxRate} onChange={(ev) => setExtras(extras.map((x, idx) => (idx === i ? { ...x, taxRate: ev.target.value } : x)))} options={['0', '5', '12', '18', '28'].map((r) => ({ value: r, label: `${r}% GST` }))} />
                        <IconButton label="Remove item" onClick={() => setExtras(extras.filter((_, idx) => idx !== i))}><Trash2 size={16} /></IconButton>
                      </div>
                    ))}
                  </div>
                  <div className="form-grid">
                    <Field label="Quotation valid until" htmlFor="sv"><Input id="sv" type="date" min={today()} value={header.quoteValidUntil} onChange={(e) => setHeader({ ...header, quoteValidUntil: e.target.value })} /></Field>
                    <Field label="Can deliver by" htmlFor="se"><Input id="se" type="date" min={today()} value={header.expectedDate} onChange={(e) => setHeader({ ...header, expectedDate: e.target.value })} /></Field>
                    <Field label="Message to the buyer" htmlFor="snote" className="span-2"><Textarea id="snote" value={header.note} onChange={(e) => setHeader({ ...header, note: e.target.value })} /></Field>
                  </div>
                  {err && <Alert tone="danger">{err.message}</Alert>}
                  <div className="form-actions"><Button icon={<Send size={16} />} loading={quote.isPending} onClick={() => quote.mutate(po)}>Send quotation</Button></div>
                </div>
              </Card>
            ) : (
              <Card title="Lines" padded={false}>
                <PoLinesTable po={po} showReceipt={['ACCEPTED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED'].includes(po.status)} />
                <div className="card-body"><KeyValue items={[['Taxable', money(po.taxableTotal)], ['GST', money(po.taxTotal)], ['Total', <strong key="t">{money(po.grandTotal)}</strong>]]} /></div>
              </Card>
            )}
            <div className="grid-2">
              <RevisionsCard revisions={po.revisions} />
              <div className="stack">
                <AttachmentsCard po={po} base={`/api/v1/supplier-portal/purchase-orders/${po.id}`} canUpload={!['CANCELLED', 'REJECTED', 'CLOSED'].includes(po.status)} />
                <ReceiptsCard receipts={po.receipts} />
              </div>
            </div>
            <ConfirmDialog open={declining} onClose={() => setDeclining(false)} tone="danger" requireReason loading={decline.isPending} title="Decline this order?"
              confirmLabel="Decline" message="The buyer is told and can send a new order later." onConfirm={(reason) => decline.mutate(reason)} />
          </div>
        )
      }}
    </QueryState>
  )
}

export function SupplierDeliveriesPage() {
  const q = useQuery({ queryKey: ['supplier-deliveries'], queryFn: () => api.get<GoodsReceipt[]>('/api/v1/supplier-portal/deliveries') })
  return (
    <div className="stack">
      <PageHeader title="Deliveries" subtitle="Goods the buyer recorded as received from you" />
      <Card padded={false}>
        <QueryState query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No deliveries recorded yet" />}>
          {(rows) => (
            <DataTable rows={rows} rowKey={(g) => g.id} columns={[
              { key: 'n', header: 'Receipt', render: (g) => <div><strong>{g.grnNumber}</strong><div className="xs muted">{date(g.receiptDate)} · {g.poNumber}</div></div> },
              { key: 'i', header: 'Items', render: (g) => <div className="xs">{g.lines.map((l) => <div key={l.id}>{l.description}: {quantity(l.receivedQuantity)}{l.damagedQuantity > 0 ? ` (${quantity(l.damagedQuantity)} damaged)` : ''}</div>)}</div> },
              { key: 'v', header: 'Your invoice', priority: 'low', render: (g) => g.supplierInvoiceNumber ?? '—' },
              { key: 'm', header: '', render: (g) => (g.hasMismatch ? <StatusBadge status="PENDING" /> : <StatusBadge status="COMPLETED" />) },
            ]} />
          )}
        </QueryState>
      </Card>
    </div>
  )
}

export function SupplierProfilePage() {
  const user = useAuthStore((s) => s.user)!
  const logout = useLogout()
  return (
    <div className="stack">
      <PageHeader title="Profile" />
      <Card>
        <KeyValue items={[['Supplier', user.supplier?.name], ['Supplier code', user.supplier?.supplierCode], ['Login', user.fullName], ['Mobile', user.mobileNumber], ['Buying business', user.business?.name], ['Role', titleCase(user.role)]]} />
      </Card>
      <p className="small muted">To change your details, contact the buying business.</p>
      <div><Button variant="secondary" icon={<LogOut size={16} />} onClick={() => logout.mutate()}>Sign out</Button></div>
    </div>
  )
}
