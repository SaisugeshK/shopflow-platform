import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CircleCheck, Plus, RotateCcw, Trash2, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, IconButton } from '@/components/ui/Button'
import { Card, DataTable, KeyValue, PageHeader, Pagination, StatusBadge, TaxBreakdown } from '@/components/ui/Data'
import { Alert, EmptyState, QueryState } from '@/components/ui/Feedback'
import { Field, Input, PriceInput, SearchInput, Select, Textarea } from '@/components/ui/Form'
import { ConfirmDialog, Modal } from '@/components/ui/Overlay'
import { useToast } from '@/components/ui/Toast'
import { ProductPicker } from '@/features/products/ProductPicker'
import { unitFactor, unitOptions } from '@/features/products/ProductOptions'
import { useListParams } from '@/hooks/useListParams'
import { api, ApiError } from '@/services/api'
import type { Product, Purchase, PurchaseReturn, Supplier } from '@/services/types'
import { useCan } from '@/stores/auth'
import { date, dateTime, money, quantity, titleCase, today } from '@/utils/format'

function useSuppliers() {
  return useQuery({ queryKey: ['suppliers', 'all'], queryFn: () => api.page<Supplier>('/api/v1/suppliers', { active: true, pageSize: 100 }) })
}

/** O10/AD08 Purchase history. */
export function PurchasesPage() {
  const list = useListParams()
  const navigate = useNavigate()
  const suppliers = useSuppliers()
  const canWrite = useCan('PURCHASE_WRITE')
  const q = useQuery({ queryKey: ['purchases', list.query], queryFn: () => api.page<Purchase>('/api/v1/purchases', { ...list.query, pageSize: 20 }) })
  return (
    <div className="stack">
      <PageHeader title="Purchases" subtitle="Stock received from suppliers" actions={canWrite && <Button icon={<Plus size={16} />} onClick={() => navigate('/app/purchases/new')}>Add purchase</Button>} />
      <Card padded={false}>
        <div className="toolbar">
          <SearchInput className="search" value={list.search} onChange={list.setSearch} placeholder="Purchase or supplier invoice number" />
          <Select aria-label="Supplier" value={list.get('supplierId')} onChange={(e) => list.set('supplierId', e.target.value)} style={{ width: 220 }} placeholder="All suppliers"
            options={(suppliers.data?.items ?? []).map((s) => ({ value: s.id, label: s.name }))} />
          <Select aria-label="Status" value={list.get('status')} onChange={(e) => list.set('status', e.target.value)} style={{ width: 150 }} placeholder="Any status"
            options={['DRAFT', 'POSTED', 'CANCELLED'].map((v) => ({ value: v, label: titleCase(v) }))} />
          <Input type="date" aria-label="From date" value={list.get('from')} onChange={(e) => list.set('from', e.target.value)} style={{ width: 150 }} />
          <Input type="date" aria-label="To date" value={list.get('to')} onChange={(e) => list.set('to', e.target.value)} style={{ width: 150 }} />
        </div>
        <QueryState query={q} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No purchases" />}>
          {(d) => (
            <>
              <DataTable rows={d.items} rowKey={(p) => p.id} onRowClick={(p) => navigate(`/app/purchases/${p.id}`)} sort={list.sort} onSortChange={list.setSort} columns={[
                { key: 'n', header: 'Purchase', sortKey: 'purchaseNumber', render: (p) => <strong>{p.purchaseNumber}</strong> },
                { key: 'd', header: 'Date', sortKey: 'purchaseDate', render: (p) => date(p.purchaseDate) },
                { key: 's', header: 'Supplier', render: (p) => <div>{p.supplierName}<div className="xs muted">{p.supplierInvoiceNumber}</div></div> },
                { key: 'st', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
                { key: 'ps', header: 'Payment', render: (p) => <StatusBadge status={p.paymentStatus === 'UNPAID' ? 'PENDING' : p.paymentStatus} /> },
                { key: 't', header: 'Total', align: 'right', sortKey: 'grandTotal', render: (p) => money(p.grandTotal) },
              ]} />
              <Pagination meta={d.pagination} onPage={list.setPage} />
            </>
          )}
        </QueryState>
      </Card>
    </div>
  )
}

interface Line {
  key: string
  product: Product
  quantity: string
  rate: string
  discountPercent: string
  unit: string
  batchNumber: string
  mfgDate: string
  expiryDate: string
  /** One serial number per line of text. */
  serials: string
}

function serialList(text: string) {
  return text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)
}

