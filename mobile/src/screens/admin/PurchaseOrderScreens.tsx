import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { LineEditor, newLine, type EditLine } from '@/components/admin/LineEditor'
import { DateInput, ProductPickerButton } from '@/components/admin/Pickers'
import { RequirePermission } from '@/components/admin/RequirePermission'
import { AttachmentsSection, PoLines, ReceiptsSection, RevisionsSection } from '@/components/procurement/PoParts'
import { Button } from '@/components/ui/Button'
import { Card, KeyValue, ListRow, StatusBadge } from '@/components/ui/Data'
import { Alert, EmptyState, QueryState } from '@/components/ui/Feedback'
import { Field, Input, MoneyInput, QtyInput, Select } from '@/components/ui/Form'
import { ConfirmDialog, Sheet } from '@/components/ui/Overlay'
import { PagedList, Screen } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { toast } from '@/components/ui/Toast'
import { useSuppliers } from '@/features/catalog'
import { api, ApiError } from '@/services/api'
import type { Product, PurchaseOrder } from '@/services/types'
import { useCan, useModule } from '@/store/auth'
import { date, money, quantity, titleCase } from '@/utils/format'

/** Purchase orders (§0B.8). */
export function PurchaseOrdersScreen() {
  const canWrite = useCan('PURCHASE_WRITE')
  return (
    <RequirePermission anyOf={['PURCHASE_READ']}>
      <PagedList<PurchaseOrder>
        queryKey={['pos']}
        fetchPage={(page, pageSize) => api.page<PurchaseOrder>('/api/v1/purchase-orders', { page, pageSize })}
        keyOf={(p) => p.id}
        header={canWrite ? <Button icon="plus" onPress={() => router.push('/admin/purchase-order-new')}>New purchase order</Button> : undefined}
        empty={<EmptyState icon="clipboard" title="No purchase orders" description="Send one to a supplier for a quotation." />}
        renderItem={(p) => (
          <ListRow title={p.poNumber} subtitle={`${p.supplierName} · ${date(p.orderDate)}`} meta={<View style={{ marginTop: 6 }}><StatusBadge status={p.status} /></View>}
            right={<Text weight="700" num>{money(p.grandTotal)}</Text>} onPress={() => router.push(`/admin/purchase-order/${p.id}`)} />
        )}
      />
    </RequirePermission>
  )
}

export function PurchaseOrderNewScreen() {
  const qc = useQueryClient()
  const suppliers = useSuppliers()
  const [supplierId, setSupplierId] = useState('')
  const [expectedDate, setExpectedDate] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<EditLine[]>([])
  const save = useMutation({
    mutationFn: (send: boolean) => api.post<PurchaseOrder>('/api/v1/purchase-orders', {
      supplierId, expectedDate: expectedDate || undefined, notes: notes || undefined, send,
      lines: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity, rate: l.rate || undefined, unit: l.unit !== l.product.unit ? l.unit : undefined })),
    }),
    onSuccess: (po) => { toast.success(po.status === 'SENT' ? 'Sent to supplier' : 'Saved as draft', po.poNumber); qc.invalidateQueries({ queryKey: ['pos'] }); router.replace(`/admin/purchase-order/${po.id}`) },
  })
  const err = save.error instanceof ApiError ? save.error : null
  const valid = !!supplierId && lines.length > 0 && lines.every((l) => Number(l.quantity) > 0)
  return (
    <RequirePermission anyOf={['PURCHASE_WRITE']}>
      <Screen footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button variant="secondary" style={{ flex: 1 }} disabled={!valid} loading={save.isPending && save.variables === false} onPress={() => save.mutate(false)}>Save draft</Button>
          <Button icon="send" style={{ flex: 1.4 }} disabled={!valid} loading={save.isPending && save.variables === true} onPress={() => save.mutate(true)}>Send</Button>
        </View>
      }>
        <Card title="Supplier">
          <View style={{ gap: 14 }}>
            <Field label="Supplier" required><Select label="Supplier" value={supplierId} onChange={setSupplierId} placeholder="Choose supplier" searchable options={(suppliers.data?.items ?? []).map((s) => ({ value: s.id, label: s.name }))} /></Field>
            <Field label="Needed by"><DateInput label="Needed by" value={expectedDate} onChange={setExpectedDate} /></Field>
            <Field label="Note to supplier"><Input value={notes} onChangeText={setNotes} multiline accessibilityLabel="Note to supplier" /></Field>
          </View>
        </Card>
        <Card title={`Items · ${lines.length}`}>
          <View style={{ gap: 10 }}>
            <ProductPickerButton exclude={lines.map((l) => l.product.id)} onPick={(p) => setLines([...lines, newLine(p, String(p.purchasePrice))])} />
            {lines.map((l, i) => (
              <LineEditor key={l.key} line={l} mode="sale" ratePlaceholder="Target rate" onChange={(patch) => setLines(lines.map((x, idx) => (idx === i ? { ...x, ...patch, serials: [] } : x)))}
                onRemove={() => setLines(lines.filter((_, idx) => idx !== i))} />
            ))}
          </View>
        </Card>
        {err && <Alert tone="danger">{err.message}</Alert>}
      </Screen>
    </RequirePermission>
  )
}

