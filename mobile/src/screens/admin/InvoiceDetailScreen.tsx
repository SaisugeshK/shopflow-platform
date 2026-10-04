import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { View } from 'react-native'
import { RecordPaymentSheet } from '@/components/admin/RecordPaymentSheet'
import { RequirePermission } from '@/components/admin/RequirePermission'
import { Button } from '@/components/ui/Button'
import { Badge, Card, KeyValue, ListRow, StatusBadge, TaxBreakdown } from '@/components/ui/Data'
import { Alert, QueryState, Spinner } from '@/components/ui/Feedback'
import { Field, Input, QtyInput, Select } from '@/components/ui/Form'
import { LineItems } from '@/components/ui/LineItems'
import { ConfirmDialog, Sheet } from '@/components/ui/Overlay'
import { Screen } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { toast } from '@/components/ui/Toast'
import { api, newIdempotencyKey } from '@/services/api'
import { openDocument } from '@/services/documents'
import type { Invoice, Party, WhatsAppMessage } from '@/services/types'
import { useCan } from '@/store/auth'
import { date, dateTime, money, quantity, titleCase } from '@/utils/format'
import { InvoiceTradeSection } from '@/components/trade/TradeParts'

function PartyBlock({ title, p }: { title: string; p: Party }) {
  return (
    <View style={{ gap: 2, flex: 1, minWidth: 220 }}>
      <Text variant="xs" color="muted" weight="700">{title.toUpperCase()}</Text>
      <Text weight="700">{p.name ?? '—'}</Text>
      {p.contactName && <Text variant="small">Attn: {p.contactName}</Text>}
      <Text variant="small" color="muted">{[p.address, p.city, p.state, p.pincode].filter(Boolean).join(', ')}</Text>
      <Text variant="small">GSTIN: {p.gstin ?? 'Unregistered'}{p.stateCode ? ` · State code ${p.stateCode}` : ''}</Text>
      {p.phone && <Text variant="small" color="muted">{p.phone}</Text>}
    </View>
  )
}

