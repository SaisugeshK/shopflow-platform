import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { RequirePermission } from '@/components/admin/RequirePermission'
import { Button } from '@/components/ui/Button'
import { Card, KeyValue, ListRow, StatusBadge, TaxBreakdown } from '@/components/ui/Data'
import { Alert, EmptyState, QueryState } from '@/components/ui/Feedback'
import { Field, Input, MoneyInput, QtyInput, Select } from '@/components/ui/Form'
import { LineItems } from '@/components/ui/LineItems'
import { ConfirmDialog, Sheet } from '@/components/ui/Overlay'
import { Screen } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { toast } from '@/components/ui/Toast'
import { api } from '@/services/api'
import type { Purchase, PurchaseReturn } from '@/services/types'
import { useCan } from '@/store/auth'
import { date, dateTime, money, quantity, titleCase } from '@/utils/format'

/** O11 Purchase detail: post draft, pay supplier, return items. */
export default function PurchaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const qc = useQueryClient()
  const canWrite = useCan('PURCHASE_WRITE')
  const [dialog, setDialog] = useState<'cancel' | 'pay' | 'return' | null>(null)
  const q = useQuery({ queryKey: ['purchase', id], queryFn: () => api.get<Purchase>(`/api/v1/purchases/${id}`) })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['purchase', id] })
    qc.invalidateQueries({ queryKey: ['purchases'] })
    qc.invalidateQueries({ queryKey: ['stock'] })
    qc.invalidateQueries({ queryKey: ['supplier'] })
  }
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api.post<Purchase>(`/api/v1/purchases/${id}/${path}`, body),
    onSuccess: () => { toast.success('Purchase updated'); setDialog(null); refresh() },
    onError: (e) => toast.error(e),
  })
  const p = q.data
  return (
    <RequirePermission anyOf={['PURCHASE_READ']}>
      <Stack.Screen options={{ title: p?.purchaseNumber ?? 'Purchase' }} />
      <Screen
        onRefresh={() => q.refetch()}
        refreshing={q.isRefetching}
        footer={canWrite && p && (p.status === 'DRAFT' || p.status === 'POSTED') ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {p.status === 'DRAFT' && <Button variant="secondary" style={{ flex: 1 }} onPress={() => setDialog('cancel')}>Cancel draft</Button>}
            {p.status === 'DRAFT' && <Button icon="check-circle" style={{ flex: 1.4 }} loading={act.isPending} onPress={() => act.mutate({ path: 'post' })}>Post (receive stock)</Button>}
            {p.status === 'POSTED' && <Button variant="secondary" icon="rotate-ccw" style={{ flex: 1 }} onPress={() => setDialog('return')}>Return items</Button>}
            {p.status === 'POSTED' && (p.balanceDue ?? 0) > 0 && <Button icon="credit-card" style={{ flex: 1 }} onPress={() => setDialog('pay')}>Pay supplier</Button>}
          </View>
        ) : undefined}
      >
        <QueryState query={q}>
          {(p) => (
            <>
              <View style={{ gap: 6 }}>
                <Text variant="small" color="muted">{p.supplierName} · {date(p.purchaseDate)}</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}><StatusBadge status={p.status} /><StatusBadge status={p.paymentStatus === 'UNPAID' ? 'PENDING' : p.paymentStatus} /></View>
              </View>
              {p.cancelReason && <Alert tone="danger" title="Cancelled">{p.cancelReason}</Alert>}
              <Card title="Summary">
                <KeyValue items={[
                  ['Supplier invoice', p.supplierInvoiceNumber], ['Invoice date', p.supplierInvoiceDate ? date(p.supplierInvoiceDate) : undefined], ['Supply', p.interState ? 'Inter-state' : 'Intra-state'],
                  ['Paid', money(p.paidAmount)], ['Balance due', p.balanceDue != null ? <Text key="b" weight="700" num>{money(p.balanceDue)}</Text> : undefined],
                  ['Posted', p.postedAt ? dateTime(p.postedAt) : undefined], ['Notes', p.notes],
                ]} />
              </Card>
              <Card title="Items">
                <LineItems lines={(p.items ?? []).map((i) => ({
                  id: i.id, name: i.productName, qty: i.quantity, unit: i.unit, rate: i.rate, amount: i.lineTotal,
                  note: [`GST ${i.taxRate}%`, i.discountAmount > 0 ? `disc ${money(i.discountAmount)}` : null,
                    i.unitFactor !== 1 ? `1 ${i.unit} = ${Number(i.unitFactor)}` : null,
                    i.batchNumber ? `batch ${i.batchNumber}${i.expiryDate ? ` exp ${i.expiryDate}` : ''}` : null,
                    i.serialNumbers.length ? `serial ${i.serialNumbers.join(', ')}` : null,
                    i.returnedQuantity > 0 ? `returned ${quantity(i.returnedQuantity)}` : null].filter(Boolean).join(' · '),
                }))} />
                <View style={{ height: 8 }} />
                <TaxBreakdown t={p} />
              </Card>
              <Card title="Supplier payments" padded={false}>
                {p.payments?.length ? p.payments.map((x) => (
                  <ListRow key={x.id} title={x.paymentNumber} subtitle={`${titleCase(x.method)} · ${dateTime(x.paidAt)}${x.referenceNumber ? ` · ${x.referenceNumber}` : ''}`} right={<Text weight="600" num>{money(x.amount)}</Text>} />
                )) : <EmptyState title="No payments yet" />}
              </Card>
              <ConfirmDialog open={dialog === 'cancel'} onClose={() => setDialog(null)} title="Cancel draft purchase" tone="danger" requireReason loading={act.isPending} confirmLabel="Cancel draft"
                message="The draft is kept for audit but can no longer be posted." onConfirm={(reason) => act.mutate({ path: 'cancel', body: { reason } })} />
              <SupplierPaymentSheet open={dialog === 'pay'} max={p.balanceDue ?? 0} loading={act.isPending} onClose={() => setDialog(null)} onSubmit={(body) => act.mutate({ path: 'payments', body })} />
              <PurchaseReturnSheet open={dialog === 'return'} purchase={p} onClose={() => setDialog(null)} onDone={refresh} />
            </>
          )}
        </QueryState>
      </Screen>
    </RequirePermission>
  )
}

