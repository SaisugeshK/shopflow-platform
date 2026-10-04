import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Badge, Card, DataTable, PageHeader, Tabs } from '@/components/ui/Data'
import { Alert, EmptyState, QueryState } from '@/components/ui/Feedback'
import { Field, Input, PriceInput, SearchInput, Select } from '@/components/ui/Form'
import { ConfirmDialog, Modal } from '@/components/ui/Overlay'
import { useToast } from '@/components/ui/Toast'
import { ProductPicker } from '@/features/products/ProductPicker'
import { ExpiryBadge } from '@/features/products/ProductOptions'
import { useCategories } from '@/features/products/ProductsPages'
import { api, ApiError } from '@/services/api'
import type { BatchRow, Product, RateRow, Scheme, SerialRow } from '@/services/types'
import { useCan } from '@/stores/auth'
import { date, dateTime, money, quantity, titleCase, today } from '@/utils/format'

// ---------------------------------------------------------------- daily rates

/** Rate list for products priced by the day (cement, steel, sand…). */
export function DailyRatesPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const canWrite = useCan('PRODUCT_WRITE')
  const [effectiveDate, setEffectiveDate] = useState(today())
  const [edits, setEdits] = useState<Record<string, string>>({})
  const q = useQuery({ queryKey: ['daily-rates', effectiveDate], queryFn: () => api.get<RateRow[]>('/api/v1/daily-rates', { date: effectiveDate }) })
  useEffect(() => setEdits({}), [effectiveDate])
  const save = useMutation({
    mutationFn: () => api.put<RateRow[]>('/api/v1/daily-rates', {
      effectiveDate, rates: Object.entries(edits).filter(([, v]) => v !== '').map(([productId, rate]) => ({ productId, rate })),
    }),
    onSuccess: () => {
      toast.success('Rates saved', effectiveDate === today() ? 'Selling prices updated' : `Effective ${date(effectiveDate)}`)
      setEdits({})
      qc.invalidateQueries({ queryKey: ['daily-rates'] })
      qc.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (e) => toast.error(e),
  })
  const changed = Object.values(edits).filter((v) => v !== '').length
  return (
    <div className="stack">
      <PageHeader title="Daily rates" subtitle="Effective-dated prices; today's rate is the selling price, orders keep the rate they were placed at"
        actions={canWrite && <Button icon={<Save size={16} />} disabled={changed === 0} loading={save.isPending} onClick={() => save.mutate()}>Save {changed || ''} rate{changed === 1 ? '' : 's'}</Button>} />
      <Card padded={false}>
        <div className="toolbar">
          <Field label="Effective date" htmlFor="rate-date"><Input id="rate-date" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} /></Field>
        </div>
        <QueryState query={q} isEmpty={(d) => d.length === 0}
          empty={<EmptyState title="No rate-priced products" description="Set a product's pricing to “Daily rate list” to manage it here." />}>
          {(rows) => (
            <DataTable rows={rows} rowKey={(r) => r.productId} columns={[
              { key: 'p', header: 'Product', render: (r) => <div><Link to={`/app/products/${r.productId}`}><strong>{r.name}</strong></Link><div className="xs muted">{r.sku} · per {r.unit}</div></div> },
              { key: 'prev', header: 'Previous', align: 'right', priority: 'low', render: (r) => (r.previousRate != null ? <div>{money(r.previousRate)}<div className="xs muted">{date(r.previousDate)}</div></div> : '—') },
              { key: 'cur', header: `Rate on ${date(effectiveDate)}`, align: 'right', render: (r) => (r.rate != null ? <div>{money(r.rate)}<div className="xs muted">from {date(r.rateDate)}</div></div> : <span className="muted">Not set</span>) },
              { key: 'new', header: 'New rate', align: 'right', render: (r) => canWrite ? (
                <PriceInput aria-label={`New rate for ${r.name}`} style={{ width: 140 }} value={edits[r.productId] ?? ''} placeholder={r.rate != null ? String(r.rate) : ''}
                  onChange={(e) => setEdits({ ...edits, [r.productId]: e.target.value })} />
              ) : '—' },
            ]} />
          )}
        </QueryState>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------- schemes

/** Buy-X-get-Y and slab discounts, applied by the server on orders, carts and invoices. */
export function SchemesPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const canWrite = useCan('PRODUCT_WRITE')
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState<Scheme | null>(null)
  const q = useQuery({ queryKey: ['schemes'], queryFn: () => api.get<Scheme[]>('/api/v1/schemes') })
  const toggle = useMutation({
    mutationFn: (s: Scheme) => api.post<Scheme>(`/api/v1/schemes/${s.id}/${s.active ? 'deactivate' : 'activate'}`),
    onSuccess: (s) => { toast.success(s.active ? 'Scheme activated' : 'Scheme stopped'); setConfirm(null); qc.invalidateQueries({ queryKey: ['schemes'] }) },
    onError: (e) => toast.error(e),
  })
  return (
    <div className="stack">
      <PageHeader title="Schemes" subtitle="Free goods and slab discounts"
        actions={canWrite && <Button icon={<Plus size={16} />} onClick={() => setOpen(true)}>New scheme</Button>} />
      <Card padded={false}>
        <QueryState query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No schemes yet" description="Create buy-X-get-Y or quantity/value slab discounts." />}>
          {(rows) => (
            <DataTable rows={rows} rowKey={(s) => s.id} columns={[
              { key: 'n', header: 'Scheme', render: (s) => <div><strong>{s.name}</strong><div className="xs muted">{s.summary}</div></div> },
              { key: 't', header: 'Type', priority: 'low', render: (s) => titleCase(s.schemeType) },
              { key: 'v', header: 'Valid', render: (s) => (s.validFrom || s.validTo ? `${date(s.validFrom) || '…'} – ${date(s.validTo) || '…'}` : 'Always') },
              { key: 's', header: 'Status', render: (s) => <Badge tone={s.active ? 'success' : 'neutral'}>{s.active ? 'Active' : 'Stopped'}</Badge> },
              { key: 'x', header: '', render: (s) => canWrite && <Button size="sm" variant="ghost" onClick={() => setConfirm(s)}>{s.active ? 'Stop' : 'Activate'}</Button> },
            ]} />
          )}
        </QueryState>
      </Card>
      <SchemeDialog open={open} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ['schemes'] }) }} />
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} loading={toggle.isPending} title={confirm?.active ? 'Stop this scheme?' : 'Activate this scheme?'}
        message={confirm?.summary} confirmLabel={confirm?.active ? 'Stop scheme' : 'Activate'} onConfirm={() => { if (confirm) toggle.mutate(confirm) }} />
    </div>
  )
}

function SchemeDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const categories = useCategories()
  const [type, setType] = useState<Scheme['schemeType']>('BUY_X_GET_Y')
  const [product, setProduct] = useState<Product | null>(null)
  const [categoryId, setCategoryId] = useState('')
  const [f, setF] = useState({ name: '', buyQuantity: '10', freeQuantity: '1', minQuantity: '', minValue: '', discountPercent: '', validFrom: '', validTo: '' })
  const save = useMutation({
    mutationFn: () => api.post<Scheme>('/api/v1/schemes', {
      name: f.name, schemeType: type, productId: product?.id, categoryId: !product && categoryId ? categoryId : undefined,
      buyQuantity: type === 'BUY_X_GET_Y' ? f.buyQuantity : undefined, freeQuantity: type === 'BUY_X_GET_Y' ? f.freeQuantity : undefined,
      minQuantity: type === 'QUANTITY_SLAB' ? f.minQuantity : undefined, minValue: type === 'VALUE_SLAB' ? f.minValue : undefined,
      discountPercent: type !== 'BUY_X_GET_Y' ? f.discountPercent : undefined, validFrom: f.validFrom || undefined, validTo: f.validTo || undefined,
    }),
    onSuccess: (s) => { toast.success('Scheme created', s.summary); setProduct(null); onSaved() },
  })
  const err = save.error instanceof ApiError ? save.error : null
  const scopeOk = type === 'BUY_X_GET_Y' ? !!product : !!product || !!categoryId
  return (
    <Modal open={open} onClose={onClose} title="New scheme" wide
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={!f.name.trim() || !scopeOk} onClick={() => save.mutate()}>Create scheme</Button></>}>
      <div className="stack">
        <div className="form-grid">
          <Field label="Name" htmlFor="sc-name" required><Input id="sc-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Diwali 10 + 1" /></Field>
          <Field label="Type" htmlFor="sc-type">
            <Select id="sc-type" value={type} onChange={(e) => setType(e.target.value as Scheme['schemeType'])} options={[
              { value: 'BUY_X_GET_Y', label: 'Buy X, get Y free' }, { value: 'QUANTITY_SLAB', label: 'Quantity slab discount' }, { value: 'VALUE_SLAB', label: 'Value slab discount' },
            ]} />
          </Field>
        </div>
        <Field label="Product" htmlFor="sc-product" hint={type === 'BUY_X_GET_Y' ? 'Free goods are the same product' : 'Or choose a whole category below'}>
          {product ? (
            <div className="row-between"><strong>{product.name}</strong><Button size="sm" variant="ghost" onClick={() => setProduct(null)}>Change</Button></div>
          ) : <ProductPicker onPick={(p) => setProduct(p)} exclude={[]} />}
        </Field>
        {type !== 'BUY_X_GET_Y' && !product && (
          <Field label="Or category" htmlFor="sc-cat">
            <Select id="sc-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} placeholder="Choose category" options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          </Field>
        )}
        <div className="form-grid">
          {type === 'BUY_X_GET_Y' && <>
            <Field label="Buy (quantity)" htmlFor="sc-buy" required><Input id="sc-buy" type="number" min={1} value={f.buyQuantity} onChange={(e) => setF({ ...f, buyQuantity: e.target.value })} /></Field>
            <Field label="Get free" htmlFor="sc-free" required><Input id="sc-free" type="number" min={1} value={f.freeQuantity} onChange={(e) => setF({ ...f, freeQuantity: e.target.value })} /></Field>
          </>}
          {type === 'QUANTITY_SLAB' && <Field label="Minimum quantity" htmlFor="sc-minq" required><Input id="sc-minq" type="number" min={0} value={f.minQuantity} onChange={(e) => setF({ ...f, minQuantity: e.target.value })} /></Field>}
          {type === 'VALUE_SLAB' && <Field label="Minimum line value (₹)" htmlFor="sc-minv" required><PriceInput id="sc-minv" value={f.minValue} onChange={(e) => setF({ ...f, minValue: e.target.value })} /></Field>}
          {type !== 'BUY_X_GET_Y' && <Field label="Discount (%)" htmlFor="sc-disc" required><Input id="sc-disc" type="number" min={0} max={100} step="0.01" value={f.discountPercent} onChange={(e) => setF({ ...f, discountPercent: e.target.value })} /></Field>}
          <Field label="Valid from" htmlFor="sc-from"><Input id="sc-from" type="date" value={f.validFrom} onChange={(e) => setF({ ...f, validFrom: e.target.value })} /></Field>
          <Field label="Valid to" htmlFor="sc-to"><Input id="sc-to" type="date" value={f.validTo} onChange={(e) => setF({ ...f, validTo: e.target.value })} /></Field>
        </div>
        {err && <Alert tone="danger">{err.message}</Alert>}
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- batches / expiry

