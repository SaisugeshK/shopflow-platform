import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { Button, IconButton } from '@/components/ui/Button'
import { Badge, Card, ListRow } from '@/components/ui/Data'
import { Alert, EmptyState } from '@/components/ui/Feedback'
import { Field, Input, QtyInput, Select, SwitchRow } from '@/components/ui/Form'
import { Sheet } from '@/components/ui/Overlay'
import { Text } from '@/components/ui/Text'
import { toast } from '@/components/ui/Toast'
import { api, ApiError } from '@/services/api'
import { openDocument } from '@/services/documents'
import type { BatchRow, PricingMode, Product, SerialRow, UnitOption } from '@/services/types'
import { useCan, useModule } from '@/store/auth'
import { colors } from '@/theme/tokens'
import { date, money, quantity, titleCase } from '@/utils/format'
import { unitSelectOptions, W } from '@/store/words'

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
    barcode: p.barcode ?? '', decimalQuantity: p.decimalQuantity, pricingMode: p.pricingMode,
    mrpDiscountPercent: p.mrpDiscountPercent != null ? String(p.mrpDiscountPercent) : '', trackBatches: p.trackBatches,
    trackSerials: p.trackSerials, warrantyMonths: p.warrantyMonths != null ? String(p.warrantyMonths) : '',
    units: p.units.map((u) => ({ unit: u.unit, factor: String(u.factor), barcode: u.barcode ?? '' })),
  }
}

export function optionsBody(v: ProductOptionsValue, uom: boolean) {
  return {
    barcode: v.barcode.trim(), decimalQuantity: v.decimalQuantity, pricingMode: v.pricingMode,
    mrpDiscountPercent: v.pricingMode === 'MRP' && v.mrpDiscountPercent ? v.mrpDiscountPercent : undefined,
    trackBatches: v.trackBatches, trackSerials: v.trackSerials,
    warrantyMonths: v.trackSerials && v.warrantyMonths ? Number(v.warrantyMonths) : undefined,
    units: uom ? v.units.filter((u) => u.unit && u.factor).map((u) => ({ unit: u.unit, factor: u.factor, barcode: u.barcode || undefined })) : undefined,
  }
}

/** Selling options of the product form (§0B.7); each option shows only when its module is on. */
export function ProductOptionsSection({ value, onChange, baseUnit, error }: { value: ProductOptionsValue; onChange: (v: ProductOptionsValue) => void; baseUnit: string; error?: ApiError | null }) {
  const uom = useModule('UOM_CONVERSIONS')
  const batches = useModule('BATCH_EXPIRY')
  const serials = useModule('SERIAL_NUMBERS')
  const rates = useModule('DAILY_RATES')
  const set = (patch: Partial<ProductOptionsValue>) => onChange({ ...value, ...patch })
  const setUnit = (i: number, patch: Partial<ProductOptionsValue['units'][number]>) => set({ units: value.units.map((u, idx) => (idx === i ? { ...u, ...patch } : u)) })
  return (
    <Card title="Selling options">
      <View style={{ gap: 14 }}>
        <Field label="Barcode" hint="Printed on labels; empty uses the SKU" error={error?.fieldError('barcode')}>
          <Input value={value.barcode} onChangeText={(t) => set({ barcode: t })} accessibilityLabel="Barcode" autoCapitalize="characters" />
        </Field>
        <Field label="Pricing" error={error?.fieldError('mrp')}>
          <Select label="Pricing" value={value.pricingMode} onChange={(m) => set({ pricingMode: m as PricingMode })}
            options={[{ value: 'FIXED', label: 'Fixed selling price' }, { value: 'MRP', label: 'MRP less discount' },
              ...(rates || value.pricingMode === 'DAILY_RATE' ? [{ value: 'DAILY_RATE', label: 'Daily rate list' }] : [])]} />
        </Field>
        {value.pricingMode === 'MRP' && (
          <Field label="Discount on MRP (%)"><QtyInput value={value.mrpDiscountPercent} onChangeText={(t) => set({ mrpDiscountPercent: t })} accessibilityLabel="Discount on MRP" style={{ textAlign: 'left' }} /></Field>
        )}
        {value.pricingMode === 'DAILY_RATE' && <Alert>The selling price follows the daily rate list.</Alert>}
        <SwitchRow label={`Allow decimal quantities (${baseUnit})`} value={value.decimalQuantity} disabled={value.trackSerials} onChange={(b) => set({ decimalQuantity: b })} />
        {batches && <SwitchRow label="Track batches and expiry" hint="Sold first-expiry-first-out" value={value.trackBatches}
          onChange={(b) => set({ trackBatches: b, trackSerials: b ? false : value.trackSerials })} />}
        {serials && <SwitchRow label="Track serial / IMEI numbers" value={value.trackSerials}
          onChange={(b) => set({ trackSerials: b, trackBatches: b ? false : value.trackBatches, decimalQuantity: b ? false : value.decimalQuantity })} />}
        {error?.fieldError('trackSerials') && <Text variant="xs" color="danger">{error.fieldError('trackSerials')}</Text>}
        {serials && value.trackSerials && (
          <Field label="Warranty (months)"><QtyInput value={value.warrantyMonths} onChangeText={(t) => set({ warrantyMonths: t })} accessibilityLabel="Warranty months" style={{ textAlign: 'left' }} /></Field>
        )}
        {uom && (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text weight="700" style={{ flex: 1 }}>Other units</Text>
              <Button size="sm" variant="secondary" icon="plus" onPress={() => set({ units: [...value.units, { unit: '', factor: '', barcode: '' }] })}>Add unit</Button>
            </View>
            {value.units.length === 0 && <Text variant="xs" color="muted">E.g. 1 CASE = 12 {baseUnit}. Stock is always kept in {baseUnit}.</Text>}
            {value.units.map((u, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
                <View style={{ flex: 1.2 }}><Field label="Unit"><Select label="Unit" value={u.unit} onChange={(x) => setUnit(i, { unit: x })} placeholder="Unit" options={unitSelectOptions(u.unit || undefined).filter((x) => x.value !== baseUnit)} /></Field></View>
                <View style={{ flex: 1 }}><Field label={`= ${baseUnit}`}><QtyInput value={u.factor} onChangeText={(t) => setUnit(i, { factor: t })} accessibilityLabel="Factor" /></Field></View>
                <IconButton icon="trash-2" label="Remove unit" color={colors.danger} onPress={() => set({ units: value.units.filter((_, idx) => idx !== i) })} />
              </View>
            ))}
            {error?.fieldError('units') && <Text variant="xs" color="danger">{error.fieldError('units')}</Text>}
          </View>
        )}
      </View>
    </Card>
  )
}

