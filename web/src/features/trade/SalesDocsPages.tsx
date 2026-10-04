import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, FileText, Plus, Receipt, Send, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card, DataTable, KeyValue, PageHeader, StatusBadge } from '@/components/ui/Data'
import { Alert, EmptyState, QueryState } from '@/components/ui/Feedback'
import { Field, Input, Select, Textarea } from '@/components/ui/Form'
import { ConfirmDialog, Modal } from '@/components/ui/Overlay'
import { PageActions } from '@/components/ui/PageActions'
import { useToast } from '@/components/ui/Toast'
import { api, ApiError } from '@/services/api'
import type { DeliveryChallan, Quotation } from '@/services/types'
import { useCan } from '@/stores/auth'
import { date, money, quantity, titleCase, today } from '@/utils/format'
import { CustomerChooser, DocLinesCard, docLinePayload, ProjectChooser } from './TradeParts'
import type { DocLine } from './TradeParts'

const QUOTE_STATUSES = ['DRAFT', 'SENT', 'CONVERTED', 'REJECTED', 'EXPIRED', 'CANCELLED']
const PAY_OPTIONS = ['CASH', 'CREDIT', 'UPI', 'BANK_TRANSFER', 'OTHER'].map((v) => ({ value: v, label: v === 'CREDIT' ? 'Credit' : titleCase(v) }))

// ---------------------------------------------------------------- quotations

/** Customer quotations (§0B.9, QUOTATIONS module). */
export function QuotationsPage() {
  const navigate = useNavigate()
  const canWrite = useCan('ORDER_WRITE')
  const [status, setStatus] = useState('')
  const q = useQuery({ queryKey: ['quotations', status], queryFn: () => api.get<Quotation[]>('/api/v1/quotations', { status: status || undefined }) })
  return (
    <div className="stack">
      <PageHeader title="Quotations" subtitle="Quote prices to a customer; when they accept, an order is placed at these rates"
        actions={canWrite && <Button icon={<Plus size={16} />} onClick={() => navigate('/app/quotations/new')}>New quotation</Button>} />
      <Card padded={false}>
        <div className="toolbar">
          <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 200 }} placeholder="Any status"
            options={QUOTE_STATUSES.map((s) => ({ value: s, label: titleCase(s) }))} />
        </div>
        <QueryState query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No quotations" description="Create one and send it to the customer." />}>
          {(d) => (
            <DataTable rows={d} rowKey={(x) => x.id} onRowClick={(x) => navigate(`/app/quotations/${x.id}`)} columns={[
              { key: 'n', header: 'Quotation', render: (x) => <div><strong>{x.quotationNumber}</strong><div className="xs muted">{date(x.quoteDate)}</div></div> },
              { key: 'c', header: 'Customer', render: (x) => <div>{x.customerName}{x.projectName && <div className="xs muted">{x.projectName}</div>}</div> },
              { key: 'v', header: 'Valid until', priority: 'low', render: (x) => date(x.validUntil) },
              { key: 't', header: 'Total', align: 'right', render: (x) => money(x.grandTotal) },
              { key: 's', header: 'Status', render: (x) => <StatusBadge status={x.status} /> },
            ]} />
          )}
        </QueryState>
      </Card>
    </div>
  )
}