type BatchTab = 'NEAR_EXPIRY' | 'EXPIRED' | 'ALL'

/** Near-expiry and expired batches; expired stock can be written off. */
export function BatchesPage() {
  const [params] = useSearchParams()
  const productId = params.get('productId') ?? undefined
  const qc = useQueryClient()
  const toast = useToast()
  const canWrite = useCan('STOCK_WRITE')
  const [tab, setTab] = useState<BatchTab>(productId ? 'ALL' : 'NEAR_EXPIRY')
  const [search, setSearch] = useState('')
  const [writeOff, setWriteOff] = useState<BatchRow | null>(null)
  const q = useQuery({ queryKey: ['batches', 'report', tab, productId, search], queryFn: () => api.get<BatchRow[]>('/api/v1/batches', { status: tab, productId, q: search }) })
  const write = useMutation({
    mutationFn: ({ row, reason }: { row: BatchRow; reason: string }) => api.post(`/api/v1/batches/products/${row.productId}/write-off`,
      { batchNumber: row.batchNumber, expired: row.status === 'EXPIRED', reason }),
    onSuccess: () => { toast.success('Stock written off'); setWriteOff(null); qc.invalidateQueries({ queryKey: ['batches'] }) },
    onError: (e) => toast.error(e),
  })
  return (
    <div className="stack">
      <PageHeader title="Batches & expiry" subtitle="Stock is sold first-expiry-first-out; expired batches are blocked from sale" />
      <Card padded={false}>
        <div className="toolbar">
          <Tabs label="Batch status" value={tab} onChange={setTab} tabs={[{ value: 'NEAR_EXPIRY', label: 'Near expiry' }, { value: 'EXPIRED', label: 'Expired' }, { value: 'ALL', label: 'All in stock' }]} />
          <SearchInput className="search" value={search} onChange={setSearch} placeholder="Product, SKU or batch" />
        </div>
        <QueryState query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title={tab === 'EXPIRED' ? 'No expired stock' : tab === 'NEAR_EXPIRY' ? 'Nothing is close to expiry' : 'No batches in stock'} />}>
          {(rows) => (
            <DataTable rows={rows} rowKey={(b) => b.id} columns={[
              { key: 'p', header: 'Product', render: (b) => <div><Link to={`/app/products/${b.productId}`}><strong>{b.productName}</strong></Link><div className="xs muted">{b.sku}</div></div> },
              { key: 'b', header: 'Batch', render: (b) => b.batchNumber },
              { key: 'm', header: 'Mfg', priority: 'low', render: (b) => (b.mfgDate ? date(b.mfgDate) : '—') },
              { key: 'e', header: 'Expiry', render: (b) => (b.expiryDate ? date(b.expiryDate) : '—') },
              { key: 'q', header: 'On hand', align: 'right', render: (b) => `${quantity(b.onHand)} ${b.unit}` },
              { key: 's', header: '', render: (b) => <ExpiryBadge row={b} /> },
              { key: 'x', header: '', render: (b) => canWrite && b.onHand > 0 && (b.status === 'EXPIRED' || b.status === 'NEAR_EXPIRY') && (
                <Button size="sm" variant="ghost" onClick={() => setWriteOff(b)}>Write off</Button>
              ) },
            ]} />
          )}
        </QueryState>
      </Card>
      <ConfirmDialog open={!!writeOff} onClose={() => setWriteOff(null)} tone="danger" requireReason loading={write.isPending}
        title={`Write off batch ${writeOff?.batchNumber ?? ''}?`} confirmLabel="Write off"
        message={writeOff ? `${quantity(writeOff.onHand)} ${writeOff.unit} of ${writeOff.productName} leave stock as ${writeOff.status === 'EXPIRED' ? 'expired' : 'damaged'}.` : ''}
        onConfirm={(reason) => { if (writeOff) write.mutate({ row: writeOff, reason }) }} />
    </div>
  )
}

