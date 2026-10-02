import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { MockCheckoutSheet } from '@/components/shop/MockCheckout'
import { Button } from '@/components/ui/Button'
import { Card, KeyValue, StatusBadge, TaxBreakdown, Timeline } from '@/components/ui/Data'
import { Alert, QueryState } from '@/components/ui/Feedback'
import { LineItems } from '@/components/ui/LineItems'
import { ConfirmDialog } from '@/components/ui/Overlay'
import { Screen } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { toast } from '@/components/ui/Toast'
import { orderTimeline } from '@/features/shop'
import { api } from '@/services/api'
import type { Order, PaymentIntent, StatusHistory } from '@/services/types'
import { date, dateTime, money, quantity, titleCase } from '@/utils/format'

/** C08 Order detail + C09 tracking (§39). */
export default function MyOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const qc = useQueryClient()
  const [cancelling, setCancelling] = useState(false)
  const [intent, setIntent] = useState<PaymentIntent | null>(null)
  const q = useQuery({ queryKey: ['order', id], queryFn: () => api.get<Order>(`/api/v1/orders/${id}`) })
  const history = useQuery({ queryKey: ['order', id, 'history'], queryFn: () => api.get<StatusHistory[]>(`/api/v1/orders/${id}/status-history`) })
  const cancel = useMutation({
    mutationFn: (reason: string) => api.post(`/api/v1/orders/${id}/cancel`, { reason }),
    onSuccess: () => {
      toast.success('Order cancelled')
      setCancelling(false)
      qc.invalidateQueries({ queryKey: ['order', id] })
      qc.invalidateQueries({ queryKey: ['my-orders'] })
    },
    onError: (e) => toast.error(e),
  })
  const pay = useMutation({
    mutationFn: () => api.post<PaymentIntent>(`/api/v1/orders/${id}/payment-intent`),
    onSuccess: setIntent,
    onError: (e) => toast.error(e),
  })
  const o = q.data
  const canPay = !!o && o.paymentMethod === 'ONLINE' && o.balanceDue > 0 && !['CANCELLED', 'REJECTED', 'DELIVERY_FAILED'].includes(o.status)
  return (
    <>
      <Stack.Screen options={{ title: o?.orderNumber ?? 'Order' }} />
      <Screen
        onRefresh={() => { q.refetch(); history.refetch() }}
        refreshing={q.isRefetching}
        footer={o && (canPay || o.customerCanCancel) ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {o.customerCanCancel && <Button variant="secondary" icon="x-circle" style={{ flex: 1 }} onPress={() => setCancelling(true)}>Cancel order</Button>}
            {canPay && <Button icon="credit-card" style={{ flex: 1 }} loading={pay.isPending} onPress={() => (o.paymentIntent ? setIntent(o.paymentIntent) : pay.mutate())}>Pay {money(o.balanceDue)}</Button>}
          </View>
        ) : undefined}
      >
        <QueryState query={q}>
          {(o) => (
            <>
              <View style={{ gap: 6 }}>
                <Text variant="small" color="muted">Placed {dateTime(o.placedAt)}</Text>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  <StatusBadge status={o.status} />
                  <StatusBadge status={o.paymentStatus} />
                </View>
              </View>
              {o.paymentStatus === 'FAILED' && <Alert tone="warning" title="Payment not completed">Your last payment attempt failed. You can try again.</Alert>}
              {o.creditApprovalStatus === 'PENDING' && <Alert>This credit order is waiting for the shop’s approval.</Alert>}
              {(o.cancelReason || o.rejectReason) && <Alert tone="danger" title={titleCase(o.status)}>{o.cancelReason ?? o.rejectReason ?? ''}</Alert>}
              <Card title="Tracking"><Timeline steps={orderTimeline(o, history.data ?? [])} /></Card>
              <Card title="Items">
                <LineItems lines={(o.items ?? []).map((i) => ({
                  id: i.id, name: i.productName, unit: i.unit, rate: i.rate, amount: i.lineTotal,
                  qty: o.status === 'PLACED' ? i.orderedQuantity : i.acceptedQuantity - i.cancelledQuantity,
                  note: i.deliveredQuantity > 0 ? `delivered ${quantity(i.deliveredQuantity)}` : undefined,
                }))} />
                <View style={{ height: 8 }} />
                <TaxBreakdown t={o} />
              </Card>
              <Card title="Invoice & payment">
                <KeyValue items={[
                  ['Payment', <StatusBadge key="p" status={o.paymentStatus} />],
                  ['Method', titleCase(o.paymentMethod)],
                  ['Paid', money(o.paidAmount)],
                  ['Balance', money(o.balanceDue)],
                ]} />
                <View style={{ marginTop: 12, gap: 8 }}>
                  {o.invoices?.length ? o.invoices.map((i) => (
                    <Button key={i.id} variant="secondary" icon="file-text" onPress={() => router.push(`/shop/invoice/${i.id}`)}>{`Invoice ${i.invoiceNumber ?? ''}`}</Button>
                  )) : <Text variant="small" color="muted">The invoice is issued after the shop accepts the order.</Text>}
                </View>
              </Card>
              <Card title="Delivery">
                <KeyValue items={[
                  ['Address', o.deliveryAddress], ['Contact', o.contactMobile],
                  ['Delivery person', o.delivery?.deliveryPerson], ['Vehicle', o.delivery?.vehicleNumber],
                  ['Delivered', o.delivery?.deliveredAt ? date(o.delivery.deliveredAt) : undefined],
                ]} />
              </Card>
            </>
          )}
        </QueryState>
      </Screen>
      <ConfirmDialog open={cancelling} onClose={() => setCancelling(false)} title="Cancel this order?" tone="danger" requireReason loading={cancel.isPending} confirmLabel="Cancel order"
        message="Online payments are refunded automatically. Cash already paid stays as credit on your account." onConfirm={(r) => cancel.mutate(r)} />
      {intent && <MockCheckoutSheet open={!!intent} intent={intent} onClose={() => { setIntent(null); qc.invalidateQueries({ queryKey: ['order', id] }) }} />}
    </>
  )
}