export function QuotationFormPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const [customerId, setCustomerId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<DocLine[]>([])
  const save = useMutation({
    mutationFn: async (send: boolean) => {
      const created = await api.post<Quotation>('/api/v1/quotations', {
        customerId, projectId: projectId || undefined, validUntil: validUntil || undefined, notes: notes || undefined,
        items: lines.map((l) => docLinePayload(l, true)),
      })
      return send ? api.post<Quotation>(`/api/v1/quotations/${created.id}/send`) : created
    },
    onSuccess: (x) => {
      toast.success(x.status === 'SENT' ? 'Quotation sent' : 'Quotation saved', x.quotationNumber)
      qc.invalidateQueries({ queryKey: ['quotations'] })
      navigate(`/app/quotations/${x.id}`)
    },
  })
  const err = save.error instanceof ApiError ? save.error : null
  const valid = customerId && lines.length > 0 && lines.every((l) => Number(l.quantity) > 0)
  return (
    <div className="stack">
      <PageHeader breadcrumb={<Link to="/app/quotations" className="row" style={{ gap: 4 }}><ArrowLeft size={14} /> Quotations</Link>} title="New quotation"
        subtitle="Leave the rate empty to use the customer's price. Valid for 15 days unless you choose a date." />
      <Card title="Customer">
        <div className="form-grid">
          <CustomerChooser idPrefix="qt" value={customerId} onChange={(id) => { setCustomerId(id); setProjectId('') }} />
          <ProjectChooser idPrefix="qt" customerId={customerId} value={projectId} onChange={setProjectId} />
          <Field label="Valid until" htmlFor="qt-v"><Input id="qt-v" type="date" min={today()} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></Field>
          <Field label="Terms / note to customer" htmlFor="qt-n" className="span-2"><Textarea id="qt-n" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
      </Card>
      <DocLinesCard lines={lines} onChange={setLines} withDiscount rateHint="Customer price" />
      {err && <Alert tone="danger">{err.message}</Alert>}
      <div className="form-actions">
        <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
        <Button variant="secondary" disabled={!valid} loading={save.isPending && save.variables === false} onClick={() => save.mutate(false)}>Save draft</Button>
        <Button icon={<Send size={16} />} disabled={!valid} loading={save.isPending && save.variables === true} onClick={() => save.mutate(true)}>Save & send</Button>
      </div>
    </div>
  )
}

export function QuotationDetailPage() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const toast = useToast()
  const canWrite = useCan('ORDER_WRITE')
  const [dialog, setDialog] = useState<'accept' | 'reject' | 'cancel' | null>(null)
  const q = useQuery({ queryKey: ['quotation', id], queryFn: () => api.get<Quotation>(`/api/v1/quotations/${id}`) })
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api.post<Quotation>(`/api/v1/quotations/${id}/${path}`, body),
    onSuccess: (x) => { toast.success(`Quotation ${titleCase(x.status).toLowerCase()}`); setDialog(null); qc.setQueryData(['quotation', id], x); qc.invalidateQueries({ queryKey: ['quotations'] }) },
    onError: (e) => toast.error(e),
  })
  return (
    <QueryState query={q}>
      {(x) => {
        const s = x.status
        const open = s === 'DRAFT' || s === 'SENT'
        return (
          <div className="stack">
            <PageHeader breadcrumb={<Link to="/app/quotations" className="row" style={{ gap: 4 }}><ArrowLeft size={14} /> Quotations</Link>}
              title={<span className="row">{x.quotationNumber} <StatusBadge status={s} /></span>}
              subtitle={`${x.customerName} · ${date(x.quoteDate)}${x.validUntil ? ` · valid until ${date(x.validUntil)}` : ''}`}
              actions={canWrite && (
                <PageActions
                  primary={s === 'DRAFT' ? { key: 'send', label: 'Send to customer', icon: <Send size={16} />, loading: act.isPending, onClick: () => act.mutate({ path: 'send' }) }
                    : s === 'SENT' ? { key: 'accept', label: 'Accept & place order', icon: <Check size={16} />, onClick: () => setDialog('accept') } : undefined}
                  actions={[
                    { key: 'accept2', label: 'Accept & place order', show: s === 'DRAFT', onClick: () => setDialog('accept') },
                    { key: 'reject', label: 'Mark rejected', icon: <X size={16} />, variant: 'danger', show: open, onClick: () => setDialog('reject') },
                    { key: 'cancel', label: 'Cancel', variant: 'ghost', show: open || s === 'EXPIRED', onClick: () => setDialog('cancel') },
                  ]}
                />
              )}
            />
            {s === 'SENT' && <Alert tone="info">Waiting for the customer. They can accept or decline it from their account, or you can accept it for them.</Alert>}
            {s === 'CONVERTED' && x.orderId && <Alert tone="success" title="Order placed">Order <Link to={`/app/orders/${x.orderId}`}>{x.orderNumber}</Link> was placed at the quoted rates.</Alert>}
            {x.decisionNote && s !== 'CONVERTED' && <Alert tone="warning">{x.decisionNote}</Alert>}
            <div className="detail-grid">
              <Card title="Items" padded={false}>
                <DataTable rows={x.items ?? []} rowKey={(i) => i.id} columns={[
                  { key: 'p', header: 'Product', render: (i) => <div><strong>{i.productName}</strong><div className="xs muted">HSN {i.hsnCode ?? '—'} · {i.taxRate}% GST</div></div> },
                  { key: 'q', header: 'Qty', align: 'right', render: (i) => `${quantity(i.quantity)} ${i.unit}` },
                  { key: 'r', header: 'Rate', align: 'right', render: (i) => money(i.rate) },
                  { key: 'd', header: 'Disc', align: 'right', render: (i) => (i.discountPercent > 0 ? `${i.discountPercent}%` : '—') },
                  { key: 'a', header: 'Amount', align: 'right', render: (i) => money(i.lineTotal) },
                ]} />
                <div className="card-body"><KeyValue items={[['Gross', money(x.subtotal)], ['Discount', x.discountTotal > 0 ? `−${money(x.discountTotal)}` : '—'], ['Taxable', money(x.taxableTotal)],
                  [x.interState ? 'IGST' : 'CGST + SGST', money(x.taxTotal)], ['Total', <strong key="t">{money(x.grandTotal)}</strong>]]} /></div>
              </Card>
              <Card title="Summary">
                <KeyValue items={[['Customer', <Link key="c" to={`/app/customers/${x.customerId}`}>{x.customerName}</Link>], ['Project', x.projectName], ['Quote date', date(x.quoteDate)],
                  ['Valid until', date(x.validUntil)], ['Sent', date(x.sentAt)], ['Decided', date(x.decidedAt)], ['Terms', x.notes]]} />
              </Card>
            </div>
            <AcceptQuotationDialog open={dialog === 'accept'} loading={act.isPending} onClose={() => setDialog(null)} onAccept={(body) => act.mutate({ path: 'accept', body })} />
            <ConfirmDialog open={dialog === 'reject' || dialog === 'cancel'} onClose={() => setDialog(null)} tone="danger" loading={act.isPending}
              title={dialog === 'reject' ? 'Mark this quotation rejected?' : 'Cancel this quotation?'} confirmLabel={dialog === 'reject' ? 'Mark rejected' : 'Cancel quotation'}
              message="It stays in history." onConfirm={() => act.mutate({ path: dialog === 'reject' ? 'reject' : 'cancel', body: {} })} />
          </div>
        )
      }}
    </QueryState>
  )
}

