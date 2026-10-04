import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, PackageCheck, Plus, Send, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, IconButton } from '@/components/ui/Button'
import { Card, DataTable, KeyValue, PageHeader, Pagination, StatusBadge } from '@/components/ui/Data'
import { Alert, EmptyState, QueryState } from '@/components/ui/Feedback'
import { Checkbox, Field, Input, PriceInput, SearchInput, Select, Textarea } from '@/components/ui/Form'
import { ConfirmDialog, Modal } from '@/components/ui/Overlay'
import { PageActions } from '@/components/ui/PageActions'
import { useToast } from '@/components/ui/Toast'
import { ProductPicker } from '@/features/products/ProductPicker'
import { unitOptions } from '@/features/products/ProductOptions'
import { useListParams } from '@/hooks/useListParams'
import { api, ApiError } from '@/services/api'
import type { Product, PurchaseOrder, Supplier } from '@/services/types'
import { useCan } from '@/stores/auth'
import { date, money, quantity, titleCase, today } from '@/utils/format'
import { AttachmentsCard, PoLinesTable, ReceiptsCard, RevisionsCard } from './PoParts'

const STATUSES = ['DRAFT', 'SENT', 'QUOTED', 'COUNTERED', 'ACCEPTED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'REJECTED', 'CANCELLED', 'EXPIRED']

/** Purchase orders sent to suppliers (§0B.8). */
export function PurchaseOrdersPage() {
  const list = useListParams()
  const navigate = useNavigate()
  const canWrite = useCan('PURCHASE_WRITE')
  const q = useQuery({ queryKey: ['pos', list.query], queryFn: () => api.page<PurchaseOrder>('/api/v1/purchase-orders', { ...list.query, pageSize: 20 }) })
  return (
    <div className="stack">
      <PageHeader title="Purchase orders" subtitle="Ask suppliers for quotations, agree prices, then receive the goods"
        actions={canWrite && <Button icon={<Plus size={16} />} onClick={() => navigate('/app/purchase-orders/new')}>New purchase order</Button>} />
      <Card padded={false}>
        <div className="toolbar">
          <SearchInput className="search" value={list.search} onChange={list.setSearch} placeholder="PO number" />
          <Select aria-label="Status" value={list.get('status')} onChange={(e) => list.set('status', e.target.value)} style={{ width: 200 }} placeholder="Any status"
            options={STATUSES.map((s) => ({ value: s, label: titleCase(s) }))} />
        </div>
        <QueryState query={q} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No purchase orders" description="Create one and send it to a supplier for a quotation." />}>
          {(d) => (
            <>
              <DataTable rows={d.items} rowKey={(p) => p.id} onRowClick={(p) => navigate(`/app/purchase-orders/${p.id}`)} columns={[
                { key: 'n', header: 'PO', render: (p) => <div><strong>{p.poNumber}</strong><div className="xs muted">{date(p.orderDate)}</div></div> },
                { key: 's', header: 'Supplier', render: (p) => p.supplierName },
                { key: 'r', header: 'Round', align: 'right', priority: 'low', render: (p) => p.revision || '—' },
                { key: 't', header: 'Total', align: 'right', render: (p) => money(p.grandTotal) },
                { key: 'st', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
              ]} />
              <Pagination meta={d.pagination} onPage={list.setPage} />
            </>
          )}
        </QueryState>
      </Card>
    </div>
  )
}

interface DraftLine { key: string; product: Product; quantity: string; rate: string; unit: string; note: string }

export function PurchaseOrderFormPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const suppliers = useQuery({ queryKey: ['suppliers', 'all'], queryFn: () => api.page<Supplier>('/api/v1/suppliers', { active: true, pageSize: 100 }) })
  const [supplierId, setSupplierId] = useState('')
  const [expectedDate, setExpectedDate] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([])
  const save = useMutation({
    mutationFn: (send: boolean) => api.post<PurchaseOrder>('/api/v1/purchase-orders', {
      supplierId, expectedDate: expectedDate || undefined, notes: notes || undefined, send,
      lines: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity, rate: l.rate || undefined, unit: l.unit !== l.product.unit ? l.unit : undefined, note: l.note || undefined })),
    }),
    onSuccess: (po) => {
      toast.success(po.status === 'SENT' ? 'Sent to supplier' : 'Saved as draft', po.poNumber)
      qc.invalidateQueries({ queryKey: ['pos'] })
      navigate(`/app/purchase-orders/${po.id}`)
    },
  })
  const err = save.error instanceof ApiError ? save.error : null
  const supplier = suppliers.data?.items.find((s) => s.id === supplierId)
  const valid = supplierId && lines.length > 0 && lines.every((l) => Number(l.quantity) > 0)
  const update = (i: number, patch: Partial<DraftLine>) => setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  return (
    <div className="stack">
      <PageHeader breadcrumb={<Link to="/app/purchase-orders" className="row" style={{ gap: 4 }}><ArrowLeft size={14} /> Purchase orders</Link>} title="New purchase order"
        subtitle="Rates are your target prices; the supplier can change everything in their quotation" />
      <Card title="Supplier">
        <div className="form-grid">
          <Field label="Supplier" htmlFor="po-sup" required>
            <Select id="po-sup" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} placeholder="Choose supplier" options={(suppliers.data?.items ?? []).map((s) => ({ value: s.id, label: `${s.name} (${s.supplierCode})` }))} />
          </Field>
          <Field label="Needed by" htmlFor="po-exp"><Input id="po-exp" type="date" min={today()} value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} /></Field>
          <Field label="Note to supplier" htmlFor="po-notes" className="span-2"><Textarea id="po-notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
        {supplier && <p className="xs muted" style={{ marginTop: 8 }}>The supplier sees the order in their supplier login once you send it. Invite them from the supplier's page if they have no login yet.</p>}
      </Card>
      <Card title="Items" padded={false}>
        <div style={{ padding: 16 }}><ProductPicker exclude={lines.map((l) => l.product.id)} onPick={(p) => setLines([...lines, { key: `${p.id}-${Date.now()}`, product: p, quantity: '1', rate: String(p.purchasePrice), unit: p.unit, note: '' }])} /></div>
        {lines.length === 0 ? <EmptyState title="No items yet" /> : (
          <DataTable rows={lines.map((l, i) => ({ ...l, i }))} rowKey={(l) => l.key} columns={[
            { key: 'p', header: 'Product', render: (l) => <div className="stack-sm"><strong>{l.product.name}</strong>
              <Input aria-label={`Note for ${l.product.name}`} placeholder="Note (optional)" value={l.note} onChange={(e) => update(l.i, { note: e.target.value })} /></div> },
            { key: 'q', header: 'Qty', align: 'right', render: (l) => (
              <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                <Input aria-label={`Quantity of ${l.product.name}`} type="number" min={0} step="any" style={{ width: 90, textAlign: 'right' }} value={l.quantity} onChange={(e) => update(l.i, { quantity: e.target.value })} />
                {l.product.units.length > 0 ? <Select aria-label={`Unit of ${l.product.name}`} style={{ width: 110 }} value={l.unit} onChange={(e) => update(l.i, { unit: e.target.value })} options={unitOptions(l.product)} /> : <span className="xs muted">{l.product.unit}</span>}
              </div>
            ) },
            { key: 'r', header: 'Target rate', align: 'right', render: (l) => <PriceInput aria-label={`Rate of ${l.product.name}`} style={{ width: 130 }} value={l.rate} onChange={(e) => update(l.i, { rate: e.target.value })} /> },
            { key: 'x', header: '', render: (l) => <IconButton label={`Remove ${l.product.name}`} onClick={() => setLines(lines.filter((_, idx) => idx !== l.i))}><Trash2 size={16} /></IconButton> },
          ]} />
        )}
      </Card>
      {err && <Alert tone="danger">{err.message}</Alert>}
      <div className="form-actions">
        <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
        <Button variant="secondary" disabled={!valid} loading={save.isPending && save.variables === false} onClick={() => save.mutate(false)}>Save draft</Button>
        <Button icon={<Send size={16} />} disabled={!valid} loading={save.isPending && save.variables === true} onClick={() => save.mutate(true)}>Send to supplier</Button>
      </div>
    </div>
  )
}

