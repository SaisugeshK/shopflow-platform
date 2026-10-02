import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { RecordPaymentSheet } from '@/components/admin/RecordPaymentSheet'
import { RequirePermission } from '@/components/admin/RequirePermission'
import { Button, type IconName } from '@/components/ui/Button'
import { Card, KeyValue, ListRow, StatusBadge, TaxBreakdown, Timeline } from '@/components/ui/Data'
import { Alert, QueryState } from '@/components/ui/Feedback'
import { Field, Input, PhoneInput, QtyInput } from '@/components/ui/Form'
import { LineItems } from '@/components/ui/LineItems'
import { ConfirmDialog, Sheet } from '@/components/ui/Overlay'
import { Screen } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { toast } from '@/components/ui/Toast'
import { orderTimeline } from '@/features/shop'
import { api } from '@/services/api'
import type { Order, StatusHistory } from '@/services/types'
import { useCan } from '@/store/auth'
import { dateTime, money, quantity, titleCase } from '@/utils/format'

type DialogKind = 'accept' | 'reject' | 'cancel' | 'dispatch' | 'deliver' | 'failed' | 'payment' | null

/** O03/AD03 Order detail with the status workflow actions (§7.2). The backend validates every transition. */
export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const qc = useQueryClient()
  const canWrite = useCan('ORDER_WRITE')
  const canInvoice = useCan('INVOICE_WRITE')
  const canPay = useCan('PAYMENT_WRITE')
  const [dialog, setDialog] = useState<DialogKind>(null)
  const order = useQuery({ queryKey: ['order', id], queryFn: () => api.get<Order>(`/api/v1/orders/${id}`) })
  const history = useQuery({ queryKey: ['order', id, 'history'], queryFn: () => api.get<StatusHistory[]>(`/api/v1/orders/${id}/status-history`) })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['order', id] })
    qc.invalidateQueries({ queryKey: ['orders'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
  }
  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api.post<Order>(`/api/v1/orders/${id}/${path}`, body),
    onSuccess: (o) => {
      toast.success(`Order ${o.orderNumber}`, `Now ${titleCase(o.status)}`)
      setDialog(null)
      refresh()
    },
    onError: (e) => toast.error(e),
  })
  const invoice = useMutation({
    mutationFn: () => api.post<{ id: string; invoiceNumber: string }>('/api/v1/invoices', { orderId: id, generate: true }),
    onSuccess: (inv) => {
      toast.success('Invoice generated', inv.invoiceNumber)
      refresh()
      router.push(`/admin/invoice/${inv.id}`)
    },
    onError: (e) => toast.error(e),
  })
  const o = order.data
  const s = o?.status
  const activeInvoice = o?.invoices?.find((i) => i.status !== 'CANCELLED' && i.status !== 'DRAFT')
  const uninvoiced = o?.items?.some((i) => i.acceptedQuantity - i.cancelledQuantity - i.invoicedQuantity > 0)

  const primary: { label: string; icon?: IconName; variant?: 'primary' | 'success' | 'danger'; onPress: () => void } | null = !canWrite || !o ? null
    : s === 'PLACED' ? { label: o.creditApprovalStatus === 'PENDING' ? 'Approve credit & accept' : 'Accept order', icon: 'check', onPress: () => setDialog('accept') }
    : s === 'ACCEPTED' ? { label: 'Start packing', icon: 'box', onPress: () => action.mutate({ path: 'packing' }) }
    : s === 'PACKING' ? { label: 'Ready for delivery', icon: 'package', onPress: () => action.mutate({ path: 'ready-for-delivery' }) }
    : s === 'READY_FOR_DELIVERY' ? { label: 'Dispatch', icon: 'truck', onPress: () => setDialog('dispatch') }
    : s === 'OUT_FOR_DELIVERY' ? { label: 'Mark delivered', icon: 'check-circle', variant: 'success', onPress: () => setDialog('deliver') }
    : s === 'DELIVERED' ? { label: 'Complete order', icon: 'check', onPress: () => action.mutate({ path: 'complete' }) }
    : null
  const secondary: { label: string; onPress: () => void }[] = !canWrite || !o ? [] : [
    ...(s === 'PLACED' ? [{ label: 'Reject', onPress: () => setDialog('reject') }] : []),
    ...(s === 'OUT_FOR_DELIVERY' ? [{ label: 'Delivery failed', onPress: () => setDialog('failed') }] : []),
    ...(s && ['ACCEPTED', 'PACKING', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY'].includes(s) ? [{ label: 'Cancel order', onPress: () => setDialog('cancel') }] : []),
  ]

  return (
    <RequirePermission anyOf={['ORDER_READ']}>
      <Stack.Screen options={{ title: o?.orderNumber ?? 'Order' }} />
      <Screen
        onRefresh={() => { order.refetch(); history.refetch() }}
        refreshing={order.isRefetching}
        footer={primary || secondary.length ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {secondary.length > 0 && (
              <Button variant="secondary" style={{ flex: primary ? 1 : 2 }} onPress={secondary[secondary.length - 1]!.onPress}>
                {secondary[secondary.length - 1]!.label}
              </Button>
            )}
            {primary && <Button variant={primary.variant ?? 'primary'} icon={primary.icon} loading={action.isPending} style={{ flex: 2 }} onPress={primary.onPress}>{primary.label}</Button>}
          </View>
        ) : undefined}
      >
        <QueryState query={order}>
          {(o) => (
            <>
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  <StatusBadge status={o.status} />
                  <StatusBadge status={o.paymentStatus} />
                </View>
                <Text variant="small" color="muted">Placed {dateTime(o.placedAt)} · {o.source === 'STAFF' ? 'by staff' : 'by customer'}</Text>
              </View>
              {o.creditApprovalStatus === 'PENDING' && <Alert tone="warning" title="Credit approval required">This credit order exceeds the customer’s available credit. Accepting it approves the credit.</Alert>}
              {o.cancelReason && <Alert tone="danger" title={titleCase(o.status)}>{o.cancelReason}</Alert>}
              {o.rejectReason && <Alert tone="danger" title="Rejected">{o.rejectReason}</Alert>}
              {secondary.length > 1 && (
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {secondary.slice(0, -1).map((a) => <Button key={a.label} size="sm" variant="secondary" onPress={a.onPress}>{a.label}</Button>)}
                </View>
              )}
              <Card title="Items">
                <LineItems lines={(o.items ?? []).map((i) => ({
                  id: i.id, name: i.productName, unit: i.unit, rate: i.rate, amount: i.lineTotal, qty: i.orderedQuantity,
                  note: [
                    `GST ${i.taxRate}%`,
                    s !== 'PLACED' ? `accepted ${quantity(i.acceptedQuantity)}` : null,
                    i.deliveredQuantity > 0 ? `delivered ${quantity(i.deliveredQuantity)}` : null,
                    i.cancelledQuantity > 0 ? `cancelled ${quantity(i.cancelledQuantity)}` : null,
                  ].filter(Boolean).join(' · '),
                }))} />
                <View style={{ height: 8 }} />
                <TaxBreakdown t={o} />
              </Card>
              <Card title="Invoices & payments">
                <View style={{ gap: 10 }}>
                  {o.invoices?.length ? o.invoices.map((i) => (
                    <ListRow key={i.id} title={i.invoiceNumber ?? 'Draft invoice'} onPress={() => router.push(`/admin/invoice/${i.id}`)}
                      meta={<View style={{ marginTop: 4 }}><StatusBadge status={i.status} /></View>}
                      right={<><Text num weight="600">{money(i.grandTotal)}</Text>{i.outstanding > 0 && <Text variant="xs" color="warning">Due {money(i.outstanding)}</Text>}</>} />
                  )) : <Text variant="small" color="muted">{s === 'PLACED' ? 'Accept the order to invoice it.' : 'Not invoiced yet.'}</Text>}
                  <KeyValue items={[
                    ['Payment method', titleCase(o.paymentMethod)],
                    ['Paid', money(o.paidAmount)],
                    ['Balance due', <Text key="b" weight="700" num>{money(o.balanceDue)}</Text>],
                  ]} />
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {canInvoice && s !== 'PLACED' && !['CANCELLED', 'REJECTED', 'DELIVERY_FAILED'].includes(o.status) && uninvoiced && (
                      <Button size="sm" icon="file-text" loading={invoice.isPending} onPress={() => invoice.mutate()}>Generate invoice</Button>
                    )}
                    {canPay && activeInvoice && activeInvoice.outstanding > 0 && (
                      <Button size="sm" variant="secondary" icon="credit-card" onPress={() => setDialog('payment')}>Record payment</Button>
                    )}
                  </View>
                </View>
              </Card>
              <Card title="Status timeline"><Timeline steps={orderTimeline(o, history.data ?? [])} /></Card>
              <Card title="Customer & delivery">
                <KeyValue items={[
                  ['Customer', o.customerName], ['Code', o.customerCode], ['Deliver to', o.deliveryAddress], ['Contact', o.contactMobile],
                  ['Supply', o.interState ? 'Inter-state (IGST)' : 'Intra-state (CGST + SGST)'], ['Note', o.orderNote],
                  ['Delivery person', o.delivery?.deliveryPerson], ['Vehicle', o.delivery?.vehicleNumber],
                  ['Dispatched', o.delivery?.dispatchedAt ? dateTime(o.delivery.dispatchedAt) : undefined],
                  ['Delivered', o.delivery?.deliveredAt ? dateTime(o.delivery.deliveredAt) : undefined],
                  ['Received by', o.delivery?.receivedBy],
                ]} />
                <Button size="sm" variant="ghost" icon="user" style={{ alignSelf: 'flex-start', marginTop: 8 }} onPress={() => router.push(`/admin/customer/${o.customerId}`)}>Open customer</Button>
              </Card>

              <AcceptSheet open={dialog === 'accept'} order={o} loading={action.isPending} onClose={() => setDialog(null)} onSubmit={(items, note) => action.mutate({ path: 'accept', body: { items, note: note || undefined } })} />
              <DeliverSheet open={dialog === 'deliver'} order={o} loading={action.isPending} onClose={() => setDialog(null)} onSubmit={(body) => action.mutate({ path: 'deliver', body })} />
              <DispatchSheet open={dialog === 'dispatch'} loading={action.isPending} onClose={() => setDialog(null)} onSubmit={(body) => action.mutate({ path: 'out-for-delivery', body })} />
              <ConfirmDialog open={dialog === 'reject'} onClose={() => setDialog(null)} title="Reject order" tone="danger" requireReason confirmLabel="Reject order"
                message="Reserved stock is released and any online payment is refunded." loading={action.isPending} onConfirm={(reason) => action.mutate({ path: 'reject', body: { reason } })} />
              <ConfirmDialog open={dialog === 'cancel'} onClose={() => setDialog(null)} title="Cancel order" tone="danger" requireReason confirmLabel="Cancel order"
                message="The order's invoice is cancelled, stock is released and online payments are refunded. Cash payments stay as customer credit." loading={action.isPending}
                onConfirm={(reason) => action.mutate({ path: 'cancel', body: { reason } })} />
              <ConfirmDialog open={dialog === 'failed'} onClose={() => setDialog(null)} title="Delivery failed" tone="danger" requireReason confirmLabel="Mark failed"
                message="This closes the order: stock is released and the invoice is cancelled." loading={action.isPending} onConfirm={(reason) => action.mutate({ path: 'delivery-failed', body: { reason } })} />
              {activeInvoice && <RecordPaymentSheet open={dialog === 'payment'} onClose={() => setDialog(null)} customerId={o.customerId} invoiceId={activeInvoice.id} maxAmount={activeInvoice.outstanding} onDone={refresh} />}
            </>
          )}
        </QueryState>
      </Screen>
    </RequirePermission>
  )
}