/** Payment choice when a quotation is accepted (staff or customer). */
export function AcceptQuotationDialog({ open, loading, onClose, onAccept }: { open: boolean; loading: boolean; onClose: () => void; onAccept: (body: { paymentMethod: string; note?: string }) => void }) {
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [note, setNote] = useState('')
  return (
    <Modal open={open} onClose={onClose} title="Accept quotation"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={<Check size={16} />} loading={loading} onClick={() => onAccept({ paymentMethod, note: note || undefined })}>Accept & place order</Button></>}>
      <div className="stack">
        <p className="small muted">An order is placed at the quoted rates and goes through the normal order steps.</p>
        <Field label="Payment" htmlFor="qa-pay"><Select id="qa-pay" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} options={PAY_OPTIONS} /></Field>
        <Field label="Note (optional)" htmlFor="qa-note"><Input id="qa-note" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- delivery challans

/** Delivery challans (§0B.9, DELIVERY_CHALLAN module). */
export function ChallansPage() {
  const navigate = useNavigate()
  const canWrite = useCan('INVOICE_WRITE')
  const [status, setStatus] = useState('')
  const q = useQuery({ queryKey: ['challans', status], queryFn: () => api.get<DeliveryChallan[]>('/api/v1/delivery-challans', { status: status || undefined }) })
  return (
    <div className="stack">
      <PageHeader title="Delivery challans" subtitle="Goods leave now and are invoiced later; the invoice does not move stock again"
        actions={canWrite && <Button icon={<Plus size={16} />} onClick={() => navigate('/app/delivery-challans/new')}>New challan</Button>} />
      <Card padded={false}>
        <div className="toolbar">
          <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 200 }} placeholder="Any status"
            options={['ISSUED', 'INVOICED', 'CANCELLED'].map((s) => ({ value: s, label: titleCase(s) }))} />
        </div>
        <QueryState query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No challans" />}>
          {(d) => (
            <DataTable rows={d} rowKey={(x) => x.id} onRowClick={(x) => navigate(`/app/delivery-challans/${x.id}`)} columns={[
              { key: 'n', header: 'Challan', render: (x) => <div><strong>{x.challanNumber}</strong><div className="xs muted">{date(x.challanDate)}</div></div> },
              { key: 'c', header: 'Customer', render: (x) => <div>{x.customerName}{x.projectName && <div className="xs muted">{x.projectName}</div>}</div> },
              { key: 'p', header: 'Purpose', priority: 'low', render: (x) => titleCase(x.purpose) },
              { key: 'v', header: 'Value', align: 'right', render: (x) => money(x.totalValue) },
              { key: 's', header: 'Status', render: (x) => <StatusBadge status={x.status} /> },
            ]} />
          )}
        </QueryState>
      </Card>
    </div>
  )
}