export function PurchaseOrderDetailPage() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const toast = useToast()
  const canWrite = useCan('PURCHASE_WRITE')
  const [dialog, setDialog] = useState<'counter' | 'accept' | 'receive' | 'reject' | 'cancel' | null>(null)
  const q = useQuery({ queryKey: ['po', id], queryFn: () => api.get<PurchaseOrder>(`/api/v1/purchase-orders/${id}`) })
  const refresh = (po?: PurchaseOrder) => {
    if (po) qc.setQueryData(['po', id], po)
    qc.invalidateQueries({ queryKey: ['pos'] })
  }
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api.post<PurchaseOrder>(`/api/v1/purchase-orders/${id}/${path}`, body),
    onSuccess: (po) => { toast.success(`Purchase order ${titleCase(po.status).toLowerCase()}`); setDialog(null); refresh(po) },
    onError: (e) => toast.error(e),
  })
  return (
    <QueryState query={q}>
      {(po) => {
        const s = po.status
        return (
          <div className="stack">
            <PageHeader breadcrumb={<Link to="/app/purchase-orders" className="row" style={{ gap: 4 }}><ArrowLeft size={14} /> Purchase orders</Link>}
              title={<span className="row">{po.poNumber} <StatusBadge status={s} /></span>}
              subtitle={`${po.supplierName} · ${date(po.orderDate)}${po.revision ? ` · round ${po.revision}` : ''}`}
              actions={canWrite && (
                <PageActions
                  primary={s === 'DRAFT' ? { key: 'send', label: 'Send to supplier', icon: <Send size={16} />, loading: act.isPending, onClick: () => act.mutate({ path: 'send' }) }
                    : s === 'QUOTED' ? { key: 'accept', label: 'Accept', icon: <Check size={16} />, onClick: () => setDialog('accept') }
                      : s === 'ACCEPTED' || s === 'PARTIALLY_RECEIVED' ? { key: 'receive', label: 'Receive goods', icon: <PackageCheck size={16} />, onClick: () => setDialog('receive') }
                        : undefined}
                  actions={[
                    { key: 'counter', label: s === 'DRAFT' ? 'Edit lines' : 'Counter-offer', show: s === 'QUOTED' || s === 'DRAFT', onClick: () => setDialog('counter') },
                    { key: 'reject', label: 'Reject', icon: <X size={16} />, variant: 'danger', show: ['SENT', 'QUOTED', 'COUNTERED'].includes(s), onClick: () => setDialog('reject') },
                    { key: 'close', label: 'Close order', show: s === 'PARTIALLY_RECEIVED' || s === 'RECEIVED', onClick: () => act.mutate({ path: 'close' }) },
                    { key: 'cancel', label: 'Cancel', variant: 'ghost', show: ['DRAFT', 'SENT', 'QUOTED', 'COUNTERED', 'ACCEPTED'].includes(s), onClick: () => setDialog('cancel') },
                  ]}
                />
              )}
            />
            {s === 'SENT' && <Alert tone="info">Waiting for {po.supplierName}'s quotation.{!po.supplierHasPortal && ' The supplier has no login yet — invite them from the supplier page.'}</Alert>}
            {s === 'COUNTERED' && <Alert tone="info">Your counter-offer is with the supplier.</Alert>}
            {s === 'QUOTED' && <Alert tone="warning" title="Quotation received">{po.supplierNote ?? 'Review the lines and accept, counter or reject.'}{po.quoteValidUntil ? ` Valid until ${date(po.quoteValidUntil)}.` : ''}</Alert>}
            {po.cancelReason && <Alert tone="danger">{po.cancelReason}</Alert>}
            <div className="detail-grid">
              <div className="stack">
                <Card title="Lines" padded={false}>
                  <PoLinesTable po={po} showReceipt={['ACCEPTED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED'].includes(s)} />
                  <div className="card-body"><KeyValue items={[['Taxable', money(po.taxableTotal)], ['GST', money(po.taxTotal)], ['Total', <strong key="t">{money(po.grandTotal)}</strong>]]} /></div>
                </Card>
                <ReceiptsCard receipts={po.receipts} />
              </div>
              <div className="stack">
                <Card title="Summary">
                  <KeyValue items={[['Supplier', po.supplierName], ['Needed by', date(po.expectedDate)], ['Quote valid until', date(po.quoteValidUntil)],
                    ['Note to supplier', po.notes], ['Supplier note', po.supplierNote], ['Supply', po.interState ? 'Inter-state' : 'Intra-state']]} />
                </Card>
                <RevisionsCard revisions={po.revisions} />
                <AttachmentsCard po={po} base={`/api/v1/purchase-orders/${po.id}`} canUpload={canWrite} />
              </div>
            </div>
            <CounterDialog open={dialog === 'counter'} po={po} onClose={() => setDialog(null)} onDone={(p) => { toast.success(p.status === 'DRAFT' ? 'Lines saved' : 'Counter-offer sent'); setDialog(null); refresh(p) }} />
            <AcceptDialog open={dialog === 'accept'} po={po} onClose={() => setDialog(null)} onDone={(p) => { toast.success('Quotation accepted', `${p.poNumber} · ${money(p.grandTotal)}`); setDialog(null); refresh(p) }} />
            <ReceiveDialog open={dialog === 'receive'} po={po} onClose={() => setDialog(null)} onDone={(p) => { toast.success('Goods received', p.receipts?.[0]?.grnNumber); setDialog(null); refresh(p); qc.invalidateQueries({ queryKey: ['purchases'] }) }} />
            <ConfirmDialog open={dialog === 'reject' || dialog === 'cancel'} onClose={() => setDialog(null)} tone="danger" requireReason loading={act.isPending}
              title={dialog === 'reject' ? 'Reject this quotation?' : 'Cancel this purchase order?'} confirmLabel={dialog === 'reject' ? 'Reject' : 'Cancel order'}
              message="The supplier is told; the order stays in history." onConfirm={(reason) => act.mutate({ path: dialog === 'reject' ? 'reject' : 'cancel', body: { reason } })} />
          </div>
        )
      }}
    </QueryState>
  )
}

