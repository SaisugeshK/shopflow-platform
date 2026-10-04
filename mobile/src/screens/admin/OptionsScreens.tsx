import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { ListFilters } from '@/components/admin/Filters'
import { DateInput, ProductPickerButton } from '@/components/admin/Pickers'
import { expiryLabel, expiryTone } from '@/components/admin/ProductOptions'
import { RequirePermission } from '@/components/admin/RequirePermission'
import { Button } from '@/components/ui/Button'
import { Badge, Card, ListRow } from '@/components/ui/Data'
import { Alert, EmptyState, QueryState } from '@/components/ui/Feedback'
import { Field, Input, MoneyInput, QtyInput, Select } from '@/components/ui/Form'
import { ConfirmDialog, Sheet } from '@/components/ui/Overlay'
import { Screen } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { toast } from '@/components/ui/Toast'
import { useCategories } from '@/features/catalog'
import { useDebounced } from '@/hooks/useDebounced'
import { api, ApiError } from '@/services/api'
import type { BatchRow, Product, RateRow, Scheme, SerialRow } from '@/services/types'
import { useCan } from '@/store/auth'
import { date, money, quantity, titleCase, today } from '@/utils/format'

/** Daily rate list (§0B.7): today's rate becomes the selling price. */
export function DailyRatesScreen() {
  const qc = useQueryClient()
  const canWrite = useCan('PRODUCT_WRITE')
  const [effectiveDate, setEffectiveDate] = useState(today())
  const [edits, setEdits] = useState<Record<string, string>>({})
  const q = useQuery({ queryKey: ['daily-rates', effectiveDate], queryFn: () => api.get<RateRow[]>('/api/v1/daily-rates', { date: effectiveDate }) })
  const save = useMutation({
    mutationFn: () => api.put<RateRow[]>('/api/v1/daily-rates', {
      effectiveDate, rates: Object.entries(edits).filter(([, v]) => v !== '').map(([productId, rate]) => ({ productId, rate })),
    }),
    onSuccess: () => { toast.success('Rates saved'); setEdits({}); qc.invalidateQueries({ queryKey: ['daily-rates'] }); qc.invalidateQueries({ queryKey: ['products'] }) },
    onError: (e) => toast.error(e),
  })
  const changed = Object.values(edits).filter((v) => v !== '').length
  return (
    <RequirePermission anyOf={['PRODUCT_READ']}>
      <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}
        footer={canWrite ? <Button block icon="save" disabled={changed === 0} loading={save.isPending} onPress={() => save.mutate()}>Save {changed || ''} rate{changed === 1 ? '' : 's'}</Button> : undefined}>
        <Field label="Effective date"><DateInput label="Effective date" value={effectiveDate} onChange={(d) => { setEffectiveDate(d); setEdits({}) }} allowEmpty={false} /></Field>
        <QueryState query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState icon="trending-up" title="No rate-priced products" description="Set a product's pricing to “Daily rate list”." />}>
          {(rows) => (
            <Card padded={false}>
              {rows.map((r) => (
                <View key={r.productId} style={{ padding: 14, gap: 8, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' }}>
                  <Text weight="700">{r.name}</Text>
                  <Text variant="xs" color="muted">{r.sku} · per {r.unit} · current {r.rate != null ? `${money(r.rate)} from ${date(r.rateDate)}` : 'not set'}</Text>
                  {canWrite && <MoneyInput value={edits[r.productId] ?? ''} placeholder={r.rate != null ? String(r.rate) : 'New rate'}
                    onChangeText={(t) => setEdits({ ...edits, [r.productId]: t })} accessibilityLabel={`New rate for ${r.name}`} />}
                </View>
              ))}
            </Card>
          )}
        </QueryState>
      </Screen>
    </RequirePermission>
  )
}

