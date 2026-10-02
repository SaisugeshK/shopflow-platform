import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { ListFilters } from '@/components/admin/Filters'
import { DateInput, isValidDate } from '@/components/admin/Pickers'
import { RequirePermission } from '@/components/admin/RequirePermission'
import { Badge, Card, StatusBadge } from '@/components/ui/Data'
import { EmptyState } from '@/components/ui/Feedback'
import { Field, Select } from '@/components/ui/Form'
import { PagedList } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { useDebounced } from '@/hooks/useDebounced'
import { api } from '@/services/api'
import type { Order } from '@/services/types'
import { date, money, titleCase } from '@/utils/format'

const STATUS = [
  { value: '', label: 'All' }, { value: 'PLACED', label: 'New' }, { value: 'ACCEPTED', label: 'Accepted' }, { value: 'PACKING', label: 'Packing' },
  { value: 'READY_FOR_DELIVERY', label: 'Ready' }, { value: 'OUT_FOR_DELIVERY', label: 'Out for delivery' }, { value: 'DELIVERED', label: 'Delivered' },
  { value: 'COMPLETED', label: 'Completed' }, { value: 'CANCELLED', label: 'Cancelled' },
]

export function OrderCard({ o }: { o: Order }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
      <Card onPress={() => router.push(`/admin/order/${o.id}`)} accessibilityLabel={`Order ${o.orderNumber}, ${o.customerName}, ${titleCase(o.status)}`}>
        <View style={{ gap: 8 }}>
          <View style={styles.between}>
            <View style={{ flex: 1 }}>
              <Text weight="700">{o.orderNumber}</Text>
              <Text variant="small" color="muted" numberOfLines={1}>{o.customerName} · {o.customerCode}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text variant="h3" num>{money(o.grandTotal)}</Text>
              <Text variant="xs" color="muted">{date(o.placedAt)}</Text>
            </View>
          </View>
          <View style={[styles.between, { flexWrap: 'wrap' }]}>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', flex: 1 }}>
              <StatusBadge status={o.status} />
              <StatusBadge status={o.paymentStatus} />
              {o.creditApprovalStatus === 'PENDING' && <Badge tone="warning">Credit approval</Badge>}
            </View>
            {o.balanceDue > 0 && <Text variant="xs" color="warning" weight="600">Due {money(o.balanceDue)}</Text>}
          </View>
        </View>
      </Card>
    </View>
  )
}

/** O02/AD02 Orders list with status chips, search and date/payment filters. */
export default function OrdersScreen() {
  const params = useLocalSearchParams<{ status?: string }>()
  const [status, setStatus] = useState(params.status ?? '')
  useEffect(() => { if (params.status !== undefined) setStatus(params.status) }, [params.status])
  const [search, setSearch] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const q = useDebounced(search)
  const f = isValidDate(from) ? from : ''
  const t = isValidDate(to) ? to : ''
  return (
    <RequirePermission anyOf={['ORDER_READ']}>
      <PagedList<Order>
        queryKey={['orders', q, status, paymentStatus, f, t]}
        fetchPage={(page, pageSize) => api.page<Order>('/api/v1/orders', { q, status, paymentStatus, from: f, to: t, page, pageSize })}
        keyOf={(o) => o.id}
        header={
          <ListFilters search={search} onSearch={setSearch} placeholder="Order number or customer" chips={STATUS} chip={status} onChip={setStatus}
            activeCount={[paymentStatus, f, t].filter(Boolean).length} onClear={() => { setPaymentStatus(''); setFrom(''); setTo('') }}
            sheet={
              <>
                <Field label="Payment status">
                  <Select label="Payment status" value={paymentStatus} onChange={setPaymentStatus} options={[{ value: '', label: 'Any payment' }, ...['PENDING', 'PAID', 'PARTIALLY_PAID', 'CREDIT', 'FAILED', 'REFUNDED'].map((v) => ({ value: v, label: titleCase(v) }))]} />
                </Field>
                <Field label="Placed from"><DateInput label="From date" value={from} onChange={setFrom} /></Field>
                <Field label="Placed to"><DateInput label="To date" value={to} onChange={setTo} /></Field>
              </>
            } />
        }
        empty={<EmptyState icon="shopping-cart" title="No orders found" description="Orders placed by customers or staff appear here." />}
        renderItem={(o) => <OrderCard o={o} />}
      />
    </RequirePermission>
  )
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
})