function CounterDialog({ open, po, onClose, onDone }: { open: boolean; po: PurchaseOrder; onClose: () => void; onDone: (p: PurchaseOrder) => void }) {
  const open_ = (po.lines ?? []).filter((l) => l.status === 'OPEN')
  const [edits, setEdits] = useState<Record<string, { rate: string; quantity: string }>>({})
  const [note, setNote] = useState('')
  const m = useMutation({
    mutationFn: () => api.put<PurchaseOrder>(`/api/v1/purchase-orders/${po.id}/counter`, {
      note: note || undefined,
      lines: Object.entries(edits).map(([lineId, v]) => ({ lineId, rate: v.rate || undefined, quantity: v.quantity || undefined })),
    }),
    onSuccess: (p) => { setEdits({}); setNote(''); onDone(p) },
  })
  const err = m.error instanceof ApiError ? m.error : null
  const set = (id: string, patch: Partial<{ rate: string; quantity: string }>) => setEdits({ ...edits, [id]: { ...{ rate: '', quantity: '' }, ...edits[id], ...patch } })
  return (
    <Modal open={open} onClose={onClose} wide title={po.status === 'DRAFT' ? 'Edit lines' : 'Counter-offer'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} disabled={Object.keys(edits).length === 0} onClick={() => m.mutate()}>{po.status === 'DRAFT' ? 'Save' : 'Send counter-offer'}</Button></>}>
      <div className="stack">
        {open_.map((l) => (
          <div key={l.id} className="quote-line">
            <strong>{l.description}</strong>
            <div className="form-grid">
              <Field label={`Quantity (${l.unit}) · now ${quantity(l.quantity)}`} htmlFor={`c-q-${l.id}`}><Input id={`c-q-${l.id}`} type="number" min={0} step="any" value={edits[l.id]?.quantity ?? ''} onChange={(e) => set(l.id, { quantity: e.target.value })} /></Field>
              <Field label={`Rate · now ${money(l.rate)}`} htmlFor={`c-r-${l.id}`}><PriceInput id={`c-r-${l.id}`} value={edits[l.id]?.rate ?? ''} onChange={(e) => set(l.id, { rate: e.target.value })} /></Field>
            </div>
          </div>
        ))}
        {po.status !== 'DRAFT' && <Field label="Message to supplier" htmlFor="c-note"><Textarea id="c-note" value={note} onChange={(e) => setNote(e.target.value)} /></Field>}
        {err && <Alert tone="danger">{err.message}</Alert>}
      </div>
    </Modal>
  )
}