function AcceptSheet({ open, order, onClose, onSubmit, loading }: { open: boolean; order: Order; onClose: () => void; onSubmit: (items: { orderItemId: string; acceptedQuantity: string }[], note: string) => void; loading: boolean }) {
  const [qty, setQty] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  useEffect(() => { if (open) { setQty({}); setNote('') } }, [open])
  const items = order.items ?? []
  return (
    <Sheet open={open} onClose={onClose} title="Accept order" footer={
      <Button block loading={loading} onPress={() => onSubmit(items.map((i) => ({ orderItemId: i.id, acceptedQuantity: qty[i.id] ?? String(i.orderedQuantity) })), note)}>Accept order</Button>
    }>
      <Text variant="small" color="muted">Reduce a quantity to accept the order partially. Unaccepted stock is released.</Text>
      {items.map((i) => (
        <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text weight="600">{i.productName}</Text>
            <Text variant="xs" color="muted">Ordered {quantity(i.orderedQuantity)} {i.unit}</Text>
          </View>
          <View style={{ width: 100 }}><QtyInput value={qty[i.id] ?? String(i.orderedQuantity)} onChangeText={(t) => setQty({ ...qty, [i.id]: t })} accessibilityLabel={`Accepted quantity for ${i.productName}`} /></View>
        </View>
      ))}
      <Field label="Note (optional)"><Input value={note} onChangeText={setNote} maxLength={500} accessibilityLabel="Note" /></Field>
    </Sheet>
  )
}

