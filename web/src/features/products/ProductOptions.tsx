import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Layers, Plus, Printer, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, IconButton } from '@/components/ui/Button'
import { Badge, Card, DataTable, StatusBadge } from '@/components/ui/Data'
import { Alert, EmptyState, QueryState } from '@/components/ui/Feedback'
import { Field, Input, Select, Switch } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Overlay'
import { useToast } from '@/components/ui/Toast'
import { api, ApiError, download } from '@/services/api'
import type { BatchRow, PricingMode, Product, SerialRow, UnitOption } from '@/services/types'
import { useCan, useModule } from '@/stores/auth'
import { date, money, quantity, titleCase } from '@/utils/format'
import { unitLabel, unitSelectOptions, W } from '@/stores/words'

const FRACTIONAL = ['KG', 'G', 'L', 'ML', 'M', 'TONNE', 'QUINTAL', 'SQFT', 'CFT', 'CM']

export interface ProductOptionsValue {
  barcode: string
  decimalQuantity: boolean
  pricingMode: PricingMode
  mrpDiscountPercent: string
  trackBatches: boolean
  trackSerials: boolean
  warrantyMonths: string
  units: { unit: string; factor: string; barcode: string }[]
}

export function defaultOptions(unit = 'PCS'): ProductOptionsValue {
  return { barcode: '', decimalQuantity: FRACTIONAL.includes(unit), pricingMode: 'FIXED', mrpDiscountPercent: '', trackBatches: false,
    trackSerials: false, warrantyMonths: '', units: [] }
}

export function optionsFrom(p: Product): ProductOptionsValue {
  return {
    barcode: p.barcode ?? '', decimalQuantity: p.decimalQuantity, pricingMode: p.pricingMode, mrpDiscountPercent: p.mrpDiscountPercent != null ? String(p.mrpDiscountPercent) : '',
    trackBatches: p.trackBatches, trackSerials: p.trackSerials, warrantyMonths: p.warrantyMonths != null ? String(p.warrantyMonths) : '',
    units: p.units.map((u) => ({ unit: u.unit, factor: String(u.factor), barcode: u.barcode ?? '' })),
  }
}

/** Request fields for the product API. Units are sent only when the module is on (empty list clears them). */
export function optionsBody(v: ProductOptionsValue, uom: boolean) {
  return {
    barcode: v.barcode.trim(),
    decimalQuantity: v.decimalQuantity,
    pricingMode: v.pricingMode,
    mrpDiscountPercent: v.pricingMode === 'MRP' && v.mrpDiscountPercent ? v.mrpDiscountPercent : undefined,
    trackBatches: v.trackBatches,
    trackSerials: v.trackSerials,
    warrantyMonths: v.trackSerials && v.warrantyMonths ? Number(v.warrantyMonths) : undefined,
    units: uom ? v.units.filter((u) => u.unit && u.factor).map((u) => ({ unit: u.unit, factor: u.factor, barcode: u.barcode || undefined })) : undefined,
  }
}