function AcceptDialog({ open, po, onClose, onDone }: { open: boolean; po: PurchaseOrder; onClose: () => void; onDone: (p: PurchaseOrder) => void }) {
  const candidates = (po.lines ?? []).filter((l) => l.status === 'OPEN' && l.availability !== 'UNAVAILABLE' && l.quantity > 0)
  const [selected, setSelected] = useState<string[] | null>(null)
  const [links, setLinks] = useState<Record<string, Product>>({})
  const chosen = selected ?? candidates.map((l) => l.id)
  const m = useMutation({
    mutationFn: () => api.post<PurchaseOrder>(`/api/v1/purchase-orders/${po.id}/accept`, {
      lineIds: chosen, productLinks: Object.fromEntries(Object.entries(links).map(([k, p]) => [k, p.id])),
    }),
    onSuccess: (p) => { setSelected(null); setLinks({}); onDone(p) },
  })
  const err = m.error instanceof ApiError ? m.error : null
  const needLink = candidates.filter((l) => !l.productId && chosen.includes(l.id) && !links[l.id])
  return (
    <Modal open={open} onClose={onClose} wide title="Accept quotation"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} disabled={chosen.length === 0 || needLink.length > 0} onClick={() => m.mutate()}>Accept {chosen.length} line{chosen.length === 1 ? '' : 's'}</Button></>}>
      <div className="stack">
        <p className="small muted">Accepted lines are locked at these terms; unselected and unavailable lines are rejected.</p>
        {candidates.map((l) => (
          <div key={l.id} className="quote-line">
            <Checkbox label={`${l.description} — ${quantity(l.quantity)} ${l.unit} × ${money(l.rate)} = ${money(l.lineTotal)}`} checked={chosen.includes(l.id)}
              onChange={(on) => setSelected(on ? [...chosen, l.id] : chosen.filter((x) => x !== l.id))} />
            {!l.productId && chosen.includes(l.id) && (
              <Field label="Link to your product (supplier added this line)" htmlFor={`link-${l.id}`}>
                {links[l.id] ? <div className="row-between"><strong>{links[l.id]!.name}</strong><Button size="sm" variant="ghost" onClick={() => { const n = { ...links }; delete n[l.id]; setLinks(n) }}>Change</Button></div>
                  : <ProductPicker exclude={[]} onPick={(p) => setLinks({ ...links, [l.id]: p })} />}
              </Field>
            )}
          </div>
        ))}
        {err && <Alert tone="danger">{err.message}</Alert>}
      </div>
    </Modal>
  )
}

