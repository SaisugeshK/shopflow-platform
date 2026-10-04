import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { DateInput } from '@/components/admin/Pickers'
import { AttachmentsSection, PoLines, ReceiptsSection, RevisionsSection, WAITING } from '@/components/procurement/PoParts'
import { Button } from '@/components/ui/Button'
import { PoweredBy } from '@/components/ui/BusinessBrand'
import { Card, KeyValue, ListRow, StatusBadge } from '@/components/ui/Data'
import { Alert, EmptyState, QueryState } from '@/components/ui/Feedback'
import { ChipGroup, Field, Input, MoneyInput, QtyInput, Select } from '@/components/ui/Form'
import { ConfirmDialog } from '@/components/ui/Overlay'
import { Screen } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { toast } from '@/components/ui/Toast'
import { BusinessSwitcher } from '@/components/ui/TenantPicker'
import { useSignOut } from '@/features/session'
import { api, ApiError } from '@/services/api'
import type { GoodsReceipt, PoLine, PurchaseOrder } from '@/services/types'
import { useAuthStore } from '@/store/auth'
import { date, money, quantity, titleCase } from '@/utils/format'

/** Supplier home: purchase orders from the business (own orders only). */
export function SupplierOrdersScreen() {
  const [filter, setFilter] = useState('OPEN')
  const q = useQuery({ queryKey: ['supplier-pos'], queryFn: () => api.page<PurchaseOrder>('/api/v1/supplier-portal/purchase-orders', { pageSize: 100 }) })
  const rows = (q.data?.items ?? []).filter((p) => filter === 'ALL' || WAITING.includes(p.status))
  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <ChipGroup value={filter} onChange={setFilter} options={[{ value: 'OPEN', label: 'Waiting for me' }, { value: 'ALL', label: 'All orders' }]} />
      <QueryState query={q} isEmpty={() => rows.length === 0} empty={<EmptyState icon="clipboard" title={filter === 'OPEN' ? 'Nothing waiting for your quotation' : 'No purchase orders yet'} />}>
        {() => (
          <Card padded={false}>
            {rows.map((p) => (
              <ListRow key={p.id} title={p.poNumber} subtitle={`${date(p.orderDate)}${p.expectedDate ? ` · needed by ${date(p.expectedDate)}` : ''}`}
                meta={<View style={{ marginTop: 6 }}><StatusBadge status={WAITING.includes(p.status) ? 'PENDING' : p.status} /></View>}
                right={<Text weight="700" num>{money(p.grandTotal)}</Text>} onPress={() => router.push(`/supplier/order/${p.id}`)} />
            ))}
          </Card>
        )}
      </QueryState>
    </Screen>
  )
}

interface QuoteLine { quantity: string; rate: string; availability: string; deliveryDate: string; note: string; substituteNote: string }

