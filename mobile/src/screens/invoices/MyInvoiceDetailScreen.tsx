import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { Button } from '@/components/ui/Button'
import { Card, KeyValue, StatusBadge, TaxBreakdown } from '@/components/ui/Data'
import { Alert, QueryState } from '@/components/ui/Feedback'
import { Field, Input } from '@/components/ui/Form'
import { LineItems } from '@/components/ui/LineItems'
import { Sheet } from '@/components/ui/Overlay'
import { Screen } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { toast } from '@/components/ui/Toast'
import { api, ApiError } from '@/services/api'
import { openDocument } from '@/services/documents'
import type { Invoice, SalesReturn } from '@/services/types'
import { date, money, quantity } from '@/utils/format'

/** Customer invoice detail: GST breakdown, PDF download/share and return request. */
export default function MyInvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const qc = useQueryClient()
  const [returning, setReturning] = useState(false)
  const [qty, setQty] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  const [downloading, setDownloading] = useState(false)
  const q = useQuery({ queryKey: ['invoice', id], queryFn: () => api.get<Invoice>(`/api/v1/invoices/${id}`) })
  const requestReturn = useMutation({
    mutationFn: () => api.post<SalesReturn>('/api/v1/sales-returns', { invoiceId: id, reason, items: Object.entries(qty).filter(([, v]) => Number(v) > 0).map(([invoiceItemId, quantity]) => ({ invoiceItemId, quantity })) }),
    onSuccess: (r) => {
      toast.success('Return requested', r.returnNumber)
      setReturning(false)
      setQty({})
      setReason('')
      qc.invalidateQueries({ queryKey: ['my-returns'] })
    },
  })
  const err = requestReturn.error instanceof ApiError ? requestReturn.error : null
  const inv = q.data
  const pdf = async () => {
    setDownloading(true)
    try {
      await openDocument(`/api/v1/invoices/${id}/pdf`, `${inv?.invoiceNumber ?? 'invoice'}.pdf`)
    } catch (e) {
      toast.error(e)
    } finally {
      setDownloading(false)
    }
  }
  return (
    <>
      <Stack.Screen options={{ title: inv?.invoiceNumber ?? 'Invoice' }} />
      <Screen
        onRefresh={() => q.refetch()}
        refreshing={q.isRefetching}
        footer={inv && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button variant="secondary" icon="rotate-ccw" style={{ flex: 1 }} onPress={() => setReturning(true)}>Request return</Button>
            <Button icon="download" style={{ flex: 1 }} loading={downloading} onPress={pdf}>PDF</Button>
          </View>
        )}
      >
        <QueryState query={q}>
          {(inv) => (
            <>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Text color="muted">{date(inv.invoiceDate)}</Text>
                <StatusBadge status={inv.status} />
                {inv.overdue && <StatusBadge status="OVERDUE" />}
              </View>
              <Card title="Payment">
                <KeyValue items={[
                  ['Total', money(inv.grandTotal)],
                  ['Credit notes', inv.creditedAmount > 0 ? money(inv.creditedAmount) : undefined],
                  ['Paid', money(inv.paidAmount)],
                  ['Due', <Text key="d" weight="700" num>{money(inv.outstanding)}</Text>],
                  ['Due date', date(inv.dueDate)],
                ]} />
              </Card>
              <Card title="Items">
                <LineItems lines={(inv.items ?? []).map((i) => ({ id: i.id, name: i.productName, qty: i.quantity, unit: i.unit, rate: i.rate, amount: i.lineTotal, note: `GST ${i.taxRate}%` }))} />
                <View style={{ height: 8 }} />
                <TaxBreakdown t={inv} />
                {inv.amountInWords && <Text variant="xs" color="muted" style={{ marginTop: 8 }}>{inv.amountInWords}</Text>}
              </Card>
              <Card title="Billed by">
                <KeyValue items={[['Seller', inv.seller.name], ['GSTIN', inv.seller.gstin], ['Address', inv.seller.address]]} />
              </Card>
            </>
          )}
        </QueryState>
      </Screen>
      <Sheet open={returning} onClose={() => setReturning(false)} title="Request a return" footer={
        <Button block loading={requestReturn.isPending} disabled={reason.trim().length < 3 || !Object.values(qty).some((v) => Number(v) > 0)} onPress={() => requestReturn.mutate()}>Submit request</Button>
      }>
        <Text variant="small" color="muted">Returns are accepted for delivered orders and reviewed by the shop. Approved returns are credited to your account.</Text>
        {(inv?.items ?? []).map((i) => (
          <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text weight="600">{i.productName}</Text>
              <Text variant="xs" color="muted">Bought {quantity(i.quantity)} {i.unit}</Text>
            </View>
            <View style={{ width: 96 }}>
              <Input accessibilityLabel={`Return quantity for ${i.productName}`} keyboardType="decimal-pad" placeholder="0" value={qty[i.id] ?? ''} onChangeText={(t) => setQty({ ...qty, [i.id]: t.replace(/[^\d.]/g, '') })} style={{ textAlign: 'right' }} />
            </View>
          </View>
        ))}
        <Field label="Reason" required>
          <Input value={reason} onChangeText={setReason} multiline accessibilityLabel="Reason for return" />
        </Field>
        {err && <Alert tone="danger">{err.message}</Alert>}
      </Sheet>
    </>
  )
}