/** Schemes: buy-X-get-Y and slab discounts, applied by the server. */
export function SchemesScreen() {
  const qc = useQueryClient()
  const canWrite = useCan('PRODUCT_WRITE')
  const categories = useCategories()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState<Scheme | null>(null)
  const [type, setType] = useState<Scheme['schemeType']>('BUY_X_GET_Y')
  const [product, setProduct] = useState<Product | null>(null)
  const [categoryId, setCategoryId] = useState('')
  const [f, setF] = useState({ name: '', buyQuantity: '10', freeQuantity: '1', minQuantity: '', minValue: '', discountPercent: '' })
  const q = useQuery({ queryKey: ['schemes'], queryFn: () => api.get<Scheme[]>('/api/v1/schemes') })
  const create = useMutation({
    mutationFn: () => api.post<Scheme>('/api/v1/schemes', {
      name: f.name, schemeType: type, productId: product?.id, categoryId: !product && categoryId ? categoryId : undefined,
      buyQuantity: type === 'BUY_X_GET_Y' ? f.buyQuantity : undefined, freeQuantity: type === 'BUY_X_GET_Y' ? f.freeQuantity : undefined,
      minQuantity: type === 'QUANTITY_SLAB' ? f.minQuantity : undefined, minValue: type === 'VALUE_SLAB' ? f.minValue : undefined,
      discountPercent: type !== 'BUY_X_GET_Y' ? f.discountPercent : undefined,
    }),
    onSuccess: (s) => { toast.success('Scheme created', s.summary); setOpen(false); setProduct(null); qc.invalidateQueries({ queryKey: ['schemes'] }) },
  })
  const toggle = useMutation({
    mutationFn: (s: Scheme) => api.post<Scheme>(`/api/v1/schemes/${s.id}/${s.active ? 'deactivate' : 'activate'}`),
    onSuccess: () => { setConfirm(null); qc.invalidateQueries({ queryKey: ['schemes'] }) },
    onError: (e) => toast.error(e),
  })
  const err = create.error instanceof ApiError ? create.error : null
  return (
    <RequirePermission anyOf={['PRODUCT_READ']}>
      <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}
        footer={canWrite ? <Button block icon="plus" onPress={() => setOpen(true)}>New scheme</Button> : undefined}>
        <QueryState query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState icon="gift" title="No schemes yet" />}>
          {(rows) => (
            <Card padded={false}>
              {rows.map((s) => (
                <ListRow key={s.id} title={s.name} subtitle={s.summary} right={<Badge tone={s.active ? 'success' : 'neutral'}>{s.active ? 'Active' : 'Stopped'}</Badge>}
                  onPress={canWrite ? () => setConfirm(s) : undefined} />
              ))}
            </Card>
          )}
        </QueryState>
        <Sheet open={open} onClose={() => setOpen(false)} title="New scheme"
          footer={<Button block loading={create.isPending} disabled={!f.name.trim() || (type === 'BUY_X_GET_Y' ? !product : !product && !categoryId)} onPress={() => create.mutate()}>Create scheme</Button>}>
          <Field label="Name" required><Input value={f.name} onChangeText={(t) => setF({ ...f, name: t })} accessibilityLabel="Scheme name" /></Field>
          <Field label="Type"><Select label="Type" value={type} onChange={(t) => setType(t as Scheme['schemeType'])} options={[
            { value: 'BUY_X_GET_Y', label: 'Buy X, get Y free' }, { value: 'QUANTITY_SLAB', label: 'Quantity slab discount' }, { value: 'VALUE_SLAB', label: 'Value slab discount' }]} /></Field>
          <Field label="Product">{product ? <Text weight="700" onPress={() => setProduct(null)}>{product.name} (change)</Text> : <ProductPickerButton exclude={[]} onPick={setProduct} />}</Field>
          {type !== 'BUY_X_GET_Y' && !product && (
            <Field label="Or category"><Select label="Category" value={categoryId} onChange={setCategoryId} placeholder="Choose category" options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))} /></Field>
          )}
          {type === 'BUY_X_GET_Y' && <>
            <Field label="Buy (quantity)"><QtyInput value={f.buyQuantity} onChangeText={(t) => setF({ ...f, buyQuantity: t })} accessibilityLabel="Buy quantity" style={{ textAlign: 'left' }} /></Field>
            <Field label="Get free"><QtyInput value={f.freeQuantity} onChangeText={(t) => setF({ ...f, freeQuantity: t })} accessibilityLabel="Free quantity" style={{ textAlign: 'left' }} /></Field>
          </>}
          {type === 'QUANTITY_SLAB' && <Field label="Minimum quantity"><QtyInput value={f.minQuantity} onChangeText={(t) => setF({ ...f, minQuantity: t })} accessibilityLabel="Minimum quantity" style={{ textAlign: 'left' }} /></Field>}
          {type === 'VALUE_SLAB' && <Field label="Minimum value"><MoneyInput value={f.minValue} onChangeText={(t) => setF({ ...f, minValue: t })} accessibilityLabel="Minimum value" /></Field>}
          {type !== 'BUY_X_GET_Y' && <Field label="Discount (%)"><QtyInput value={f.discountPercent} onChangeText={(t) => setF({ ...f, discountPercent: t })} accessibilityLabel="Discount percent" style={{ textAlign: 'left' }} /></Field>}
          {err && <Alert tone="danger">{err.message}</Alert>}
        </Sheet>
        <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.active ? 'Stop this scheme?' : 'Activate this scheme?'}
          message={confirm?.summary} confirmLabel={confirm?.active ? 'Stop' : 'Activate'} loading={toggle.isPending} onConfirm={() => { if (confirm) toggle.mutate(confirm) }} />
      </Screen>
    </RequirePermission>
  )
}