/** What a received line still needs: a batch number, or one serial number per base unit. */
function trackingProblem(l: Line): string | null {
  if (l.product.trackBatches && !l.batchNumber.trim()) return 'Enter the batch number'
  if (l.product.trackSerials) {
    const need = Number(l.quantity) * unitFactor(l.product, l.unit)
    const have = serialList(l.serials).length
    if (have !== need) return `Enter ${need} serial number(s) (${have} entered)`
  }
  return null
}

/** O12 Add Purchase. Totals and GST are calculated by the backend when saved. */
export function PurchaseFormPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const suppliers = useSuppliers()
  const [supplierId, setSupplierId] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(today())
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState('')
  const [supplierInvoiceDate, setSupplierInvoiceDate] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const save = useMutation({
    mutationFn: (post: boolean) => api.post<Purchase>('/api/v1/purchases', {
      supplierId, purchaseDate, supplierInvoiceNumber: supplierInvoiceNumber || undefined, supplierInvoiceDate: supplierInvoiceDate || undefined,
      notes: notes || undefined, post,
      items: lines.map((l) => ({
        productId: l.product.id, quantity: l.quantity, rate: l.rate, discountPercent: l.discountPercent || '0',
        unit: l.unit !== l.product.unit ? l.unit : undefined,
        batchNumber: l.product.trackBatches ? l.batchNumber.trim() : undefined,
        mfgDate: l.product.trackBatches && l.mfgDate ? l.mfgDate : undefined,
        expiryDate: l.product.trackBatches && l.expiryDate ? l.expiryDate : undefined,
        serialNumbers: l.product.trackSerials ? serialList(l.serials) : undefined,
      })),
    }),
    onSuccess: (p) => {
      toast.success(p.status === 'POSTED' ? 'Purchase posted — stock received' : 'Purchase saved as draft', p.purchaseNumber)
      qc.invalidateQueries({ queryKey: ['purchases'] })
      qc.invalidateQueries({ queryKey: ['stock'] })
      navigate(`/app/purchases/${p.id}`)
    },
  })
  const err = save.error instanceof ApiError ? save.error : null
  const valid = supplierId && lines.length > 0 && lines.every((l) => Number(l.quantity) > 0 && Number(l.rate) >= 0 && l.rate !== '' && !trackingProblem(l))
  const update = (i: number, patch: Partial<Line>) => setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))

  return (
    <div className="stack">
      <PageHeader breadcrumb={<Link to="/app/purchases" className="row" style={{ gap: 4 }}><ArrowLeft size={14} /> Purchases</Link>} title="Add purchase" subtitle="Save as draft to review totals, or save and post to receive stock now" />
      <Card title="Supplier">
        <div className="form-grid">
          <Field label="Supplier" htmlFor="sup" required>
            <Select id="sup" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} placeholder="Choose supplier" options={(suppliers.data?.items ?? []).map((s) => ({ value: s.id, label: `${s.name} (${s.supplierCode})` }))} />
          </Field>
          <Field label="Purchase date" htmlFor="pdate" required><Input id="pdate" type="date" max={today()} value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} /></Field>
          <Field label="Supplier invoice number" htmlFor="sinv"><Input id="sinv" value={supplierInvoiceNumber} onChange={(e) => setSupplierInvoiceNumber(e.target.value)} /></Field>
          <Field label="Supplier invoice date" htmlFor="sdate"><Input id="sdate" type="date" value={supplierInvoiceDate} onChange={(e) => setSupplierInvoiceDate(e.target.value)} /></Field>
        </div>
      </Card>
      <Card title="Items" padded={false}>
        <div style={{ padding: 16 }}>
          <ProductPicker exclude={lines.filter((l) => !l.product.trackBatches && l.product.units.length === 0).map((l) => l.product.id)}
            onPick={(p) => setLines([...lines, { key: `${p.id}-${Date.now()}`, product: p, quantity: '1', rate: String(p.purchasePrice), discountPercent: '0',
              unit: p.unit, batchNumber: '', mfgDate: '', expiryDate: '', serials: '' }])} />
        </div>
        {lines.length === 0 ? <EmptyState title="No items yet" description="Search and add the products you received." /> : (
          <DataTable rows={lines.map((l, i) => ({ ...l, i }))} rowKey={(l) => l.key} columns={[
            { key: 'p', header: 'Product', render: (l) => (
              <div className="stack-sm">
                <div><div style={{ fontWeight: 600 }}>{l.product.name}</div><div className="xs muted">{l.product.sku} · GST {l.product.gstRate}%</div></div>
                {l.product.trackBatches && (
                  <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                    <Input aria-label={`Batch number of ${l.product.name}`} placeholder="Batch no." style={{ width: 120 }} value={l.batchNumber} onChange={(e) => update(l.i, { batchNumber: e.target.value })} />
                    <Input aria-label={`Manufacturing date of ${l.product.name}`} type="date" title="Mfg date" style={{ width: 150 }} value={l.mfgDate} onChange={(e) => update(l.i, { mfgDate: e.target.value })} />
                    <Input aria-label={`Expiry date of ${l.product.name}`} type="date" title="Expiry date" style={{ width: 150 }} value={l.expiryDate} onChange={(e) => update(l.i, { expiryDate: e.target.value })} />
                  </div>
                )}
                {l.product.trackSerials && (
                  <Textarea aria-label={`Serial numbers of ${l.product.name}`} rows={2} placeholder="One serial / IMEI per line" value={l.serials} onChange={(e) => update(l.i, { serials: e.target.value })} />
                )}
                {trackingProblem(l) && <span className="xs danger-text">{trackingProblem(l)}</span>}
              </div>
            ) },
            { key: 'q', header: `Quantity`, align: 'right', render: (l) => (
              <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                <Input aria-label={`Quantity of ${l.product.name}`} type="number" min={0} step="any" style={{ width: 90, textAlign: 'right' }} value={l.quantity} onChange={(e) => update(l.i, { quantity: e.target.value })} />
                {l.product.units.length > 0 ? (
                  <Select aria-label={`Unit of ${l.product.name}`} style={{ width: 110 }} value={l.unit}
                    onChange={(e) => update(l.i, { unit: e.target.value, rate: String(Math.round(l.product.purchasePrice * unitFactor(l.product, e.target.value) * 100) / 100) })}
                    options={unitOptions(l.product)} />
                ) : <span className="xs muted">{l.product.unit}</span>}
              </div>
            ) },
            { key: 'r', header: 'Rate', align: 'right', render: (l) => <PriceInput aria-label={`Rate of ${l.product.name}`} style={{ width: 140 }} value={l.rate} onChange={(e) => update(l.i, { rate: e.target.value })} /> },
            { key: 'd', header: 'Disc %', align: 'right', render: (l) => <Input aria-label={`Discount percent for ${l.product.name}`} type="number" min={0} max={100} step="0.01" style={{ width: 90, textAlign: 'right' }} value={l.discountPercent} onChange={(e) => update(l.i, { discountPercent: e.target.value })} /> },
            { key: 'x', header: '', render: (l) => <IconButton label={`Remove ${l.product.name}`} onClick={() => setLines(lines.filter((_, idx) => idx !== l.i))}><Trash2 size={16} /></IconButton> },
          ]} />
        )}
      </Card>
      <Card title="Notes"><Textarea aria-label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></Card>
      {err && <Alert tone="danger">{err.message}</Alert>}
      <div className="form-actions">
        <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
        <Button variant="secondary" disabled={!valid} loading={save.isPending && save.variables === false} onClick={() => save.mutate(false)}>Save draft</Button>
        <Button disabled={!valid} loading={save.isPending && save.variables === true} icon={<CircleCheck size={16} />} onClick={() => save.mutate(true)}>Save & post</Button>
      </div>
    </div>
  )
}