/** Industry options section of the product form; each option appears only when its module is on. */
export function ProductOptionsCard({ value, onChange, baseUnit, error }: { value: ProductOptionsValue; onChange: (v: ProductOptionsValue) => void; baseUnit: string; error?: ApiError | null }) {
  const uom = useModule('UOM_CONVERSIONS')
  const batches = useModule('BATCH_EXPIRY')
  const serials = useModule('SERIAL_NUMBERS')
  const rates = useModule('DAILY_RATES')
  const set = (patch: Partial<ProductOptionsValue>) => onChange({ ...value, ...patch })
  const setUnit = (i: number, patch: Partial<ProductOptionsValue['units'][number]>) =>
    set({ units: value.units.map((u, idx) => (idx === i ? { ...u, ...patch } : u)) })
  return (
    <Card title="Selling options">
      <div className="form-grid">
        <Field label="Barcode" htmlFor="barcode" hint="Printed on labels; leave empty to use the SKU" error={error?.fieldError('barcode')}>
          <Input id="barcode" value={value.barcode} maxLength={60} onChange={(e) => set({ barcode: e.target.value })} />
        </Field>
        <Field label="Pricing" htmlFor="pricingMode" error={error?.fieldError('mrp')}>
          <Select id="pricingMode" value={value.pricingMode} onChange={(e) => set({ pricingMode: e.target.value as PricingMode })}
            options={[{ value: 'FIXED', label: 'Fixed selling price' }, { value: 'MRP', label: 'MRP less discount' },
              ...(rates || value.pricingMode === 'DAILY_RATE' ? [{ value: 'DAILY_RATE', label: 'Daily rate list' }] : [])]} />
        </Field>
        {value.pricingMode === 'MRP' && (
          <Field label="Discount on MRP (%)" htmlFor="mrpDiscount" hint="Selling price = MRP less this discount">
            <Input id="mrpDiscount" type="number" min={0} max={100} step="0.01" value={value.mrpDiscountPercent} onChange={(e) => set({ mrpDiscountPercent: e.target.value })} />
          </Field>
        )}
        {value.pricingMode === 'DAILY_RATE' && <div className="span-2"><Alert tone="info">The selling price follows the rate list (Products → Daily rates).</Alert></div>}
        <div className="span-2">
          <Switch label={`Allow decimal quantities (e.g. 2.5 ${baseUnit})`} checked={value.decimalQuantity} disabled={value.trackSerials}
            onChange={(on) => set({ decimalQuantity: on })} />
        </div>
        {batches && (
          <div className="span-2">
            <Switch label="Track batches and expiry dates (sold first-expiry-first-out)" checked={value.trackBatches}
              onChange={(on) => set({ trackBatches: on, trackSerials: on ? false : value.trackSerials })} />
          </div>
        )}
        {serials && (
          <div className="span-2 stack-sm">
            <Switch label="Track serial / IMEI numbers" checked={value.trackSerials}
              onChange={(on) => set({ trackSerials: on, trackBatches: on ? false : value.trackBatches, decimalQuantity: on ? false : value.decimalQuantity })} />
            {error?.fieldError('trackSerials') && <span className="xs danger-text">{error.fieldError('trackSerials')}</span>}
          </div>
        )}
        {serials && value.trackSerials && (
          <Field label="Warranty (months)" htmlFor="warranty" hint="Counted from the sale date">
            <Input id="warranty" type="number" min={0} max={240} value={value.warrantyMonths} onChange={(e) => set({ warrantyMonths: e.target.value })} />
          </Field>
        )}
      </div>
      {uom && (
        <div className="stack-sm" style={{ marginTop: 16 }}>
          <div className="row-between">
            <strong className="small">Other units</strong>
            <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => set({ units: [...value.units, { unit: '', factor: '', barcode: '' }] })}>Add unit</Button>
          </div>
          {value.units.length === 0 ? <p className="xs muted">Sell or buy in bigger packs, e.g. 1 CASE = 12 {baseUnit}. Stock is always kept in {baseUnit}.</p> : (
            <div className="stack-sm">
              {value.units.map((u, i) => (
                <div key={i} className="unit-row">
                  <Select aria-label="Unit" value={u.unit} onChange={(e) => setUnit(i, { unit: e.target.value })} placeholder="Unit"
                    options={unitSelectOptions(u.unit || undefined).filter((x) => x.value !== baseUnit)} />
                  <span className="small muted">=</span>
                  <Input aria-label="Factor" type="number" min={0} step="any" placeholder="Factor" value={u.factor} onChange={(e) => setUnit(i, { factor: e.target.value })} />
                  <span className="small muted">{baseUnit}</span>
                  <Input aria-label="Unit barcode" placeholder="Barcode (optional)" value={u.barcode} onChange={(e) => setUnit(i, { barcode: e.target.value })} />
                  <IconButton label="Remove unit" onClick={() => set({ units: value.units.filter((_, idx) => idx !== i) })}><Trash2 size={16} /></IconButton>
                </div>
              ))}
            </div>
          )}
          {error?.fieldError('units') && <span className="xs danger-text">{error.fieldError('units')}</span>}
        </div>
      )}
    </Card>
  )
}