/** Options summary rows for the product detail screen. */
export function optionRows(p: Product): [string, string | undefined][] {
  return [
    ['Other units', p.units.length ? p.units.map((u) => `1 ${u.unit} = ${Number(u.factor)} ${p.unit}`).join(', ') : undefined],
    ['Barcode', p.barcode],
    ['Pricing', p.pricingMode === 'FIXED' ? undefined : p.pricingMode === 'MRP' ? `MRP less ${p.mrpDiscountPercent ?? 0}%` : 'Daily rate list'],
    ['Tracking', p.trackBatches ? 'Batch + expiry' : p.trackSerials ? `Serial numbers${p.warrantyMonths ? ` · ${p.warrantyMonths} months warranty` : ''}` : undefined],
    ['Variant', p.variantAttributes],
  ]
}

/** Variants of a group product, with a generator sheet. */
export function VariantsSection({ product }: { product: Product }) {
  const enabled = useModule('VARIANTS')
  const canWrite = useCan('PRODUCT_WRITE')
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [attrs, setAttrs] = useState(() => W.variantOptions.slice(0, 3).map((name) => ({ name, values: '' })))
  const variants = useQuery({ queryKey: ['variants', product.id], queryFn: () => api.get<Product[]>(`/api/v1/products/${product.id}/variants`), enabled: product.variantGroup })
  const generate = useMutation({
    mutationFn: () => api.post<Product[]>(`/api/v1/products/${product.id}/variants`, {
      attributes: attrs.filter((a) => a.name.trim() && a.values.trim()).map((a) => ({ name: a.name.trim(), values: a.values.split(',').map((v) => v.trim()).filter(Boolean) })),
    }),
    onSuccess: (list) => {
      toast.success('Variants saved', `${list.length} variants`)
      setOpen(false)
      qc.invalidateQueries({ queryKey: ['variants', product.id] })
      qc.invalidateQueries({ queryKey: ['product', product.id] })
    },
    onError: (e) => toast.error(e),
  })
  if (product.parentId || (!enabled && !product.variantGroup)) return null
  return (
    <Card title="Variants" padded={false} actions={canWrite && enabled ? <Button size="sm" variant="secondary" icon="layers" onPress={() => setOpen(true)}>{product.variantGroup ? 'Add' : 'Create'}</Button> : undefined}>
      {!product.variantGroup ? (
        <View style={{ padding: 14 }}><Text variant="small" color="muted">Sell this product in sizes, colours or designs; each combination gets its own stock.</Text></View>
      ) : (variants.data ?? []).length === 0 ? <EmptyState icon="layers" title="No variants yet" /> : (variants.data ?? []).map((v) => (
        <ListRow key={v.id} title={v.variantAttributes ?? v.name} subtitle={`${v.sku} · ${quantity(v.available)} ${v.unit} available`} meta={money(v.sellingPrice)}
          onPress={() => router.push(`/admin/product/${v.id}`)} />
      ))}
      <Sheet open={open} onClose={() => setOpen(false)} title="Variants"
        footer={<Button block loading={generate.isPending} disabled={!attrs.some((a) => a.values.trim())} onPress={() => generate.mutate()}>Create variants</Button>}>
        <Text variant="small" color="muted">Values separated by commas; every combination is created.</Text>
        {attrs.map((a, i) => (
          <View key={i} style={{ gap: 8 }}>
            <Field label="Attribute"><Input value={a.name} onChangeText={(t) => setAttrs(attrs.map((x, idx) => (idx === i ? { ...x, name: t } : x)))} accessibilityLabel={`Attribute ${i + 1}`} /></Field>
            <Field label="Values"><Input value={a.values} placeholder="S, M, L, XL" onChangeText={(t) => setAttrs(attrs.map((x, idx) => (idx === i ? { ...x, values: t } : x)))} accessibilityLabel={`Values ${i + 1}`} /></Field>
          </View>
        ))}
      </Sheet>
    </Card>
  )
}