function DeliverSheet({ open, order, onClose, onSubmit, loading }: { open: boolean; order: Order; onClose: () => void; onSubmit: (body: unknown) => void; loading: boolean }) {
  const items = (order.items ?? []).filter((i) => i.acceptedQuantity - i.cancelledQuantity - i.deliveredQuantity > 0)
  const deliverable = (i: (typeof items)[number]) => i.acceptedQuantity - i.cancelledQuantity - i.deliveredQuantity
  const [qty, setQty] = useState<Record<string, string>>({})
  const [receivedBy, setReceivedBy] = useState('')
  const [proof, setProof] = useState('')
  useEffect(() => { if (open) { setQty({}); setReceivedBy(''); setProof('') } }, [open])
  return (
    <Sheet open={open} onClose={onClose} title="Mark delivered" footer={
      <Button block variant="success" loading={loading} onPress={() => onSubmit({
        items: items.map((i) => ({ orderItemId: i.id, deliveredQuantity: qty[i.id] ?? String(deliverable(i)) })),
        receivedBy: receivedBy || undefined, proofOfDelivery: proof || undefined, customerConfirmed: !!receivedBy,
      })}>Confirm delivery</Button>
    }>
      <Alert>Delivered quantities leave stock now. Short quantities are cancelled and, if already invoiced, credited automatically.</Alert>
      {items.map((i) => (
        <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text weight="600">{i.productName}</Text>
            <Text variant="xs" color="muted">To deliver {quantity(deliverable(i))} {i.unit}</Text>
          </View>
          <View style={{ width: 100 }}><QtyInput value={qty[i.id] ?? String(deliverable(i))} onChangeText={(t) => setQty({ ...qty, [i.id]: t })} accessibilityLabel={`Delivered quantity for ${i.productName}`} /></View>
        </View>
      ))}
      <Field label="Received by"><Input value={receivedBy} onChangeText={setReceivedBy} accessibilityLabel="Received by" /></Field>
      <Field label="Proof of delivery" hint="e.g. signed challan number"><Input value={proof} onChangeText={setProof} accessibilityLabel="Proof of delivery" /></Field>
    </Sheet>
  )
}