export function PurchaseOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const qc = useQueryClient()
  const canWrite = useCan('PURCHASE_WRITE')
  const [sheet, setSheet] = useState<'accept' | 'counter' | 'receive' | null>(null)
  const [confirm, setConfirm] = useState<'reject' | 'cancel' | null>(null)
  const q = useQuery({ queryKey: ['po', id], queryFn: () => api.get<PurchaseOrder>(`/api/v1/purchase-orders/${id}`) })
  const done = (po: PurchaseOrder, msg: string) => { toast.success(msg); setSheet(null); setConfirm(null); qc.setQueryData(['po', id], po); qc.invalidateQueries({ queryKey: ['pos'] }) }
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api.post<PurchaseOrder>(`/api/v1/purchase-orders/${id}/${path}`, body),
    onSuccess: (po) => done(po, `Purchase order ${titleCase(po.status).toLowerCase()}`),
    onError: (e) => toast.error(e),
  })
  const po = q.data
  const s = po?.status
  return (
    <RequirePermission anyOf={['PURCHASE_READ']}>
      <Stack.Screen options={{ title: po?.poNumber ?? 'Purchase order' }} />
      <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}
        footer={canWrite && po ? (
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            {s === 'DRAFT' && <Button icon="send" style={{ flex: 1 }} loading={act.isPending} onPress={() => act.mutate({ path: 'send' })}>Send</Button>}
            {s === 'QUOTED' && <Button variant="secondary" style={{ flex: 1 }} onPress={() => setSheet('counter')}>Counter</Button>}
            {s === 'QUOTED' && <Button icon="check" style={{ flex: 1 }} onPress={() => setSheet('accept')}>Accept</Button>}
            {(s === 'ACCEPTED' || s === 'PARTIALLY_RECEIVED') && <Button icon="package" style={{ flex: 1 }} onPress={() => setSheet('receive')}>Receive goods</Button>}
            {['SENT', 'QUOTED', 'COUNTERED'].includes(s ?? '') && <Button variant="ghost" onPress={() => setConfirm('reject')}>Reject</Button>}
            {s === 'DRAFT' && <Button variant="ghost" onPress={() => setConfirm('cancel')}>Cancel</Button>}
          </View>
        ) : undefined}>
        <QueryState query={q}>
          {(po) => (
            <>
              <View style={{ gap: 6 }}>
                <Text variant="small" color="muted">{po.supplierName} · {date(po.orderDate)}{po.revision ? ` · round ${po.revision}` : ''}</Text>
                <View style={{ flexDirection: 'row' }}><StatusBadge status={po.status} /></View>
              </View>
              {po.status === 'SENT' && <Alert>Waiting for the supplier&apos;s quotation.{!po.supplierHasPortal ? ' Invite the supplier to the portal from their page.' : ''}</Alert>}
              {po.status === 'QUOTED' && <Alert tone="warning" title="Quotation received">{po.supplierNote ?? 'Review and accept, counter or reject.'}</Alert>}
              <Card title="Lines">
                <PoLines po={po} />
                <KeyValue items={[['Taxable', money(po.taxableTotal)], ['GST', money(po.taxTotal)], ['Total', <Text key="t" weight="700" num>{money(po.grandTotal)}</Text>]]} />
              </Card>
              <ReceiptsSection receipts={po.receipts} />
              <RevisionsSection revisions={po.revisions} />
              <AttachmentsSection po={po} base={`/api/v1/purchase-orders/${po.id}`} canUpload={canWrite} />
              {sheet === 'accept' && <AcceptSheet po={po} onClose={() => setSheet(null)} onDone={(p) => done(p, 'Quotation accepted')} />}
              {sheet === 'counter' && <CounterSheet po={po} onClose={() => setSheet(null)} onDone={(p) => done(p, 'Counter-offer sent')} />}
              {sheet === 'receive' && <ReceiveSheet po={po} onClose={() => setSheet(null)} onDone={(p) => done(p, 'Goods received')} />}
            </>
          )}
        </QueryState>
        <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} tone="danger" requireReason loading={act.isPending}
          title={confirm === 'reject' ? 'Reject this quotation?' : 'Cancel this purchase order?'} confirmLabel={confirm === 'reject' ? 'Reject' : 'Cancel order'}
          onConfirm={(reason) => act.mutate({ path: confirm ?? 'cancel', body: { reason } })} />
      </Screen>
    </RequirePermission>
  )
}

