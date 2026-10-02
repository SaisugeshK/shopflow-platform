import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { ListFilters } from '@/components/admin/Filters'
import { DateInput, isValidDate } from '@/components/admin/Pickers'
import { RecordPaymentSheet } from '@/components/admin/RecordPaymentSheet'
import { RequirePermission } from '@/components/admin/RequirePermission'
import { Button } from '@/components/ui/Button'
import { Card, KeyValue, ListRow, StatusBadge } from '@/components/ui/Data'
import { EmptyState, QueryState } from '@/components/ui/Feedback'
import { Field, Select } from '@/components/ui/Form'
import { ConfirmDialog } from '@/components/ui/Overlay'
import { PagedList, Screen } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { toast } from '@/components/ui/Toast'
import { useDebounced } from '@/hooks/useDebounced'
import { api } from '@/services/api'
import { openDocument } from '@/services/documents'
import type { Payment } from '@/services/types'
import { useCan } from '@/store/auth'
import { dateTime, money, titleCase } from '@/utils/format'

/** O18/AD12 Payments received from customers. */
export default function PaymentsScreen() {
  const params = useLocalSearchParams<{ record?: string }>()
  const canWrite = useCan('PAYMENT_WRITE')
  const [recording, setRecording] = useState(false)
  useEffect(() => { if (params.record === '1' && canWrite) setRecording(true) }, [params.record, canWrite])
  const [search, setSearch] = useState('')
  const [method, setMethod] = useState('')
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const q = useDebounced(search)
  const f = isValidDate(from) ? from : ''
  const t = isValidDate(to) ? to : ''
  return (
    <RequirePermission anyOf={['PAYMENT_READ']}>
      <PagedList<Payment>
        queryKey={['payments', q, method, status, f, t]}
        fetchPage={(page, pageSize) => api.page<Payment>('/api/v1/payments', { q, method, status, from: f, to: t, page, pageSize })}
        keyOf={(p) => p.id}
        header={
          <ListFilters search={search} onSearch={setSearch} placeholder="Payment or reference number"
            chips={[{ value: '', label: 'All' }, ...['CASH', 'ONLINE', 'UPI', 'BANK_TRANSFER', 'OTHER'].map((v) => ({ value: v, label: titleCase(v) }))]} chip={method} onChip={setMethod}
            activeCount={[status, f, t].filter(Boolean).length} onClear={() => { setStatus(''); setFrom(''); setTo('') }}
            action={canWrite ? <Button icon="plus" onPress={() => setRecording(true)} accessibilityLabel="Record payment">Record</Button> : undefined}
            sheet={
              <>
                <Field label="Status"><Select label="Status" value={status} onChange={setStatus} options={[{ value: '', label: 'Any status' }, ...['CAPTURED', 'PENDING', 'UNPAID', 'FAILED', 'REFUNDED', 'CANCELLED'].map((v) => ({ value: v, label: titleCase(v) }))]} /></Field>
                <Field label="From"><DateInput label="From date" value={from} onChange={setFrom} /></Field>
                <Field label="To"><DateInput label="To date" value={to} onChange={setTo} /></Field>
              </>
            } />
        }
        empty={<EmptyState icon="credit-card" title="No payments" description="Recorded and online payments appear here." />}
        renderItem={(p) => (
          <ListRow onPress={() => router.push(`/admin/payment/${p.id}`)} title={p.paymentNumber}
            subtitle={`${p.customerName} · ${titleCase(p.method)} · ${dateTime(p.paidAt ?? p.createdAt)}`}
            meta={<View style={{ marginTop: 4 }}><StatusBadge status={p.status} /></View>}
            right={<><Text weight="700" num>{money(p.amount)}</Text>{(p.referenceNumber ?? p.invoiceNumber) && <Text variant="xs" color="muted">{p.referenceNumber ?? p.invoiceNumber}</Text>}</>} />
        )}
      />
      <RecordPaymentSheet open={recording} onClose={() => setRecording(false)} onDone={(p) => router.push(`/admin/payment/${p.id}`)} />
    </RequirePermission>
  )
}