function SupplierPaymentSheet({ open, max, loading, onClose, onSubmit }: { open: boolean; max: number; loading: boolean; onClose: () => void; onSubmit: (b: unknown) => void }) {
  const [amount, setAmount] = useState(String(max))
  const [method, setMethod] = useState('BANK_TRANSFER')
  const [reference, setReference] = useState('')
  useEffect(() => { if (open) { setAmount(String(max)); setReference('') } }, [open, max])
  return (
    <Sheet open={open} onClose={onClose} title="Pay supplier" footer={
      <Button block loading={loading} disabled={!(Number(amount) > 0)} onPress={() => onSubmit({ amount, method, referenceNumber: reference || undefined })}>Record payment</Button>
    }>
      <Field label="Amount" hint={`Balance due ${money(max)}`}><MoneyInput value={amount} onChangeText={setAmount} accessibilityLabel="Amount" /></Field>
      <Field label="Method"><Select label="Method" value={method} onChange={setMethod} options={['BANK_TRANSFER', 'UPI', 'CASH', 'CHEQUE', 'OTHER'].map((v) => ({ value: v, label: titleCase(v) }))} /></Field>
      <Field label="Reference"><Input value={reference} onChangeText={setReference} accessibilityLabel="Reference" /></Field>
    </Sheet>
  )
}

function PurchaseReturnSheet({ open, purchase, onClose, onDone }: { open: boolean; purchase: Purchase; onClose: () => void; onDone: () => void }) {
  const [qty, setQty] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  useEffect(() => { if (open) { setQty({}); setReason('') } }, [open])
  const items = (purchase.items ?? []).filter((i) => i.quantity - i.returnedQuantity > 0)
  const save = useMutation({
    mutationFn: () => api.post<PurchaseReturn>('/api/v1/purchase-returns', {
      purchaseId: purchase.id, reason, post: true,
      items: Object.entries(qty).filter(([, v]) => Number(v) > 0).map(([purchaseItemId, quantity]) => ({ purchaseItemId, quantity })),
    }),
    onSuccess: (r) => { toast.success('Purchase return posted', `${r.returnNumber} · ${money(r.grandTotal)}`); onClose(); onDone() },
    onError: (e) => toast.error(e),
  })
  const any = Object.values(qty).some((v) => Number(v) > 0)
  return (
    <Sheet open={open} onClose={onClose} title="Return items to supplier" footer={
      <Button block loading={save.isPending} disabled={!any || reason.trim().length < 3} onPress={() => save.mutate()}>Post return</Button>
    }>
      <Text variant="small" color="muted">Stock goes out immediately and the supplier balance is reduced by the return value at the original net rate.</Text>
      {items.map((i) => (
        <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text weight="600">{i.productName}</Text>
            <Text variant="xs" color="muted">Returnable {quantity(i.quantity - i.returnedQuantity)} {i.unit}</Text>
          </View>
          <View style={{ width: 100 }}><QtyInput value={qty[i.id] ?? ''} placeholder="0" onChangeText={(t) => setQty({ ...qty, [i.id]: t })} accessibilityLabel={`Return quantity for ${i.productName}`} /></View>
        </View>
      ))}
      <Field label="Reason" required><Input value={reason} onChangeText={setReason} multiline accessibilityLabel="Reason" /></Field>
    </Sheet>
  )
}