function AcceptSheet({ po, onClose, onDone }: { po: PurchaseOrder; onClose: () => void; onDone: (p: PurchaseOrder) => void }) {
  const candidates = (po.lines ?? []).filter((l) => l.status === 'OPEN' && l.availability !== 'UNAVAILABLE' && l.quantity > 0)
  const [links, setLinks] = useState<Record<string, Product>>({})
  const m = useMutation({
    mutationFn: () => api.post<PurchaseOrder>(`/api/v1/purchase-orders/${po.id}/accept`, { productLinks: Object.fromEntries(Object.entries(links).map(([k, p]) => [k, p.id])) }),
    onSuccess: onDone,
  })
  const err = m.error instanceof ApiError ? m.error : null
  const missing = candidates.some((l) => !l.productId && !links[l.id])
  return (
    <Sheet open onClose={onClose} title="Accept quotation" footer={<Button block loading={m.isPending} disabled={missing} onPress={() => m.mutate()}>Accept {candidates.length} line(s)</Button>}>
      <Text variant="small" color="muted">Available lines are accepted at the quoted terms; unavailable lines are rejected.</Text>
      {candidates.map((l) => (
        <View key={l.id} style={{ gap: 6 }}>
          <Text weight="600">{l.description} — {quantity(l.quantity)} {l.unit} × {money(l.rate)}</Text>
          {!l.productId && (links[l.id] ? <Text variant="small" color="primary" onPress={() => { const n = { ...links }; delete n[l.id]; setLinks(n) }}>Linked to {links[l.id]!.name} (change)</Text>
            : <ProductPickerButton exclude={[]} onPick={(p) => setLinks({ ...links, [l.id]: p })} />)}
        </View>
      ))}
      {err && <Alert tone="danger">{err.message}</Alert>}
    </Sheet>
  )
}

function CounterSheet({ po, onClose, onDone }: { po: PurchaseOrder; onClose: () => void; onDone: (p: PurchaseOrder) => void }) {
  const open = (po.lines ?? []).filter((l) => l.status === 'OPEN')
  const [rates, setRates] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const m = useMutation({
    mutationFn: () => api.put<PurchaseOrder>(`/api/v1/purchase-orders/${po.id}/counter`, { note: note || undefined, lines: Object.entries(rates).filter(([, v]) => v).map(([lineId, rate]) => ({ lineId, rate })) }),
    onSuccess: onDone,
  })
  return (
    <Sheet open onClose={onClose} title="Counter-offer" footer={<Button block loading={m.isPending} disabled={!Object.values(rates).some(Boolean)} onPress={() => m.mutate()}>Send counter-offer</Button>}>
      {open.map((l) => (
        <Field key={l.id} label={`${l.description} · now ${money(l.rate)}`}><MoneyInput value={rates[l.id] ?? ''} onChangeText={(t) => setRates({ ...rates, [l.id]: t })} accessibilityLabel={`Counter rate for ${l.description}`} /></Field>
      ))}
      <Field label="Message to supplier"><Input value={note} onChangeText={setNote} multiline accessibilityLabel="Message to supplier" /></Field>
    </Sheet>
  )
}