/** O21/AD11 Invoice detail: PDF (share/print), generate, WhatsApp delivery, payment, credit note, cancel. */
export default function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const qc = useQueryClient()
  const canWrite = useCan('INVOICE_WRITE')
  const canPay = useCan('PAYMENT_WRITE')
  const [dialog, setDialog] = useState<'cancel' | 'payment' | 'credit' | null>(null)
  const [downloading, setDownloading] = useState(false)
  const generateKey = useMemo(() => newIdempotencyKey(), [])
  const q = useQuery({ queryKey: ['invoice', id], queryFn: () => api.get<Invoice>(`/api/v1/invoices/${id}`) })
  const messages = useQuery({
    queryKey: ['invoice', id, 'whatsapp'],
    queryFn: () => api.get<WhatsAppMessage[]>(`/api/v1/invoices/${id}/whatsapp-messages`),
    refetchInterval: (query) => (query.state.data?.some((m) => m.status === 'QUEUED' || m.status === 'SENDING') ? 2000 : false),
  })
  const refresh = () => { qc.invalidateQueries({ queryKey: ['invoice', id] }); qc.invalidateQueries({ queryKey: ['invoices'] }) }
  const generate = useMutation({ mutationFn: () => api.post(`/api/v1/invoices/${id}/generate`, undefined, { 'Idempotency-Key': generateKey }), onSuccess: () => { toast.success('Invoice generated'); refresh() }, onError: (e) => toast.error(e) })
  const cancel = useMutation({ mutationFn: (reason: string) => api.post(`/api/v1/invoices/${id}/cancel`, { reason }), onSuccess: () => { toast.success('Invoice cancelled'); setDialog(null); refresh() }, onError: (e) => toast.error(e) })
  const send = useMutation({
    mutationFn: () => api.post<WhatsAppMessage>(`/api/v1/invoices/${id}/send-whatsapp`, undefined, { 'Idempotency-Key': newIdempotencyKey() }),
    onSuccess: () => { toast.success('Queued for WhatsApp delivery'); qc.invalidateQueries({ queryKey: ['invoice', id, 'whatsapp'] }) },
    onError: (e) => toast.error(e),
  })
  const retry = useMutation({ mutationFn: (mid: string) => api.post(`/api/v1/invoices/whatsapp-messages/${mid}/retry`), onSuccess: () => qc.invalidateQueries({ queryKey: ['invoice', id, 'whatsapp'] }), onError: (e) => toast.error(e) })
  const inv = q.data
  const pdf = async () => {
    setDownloading(true)
    try {
      await openDocument(`/api/v1/invoices/${id}/pdf`, `${inv?.invoiceNumber ?? 'invoice-draft'}.pdf`)
    } catch (e) {
      toast.error(e)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <RequirePermission anyOf={['INVOICE_READ']}>
      <Stack.Screen options={{ title: inv?.invoiceNumber ?? 'Draft invoice' }} />
      <Screen onRefresh={() => { q.refetch(); messages.refetch() }} refreshing={q.isRefetching}
        footer={inv ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button variant="secondary" icon="share" style={{ flex: 1 }} loading={downloading} onPress={pdf}>PDF</Button>
            {canWrite && inv.status === 'DRAFT' ? <Button icon="check-circle" style={{ flex: 1.4 }} loading={generate.isPending} onPress={() => generate.mutate()}>Generate</Button>
              : canPay && inv.outstanding > 0 ? <Button icon="credit-card" style={{ flex: 1.4 }} onPress={() => setDialog('payment')}>Record payment</Button> : null}
          </View>
        ) : undefined}
      >
        <QueryState query={q}>
          {(inv) => (
            <>
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}><StatusBadge status={inv.status} />{inv.overdue && <Badge tone="danger">Overdue</Badge>}</View>
                <Text variant="small" color="muted">{inv.paymentType === 'CREDIT' ? 'Credit bill' : titleCase(inv.paymentType)} · {date(inv.invoiceDate)}{inv.orderNumber ? ` · Order ${inv.orderNumber}` : ''}</Text>
              </View>
              {inv.status === 'CANCELLED' && <Alert tone="danger" title="Cancelled">{inv.cancelReason ?? ''}</Alert>}
              {inv.einvoiceStatus === 'TEST_IRN' && <Alert tone="warning" title="TEST ONLY e-invoice reference">This IRN comes from the mock e-invoice provider and is not government-issued.</Alert>}
              {canWrite && (
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {!['DRAFT', 'CANCELLED'].includes(inv.status) && <Button size="sm" variant="secondary" icon="message-circle" loading={send.isPending} onPress={() => send.mutate()}>Send WhatsApp</Button>}
                  {['GENERATED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'CREDIT'].includes(inv.status) && <Button size="sm" variant="secondary" icon="rotate-ccw" onPress={() => setDialog('credit')}>Credit note</Button>}
                  {inv.status !== 'CANCELLED' && <Button size="sm" variant="ghost" icon="x-circle" onPress={() => setDialog('cancel')}>Cancel invoice</Button>}
                </View>
              )}
              <Card>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
                  <PartyBlock title="Seller" p={inv.seller} />
                  <PartyBlock title="Buyer (bill to)" p={inv.buyer} />
                </View>
              </Card>
              <Card title="Payment">
                <KeyValue items={[
                  ['Total', money(inv.grandTotal)], ['Credit notes', inv.creditedAmount > 0 ? `−${money(inv.creditedAmount)}` : undefined], ['Paid', money(inv.paidAmount)],
                  ['Outstanding', <Text key="o" weight="700" num color={inv.outstanding > 0 ? 'warning' : 'success'}>{money(inv.outstanding)}</Text>],
                  ['Due date', inv.dueDate ? date(inv.dueDate) : undefined], ['Terms', inv.paymentTerms],
                ]} />
              </Card>
              <Card title="Items">
                <LineItems lines={[...(inv.items ?? []).map((i) => ({
                  id: i.id, name: i.freeItem ? `${i.productName} (free)` : i.productName, qty: i.quantity, unit: i.unit, rate: i.rate, amount: i.lineTotal,
                  note: [`HSN ${i.hsnCode ?? '—'}`, `GST ${i.taxRate}%`, i.discountAmount > 0 ? `disc ${i.discountPercent}%` : null,
                    i.schemeName ? `scheme ${i.schemeName}` : null, i.unitFactor !== 1 ? `1 ${i.unit} = ${Number(i.unitFactor)}` : null,
                    i.batchDetails && !i.batchDetails.startsWith('BATCH:') ? `batch ${i.batchDetails}` : null,
                    i.serialNumbers.length ? `serial ${i.serialNumbers.join(', ')}` : null,
                    i.returnedQuantity > 0 ? `returned ${quantity(i.returnedQuantity)}` : null].filter(Boolean).join(' · '),
                })), ...(inv.charges ?? []).map((c) => ({ id: c.id, name: c.description, qty: 1, unit: '', rate: c.amount, amount: c.total, note: `SAC ${c.sacCode ?? '—'} · GST ${c.taxRate}%` }))]} />
                <View style={{ height: 8 }} />
                <TaxBreakdown t={inv} />
                <Text variant="xs" color="muted" style={{ marginTop: 8 }}>{inv.amountInWords ?? 'Amount in words is calculated on generation'}</Text>
              </Card>
              {inv.taxSummary?.length ? (
                <Card title="HSN tax summary" padded={false}>
                  {inv.taxSummary.map((t) => <ListRow key={`${t.hsnCode}-${t.taxRate}`} title={`HSN ${t.hsnCode ?? '—'} · ${t.taxRate}%`} subtitle={`Taxable ${money(t.taxableAmount)}`} right={<Text num weight="600">{money(t.totalTax)}</Text>} />)}
                </Card>
              ) : null}
              {(inv.creditNotes?.length ?? 0) > 0 && (
                <Card title="Credit notes" padded={false}>
                  {inv.creditNotes!.map((c) => <ListRow key={c.id} title={c.creditNoteNumber} subtitle={`${date(c.noteDate)} · ${titleCase(c.reasonType)} · ${c.reason}`} right={<Text num weight="600">{money(c.grandTotal)}</Text>} />)}
                </Card>
              )}
              <Card title="Details">
                <KeyValue items={[
                  ['Source', inv.source === 'ORDER' ? 'Order' : inv.source === 'CHALLAN' ? 'Delivery challan' : 'Admin-created'], ['Buyer order no.', inv.buyerOrderNumber], ['Transport', inv.transport], ['Vehicle', inv.vehicleNumber],
                  ['Destination', inv.destination], ['E-invoice', titleCase(inv.einvoiceStatus)], ['IRN', inv.irn], ['Generated', inv.generatedAt ? dateTime(inv.generatedAt) : undefined], ['Notes', inv.notes],
                ]} />
                {inv.orderId && <Button size="sm" variant="ghost" icon="shopping-cart" style={{ alignSelf: 'flex-start', marginTop: 8 }} onPress={() => router.push(`/admin/order/${inv.orderId}`)}>Open order {inv.orderNumber}</Button>}
              </Card>
              <InvoiceTradeSection inv={inv} onChanged={refresh} />
              <Card title="WhatsApp delivery">
                {messages.isLoading ? <Spinner /> : messages.data?.length ? (
                  <View style={{ gap: 10 }}>
                    {messages.data.map((m) => (
                      <View key={m.id} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                        <View style={{ flex: 1 }}>
                          <Text variant="small">{m.recipient} · {dateTime(m.queuedAt)}</Text>
                          {m.failureReason && <Text variant="xs" color="danger">{m.failureReason}{m.nextRetryAt ? ` · retry ${dateTime(m.nextRetryAt)}` : ''}</Text>}
                        </View>
                        <StatusBadge status={m.status} />
                        {m.status === 'FAILED' && canWrite && <Button size="sm" variant="ghost" onPress={() => retry.mutate(m.id)}>Retry</Button>}
                      </View>
                    ))}
                  </View>
                ) : <Text variant="small" color="muted">Not sent yet.</Text>}
              </Card>
              <ConfirmDialog open={dialog === 'cancel'} onClose={() => setDialog(null)} title="Cancel invoice" tone="danger" requireReason loading={cancel.isPending} confirmLabel="Cancel invoice"
                message="The invoice is kept for audit and marked cancelled. The ledger is reversed, payments become customer credit, and stock returns for admin-created invoices." onConfirm={(r) => cancel.mutate(r)} />
              <RecordPaymentSheet open={dialog === 'payment'} onClose={() => setDialog(null)} customerId={inv.customerId} invoiceId={inv.id} maxAmount={inv.outstanding} onDone={refresh} />
              <CreditNoteSheet open={dialog === 'credit'} invoice={inv} onClose={() => setDialog(null)} onDone={refresh} />
            </>
          )}
        </QueryState>
      </Screen>
    </RequirePermission>
  )
}