function DispatchSheet({ open, onClose, onSubmit, loading }: { open: boolean; onClose: () => void; onSubmit: (body: unknown) => void; loading: boolean }) {
  const [f, setF] = useState({ deliveryPerson: '', deliveryPersonMobile: '', vehicleNumber: '', notes: '' })
  useEffect(() => { if (open) setF({ deliveryPerson: '', deliveryPersonMobile: '', vehicleNumber: '', notes: '' }) }, [open])
  return (
    <Sheet open={open} onClose={onClose} title="Dispatch order" footer={
      <Button block icon="truck" loading={loading} onPress={() => onSubmit({ ...f, deliveryPersonMobile: f.deliveryPersonMobile || undefined })}>Dispatch</Button>
    }>
      <Field label="Delivery person"><Input value={f.deliveryPerson} onChangeText={(t) => setF({ ...f, deliveryPerson: t })} accessibilityLabel="Delivery person" /></Field>
      <Field label="Mobile"><PhoneInput value={f.deliveryPersonMobile} onChangeText={(t) => setF({ ...f, deliveryPersonMobile: t.replace(/\D/g, '') })} accessibilityLabel="Delivery person mobile" /></Field>
      <Field label="Vehicle number"><Input value={f.vehicleNumber} onChangeText={(t) => setF({ ...f, vehicleNumber: t.toUpperCase() })} autoCapitalize="characters" accessibilityLabel="Vehicle number" /></Field>
      <Field label="Notes"><Input value={f.notes} onChangeText={(t) => setF({ ...f, notes: t })} multiline accessibilityLabel="Notes" /></Field>
    </Sheet>
  )
}