/** Near-expiry / expired batches with write-off. */
export function BatchesScreen() {
  const params = useLocalSearchParams<{ productId?: string }>()
  const qc = useQueryClient()
  const canWrite = useCan('STOCK_WRITE')
  const [tab, setTab] = useState(params.productId ? 'ALL' : 'NEAR_EXPIRY')
  const [search, setSearch] = useState('')
  const [writeOff, setWriteOff] = useState<BatchRow | null>(null)
  const debounced = useDebounced(search)
  const q = useQuery({ queryKey: ['batches', 'report', tab, debounced, params.productId], queryFn: () => api.get<BatchRow[]>('/api/v1/batches', { status: tab, q: debounced, productId: params.productId }) })
  const write = useMutation({
    mutationFn: ({ row, reason }: { row: BatchRow; reason: string }) => api.post(`/api/v1/batches/products/${row.productId}/write-off`, { batchNumber: row.batchNumber, expired: row.status === 'EXPIRED', reason }),
    onSuccess: () => { toast.success('Stock written off'); setWriteOff(null); qc.invalidateQueries({ queryKey: ['batches'] }) },
    onError: (e) => toast.error(e),
  })
  return (
    <RequirePermission anyOf={['STOCK_READ']}>
      <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
        <ListFilters search={search} onSearch={setSearch} placeholder="Product, SKU or batch"
          chips={[{ value: 'NEAR_EXPIRY', label: 'Near expiry' }, { value: 'EXPIRED', label: 'Expired' }, { value: 'ALL', label: 'All in stock' }]} chip={tab} onChip={setTab} />
        <QueryState query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState icon="archive" title="No batches here" />}>
          {(rows) => (
            <Card padded={false}>
              {rows.map((b) => (
                <ListRow key={b.id} title={b.productName} subtitle={`Batch ${b.batchNumber}${b.expiryDate ? ` · exp ${date(b.expiryDate)}` : ''} · ${quantity(b.onHand)} ${b.unit}`}
                  right={<Badge tone={expiryTone(b)}>{expiryLabel(b)}</Badge>}
                  onPress={canWrite && b.onHand > 0 && (b.status === 'EXPIRED' || b.status === 'NEAR_EXPIRY') ? () => setWriteOff(b) : () => router.push(`/admin/product/${b.productId}`)} />
              ))}
            </Card>
          )}
        </QueryState>
        <ConfirmDialog open={!!writeOff} onClose={() => setWriteOff(null)} tone="danger" requireReason loading={write.isPending}
          title={`Write off batch ${writeOff?.batchNumber ?? ''}?`} confirmLabel="Write off"
          message={writeOff ? `${quantity(writeOff.onHand)} ${writeOff.unit} of ${writeOff.productName} leave stock.` : undefined}
          onConfirm={(reason) => { if (writeOff) write.mutate({ row: writeOff, reason: reason ?? '' }) }} />
      </Screen>
    </RequirePermission>
  )
}

/** Serial / IMEI lookup with buyer and warranty. */
export function SerialsScreen() {
  const params = useLocalSearchParams<{ productId?: string }>()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const debounced = useDebounced(search)
  const q = useQuery({ queryKey: ['serials', 'search', debounced, status, params.productId], queryFn: () => api.get<SerialRow[]>('/api/v1/serials', { q: debounced, status, productId: params.productId }) })
  return (
    <RequirePermission anyOf={['STOCK_READ']}>
      <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
        <ListFilters search={search} onSearch={setSearch} placeholder="Serial, IMEI, product or invoice"
          chips={[{ value: '', label: 'All' }, { value: 'IN_STOCK', label: 'In stock' }, { value: 'SOLD', label: 'Sold' }]} chip={status} onChip={setStatus} />
        <QueryState query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState icon="hash" title="No serial numbers found" />}>
          {(rows) => (
            <Card padded={false}>
              {rows.map((s) => (
                <ListRow key={s.id} title={s.serialNumber}
                  subtitle={[s.productName, s.customerName, s.invoiceNumber, s.warrantyUntil ? `warranty ${s.underWarranty ? 'till' : 'ended'} ${date(s.warrantyUntil)}` : null].filter(Boolean).join(' · ')}
                  right={<Badge tone={s.status === 'IN_STOCK' ? 'success' : s.status === 'SOLD' ? 'primary' : 'neutral'}>{titleCase(s.status)}</Badge>}
                  onPress={s.invoiceId ? () => router.push(`/admin/invoice/${s.invoiceId}`) : undefined} />
              ))}
            </Card>
          )}
        </QueryState>
      </Screen>
    </RequirePermission>
  )
}