function CreditNoteSheet({ open, invoice, onClose, onDone }: { open: boolean; invoice: Invoice; onClose: () => void; onDone: () => void }) {
  const [qty, setQty] = useState<Record<string, string>>({})
  const [reasonType, setReasonType] = useState('PRICE_ADJUSTMENT')
  const [reason, setReason] = useState('')
  useEffect(() => { if (open) { setQty({}); setReason('') } }, [open])
  const save = useMutation({
    mutationFn: () => api.post(`/api/v1/invoices/${invoice.id}/credit-notes`, {
      reasonType, reason, items: Object.entries(qty).filter(([, v]) => Number(v) > 0).map(([invoiceItemId, quantity]) => ({ invoiceItemId, quantity })),
    }),
    onSuccess: () => { toast.success('Credit note issued'); onClose(); onDone() },
    onError: (e) => toast.error(e),
  })
  return (
    <Sheet open={open} onClose={onClose} title="Issue credit note" footer={
      <Button block loading={save.isPending} disabled={reason.trim().length < 3 || !Object.values(qty).some((v) => Number(v) > 0)} onPress={() => save.mutate()}>Issue credit note</Button>
    }>
      <Text variant="small" color="muted">Credited at the invoice’s net rate and GST. Use Sales returns for goods that come back to stock.</Text>
      {(invoice.items ?? []).map((i) => (
        <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text weight="600">{i.productName}</Text>
            <Text variant="xs" color="muted">Invoiced {quantity(i.quantity)} {i.unit}</Text>
          </View>
          <View style={{ width: 100 }}><QtyInput value={qty[i.id] ?? ''} placeholder="0" onChangeText={(t) => setQty({ ...qty, [i.id]: t })} accessibilityLabel={`Credit quantity for ${i.productName}`} /></View>
        </View>
      ))}
      <Field label="Reason type"><Select label="Reason type" value={reasonType} onChange={setReasonType} options={[{ value: 'PRICE_ADJUSTMENT', label: 'Price adjustment' }, { value: 'OTHER', label: 'Other' }]} /></Field>
      <Field label="Reason" required><Input value={reason} onChangeText={setReason} accessibilityLabel="Reason" /></Field>
    </Sheet>
  )
}
