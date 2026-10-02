import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { ListFilters } from '@/components/admin/Filters'
import { DateInput, isValidDate } from '@/components/admin/Pickers'
import { RequirePermission } from '@/components/admin/RequirePermission'
import { Alert, EmptyState } from '@/components/ui/Feedback'
import { ListRow } from '@/components/ui/Data'
import { Button } from '@/components/ui/Button'
import { Field, Select } from '@/components/ui/Form'
import { PagedList } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { api } from '@/services/api'
import type { MovementRow } from '@/services/types'
import { dateTime, quantity, titleCase } from '@/utils/format'

const TYPES = ['OPENING', 'PURCHASE_IN', 'SALE_OUT', 'SALES_RETURN_IN', 'PURCHASE_RETURN_OUT', 'DAMAGE_OUT', 'LOSS_OUT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT']

/** O09 Stock movement history: every stock change, newest first. */
export default function MovementsScreen() {
  const params = useLocalSearchParams<{ productId?: string }>()
  const [productId, setProductId] = useState(params.productId ?? '')
  const [type, setType] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const f = isValidDate(from) ? from : ''
  const t = isValidDate(to) ? to : ''
  return (
    <RequirePermission anyOf={['STOCK_READ']}>
      <PagedList<MovementRow>
        queryKey={['movements', 'list', productId, type, f, t]}
        fetchPage={(page, pageSize) => api.page<MovementRow>('/api/v1/stock/movements', { productId, type, from: f, to: t, page, pageSize })}
        keyOf={(m) => m.id}
        pageSize={30}
        header={
          <>
            {productId ? <Alert>{'Showing one product. '}</Alert> : null}
            {productId ? <Button size="sm" variant="secondary" onPress={() => setProductId('')}>Show all products</Button> : null}
            <ListFilters activeCount={[type, f, t].filter(Boolean).length} onClear={() => { setType(''); setFrom(''); setTo('') }}
              sheet={
                <>
                  <Field label="Movement type"><Select label="Movement type" value={type} onChange={setType} options={[{ value: '', label: 'All types' }, ...TYPES.map((v) => ({ value: v, label: titleCase(v) }))]} /></Field>
                  <Field label="From"><DateInput label="From date" value={from} onChange={setFrom} /></Field>
                  <Field label="To"><DateInput label="To date" value={to} onChange={setTo} /></Field>
                </>
              } />
          </>
        }
        empty={<EmptyState icon="activity" title="No movements" />}
        renderItem={(m) => (
          <ListRow
            onPress={() => router.push(`/admin/product/${m.productId}`)}
            title={m.productName}
            subtitle={`${titleCase(m.movementType)} · ${dateTime(m.createdAt)}${m.referenceNumber ? ` · ${m.referenceNumber}` : ''}${m.reason ? ` · ${m.reason}` : ''}`}
            right={<><Text weight="700" num color={m.direction === 'IN' ? 'success' : 'danger'}>{m.direction === 'IN' ? '+' : '−'}{quantity(m.quantity)}</Text><Text variant="xs" color="muted">Bal {quantity(m.balanceAfter)}</Text></>}
          />
        )}
      />
    </RequirePermission>
  )
}