/** O11 Purchase detail. */
export function PurchaseDetailPage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const toast = useToast()
  const canWrite = useCan('PURCHASE_WRITE')
  const [dialog, setDialog] = useState<'cancel' | 'pay' | 'return' | null>(null)
  const q = useQuery({ queryKey: ['purchase', id], queryFn: () => api.get<Purchase>(`/api/v1/purchases/${id}`) })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['purchase', id] })
    qc.invalidateQueries({ queryKey: ['purchases'] })
    qc.invalidateQueries({ queryKey: ['stock'] })
  }
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api.post<Purchase>(`/api/v1/purchases/${id}/${path}`, body),
    onSuccess: () => { toast.success('Purchase updated'); setDialog(null); refresh() },
    onError: (e) => toast.error(e),
  })
  return (
    <QueryState query={q}>
      {(p) => (
        <div className="stack">
          <PageHeader
            breadcrumb={<Link to="/app/purchases" className="row" style={{ gap: 4 }}><ArrowLeft size={14} /> Purchases</Link>}
            title={<span className="row">{p.purchaseNumber} <StatusBadge status={p.status} /></span>}
            subtitle={`${p.supplierName} · ${date(p.purchaseDate)}`}
            actions={canWrite && (
              <>
                {p.status === 'DRAFT' && <Button variant="ghost" onClick={() => setDialog('cancel')}>Cancel draft</Button>}
                {p.status === 'DRAFT' && <Button icon={<CircleCheck size={16} />} loading={act.isPending} onClick={() => act.mutate({ path: 'post' })}>Post (receive stock)</Button>}
                {p.status === 'POSTED' && <Button variant="secondary" icon={<RotateCcw size={16} />} onClick={() => setDialog('return')}>Return items</Button>}
                {p.status === 'POSTED' && (p.balanceDue ?? 0) > 0 && <Button icon={<Wallet size={16} />} onClick={() => setDialog('pay')}>Pay supplier</Button>}
              </>
            )}
          />
          {p.cancelReason && <Alert tone="danger" title="Cancelled">{p.cancelReason}</Alert>}
          <div className="detail-grid">
            <Card title="Items" padded={false}>
              <DataTable rows={p.items ?? []} rowKey={(i) => i.id} columns={[
                { key: 'p', header: 'Product', render: (i) => (
                  <div>
                    <div style={{ fontWeight: 600 }}>{i.productName}</div>
                    <div className="xs muted">HSN {i.hsnCode ?? '—'}{i.unitFactor !== 1 ? ` · 1 ${i.unit} = ${Number(i.unitFactor)}` : ''}</div>
                    {i.batchNumber && <div className="xs muted">Batch {i.batchNumber}{i.expiryDate ? ` · exp ${date(i.expiryDate)}` : ''}</div>}
                    {i.serialNumbers.length > 0 && <div className="xs muted">Serials: {i.serialNumbers.join(', ')}</div>}
                  </div>
                ) },
                { key: 'q', header: 'Qty', align: 'right', render: (i) => `${quantity(i.quantity)} ${i.unit}` },
                { key: 'r', header: 'Rate', align: 'right', render: (i) => money(i.rate) },
                { key: 'd', header: 'Disc', align: 'right', render: (i) => (i.discountAmount > 0 ? money(i.discountAmount) : '—') },
                { key: 't', header: 'Taxable', align: 'right', render: (i) => money(i.taxableAmount) },
                { key: 'g', header: 'GST', align: 'right', render: (i) => `${i.taxRate}%` },
                { key: 'l', header: 'Total', align: 'right', render: (i) => money(i.lineTotal) },
                { key: 'rt', header: 'Returned', align: 'right', render: (i) => (i.returnedQuantity > 0 ? quantity(i.returnedQuantity) : '—') },
              ]} />
              <div className="card-body" style={{ display: 'flex', justifyContent: 'flex-end' }}><div style={{ width: 'min(340px, 100%)' }}><TaxBreakdown t={p} /></div></div>
            </Card>
            <div className="stack">
              <Card title="Summary">
                <KeyValue items={[
                  ['Supplier invoice', p.supplierInvoiceNumber], ['Invoice date', date(p.supplierInvoiceDate)], ['Supply', p.interState ? 'Inter-state' : 'Intra-state'],
                  ['Payment', <StatusBadge key="p" status={p.paymentStatus === 'UNPAID' ? 'PENDING' : p.paymentStatus} />], ['Paid', money(p.paidAmount)],
                  ['Balance due', p.balanceDue != null ? money(p.balanceDue) : undefined], ['Posted', dateTime(p.postedAt)], ['Notes', p.notes],
                ]} />
              </Card>
              <Card title="Supplier payments" padded={false}>
                {p.payments?.length ? (
                  <DataTable rows={p.payments} rowKey={(x) => x.id} columns={[
                    { key: 'n', header: 'Number', render: (x) => x.paymentNumber },
                    { key: 'm', header: 'Method', render: (x) => titleCase(x.method) },
                    { key: 'a', header: 'Amount', align: 'right', render: (x) => money(x.amount) },
                  ]} />
                ) : <EmptyState title="No payments yet" />}
              </Card>
            </div>
          </div>
          <ConfirmDialog open={dialog === 'cancel'} onClose={() => setDialog(null)} title="Cancel draft purchase" tone="danger" requireReason loading={act.isPending}
            message="The draft is kept for audit but can no longer be posted." onConfirm={(reason) => act.mutate({ path: 'cancel', body: { reason } })} />
          <SupplierPaymentDialog open={dialog === 'pay'} max={p.balanceDue ?? 0} loading={act.isPending} onClose={() => setDialog(null)} onSubmit={(body) => act.mutate({ path: 'payments', body })} />
          <PurchaseReturnDialog open={dialog === 'return'} purchase={p} onClose={() => setDialog(null)} onDone={refresh} />
        </div>
      )}
    </QueryState>
  )
}

