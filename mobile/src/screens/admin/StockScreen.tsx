import { useMutation, useQueryClient } from '@tanstack/react-query'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { ListFilters } from '@/components/admin/Filters'
import { RequirePermission } from '@/components/admin/RequirePermission'
import { Button } from '@/components/ui/Button'
import { ListRow, StatusBadge } from '@/components/ui/Data'
import { Alert, EmptyState } from '@/components/ui/Feedback'
import { Field, Input, QtyInput, Select } from '@/components/ui/Form'
import { Sheet } from '@/components/ui/Overlay'
import { PagedList } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { toast } from '@/components/ui/Toast'
import { useCategories } from '@/features/catalog'
import { useDebounced } from '@/hooks/useDebounced'
import { api, ApiError } from '@/services/api'
import type { StockRow } from '@/services/types'
import { useCan } from '@/store/auth'
import { money, quantity } from '@/utils/format'

/** O08/AD07 Stock. Available = on hand − reserved for open orders. */
export default function StockScreen() {
  const params = useLocalSearchParams<{ status?: string }>()
  const canWrite = useCan('STOCK_WRITE')
  const categories = useCategories()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState(params.status ?? '')
  useEffect(() => { if (params.status !== undefined) setStatus(params.status) }, [params.status])
  const [categoryId, setCategoryId] = useState('')
  const [adjusting, setAdjusting] = useState<StockRow | null>(null)
  const q = useDebounced(search)
  return (
    <RequirePermission anyOf={['STOCK_READ']}>
      <PagedList<StockRow>
        queryKey={['stock', q, status, categoryId]}
        fetchPage={(page, pageSize) => api.page<StockRow>('/api/v1/stock', { q, status, categoryId, page, pageSize })}
        keyOf={(r) => r.productId}
        header={
          <ListFilters search={search} onSearch={setSearch} placeholder="Product or SKU"
            chips={[{ value: '', label: 'All' }, { value: 'IN_STOCK', label: 'In stock' }, { value: 'LOW_STOCK', label: 'Low' }, { value: 'OUT_OF_STOCK', label: 'Out of stock' }]} chip={status} onChip={setStatus}
            activeCount={categoryId ? 1 : 0} onClear={() => setCategoryId('')}
            action={<Button variant="secondary" icon="activity" onPress={() => router.push('/admin/movements')} accessibilityLabel="Stock movements">Log</Button>}
            sheet={<Field label="Category"><Select label="Category" value={categoryId} onChange={setCategoryId} options={[{ value: '', label: 'All categories' }, ...(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))]} /></Field>} />
        }
        empty={<EmptyState icon="layers" title="No products match" />}
        renderItem={(r) => (
          <ListRow
            title={r.productName}
            subtitle={`${r.sku} · ${r.category} · min ${quantity(r.minimumStock)}`}
            meta={
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <StatusBadge status={r.status} />
                <Button size="sm" variant="ghost" icon="eye" onPress={() => router.push(`/admin/product/${r.productId}`)}>Details</Button>
                {canWrite && <Button size="sm" variant="ghost" icon="sliders" onPress={() => setAdjusting(r)}>Adjust</Button>}
              </View>
            }
            right={
              <>
                <Text weight="700" num>{quantity(r.available)} {r.unit}</Text>
                <Text variant="xs" color="muted">on hand {quantity(r.onHand)} · res {quantity(r.reserved)}</Text>
                <Text variant="xs" color="muted" num>{money(r.stockValue)}</Text>
              </>
            }
          />
        )}
      />
      <AdjustSheet row={adjusting} onClose={() => setAdjusting(null)} />
    </RequirePermission>
  )
}

function AdjustSheet({ row, onClose }: { row: StockRow | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [type, setType] = useState('ADJUSTMENT_IN')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('')
  useEffect(() => { if (row) { setQty(''); setReason(''); setType('ADJUSTMENT_IN') } }, [row])
  const save = useMutation({
    mutationFn: () => api.post('/api/v1/stock/adjustments', { productId: row!.productId, type, quantity: qty, reason }),
    onSuccess: () => {
      toast.success('Stock adjusted', row?.productName)
      qc.invalidateQueries({ queryKey: ['stock'] })
      qc.invalidateQueries({ queryKey: ['movements'] })
      qc.invalidateQueries({ queryKey: ['product'] })
      onClose()
    },
  })
  const err = save.error instanceof ApiError ? save.error : null
  return (
    <Sheet open={!!row} onClose={onClose} title={`Adjust stock · ${row?.productName ?? ''}`} footer={
      <Button block loading={save.isPending} disabled={!(Number(qty) > 0) || reason.trim().length < 3} onPress={() => save.mutate()}>Post adjustment</Button>
    }>
      <Text variant="small" color="muted">Current: {quantity(row?.onHand)} on hand, {quantity(row?.available)} available. Adjustments are permanent journal entries.</Text>
      <Field label="Type" required>
        <Select label="Type" value={type} onChange={setType} options={[
          { value: 'ADJUSTMENT_IN', label: 'Adjustment in (+)' }, { value: 'ADJUSTMENT_OUT', label: 'Adjustment out (−)' },
          { value: 'DAMAGE_OUT', label: 'Damage (−)' }, { value: 'LOSS_OUT', label: 'Loss (−)' },
        ]} />
      </Field>
      <Field label="Quantity" required><QtyInput value={qty} onChangeText={setQty} accessibilityLabel="Quantity" style={{ textAlign: 'left' }} /></Field>
      <Field label="Reason" required><Input value={reason} onChangeText={setReason} multiline maxLength={300} accessibilityLabel="Reason" /></Field>
      {err && <Alert tone="danger">{err.message}</Alert>}
    </Sheet>
  )
}