export function expiryTone(b: BatchRow): 'danger' | 'warning' | 'neutral' | 'success' {
  return b.status === 'EXPIRED' ? 'danger' : b.status === 'NEAR_EXPIRY' ? 'warning' : b.status === 'EMPTY' ? 'neutral' : 'success'
}

export function expiryLabel(b: BatchRow) {
  return b.status === 'EXPIRED' ? 'Expired' : b.status === 'NEAR_EXPIRY' ? `${b.daysToExpiry} days left` : b.status === 'EMPTY' ? 'Sold out' : 'OK'
}

export function BatchesSection({ product }: { product: Product }) {
  const q = useQuery({ queryKey: ['batches', product.id], queryFn: () => api.get<BatchRow[]>('/api/v1/batches', { productId: product.id }), enabled: product.trackBatches })
  if (!product.trackBatches) return null
  return (
    <Card title="Batches" padded={false}>
      {(q.data ?? []).length === 0 ? <EmptyState icon="archive" title="No batches yet" /> : (q.data ?? []).map((b) => (
        <ListRow key={b.id} title={b.batchNumber} subtitle={b.expiryDate ? `Expiry ${date(b.expiryDate)}` : 'No expiry'} meta={quantity(b.onHand)}
          right={<Badge tone={expiryTone(b)}>{expiryLabel(b)}</Badge>} />
      ))}
    </Card>
  )
}

export function SerialsSection({ product }: { product: Product }) {
  const q = useQuery({ queryKey: ['serials', product.id], queryFn: () => api.get<SerialRow[]>('/api/v1/serials', { productId: product.id }), enabled: product.trackSerials })
  if (!product.trackSerials) return null
  return (
    <Card title="Serial numbers" padded={false}>
      {(q.data ?? []).length === 0 ? <EmptyState icon="hash" title="No serial numbers yet" /> : (q.data ?? []).slice(0, 20).map((s) => (
        <ListRow key={s.id} title={s.serialNumber} subtitle={s.invoiceNumber ? `Invoice ${s.invoiceNumber}` : undefined}
          right={<Badge tone={s.status === 'IN_STOCK' ? 'success' : 'neutral'}>{titleCase(s.status)}</Badge>} />
      ))}
    </Card>
  )
}

/** Opens a PDF sheet of barcode labels (BARCODE_LABELS module). */
export function LabelsButton({ productIds }: { productIds: string[] }) {
  const enabled = useModule('BARCODE_LABELS')
  const [busy, setBusy] = useState(false)
  if (!enabled || productIds.length === 0) return null
  const open = async () => {
    setBusy(true)
    try {
      await openDocument('/api/v1/labels/products', 'labels.pdf', { ids: productIds.join(','), copies: 1 })
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }
  return <Button variant="secondary" icon="printer" loading={busy} onPress={open}>Labels</Button>
}

/** Unit choices of a product for document lines: base unit first, then alternate units. */
export function unitOptions(p: { unit: string; units?: UnitOption[] }) {
  return [{ value: p.unit, label: p.unit }, ...(p.units ?? []).map((u) => ({ value: u.unit, label: `${u.unit} (= ${Number(u.factor)} ${p.unit})` }))]
}

export function unitFactor(p: { unit: string; units?: UnitOption[] }, unit?: string) {
  if (!unit || unit === p.unit) return 1
  return Number(p.units?.find((u) => u.unit === unit)?.factor ?? 1)
}