interface ReceiveLine { received: string; damaged: string; rate: string; batchNumber: string; expiryDate: string; serials: string }

function ReceiveDialog({ open, po, onClose, onDone }: { open: boolean; po: PurchaseOrder; onClose: () => void; onDone: (p: PurchaseOrder) => void }) {
  const lines = (po.lines ?? []).filter((l) => l.status === 'ACCEPTED')
  const [values, setValues] = useState<Record<string, ReceiveLine>>({})
  const [invoice, setInvoice] = useState({ number: '', date: '', receiptDate: today(), notes: '' })
  const get = (id: string, pending: number, rate: number): ReceiveLine => values[id] ?? { received: String(pending), damaged: '', rate: String(rate), batchNumber: '', expiryDate: '', serials: '' }
  const set = (id: string, cur: ReceiveLine, patch: Partial<ReceiveLine>) => setValues({ ...values, [id]: { ...cur, ...patch } })
  const m = useMutation({
    mutationFn: () => api.post<PurchaseOrder>(`/api/v1/purchase-orders/${po.id}/receipts`, {
      receiptDate: invoice.receiptDate, supplierInvoiceNumber: invoice.number || undefined, supplierInvoiceDate: invoice.date || undefined, notes: invoice.notes || undefined,
      lines: lines.map((l) => {
        const v = get(l.id, l.pendingQuantity, l.rate)
        return {
          poLineId: l.id, receivedQuantity: v.received || '0', damagedQuantity: v.damaged || undefined, rate: v.rate || undefined,
          batchNumber: l.trackBatches ? v.batchNumber || undefined : undefined, expiryDate: l.trackBatches ? v.expiryDate || undefined : undefined,
          serialNumbers: l.trackSerials ? v.serials.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean) : undefined,
        }
      }).filter((x) => Number(x.receivedQuantity) > 0),
    }),
    onSuccess: (p) => { setValues({}); onDone(p) },
  })
  const err = m.error instanceof ApiError ? m.error : null
  return (
    <Modal open={open} onClose={onClose} wide title="Receive goods (GRN)"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={<PackageCheck size={16} />} loading={m.isPending} onClick={() => m.mutate()}>Receive & post</Button></>}>
      <div className="stack">
        <div className="form-grid">
          <Field label="Receipt date" htmlFor="g-date"><Input id="g-date" type="date" max={today()} value={invoice.receiptDate} onChange={(e) => setInvoice({ ...invoice, receiptDate: e.target.value })} /></Field>
          <Field label="Supplier invoice no." htmlFor="g-inv"><Input id="g-inv" value={invoice.number} onChange={(e) => setInvoice({ ...invoice, number: e.target.value })} /></Field>
          <Field label="Supplier invoice date" htmlFor="g-invd"><Input id="g-invd" type="date" value={invoice.date} onChange={(e) => setInvoice({ ...invoice, date: e.target.value })} /></Field>
        </div>
        {lines.map((l) => {
          const v = get(l.id, l.pendingQuantity, l.rate)
          return (
            <div key={l.id} className="quote-line">
              <strong>{l.description}</strong>
              <span className="xs muted">Ordered {quantity(l.quantity)} {l.unit} at {money(l.rate)} · received so far {quantity(l.receivedQuantity)}</span>
              <div className="form-grid">
                <Field label="Received" htmlFor={`g-r-${l.id}`}><Input id={`g-r-${l.id}`} type="number" min={0} step="any" value={v.received} onChange={(e) => set(l.id, v, { received: e.target.value })} /></Field>
                <Field label="Of which damaged" htmlFor={`g-d-${l.id}`}><Input id={`g-d-${l.id}`} type="number" min={0} step="any" value={v.damaged} onChange={(e) => set(l.id, v, { damaged: e.target.value })} /></Field>
                <Field label="Invoice rate" htmlFor={`g-rate-${l.id}`}><PriceInput id={`g-rate-${l.id}`} value={v.rate} onChange={(e) => set(l.id, v, { rate: e.target.value })} /></Field>
                {l.trackBatches && <>
                  <Field label="Batch no." htmlFor={`g-b-${l.id}`}><Input id={`g-b-${l.id}`} value={v.batchNumber} onChange={(e) => set(l.id, v, { batchNumber: e.target.value })} /></Field>
                  <Field label="Expiry" htmlFor={`g-e-${l.id}`}><Input id={`g-e-${l.id}`} type="date" value={v.expiryDate} onChange={(e) => set(l.id, v, { expiryDate: e.target.value })} /></Field>
                </>}
                {l.trackSerials && <Field label="Serial numbers (one per line)" htmlFor={`g-s-${l.id}`} className="span-2"><Textarea id={`g-s-${l.id}`} value={v.serials} onChange={(e) => set(l.id, v, { serials: e.target.value })} /></Field>}
              </div>
            </div>
          )
        })}
        <Field label="Notes" htmlFor="g-notes"><Textarea id="g-notes" value={invoice.notes} onChange={(e) => setInvoice({ ...invoice, notes: e.target.value })} /></Field>
        {err && <Alert tone="danger">{err.message}</Alert>}
      </div>
    </Modal>
  )
}