export function PaymentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const qc = useQueryClient()
  const canWrite = useCan('PAYMENT_WRITE')
  const [dialog, setDialog] = useState<'cancel' | 'refund' | null>(null)
  const [downloading, setDownloading] = useState(false)
  const q = useQuery({ queryKey: ['payment', id], queryFn: () => api.get<Payment>(`/api/v1/payments/${id}`) })
  const act = useMutation({
    mutationFn: ({ path, reason }: { path: string; reason: string }) => api.post<Payment>(`/api/v1/payments/${id}/${path}`, { reason }),
    onSuccess: (p) => {
      toast.success(`Payment ${titleCase(p.status)}`)
      setDialog(null)
      qc.invalidateQueries({ queryKey: ['payment', id] })
      qc.invalidateQueries({ queryKey: ['payments'] })
    },
    onError: (e) => toast.error(e),
  })
  const p = q.data
  const received = !!p && (p.status === 'CAPTURED' || p.status === 'PARTIALLY_PAID')
  const receipt = async () => {
    setDownloading(true)
    try {
      await openDocument(`/api/v1/payments/${id}/receipt`, `${p?.paymentNumber ?? 'receipt'}.pdf`)
    } catch (e) {
      toast.error(e)
    } finally {
      setDownloading(false)
    }
  }
  return (
    <RequirePermission anyOf={['PAYMENT_READ']}>
      <Stack.Screen options={{ title: p?.paymentNumber ?? 'Payment' }} />
      <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}
        footer={p && received ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button variant="secondary" icon="download" style={{ flex: 1 }} loading={downloading} onPress={receipt}>Receipt</Button>
            {canWrite && p.refundedAmount < p.amount && <Button variant="danger" icon="rotate-ccw" style={{ flex: 1 }} onPress={() => setDialog('refund')}>Refund</Button>}
          </View>
        ) : undefined}
      >
        <QueryState query={q}>
          {(p) => (
            <>
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 28, fontWeight: '800' }} num>{money(p.amount)}</Text>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><StatusBadge status={p.status} /><Text variant="small" color="muted">from {p.customerName}</Text></View>
              </View>
              {canWrite && received && p.method !== 'ONLINE' && p.refundedAmount === 0 && (
                <Button size="sm" variant="ghost" icon="corner-up-left" style={{ alignSelf: 'flex-start' }} onPress={() => setDialog('cancel')}>Cancel entry (made in error)</Button>
              )}
              <Card title="Details">
                <KeyValue items={[
                  ['Method', titleCase(p.method)], ['Reference', p.referenceNumber], ['Paid at', p.paidAt ? dateTime(p.paidAt) : undefined], ['Collected by', p.collectedBy],
                  ['Order', p.orderNumber], ['Provider', p.provider ? `${p.provider} · ${p.providerOrderId}` : undefined], ['Failure', p.failureReason],
                  ['Refunded', p.refundedAmount > 0 ? money(p.refundedAmount) : undefined], ['Cancel reason', p.cancelReason], ['Notes', p.notes],
                ]} />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <Button size="sm" variant="ghost" icon="user" onPress={() => router.push(`/admin/customer/${p.customerId}`)}>Customer</Button>
                  {p.orderId && <Button size="sm" variant="ghost" icon="shopping-cart" onPress={() => router.push(`/admin/order/${p.orderId}`)}>Order</Button>}
                </View>
              </Card>
              <Card title="Applied to invoices" padded={false}>
                {p.allocations?.length ? p.allocations.map((a) => (
                  <ListRow key={a.invoiceId + a.amount + a.reversed} title={a.invoiceNumber ?? 'Invoice'} onPress={() => router.push(`/admin/invoice/${a.invoiceId}`)}
                    meta={<View style={{ marginTop: 4 }}><StatusBadge status={a.reversed ? 'CANCELLED' : 'APPLIED'} /></View>} right={<Text num weight="600">{money(a.amount)}</Text>} />
                )) : <EmptyState title="Not applied yet" description="Unapplied money is held as customer credit and used on the next invoice." />}
                <View style={{ padding: 16 }}><KeyValue items={[['Applied', money(p.allocatedAmount)], ['Unapplied (credit)', money(p.unallocatedAmount)]]} /></View>
              </Card>
              <ConfirmDialog open={dialog === 'cancel'} onClose={() => setDialog(null)} title="Cancel payment entry" tone="danger" requireReason confirmLabel="Cancel payment"
                message="Use this only for an entry made in error. The ledger and invoices are reversed." loading={act.isPending} onConfirm={(reason) => act.mutate({ path: 'cancel', reason })} />
              <ConfirmDialog open={dialog === 'refund'} onClose={() => setDialog(null)} title="Refund payment" tone="danger" requireReason confirmLabel="Refund"
                message={`Refund the remaining ${money(p.amount - p.refundedAmount)} to the customer${p.method === 'ONLINE' ? ' through the payment gateway' : ''}.`}
                loading={act.isPending} onConfirm={(reason) => act.mutate({ path: 'refund', reason })} />
            </>
          )}
        </QueryState>
      </Screen>
    </RequirePermission>
  )
}