function SupplierPaymentDialog({ open, max, loading, onClose, onSubmit }: { open: boolean; max: number; loading: boolean; onClose: () => void; onSubmit: (b: unknown) => void }) {
  const [amount, setAmount] = useState(String(max))
  const [method, setMethod] = useState('BANK_TRANSFER')
  const [reference, setReference] = useState('')
  return (
    <Modal open={open} onClose={onClose} title="Pay supplier" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button loading={loading} disabled={!(Number(amount) > 0)} onClick={() => onSubmit({ amount, method, referenceNumber: reference || undefined })}>Record payment</Button>
      </>
    }>
      <div className="form-grid">
        <Field label="Amount" htmlFor="sp-amt" hint={`Balance due ${money(max)}`}><PriceInput id="sp-amt" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Method" htmlFor="sp-m"><Select id="sp-m" value={method} onChange={(e) => setMethod(e.target.value)} options={['BANK_TRANSFER', 'UPI', 'CASH', 'CHEQUE', 'OTHER'].map((v) => ({ value: v, label: titleCase(v) }))} /></Field>
        <Field label="Reference" htmlFor="sp-r" className="span-2"><Input id="sp-r" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

function PurchaseReturnDialog({ open, purchase, onClose, onDone }: { open: boolean; purchase: Purchase; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [qty, setQty] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  const items = (purchase.items ?? []).filter((i) => i.quantity - i.returnedQuantity > 0)
  const save = useMutation({
    mutationFn: () => api.post<PurchaseReturn>('/api/v1/purchase-returns', {
      purchaseId: purchase.id, reason, post: true,
      items: Object.entries(qty).filter(([, v]) => Number(v) > 0).map(([purchaseItemId, quantity]) => ({ purchaseItemId, quantity })),
    }),
    onSuccess: (r) => { toast.success('Purchase return posted', `${r.returnNumber} · ${money(r.grandTotal)}`); setQty({}); setReason(''); onClose(); onDone() },
    onError: (e) => toast.error(e),
  })
  const any = Object.values(qty).some((v) => Number(v) > 0)
  return (
    <Modal open={open} onClose={onClose} title="Return items to supplier" wide footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button loading={save.isPending} disabled={!any || reason.trim().length < 3} onClick={() => save.mutate()}>Post return</Button>
      </>
    }>
      <div className="stack">
        <p className="small muted">Stock goes out immediately and the supplier balance is reduced by the return value at the original net rate.</p>
        <DataTable rows={items} rowKey={(i) => i.id} columns={[
          { key: 'p', header: 'Product', render: (i) => i.productName },
          { key: 'a', header: 'Returnable', align: 'right', render: (i) => quantity(i.quantity - i.returnedQuantity) },
          { key: 'q', header: 'Return qty', align: 'right', render: (i) => <Input aria-label={`Return quantity for ${i.productName}`} type="number" min={0} max={i.quantity - i.returnedQuantity} step="any" style={{ width: 100, textAlign: 'right' }} value={qty[i.id] ?? ''} onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })} /> },
        ]} />
        <Field label="Reason" htmlFor="pr-reason" required><Textarea id="pr-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

