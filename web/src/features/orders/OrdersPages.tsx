import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, CircleX, FileText, PackageCheck, Truck, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Badge, Card, DataTable, KeyValue, PageHeader, Pagination, StatusBadge, TaxBreakdown, Timeline } from '@/components/ui/Data'
import type { TimelineStep } from '@/components/ui/Data'
import { Alert, EmptyState, QueryState } from '@/components/ui/Feedback'
import { Field, Input, SearchInput, Select, Textarea } from '@/components/ui/Form'
import { ConfirmDialog, Modal } from '@/components/ui/Overlay'
import { useToast } from '@/components/ui/Toast'
import { RecordPaymentDialog } from '@/features/payments/RecordPaymentDialog'
import { useListParams } from '@/hooks/useListParams'
import { api } from '@/services/api'
import type { Order, OrderStatus, StatusHistory } from '@/services/types'
import { useCan } from '@/stores/auth'
import { date, dateTime, money, quantity, titleCase } from '@/utils/format'

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'PLACED', label: 'New' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'PACKING', label: 'Packing' },
  { value: 'READY_FOR_DELIVERY', label: 'Ready' },
  { value: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

/** O02/AD02 Orders list. */
export function OrdersPage() {
  const list = useListParams()
  const navigate = useNavigate()
  const q = useQuery({
    queryKey: ['orders', list.query],
    queryFn: () => api.page<Order>('/api/v1/orders', { ...list.query, pageSize: 20 }),
  })
  return (
    <div className="stack">
      <PageHeader title="Orders" subtitle="Customer orders and their fulfilment status" />
      <Card padded={false}>
        <div className="toolbar">
          <SearchInput className="search" value={list.search} onChange={list.setSearch} placeholder="Order number or customer" />
          <div className="chips" role="group" aria-label="Filter by status">
            {STATUS_FILTERS.map((s) => (
              <button key={s.value} className="chip" aria-pressed={list.get('status') === s.value} onClick={() => list.set('status', s.value)}>{s.label}</button>
            ))}
          </div>
          <Select aria-label="Payment status" value={list.get('paymentStatus')} onChange={(e) => list.set('paymentStatus', e.target.value)} style={{ width: 170 }}
            placeholder="Any payment" options={['PENDING', 'PAID', 'PARTIALLY_PAID', 'CREDIT', 'FAILED', 'REFUNDED'].map((v) => ({ value: v, label: titleCase(v) }))} />
          <Input type="date" aria-label="From date" value={list.get('from')} onChange={(e) => list.set('from', e.target.value)} style={{ width: 150 }} />
          <Input type="date" aria-label="To date" value={list.get('to')} onChange={(e) => list.set('to', e.target.value)} style={{ width: 150 }} />
        </div>
        <QueryState query={q} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No orders found" description="Orders placed by customers or staff appear here." />}>
          {(d) => (
            <>
              <DataTable
                rows={d.items}
                rowKey={(o) => o.id}
                onRowClick={(o) => navigate(`/app/orders/${o.id}`)}
                sort={list.sort}
                onSortChange={list.setSort}
                caption="Orders"
                columns={[
                  { key: 'n', header: 'Order', sortKey: 'orderNumber', render: (o) => <strong>{o.orderNumber}</strong> },
                  { key: 'c', header: 'Customer', render: (o) => <div><div>{o.customerName}</div><div className="xs muted">{o.customerCode}</div></div> },
                  { key: 'd', header: 'Placed', sortKey: 'placedAt', render: (o) => date(o.placedAt) },
                  { key: 's', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
                  { key: 'p', header: 'Payment', render: (o) => <div className="row" style={{ gap: 6 }}><StatusBadge status={o.paymentStatus} /><span className="xs muted">{titleCase(o.paymentMethod)}</span>{o.creditApprovalStatus === 'PENDING' && <Badge tone="warning">Credit approval</Badge>}</div> },
                  { key: 't', header: 'Total', align: 'right', sortKey: 'grandTotal', render: (o) => money(o.grandTotal) },
                  { key: 'b', header: 'Balance', align: 'right', render: (o) => (o.balanceDue > 0 ? money(o.balanceDue) : '—') },
                ]}
              />
              <Pagination meta={d.pagination} onPage={list.setPage} />
            </>
          )}
        </QueryState>
      </Card>
    </div>
  )
}

const FLOW: OrderStatus[] = ['PLACED', 'ACCEPTED', 'PACKING', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED']

export function orderTimeline(order: Order, history: StatusHistory[]): TimelineStep[] {
  const when = (s: string) => history.find((h) => h.newStatus === s)
  const terminalFailure = ['CANCELLED', 'REJECTED', 'DELIVERY_FAILED'].includes(order.status)
  const reached = terminalFailure ? history.map((h) => h.newStatus) : FLOW.slice(0, FLOW.indexOf(order.status) + 1)
  const steps: TimelineStep[] = FLOW.filter((s) => !terminalFailure || reached.includes(s)).map((s) => {
    const h = when(s)
    const done = reached.includes(s) && (s !== order.status || s === 'COMPLETED')
    return {
      label: titleCase(s === 'PLACED' ? 'Order placed' : s),
      state: s === order.status && !terminalFailure && s !== 'COMPLETED' ? 'current' : done ? 'done' : 'upcoming',
      detail: h ? `${dateTime(h.changedAt)}${h.changedBy ? ` · ${h.changedBy}` : ''}${h.note ? ` · ${h.note}` : ''}` : undefined,
    }
  })
  if (terminalFailure) {
    const h = when(order.status)
    steps.push({ label: titleCase(order.status), state: 'failed', detail: h ? `${dateTime(h.changedAt)}${h.note ? ` · ${h.note}` : ''}` : undefined })
  }
  return steps
}

type DialogKind = 'accept' | 'reject' | 'cancel' | 'dispatch' | 'deliver' | 'failed' | 'payment' | null

/** O03/AD03 Order detail with the status workflow actions (§7.2). */
export function OrderDetailPage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const canWrite = useCan('ORDER_WRITE')
  const canInvoice = useCan('INVOICE_WRITE')
  const canPay = useCan('PAYMENT_WRITE')
  const [dialog, setDialog] = useState<DialogKind>(null)
  const order = useQuery({ queryKey: ['order', id], queryFn: () => api.get<Order>(`/api/v1/orders/${id}`) })
  const history = useQuery({ queryKey: ['order', id, 'history'], queryFn: () => api.get<StatusHistory[]>(`/api/v1/orders/${id}/status-history`) })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['order', id] })
    qc.invalidateQueries({ queryKey: ['orders'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
  }
  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api.post<Order>(`/api/v1/orders/${id}/${path}`, body),
    onSuccess: (o) => {
      toast.success(`Order ${o.orderNumber}`, `Now ${titleCase(o.status)}`)
      setDialog(null)
      refresh()
    },
    onError: (e) => toast.error(e),
  })
  const invoice = useMutation({
    mutationFn: () => api.post<{ id: string; invoiceNumber: string }>('/api/v1/invoices', { orderId: id, generate: true }),
    onSuccess: (inv) => {
      toast.success('Invoice generated', inv.invoiceNumber)
      refresh()
      navigate(`/app/invoices/${inv.id}`)
    },
    onError: (e) => toast.error(e),
  })

  return (
    <QueryState query={order}>
      {(o) => {
        const s = o.status
        const activeInvoice = o.invoices?.find((i) => i.status !== 'CANCELLED' && i.status !== 'DRAFT')
        const uninvoiced = o.items?.some((i) => i.acceptedQuantity - i.cancelledQuantity - i.invoicedQuantity > 0)
        return (
          <div className="stack">
            <PageHeader
              breadcrumb={<Link to="/app/orders" className="row" style={{ gap: 4 }}><ArrowLeft size={14} /> Orders</Link>}
              title={<span className="row">{o.orderNumber} <StatusBadge status={s} /></span>}
              subtitle={`Placed ${dateTime(o.placedAt)} · ${o.source === 'STAFF' ? 'Placed by staff' : 'Placed by customer'}`}
              actions={canWrite && (
                <>
                  {s === 'PLACED' && <Button variant="danger" icon={<CircleX size={16} />} onClick={() => setDialog('reject')}>Reject</Button>}
                  {s === 'PLACED' && <Button icon={<Check size={16} />} onClick={() => setDialog('accept')}>{o.creditApprovalStatus === 'PENDING' ? 'Approve credit & accept' : 'Accept'}</Button>}
                  {s === 'ACCEPTED' && <Button icon={<PackageCheck size={16} />} loading={action.isPending} onClick={() => action.mutate({ path: 'packing' })}>Start packing</Button>}
                  {s === 'PACKING' && <Button icon={<PackageCheck size={16} />} loading={action.isPending} onClick={() => action.mutate({ path: 'ready-for-delivery' })}>Ready for delivery</Button>}
                  {s === 'READY_FOR_DELIVERY' && <Button icon={<Truck size={16} />} onClick={() => setDialog('dispatch')}>Dispatch</Button>}
                  {s === 'OUT_FOR_DELIVERY' && <Button variant="secondary" onClick={() => setDialog('failed')}>Delivery failed</Button>}
                  {s === 'OUT_FOR_DELIVERY' && <Button variant="success" icon={<Check size={16} />} onClick={() => setDialog('deliver')}>Mark delivered</Button>}
                  {s === 'DELIVERED' && <Button loading={action.isPending} onClick={() => action.mutate({ path: 'complete' })}>Complete</Button>}
                  {['ACCEPTED', 'PACKING', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY'].includes(s) && <Button variant="ghost" onClick={() => setDialog('cancel')}>Cancel order</Button>}
                </>
              )}
            />
            {o.creditApprovalStatus === 'PENDING' && <Alert tone="warning" title="Credit approval required">This credit order exceeds the customer's available credit. Accepting it approves the credit.</Alert>}
            {o.cancelReason && <Alert tone="danger" title={titleCase(s)}>{o.cancelReason}</Alert>}
            {o.rejectReason && <Alert tone="danger" title="Rejected">{o.rejectReason}</Alert>}
            <div className="detail-grid">
              <div className="stack">
                <Card title="Items" padded={false}>
                  <DataTable
                    rows={o.items ?? []}
                    rowKey={(i) => i.id}
                    columns={[
                      { key: 'p', header: 'Product', render: (i) => (
                        <div>
                          <div style={{ fontWeight: 600 }}>{i.productName} {i.freeItem && <Badge tone="success">Free</Badge>}</div>
                          <div className="xs muted">{i.sku} · HSN {i.hsnCode ?? '—'}{i.unitFactor !== 1 ? ` · 1 ${i.unit} = ${Number(i.unitFactor)}` : ''}</div>
                          {i.schemeName && <div className="xs muted">Scheme: {i.schemeName}</div>}
                        </div>
                      ) },
                      { key: 'o', header: 'Ordered', align: 'right', render: (i) => `${quantity(i.orderedQuantity)} ${i.unit}` },
                      { key: 'a', header: 'Accepted', align: 'right', render: (i) => (s === 'PLACED' ? '—' : quantity(i.acceptedQuantity)) },
                      { key: 'dl', header: 'Delivered', align: 'right', render: (i) => quantity(i.deliveredQuantity) },
                      { key: 'x', header: 'Cancelled', align: 'right', render: (i) => (i.cancelledQuantity > 0 ? <span className="danger-text">{quantity(i.cancelledQuantity)}</span> : '—') },
                      { key: 'r', header: 'Rate', align: 'right', render: (i) => money(i.rate) },
                      { key: 't', header: 'GST', align: 'right', render: (i) => `${i.taxRate}%` },
                      { key: 'l', header: 'Amount', align: 'right', render: (i) => money(i.lineTotal) },
                    ]}
                  />
                  <div className="card-body" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ width: 'min(340px, 100%)' }}><TaxBreakdown t={o} /></div>
                  </div>
                </Card>
                <Card title="Invoices & payments" actions={
                  <>
                    {canInvoice && s !== 'PLACED' && !['CANCELLED', 'REJECTED', 'DELIVERY_FAILED'].includes(s) && uninvoiced && (
                      <Button size="sm" icon={<FileText size={14} />} loading={invoice.isPending} onClick={() => invoice.mutate()}>Generate invoice</Button>
                    )}
                    {canPay && activeInvoice && activeInvoice.outstanding > 0 && (
                      <Button size="sm" variant="secondary" icon={<Wallet size={14} />} onClick={() => setDialog('payment')}>Record payment</Button>
                    )}
                  </>
                }>
                  {o.invoices?.length ? (
                    <ul className="list-plain">
                      {o.invoices.map((i) => (
                        <li key={i.id}>
                          <Link to={`/app/invoices/${i.id}`}>{i.invoiceNumber ?? 'Draft invoice'}</Link>
                          <span className="row" style={{ gap: 8 }}><StatusBadge status={i.status} /><span className="num">{money(i.grandTotal)}</span>{i.outstanding > 0 && <span className="xs warning-text">Due {money(i.outstanding)}</span>}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="muted small">{s === 'PLACED' ? 'Accept the order to invoice it.' : 'Not invoiced yet.'}</p>}
                  <div className="divider" />
                  <KeyValue items={[
                    ['Payment method', titleCase(o.paymentMethod)],
                    ['Payment status', <StatusBadge key="ps" status={o.paymentStatus} />],
                    ['Paid', money(o.paidAmount)],
                    ['Balance due', <strong key="bd">{money(o.balanceDue)}</strong>],
                  ]} />
                </Card>
              </div>
              <div className="stack">
                <Card title="Status timeline">
                  <Timeline steps={orderTimeline(o, history.data ?? [])} />
                </Card>
                <Card title="Customer & delivery">
                  <KeyValue items={[
                    ['Customer', <Link key="c" to={`/app/customers/${o.customerId}`}>{o.customerName}</Link>],
                    ['Code', o.customerCode],
                    ['Deliver to', o.deliveryAddress],
                    ['Contact', o.contactMobile],
                    ['Supply', o.interState ? 'Inter-state (IGST)' : 'Intra-state (CGST + SGST)'],
                    ['Note', o.orderNote],
                    ...(o.delivery ? ([
                      ['Delivery person', o.delivery.deliveryPerson],
                      ['Vehicle', o.delivery.vehicleNumber],
                      ['Dispatched', dateTime(o.delivery.dispatchedAt)],
                      ['Delivered', o.delivery.deliveredAt ? dateTime(o.delivery.deliveredAt) : undefined],
                      ['Received by', o.delivery.receivedBy],
                    ] as [string, React.ReactNode][]) : []),
                  ]} />
                </Card>
              </div>
            </div>

            <AcceptDialog open={dialog === 'accept'} order={o} loading={action.isPending} onClose={() => setDialog(null)}
              onSubmit={(items, note) => action.mutate({ path: 'accept', body: { items, note } })} />
            <DeliverDialog open={dialog === 'deliver'} order={o} loading={action.isPending} onClose={() => setDialog(null)}
              onSubmit={(body) => action.mutate({ path: 'deliver', body })} />
            <DispatchDialog open={dialog === 'dispatch'} loading={action.isPending} onClose={() => setDialog(null)}
              onSubmit={(body) => action.mutate({ path: 'out-for-delivery', body })} />
            <ConfirmDialog open={dialog === 'reject'} onClose={() => setDialog(null)} title="Reject order" tone="danger" requireReason confirmLabel="Reject order"
              message="Reserved stock is released and any online payment is refunded." loading={action.isPending}
              onConfirm={(reason) => action.mutate({ path: 'reject', body: { reason } })} />
            <ConfirmDialog open={dialog === 'cancel'} onClose={() => setDialog(null)} title="Cancel order" tone="danger" requireReason confirmLabel="Cancel order"
              message="The order's invoice is cancelled, stock is released and online payments are refunded. Cash payments stay as customer credit." loading={action.isPending}
              onConfirm={(reason) => action.mutate({ path: 'cancel', body: { reason } })} />
            <ConfirmDialog open={dialog === 'failed'} onClose={() => setDialog(null)} title="Delivery failed" tone="danger" requireReason confirmLabel="Mark failed"
              message="This closes the order: stock is released and the invoice is cancelled." loading={action.isPending}
              onConfirm={(reason) => action.mutate({ path: 'delivery-failed', body: { reason } })} />
            {activeInvoice && (
              <RecordPaymentDialog open={dialog === 'payment'} onClose={() => setDialog(null)} customerId={o.customerId} invoiceId={activeInvoice.id}
                maxAmount={activeInvoice.outstanding} onDone={refresh} />
            )}
          </div>
        )
      }}
    </QueryState>
  )
}

function AcceptDialog({ open, order, onClose, onSubmit, loading }: { open: boolean; order: Order; onClose: () => void; onSubmit: (items: { orderItemId: string; acceptedQuantity: string }[], note: string) => void; loading: boolean }) {
  const [qty, setQty] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const items = order.items ?? []
  return (
    <Modal open={open} onClose={onClose} title="Accept order" wide footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button loading={loading} onClick={() => onSubmit(items.map((i) => ({ orderItemId: i.id, acceptedQuantity: qty[i.id] ?? String(i.orderedQuantity) })), note)}>Accept order</Button>
      </>
    }>
      <div className="stack">
        <p className="small muted">Reduce a quantity to accept the order partially. Unaccepted stock is released.</p>
        <DataTable rows={items} rowKey={(i) => i.id} columns={[
          { key: 'p', header: 'Product', render: (i) => i.productName },
          { key: 'o', header: 'Ordered', align: 'right', render: (i) => quantity(i.orderedQuantity) },
          { key: 'a', header: 'Accept', align: 'right', render: (i) => (
            <Input type="number" aria-label={`Accepted quantity for ${i.productName}`} min={0} max={i.orderedQuantity} step="any" style={{ width: 100, textAlign: 'right' }}
              value={qty[i.id] ?? String(i.orderedQuantity)} onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })} />
          ) },
        ]} />
        <Field label="Note (optional)" htmlFor="accept-note"><Input id="accept-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></Field>
      </div>
    </Modal>
  )
}

function DeliverDialog({ open, order, onClose, onSubmit, loading }: { open: boolean; order: Order; onClose: () => void; onSubmit: (body: unknown) => void; loading: boolean }) {
  const items = (order.items ?? []).filter((i) => i.acceptedQuantity - i.cancelledQuantity - i.deliveredQuantity > 0)
  const [qty, setQty] = useState<Record<string, string>>({})
  const [receivedBy, setReceivedBy] = useState('')
  const [proof, setProof] = useState('')
  const deliverable = (i: (typeof items)[number]) => i.acceptedQuantity - i.cancelledQuantity - i.deliveredQuantity
  return (
    <Modal open={open} onClose={onClose} title="Mark delivered" wide footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="success" loading={loading} onClick={() => onSubmit({
          items: items.map((i) => ({ orderItemId: i.id, deliveredQuantity: qty[i.id] ?? String(deliverable(i)) })),
          receivedBy: receivedBy || undefined, proofOfDelivery: proof || undefined, customerConfirmed: !!receivedBy,
        })}>Confirm delivery</Button>
      </>
    }>
      <div className="stack">
        <Alert tone="info">Delivered quantities leave stock now. Short quantities are cancelled and, if already invoiced, credited automatically.</Alert>
        <DataTable rows={items} rowKey={(i) => i.id} columns={[
          { key: 'p', header: 'Product', render: (i) => i.productName },
          { key: 'd', header: 'To deliver', align: 'right', render: (i) => quantity(deliverable(i)) },
          { key: 'q', header: 'Delivered', align: 'right', render: (i) => (
            <Input type="number" aria-label={`Delivered quantity for ${i.productName}`} min={0} max={deliverable(i)} step="any" style={{ width: 100, textAlign: 'right' }}
              value={qty[i.id] ?? String(deliverable(i))} onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })} />
          ) },
        ]} />
        <div className="form-grid">
          <Field label="Received by" htmlFor="received-by"><Input id="received-by" value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} /></Field>
          <Field label="Proof of delivery" htmlFor="pod" hint="e.g. signed challan number"><Input id="pod" value={proof} onChange={(e) => setProof(e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  )
}