export function ChallanFormPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const [customerId, setCustomerId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [header, setHeader] = useState({ purpose: 'SUPPLY', vehicleNumber: '', transport: '', destination: '', notes: '' })
  const [lines, setLines] = useState<DocLine[]>([])
  const save = useMutation({
    mutationFn: () => api.post<DeliveryChallan>('/api/v1/delivery-challans', {
      customerId, projectId: projectId || undefined, ...Object.fromEntries(Object.entries(header).filter(([, v]) => v)),
      items: lines.map((l) => docLinePayload(l)),
    }),
    onSuccess: (x) => { toast.success('Challan issued', x.challanNumber); qc.invalidateQueries({ queryKey: ['challans'] }); navigate(`/app/delivery-challans/${x.id}`) },
  })
  const err = save.error instanceof ApiError ? save.error : null
  const valid = customerId && lines.length > 0 && lines.every((l) => Number(l.quantity) > 0)
  return (
    <div className="stack">
      <PageHeader breadcrumb={<Link to="/app/delivery-challans" className="row" style={{ gap: 4 }}><ArrowLeft size={14} /> Delivery challans</Link>} title="New delivery challan"
        subtitle="Stock leaves when you issue it. Batches go first-expiry-first-out." />
      <Card title="Customer & dispatch">
        <div className="form-grid">
          <CustomerChooser idPrefix="dc" value={customerId} onChange={(id) => { setCustomerId(id); setProjectId('') }} />
          <ProjectChooser idPrefix="dc" customerId={customerId} value={projectId} onChange={setProjectId} />
          <Field label="Purpose" htmlFor="dc-p"><Select id="dc-p" value={header.purpose} onChange={(e) => setHeader({ ...header, purpose: e.target.value })}
            options={['SUPPLY', 'APPROVAL', 'JOB_WORK', 'OTHER'].map((v) => ({ value: v, label: titleCase(v) }))} /></Field>
          <Field label="Vehicle number" htmlFor="dc-v"><Input id="dc-v" value={header.vehicleNumber} onChange={(e) => setHeader({ ...header, vehicleNumber: e.target.value.toUpperCase() })} /></Field>
          <Field label="Transport" htmlFor="dc-t"><Input id="dc-t" value={header.transport} onChange={(e) => setHeader({ ...header, transport: e.target.value })} /></Field>
          <Field label="Destination" htmlFor="dc-d"><Input id="dc-d" value={header.destination} onChange={(e) => setHeader({ ...header, destination: e.target.value })} /></Field>
          <Field label="Notes" htmlFor="dc-n" className="span-2"><Textarea id="dc-n" value={header.notes} onChange={(e) => setHeader({ ...header, notes: e.target.value })} /></Field>
        </div>
      </Card>
      <DocLinesCard lines={lines} onChange={setLines} rateHint="Customer price" />
      {err && <Alert tone="danger">{err.message}</Alert>}
      <div className="form-actions">
        <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
        <Button icon={<FileText size={16} />} disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>Issue challan</Button>
      </div>
    </div>
  )
}