function ReceiveSheet({ po, onClose, onDone }: { po: PurchaseOrder; onClose: () => void; onDone: (p: PurchaseOrder) => void }) {
  const lines = (po.lines ?? []).filter((l) => l.status === 'ACCEPTED')
  const [vals, setVals] = useState<Record<string, { received: string; damaged: string; batch: string; serials: string }>>(
    Object.fromEntries(lines.map((l) => [l.id, { received: String(l.pendingQuantity), damaged: '', batch: '', serials: '' }])))
  const [invoice, setInvoice] = useState('')
  const m = useMutation({
    mutationFn: () => api.post<PurchaseOrder>(`/api/v1/purchase-orders/${po.id}/receipts`, {
      supplierInvoiceNumber: invoice || undefined,
      lines: lines.map((l) => ({ poLineId: l.id, receivedQuantity: vals[l.id]!.received || '0', damagedQuantity: vals[l.id]!.damaged || undefined,
        batchNumber: l.trackBatches ? vals[l.id]!.batch || undefined : undefined,
        serialNumbers: l.trackSerials ? vals[l.id]!.serials.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean) : undefined })).filter((x) => Number(x.receivedQuantity) > 0),
    }),
    onSuccess: onDone,
  })
  const err = m.error instanceof ApiError ? m.error : null
  return (
    <Sheet open onClose={onClose} title="Receive goods" footer={<Button block icon="package" loading={m.isPending} onPress={() => m.mutate()}>Receive & post</Button>}>
      <Field label="Supplier invoice no."><Input value={invoice} onChangeText={setInvoice} accessibilityLabel="Supplier invoice number" autoCapitalize="characters" /></Field>
      {lines.map((l) => (
        <View key={l.id} style={{ gap: 6 }}>
          <Text weight="600">{l.description}</Text>
          <Text variant="xs" color="muted">Ordered {quantity(l.quantity)} {l.unit} · received {quantity(l.receivedQuantity)}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Field label="Received"><QtyInput value={vals[l.id]!.received} onChangeText={(t) => setVals({ ...vals, [l.id]: { ...vals[l.id]!, received: t } })} accessibilityLabel={`Received ${l.description}`} /></Field></View>
            <View style={{ flex: 1 }}><Field label="Damaged"><QtyInput value={vals[l.id]!.damaged} onChangeText={(t) => setVals({ ...vals, [l.id]: { ...vals[l.id]!, damaged: t } })} accessibilityLabel={`Damaged ${l.description}`} /></Field></View>
          </View>
          {l.trackBatches && <Field label="Batch no."><Input value={vals[l.id]!.batch} onChangeText={(t) => setVals({ ...vals, [l.id]: { ...vals[l.id]!, batch: t.toUpperCase() } })} accessibilityLabel={`Batch for ${l.description}`} /></Field>}
          {l.trackSerials && <Field label="Serial numbers"><Input multiline value={vals[l.id]!.serials} onChangeText={(t) => setVals({ ...vals, [l.id]: { ...vals[l.id]!, serials: t } })} accessibilityLabel={`Serials for ${l.description}`} /></Field>}
        </View>
      ))}
      {err && <Alert tone="danger">{err.message}</Alert>}
    </Sheet>
  )
}

/** Supplier portal login section for the supplier detail screen. */
export function SupplierPortalSection({ supplierId, defaultMobile }: { supplierId: string; defaultMobile?: string }) {
  const qc = useQueryClient()
  const canWrite = useCan('SUPPLIER_WRITE')
  const [mobile, setMobile] = useState((defaultMobile ?? '').replace('+91', ''))
  const on = useModule('SUPPLIER_PORTAL')
  const q = useQuery({ enabled: on, queryKey: ['portal-access', supplierId], queryFn: () => api.get<{ enabled: boolean; mobileNumber?: string; lastLoginAt?: string }>(`/api/v1/suppliers/${supplierId}/portal-access`) })
  const invite = useMutation({
    mutationFn: () => api.post(`/api/v1/suppliers/${supplierId}/portal-access`, { mobileNumber: mobile }),
    onSuccess: () => { toast.success('Supplier can now sign in'); qc.invalidateQueries({ queryKey: ['portal-access', supplierId] }) },
    onError: (e) => toast.error(e),
  })
  const revoke = useMutation({
    mutationFn: () => api.del(`/api/v1/suppliers/${supplierId}/portal-access`),
    onSuccess: () => { toast.success('Portal login turned off'); qc.invalidateQueries({ queryKey: ['portal-access', supplierId] }) },
    onError: (e) => toast.error(e),
  })
  if (!on || q.isError) return null
  return (
    <Card title="Supplier portal">
      {q.data?.enabled ? (
        <View style={{ gap: 8 }}>
          <Text variant="small">Login {q.data.mobileNumber} · last sign-in {q.data.lastLoginAt ? date(q.data.lastLoginAt) : 'never'}</Text>
          {canWrite && <Button size="sm" variant="ghost" loading={revoke.isPending} onPress={() => revoke.mutate()}>Turn off login</Button>}
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <Text variant="small" color="muted">Let this supplier sign in to quote on your purchase orders.</Text>
          {canWrite && <>
            <Field label="Supplier's mobile"><QtyInput value={mobile} onChangeText={(t) => setMobile(t.replace(/\D/g, '').slice(0, 10))} accessibilityLabel="Supplier mobile" style={{ textAlign: 'left' }} /></Field>
            <Button size="sm" loading={invite.isPending} disabled={!/^[6-9]\d{9}$/.test(mobile)} onPress={() => invite.mutate()}>Invite to portal</Button>
          </>}
        </View>
      )}
    </Card>
  )
}