/** Purchase returns list. */
export function PurchaseReturnsPage() {
  const list = useListParams()
  const [open, setOpen] = useState<PurchaseReturn | null>(null)
  const q = useQuery({ queryKey: ['purchase-returns', list.query], queryFn: () => api.page<PurchaseReturn>('/api/v1/purchase-returns', { ...list.query, pageSize: 20 }) })
  return (
    <div className="stack">
      <PageHeader title="Purchase returns" subtitle="Goods sent back to suppliers. Create a return from a posted purchase." />
      <Card padded={false}>
        <QueryState query={q} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No purchase returns" />}>
          {(d) => (
            <>
              <DataTable rows={d.items} rowKey={(r) => r.id} onRowClick={setOpen} columns={[
                { key: 'n', header: 'Return', render: (r) => <strong>{r.returnNumber}</strong> },
                { key: 'd', header: 'Date', render: (r) => date(r.returnDate) },
                { key: 'p', header: 'Purchase', render: (r) => <Link to={`/app/purchases/${r.purchaseId}`} onClick={(e) => e.stopPropagation()}>{r.purchaseNumber}</Link> },
                { key: 's', header: 'Supplier', render: (r) => r.supplierName },
                { key: 'st', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                { key: 't', header: 'Value', align: 'right', render: (r) => money(r.grandTotal) },
              ]} />
              <Pagination meta={d.pagination} onPage={list.setPage} />
            </>
          )}
        </QueryState>
      </Card>
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.returnNumber ?? ''} wide>
        {open && (
          <div className="stack">
            <KeyValue items={[['Supplier', open.supplierName], ['Reason', open.reason], ['Taxable', money(open.taxableTotal)], ['Tax', money(open.taxTotal)], ['Total', money(open.grandTotal)]]} />
            <DataTable rows={open.items} rowKey={(i) => i.id} columns={[
              { key: 'p', header: 'Product', render: (i) => i.productName },
              { key: 'q', header: 'Qty', align: 'right', render: (i) => quantity(i.quantity) },
              { key: 'r', header: 'Rate', align: 'right', render: (i) => money(i.rate) },
              { key: 't', header: 'Total', align: 'right', render: (i) => money(i.lineTotal) },
            ]} />
          </div>
        )}
      </Modal>
    </div>
  )
}