export function ChallanDetailPage() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const canWrite = useCan('INVOICE_WRITE')
  const [dialog, setDialog] = useState<'invoice' | 'cancel' | null>(null)
  const [paymentType, setPaymentType] = useState('CASH')
  const q = useQuery({ queryKey: ['challan', id], queryFn: () => api.get<DeliveryChallan>(`/api/v1/delivery-challans/${id}`) })
  const refresh = () => { qc.invalidateQueries({ queryKey: ['challan', id] }); qc.invalidateQueries({ queryKey: ['challans'] }) }
  const cancel = useMutation({
    mutationFn: (reason: string) => api.post(`/api/v1/delivery-challans/${id}/cancel`, { reason }),
    onSuccess: () => { toast.success('Challan cancelled; stock is back'); setDialog(null); refresh() },
    onError: (e) => toast.error(e),
  })
  const invoice = useMutation({
    mutationFn: () => api.post<{ invoiceId: string; invoiceNumber: string }>(`/api/v1/delivery-challans/${id}/invoice`, { paymentType }),
    onSuccess: (r) => { toast.success('Invoice generated', r.invoiceNumber); refresh(); qc.invalidateQueries({ queryKey: ['invoices'] }); navigate(`/app/invoices/${r.invoiceId}`) },
  })
  const invoiceErr = invoice.error instanceof ApiError ? invoice.error : null
  return (
    <QueryState query={q}>
      {(x) => (
        <div className="stack">
          <PageHeader breadcrumb={<Link to="/app/delivery-challans" className="row" style={{ gap: 4 }}><ArrowLeft size={14} /> Delivery challans</Link>}
            title={<span className="row">{x.challanNumber} <StatusBadge status={x.status} /></span>}
            subtitle={`${x.customerName} · ${date(x.challanDate)} · ${titleCase(x.purpose)}`}
            actions={canWrite && x.status === 'ISSUED' && (
              <PageActions primary={{ key: 'invoice', label: 'Create invoice', icon: <Receipt size={16} />, onClick: () => setDialog('invoice') }}
                actions={[{ key: 'cancel', label: 'Cancel challan', icon: <X size={16} />, variant: 'ghost', onClick: () => setDialog('cancel') }]} />
            )}
          />
          {x.status === 'INVOICED' && x.invoiceId && <Alert tone="success" title="Invoiced">Billed on invoice <Link to={`/app/invoices/${x.invoiceId}`}>{x.invoiceNumber}</Link>.</Alert>}
          {x.cancelReason && <Alert tone="danger" title="Cancelled">{x.cancelReason}</Alert>}
          <div className="detail-grid">
            <Card title="Items" padded={false}>
              <DataTable rows={x.items ?? []} rowKey={(i) => i.id} columns={[
                { key: 'p', header: 'Product', render: (i) => <div><strong>{i.productName}</strong>
                  {i.batchDetails && <div className="xs muted">{i.batchDetails}</div>}
                  {i.serialNumbers.length > 0 && <div className="xs muted">S/N {i.serialNumbers.join(', ')}</div>}</div> },
                { key: 'q', header: 'Qty', align: 'right', render: (i) => `${quantity(i.quantity)} ${i.unit}` },
                { key: 'r', header: 'Rate', align: 'right', render: (i) => money(i.rate) },
                { key: 'a', header: 'Value', align: 'right', render: (i) => money(i.quantity * i.rate) },
              ]} />
              <div className="card-body"><KeyValue items={[['Value before tax', <strong key="v">{money(x.totalValue)}</strong>]]} /></div>
            </Card>
            <Card title="Dispatch">
              <KeyValue items={[['Customer', <Link key="c" to={`/app/customers/${x.customerId}`}>{x.customerName}</Link>], ['Project', x.projectName], ['Vehicle', x.vehicleNumber],
                ['Transport', x.transport], ['Destination', x.destination], ['Notes', x.notes]]} />
            </Card>
          </div>
          <Modal open={dialog === 'invoice'} onClose={() => setDialog(null)} title="Invoice this challan"
            footer={<><Button variant="secondary" onClick={() => setDialog(null)}>Cancel</Button><Button loading={invoice.isPending} onClick={() => invoice.mutate()}>Generate invoice</Button></>}>
            <div className="stack">
              <p className="small muted">The invoice uses the challan's lines and rates with GST. Stock already left with the challan.</p>
              <Field label="Payment" htmlFor="dc-pay"><Select id="dc-pay" value={paymentType} onChange={(e) => setPaymentType(e.target.value)} options={PAY_OPTIONS} /></Field>
              {invoiceErr && <Alert tone="danger">{invoiceErr.message}</Alert>}
            </div>
          </Modal>
          <ConfirmDialog open={dialog === 'cancel'} onClose={() => setDialog(null)} tone="danger" requireReason loading={cancel.isPending}
            title="Cancel this challan?" confirmLabel="Cancel challan" message="The goods come back into stock." onConfirm={(reason) => cancel.mutate(reason ?? '')} />
        </div>
      )}
    </QueryState>
  )
}