/** Variants of a group product (size × colour…); generator plus the list with stock. */
export function VariantsCard({ product }: { product: Product }) {
  const enabled = useModule('VARIANTS')
  const canWrite = useCan('PRODUCT_WRITE')
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [attrs, setAttrs] = useState(() => W.variantOptions.slice(0, 3).map((name) => ({ name, values: '' })))
  const [price, setPrice] = useState('')
  const variants = useQuery({ queryKey: ['variants', product.id], queryFn: () => api.get<Product[]>(`/api/v1/products/${product.id}/variants`), enabled: product.variantGroup })
  const generate = useMutation({
    mutationFn: () => api.post<Product[]>(`/api/v1/products/${product.id}/variants`, {
      attributes: attrs.filter((a) => a.name.trim() && a.values.trim()).map((a) => ({ name: a.name.trim(), values: a.values.split(',').map((v) => v.trim()).filter(Boolean) })),
      sellingPrice: price || undefined,
    }),
    onSuccess: (list) => {
      toast.success('Variants saved', `${list.length} variants`)
      setOpen(false)
      qc.invalidateQueries({ queryKey: ['variants', product.id] })
      qc.invalidateQueries({ queryKey: ['product', product.id] })
      qc.invalidateQueries({ queryKey: ['products'] })
    },
  })
  const err = generate.error instanceof ApiError ? generate.error : null
  if (product.parentId) return null
  if (!enabled && !product.variantGroup) return null
  const combos = attrs.filter((a) => a.name.trim() && a.values.trim()).reduce((n, a) => n * a.values.split(',').filter((v) => v.trim()).length, 1)
  return (
    <Card title="Variants" padded={false} actions={canWrite && enabled && <Button size="sm" variant="secondary" icon={<Layers size={14} />} onClick={() => setOpen(true)}>{product.variantGroup ? 'Add variants' : 'Create variants'}</Button>}>
      {!product.variantGroup ? (
        <div style={{ padding: 16 }}><p className="small muted">Sell this product in sizes, colours or designs. Each combination becomes its own product with its own stock and barcode.</p></div>
      ) : (
        <QueryState query={variants} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No variants yet" />}>
          {(rows) => (
            <DataTable rows={rows} rowKey={(v) => v.id} onRowClick={(v) => navigate(`/app/products/${v.id}`)} columns={[
              { key: 'a', header: 'Variant', render: (v) => <div><strong>{v.variantAttributes}</strong><div className="xs muted">{v.sku}</div></div> },
              { key: 'p', header: 'Price', align: 'right', render: (v) => money(v.sellingPrice) },
              { key: 's', header: 'Available', align: 'right', render: (v) => `${quantity(v.available)} ${v.unit}` },
              { key: 'st', header: 'Stock', render: (v) => <StatusBadge status={v.stockStatus} /> },
            ]} />
          )}
        </QueryState>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Variants"
        footer={<>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={generate.isPending} disabled={combos < 1 || !attrs.some((a) => a.values.trim())} onClick={() => generate.mutate()}>Create {combos} variant{combos === 1 ? '' : 's'}</Button>
        </>}>
        <div className="stack">
          <p className="small muted">Enter values separated by commas. Every combination is created; existing ones are kept.</p>
          {attrs.map((a, i) => (
            <div key={i} className="form-grid">
              <Field label="Attribute" htmlFor={`attr-${i}`}><Input id={`attr-${i}`} value={a.name} onChange={(e) => setAttrs(attrs.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)))} /></Field>
              <Field label="Values" htmlFor={`vals-${i}`}><Input id={`vals-${i}`} placeholder="S, M, L, XL" value={a.values} onChange={(e) => setAttrs(attrs.map((x, idx) => (idx === i ? { ...x, values: e.target.value } : x)))} /></Field>
            </div>
          ))}
          {attrs.length < 3 && <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => setAttrs([...attrs, { name: '', values: '' }])}>Add attribute</Button>}
          <Field label="Selling price of the variants" htmlFor="v-price" hint={`Default ${money(product.sellingPrice)}`}>
            <Input id="v-price" type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          {err && <Alert tone="danger">{err.message}</Alert>}
        </div>
      </Modal>
    </Card>
  )
}