function DispatchDialog({ open, onClose, onSubmit, loading }: { open: boolean; onClose: () => void; onSubmit: (body: unknown) => void; loading: boolean }) {
  const [form, setForm] = useState({ deliveryPerson: '', deliveryPersonMobile: '', vehicleNumber: '', notes: '' })
  return (
    <Modal open={open} onClose={onClose} title="Dispatch order" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button loading={loading} onClick={() => onSubmit({ ...form, deliveryPersonMobile: form.deliveryPersonMobile || undefined })}>Dispatch</Button>
      </>
    }>
      <div className="form-grid">
        <Field label="Delivery person" htmlFor="dp"><Input id="dp" value={form.deliveryPerson} onChange={(e) => setForm({ ...form, deliveryPerson: e.target.value })} /></Field>
        <Field label="Mobile" htmlFor="dpm"><Input id="dpm" inputMode="numeric" maxLength={10} value={form.deliveryPersonMobile} onChange={(e) => setForm({ ...form, deliveryPersonMobile: e.target.value.replace(/\D/g, '') })} /></Field>
        <Field label="Vehicle number" htmlFor="veh"><Input id="veh" value={form.vehicleNumber} onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value.toUpperCase() })} /></Field>
        <Field label="Notes" htmlFor="dn" className="span-2"><Textarea id="dn" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  )
}