// ---------------------------------------------------------------- serial numbers

/** Find a serial / IMEI number: where it came from, who bought it and warranty. */
export function SerialsPage() {
  const [params] = useSearchParams()
  const productId = params.get('productId') ?? undefined
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const q = useQuery({ queryKey: ['serials', 'search', search, status, productId], queryFn: () => api.get<SerialRow[]>('/api/v1/serials', { q: search, status, productId }) })
  return (
    <div className="stack">
      <PageHeader title="Serial numbers" subtitle="Search by serial / IMEI, product or invoice number" />
      <Card padded={false}>
        <div className="toolbar">
          <SearchInput className="search" value={search} onChange={setSearch} placeholder="Serial, IMEI, product or invoice" />
          <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 180 }}
            options={[{ value: '', label: 'Any status' }, { value: 'IN_STOCK', label: 'In stock' }, { value: 'SOLD', label: 'Sold' },
              { value: 'RETURNED_TO_SUPPLIER', label: 'Returned to supplier' }, { value: 'REMOVED', label: 'Written off' }]} />
        </div>
        <QueryState query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No serial numbers found" />}>
          {(rows) => (
            <DataTable rows={rows} rowKey={(s) => s.id} columns={[
              { key: 's', header: 'Serial', render: (s) => <div><strong>{s.serialNumber}</strong><div className="xs muted">{s.productName}</div></div> },
              { key: 'st', header: 'Status', render: (s) => <Badge tone={s.status === 'IN_STOCK' ? 'success' : s.status === 'SOLD' ? 'primary' : 'neutral'}>{titleCase(s.status)}</Badge> },
              { key: 'b', header: 'Sold to', render: (s) => (s.customerName ? <div>{s.customerName}<div className="xs muted">{s.soldAt ? dateTime(s.soldAt) : ''}</div></div> : '—') },
              { key: 'i', header: 'Invoice', render: (s) => (s.invoiceId ? <Link to={`/app/invoices/${s.invoiceId}`}>{s.invoiceNumber}</Link> : s.orderNumber ?? '—') },
              { key: 'p', header: 'Purchase', priority: 'low', render: (s) => (s.purchaseId ? <Link to={`/app/purchases/${s.purchaseId}`}>{s.purchaseNumber}</Link> : '—') },
              { key: 'w', header: 'Warranty', render: (s) => (s.warrantyUntil ? <Badge tone={s.underWarranty ? 'success' : 'neutral'}>{s.underWarranty ? `Till ${date(s.warrantyUntil)}` : 'Expired'}</Badge> : '—') },
            ]} />
          )}
        </QueryState>
      </Card>
    </div>
  )
}