/** Batches of a batch-tracked product, by expiry. */
export function BatchesCard({ product }: { product: Product }) {
  const q = useQuery({ queryKey: ['batches', product.id], queryFn: () => api.get<BatchRow[]>('/api/v1/batches', { productId: product.id }), enabled: product.trackBatches })
  if (!product.trackBatches) return null
  return (
    <Card title="Batches" padded={false} actions={<Link to={`/app/batches?productId=${product.id}`} className="small">Expiry report</Link>}>
      <QueryState query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No batches yet" description="Batches are created when stock is received." />}>
        {(rows) => (
          <DataTable rows={rows} rowKey={(b) => b.id} columns={[
            { key: 'b', header: 'Batch', render: (b) => <strong>{b.batchNumber}</strong> },
            { key: 'e', header: 'Expiry', render: (b) => (b.expiryDate ? date(b.expiryDate) : '—') },
            { key: 'q', header: 'On hand', align: 'right', render: (b) => quantity(b.onHand) },
            { key: 's', header: '', render: (b) => <ExpiryBadge row={b} /> },
          ]} />
        )}
      </QueryState>
    </Card>
  )
}

export function ExpiryBadge({ row }: { row: BatchRow }) {
  if (row.status === 'EXPIRED') return <Badge tone="danger">Expired</Badge>
  if (row.status === 'NEAR_EXPIRY') return <Badge tone="warning">{row.daysToExpiry === 0 ? 'Expires today' : `${row.daysToExpiry} days left`}</Badge>
  if (row.status === 'EMPTY') return <Badge>Sold out</Badge>
  return <Badge tone="success">OK</Badge>
}

/** Serial numbers of a serial-tracked product. */
export function SerialsCard({ product }: { product: Product }) {
  const q = useQuery({ queryKey: ['serials', product.id], queryFn: () => api.get<SerialRow[]>('/api/v1/serials', { productId: product.id }), enabled: product.trackSerials })
  if (!product.trackSerials) return null
  return (
    <Card title="Serial numbers" padded={false} actions={<Link to={`/app/serials?productId=${product.id}`} className="small">Search serials</Link>}>
      <QueryState query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No serial numbers yet" description="Receive stock through a purchase with serial numbers." />}>
        {(rows) => (
          <DataTable rows={rows.slice(0, 20)} rowKey={(s) => s.id} columns={[
            { key: 's', header: 'Serial', render: (s) => <strong>{s.serialNumber}</strong> },
            { key: 'st', header: 'Status', render: (s) => <Badge tone={s.status === 'IN_STOCK' ? 'success' : 'neutral'}>{titleCase(s.status)}</Badge> },
            { key: 'i', header: 'Invoice', render: (s) => (s.invoiceId ? <Link to={`/app/invoices/${s.invoiceId}`}>{s.invoiceNumber}</Link> : '—') },
            { key: 'w', header: 'Warranty', priority: 'low', render: (s) => (s.warrantyUntil ? date(s.warrantyUntil) : '—') },
          ]} />
        )}
      </QueryState>
    </Card>
  )
}

/** Downloads a PDF sheet of barcode labels for the given products. */
export function LabelsButton({ productIds, label = 'Print labels' }: { productIds: string[]; label?: string }) {
  const enabled = useModule('BARCODE_LABELS')
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [copies, setCopies] = useState('1')
  const [busy, setBusy] = useState(false)
  if (!enabled || productIds.length === 0) return null
  const print = async () => {
    setBusy(true)
    try {
      await download('/api/v1/labels/products', { ids: productIds.join(','), copies: Number(copies) || 1 }, 'labels.pdf')
      setOpen(false)
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Button variant="secondary" icon={<Printer size={16} />} onClick={() => setOpen(true)}>{label}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Barcode labels"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={busy} onClick={print}>Download PDF</Button></>}>
        <Field label="Labels per product" htmlFor="label-copies" hint="A4 sheet, 3 × 8 labels">
          <Input id="label-copies" type="number" min={1} max={100} value={copies} onChange={(e) => setCopies(e.target.value)} />
        </Field>
      </Modal>
    </>
  )
}

/** Unit choices of a product for document lines: base unit first, then alternate units. */
export function unitOptions(p: { unit: string; units?: UnitOption[] }) {
  return [{ value: p.unit, label: unitLabel(p.unit) }, ...(p.units ?? []).map((u) => ({ value: u.unit, label: `${u.unit} (= ${Number(u.factor)} ${p.unit})` }))]
}

export function unitFactor(p: { unit: string; units?: UnitOption[] }, unit?: string) {
  if (!unit || unit === p.unit) return 1
  return Number(p.units?.find((u) => u.unit === unit)?.factor ?? 1)
}