export function SupplierOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const qc = useQueryClient()
  const [values, setValues] = useState<Record<string, QuoteLine>>({})
  const [header, setHeader] = useState({ quoteValidUntil: '', note: '' })
  const [declining, setDeclining] = useState(false)
  const q = useQuery({ queryKey: ['po', id], queryFn: () => api.get<PurchaseOrder>(`/api/v1/supplier-portal/purchase-orders/${id}`) })
  const value = (l: PoLine): QuoteLine => values[l.id] ?? { quantity: String(l.quantity), rate: String(l.rate), availability: l.availability, deliveryDate: l.deliveryDate ?? '', note: l.lineNote ?? '', substituteNote: l.substituteNote ?? '' }
  const quote = useMutation({
    mutationFn: (po: PurchaseOrder) => api.put<PurchaseOrder>(`/api/v1/supplier-portal/purchase-orders/${id}/quote`, {
      lines: (po.lines ?? []).filter((l) => l.status === 'OPEN').map((l) => {
        const v = value(l)
        return { lineId: l.id, quantity: v.quantity, rate: v.rate, availability: v.availability, deliveryDate: v.deliveryDate || undefined, note: v.note, substituteNote: v.substituteNote }
      }),
      quoteValidUntil: header.quoteValidUntil || undefined, note: header.note || undefined,
    }),
    onSuccess: (po) => { toast.success('Quotation sent', money(po.grandTotal)); setValues({}); qc.setQueryData(['po', id], po); qc.invalidateQueries({ queryKey: ['supplier-pos'] }) },
  })
  const decline = useMutation({
    mutationFn: (reason: string) => api.post<PurchaseOrder>(`/api/v1/supplier-portal/purchase-orders/${id}/decline`, { reason }),
    onSuccess: (po) => { toast.success('Order declined'); setDeclining(false); qc.setQueryData(['po', id], po); qc.invalidateQueries({ queryKey: ['supplier-pos'] }) },
    onError: (e) => toast.error(e),
  })
  const err = quote.error instanceof ApiError ? quote.error : null
  const po = q.data
  const canQuote = !!po && WAITING.includes(po.status)
  return (
    <>
      <Stack.Screen options={{ title: po?.poNumber ?? 'Purchase order' }} />
      <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}
        footer={canQuote && po ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button variant="secondary" style={{ flex: 1 }} onPress={() => setDeclining(true)}>Decline</Button>
            <Button icon="send" style={{ flex: 1.6 }} loading={quote.isPending} onPress={() => quote.mutate(po)}>Send quotation</Button>
          </View>
        ) : undefined}>
        <QueryState query={q}>
          {(po) => (
            <>
              <View style={{ gap: 6 }}>
                <Text variant="small" color="muted">{po.businessName} · {date(po.orderDate)}{po.expectedDate ? ` · needed by ${date(po.expectedDate)}` : ''}</Text>
                <View style={{ flexDirection: 'row' }}><StatusBadge status={po.status} /></View>
              </View>
              {po.notes && <Alert title="Note from the buyer">{po.notes}</Alert>}
              {po.status === 'COUNTERED' && <Alert tone="warning" title="Counter-offer">The buyer changed some terms; review and send your quotation again.</Alert>}
              {po.status === 'ACCEPTED' && <Alert tone="success" title="Accepted">Please deliver the accepted lines.</Alert>}
              {canQuote ? (po.lines ?? []).filter((l) => l.status === 'OPEN').map((l) => {
                const v = value(l)
                const set = (patch: Partial<QuoteLine>) => setValues({ ...values, [l.id]: { ...v, ...patch } })
                return (
                  <Card key={l.id} title={`${l.lineNumber}. ${l.description}`}>
                    <View style={{ gap: 10 }}>
                      <Text variant="xs" color="muted">Asked {quantity(l.quantity)} {l.unit} at {money(l.rate)}{l.lineNote ? ` · ${l.lineNote}` : ''}</Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <View style={{ flex: 1 }}><Field label={`Qty (${l.unit})`}><QtyInput value={v.quantity} onChangeText={(t) => set({ quantity: t })} accessibilityLabel={`Quantity of ${l.description}`} /></Field></View>
                        <View style={{ flex: 1.3 }}><Field label="Your rate"><MoneyInput value={v.rate} onChangeText={(t) => set({ rate: t })} accessibilityLabel={`Your rate for ${l.description}`} /></Field></View>
                      </View>
                      <Field label="Availability"><Select label="Availability" value={v.availability} onChange={(a) => set({ availability: a })}
                        options={[{ value: 'AVAILABLE', label: 'Available' }, { value: 'PARTIAL', label: 'Partly available' }, { value: 'UNAVAILABLE', label: 'Not available' }]} /></Field>
                      <Field label="Delivery date"><DateInput label="Delivery date" value={v.deliveryDate} onChange={(d) => set({ deliveryDate: d })} /></Field>
                      <Field label="Note"><Input value={v.note} onChangeText={(t) => set({ note: t })} accessibilityLabel={`Note for ${l.description}`} /></Field>
                      <Field label="Substitute suggestion"><Input value={v.substituteNote} onChangeText={(t) => set({ substituteNote: t })} accessibilityLabel={`Substitute for ${l.description}`} /></Field>
                    </View>
                  </Card>
                )
              }) : (
                <Card title="Lines">
                  <PoLines po={po} />
                  <KeyValue items={[['Total', <Text key="t" weight="700" num>{money(po.grandTotal)}</Text>]]} />
                </Card>
              )}
              {canQuote && (
                <Card title="Quotation">
                  <View style={{ gap: 10 }}>
                    <Field label="Valid until"><DateInput label="Valid until" value={header.quoteValidUntil} onChange={(d) => setHeader({ ...header, quoteValidUntil: d })} /></Field>
                    <Field label="Message to the buyer"><Input multiline value={header.note} onChangeText={(t) => setHeader({ ...header, note: t })} accessibilityLabel="Message to the buyer" /></Field>
                    {err && <Alert tone="danger">{err.message}</Alert>}
                  </View>
                </Card>
              )}
              <RevisionsSection revisions={po.revisions} />
              <AttachmentsSection po={po} base={`/api/v1/supplier-portal/purchase-orders/${po.id}`} canUpload={!['CANCELLED', 'REJECTED', 'CLOSED'].includes(po.status)} />
              <ReceiptsSection receipts={po.receipts} />
            </>
          )}
        </QueryState>
        <ConfirmDialog open={declining} onClose={() => setDeclining(false)} tone="danger" requireReason loading={decline.isPending} title="Decline this order?"
          confirmLabel="Decline" onConfirm={(reason) => decline.mutate(reason ?? '')} />
      </Screen>
    </>
  )
}

export function SupplierDeliveriesScreen() {
  const q = useQuery({ queryKey: ['supplier-deliveries'], queryFn: () => api.get<GoodsReceipt[]>('/api/v1/supplier-portal/deliveries') })
  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <QueryState query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState icon="truck" title="No deliveries recorded yet" />}>
        {(rows) => <ReceiptsSection receipts={rows} />}
      </QueryState>
    </Screen>
  )
}

export function SupplierProfileScreen() {
  const user = useAuthStore((s) => s.user)!
  const signOut = useSignOut()
  return (
    <Screen>
      <Card title="Profile">
        <KeyValue items={[['Supplier', user.supplier?.name], ['Supplier code', user.supplier?.supplierCode], ['Login', user.fullName], ['Mobile', user.mobileNumber],
          ['Buying business', user.business?.name], ['Role', titleCase(user.role)]]} />
      </Card>
      <BusinessSwitcher />
      <Button variant="secondary" icon="log-out" onPress={signOut}>Sign out</Button>
      <PoweredBy />
    </Screen>
  )
}
