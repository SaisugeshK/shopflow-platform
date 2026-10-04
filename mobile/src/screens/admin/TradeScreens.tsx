import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { LineEditor, newLine, type EditLine } from '@/components/admin/LineEditor'
import { CustomerPicker, ProductPickerButton } from '@/components/admin/Pickers'
import { RequirePermission } from '@/components/admin/RequirePermission'
import { AcceptQuotationSheet, PAY_OPTIONS, ProjectSelect, ProjectStatementSheet } from '@/components/trade/TradeParts'
import { Button, IconButton } from '@/components/ui/Button'
import { Card, KeyValue, ListRow, StatusBadge } from '@/components/ui/Data'
import { Alert, EmptyState, QueryState } from '@/components/ui/Feedback'
import { ChipGroup, Field, Input, MoneyInput, QtyInput, Select, SwitchRow } from '@/components/ui/Form'
import { ConfirmDialog, Sheet } from '@/components/ui/Overlay'
import { PagedList, Screen } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { toast } from '@/components/ui/Toast'
import { useSuppliers } from '@/features/catalog'
import { api, ApiError } from '@/services/api'
import type { Agent, CommissionReport, CustomerSummary, DeliveryChallan, JobWork, Product, Project, Quotation } from '@/services/types'
import { useCan } from '@/store/auth'
import { date, money, quantity, titleCase } from '@/utils/format'

const linePayload = (l: EditLine, withDiscount: boolean) => ({
  productId: l.product.id, quantity: l.quantity, unit: l.unit !== l.product.unit ? l.unit : undefined, rate: l.rate || undefined,
  ...(withDiscount ? { discountPercent: l.discountPercent || undefined } : {}),
})

// ---------------------------------------------------------------- quotations

/** Customer quotations (§0B.9, QUOTATIONS module). */
export function QuotationsScreen() {
  const canWrite = useCan('ORDER_WRITE')
  return (
    <RequirePermission anyOf={['ORDER_READ']}>
      <PagedList<Quotation>
        queryKey={['quotations']}
        fetchPage={() => api.page<Quotation>('/api/v1/quotations')}
        keyOf={(x) => x.id}
        header={canWrite ? <Button icon="plus" onPress={() => router.push('/admin/quotation-new')}>New quotation</Button> : undefined}
        empty={<EmptyState icon="file-text" title="No quotations" />}
        renderItem={(x) => (
          <ListRow title={x.quotationNumber} subtitle={`${x.customerName} · ${date(x.quoteDate)}`} meta={<View style={{ marginTop: 6, flexDirection: 'row' }}><StatusBadge status={x.status} /></View>}
            right={<Text weight="700" num>{money(x.grandTotal)}</Text>} onPress={() => router.push(`/admin/quotation/${x.id}`)} />
        )}
      />
    </RequirePermission>
  )
}

export function QuotationNewScreen() {
  const qc = useQueryClient()
  const [customer, setCustomer] = useState<CustomerSummary | null>(null)
  const [projectId, setProjectId] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<EditLine[]>([])
  const save = useMutation({
    mutationFn: async (send: boolean) => {
      const created = await api.post<Quotation>('/api/v1/quotations', { customerId: customer!.id, projectId: projectId || undefined, notes: notes || undefined, items: lines.map((l) => linePayload(l, true)) })
      return send ? api.post<Quotation>(`/api/v1/quotations/${created.id}/send`) : created
    },
    onSuccess: (x) => { toast.success(x.status === 'SENT' ? 'Quotation sent' : 'Quotation saved', x.quotationNumber); qc.invalidateQueries({ queryKey: ['quotations'] }); router.replace(`/admin/quotation/${x.id}`) },
  })
  const err = save.error instanceof ApiError ? save.error : null
  const valid = !!customer && lines.length > 0 && lines.every((l) => Number(l.quantity) > 0)
  return (
    <RequirePermission anyOf={['ORDER_WRITE']}>
      <Screen footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button variant="secondary" style={{ flex: 1 }} disabled={!valid} loading={save.isPending && save.variables === false} onPress={() => save.mutate(false)}>Save draft</Button>
          <Button icon="send" style={{ flex: 1.4 }} disabled={!valid} loading={save.isPending && save.variables === true} onPress={() => save.mutate(true)}>Save & send</Button>
        </View>
      }>
        <Card title="Customer">
          <View style={{ gap: 14 }}>
            <CustomerPicker value={customer} onChange={(c) => { setCustomer(c); setProjectId('') }} />
            <ProjectSelect customerId={customer?.id} value={projectId} onChange={setProjectId} />
            <Field label="Terms / note"><Input value={notes} onChangeText={setNotes} multiline accessibilityLabel="Terms" /></Field>
          </View>
        </Card>
        <Card title={`Items · ${lines.length}`}>
          <View style={{ gap: 10 }}>
            <ProductPickerButton exclude={lines.filter((l) => l.product.units.length === 0).map((l) => l.product.id)} onPick={(p) => setLines([...lines, newLine(p, '')])} />
            {lines.map((l, i) => (
              <LineEditor key={l.key} line={l} mode="sale" ratePlaceholder="Customer price" onChange={(patch) => setLines(lines.map((x, idx) => (idx === i ? { ...x, ...patch, serials: [] } : x)))}
                onRemove={() => setLines(lines.filter((_, idx) => idx !== i))} />
            ))}
          </View>
        </Card>
        {err && <Alert tone="danger">{err.message}</Alert>}
      </Screen>
    </RequirePermission>
  )
}

export function QuotationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const qc = useQueryClient()
  const canWrite = useCan('ORDER_WRITE')
  const [sheet, setSheet] = useState(false)
  const [confirm, setConfirm] = useState<'reject' | 'cancel' | null>(null)
  const q = useQuery({ queryKey: ['quotation', id], queryFn: () => api.get<Quotation>(`/api/v1/quotations/${id}`) })
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api.post<Quotation>(`/api/v1/quotations/${id}/${path}`, body),
    onSuccess: (x) => { toast.success(`Quotation ${titleCase(x.status).toLowerCase()}`); setSheet(false); setConfirm(null); qc.setQueryData(['quotation', id], x); qc.invalidateQueries({ queryKey: ['quotations'] }) },
    onError: (e) => toast.error(e),
  })
  const s = q.data?.status
  const open = s === 'DRAFT' || s === 'SENT'
  return (
    <RequirePermission anyOf={['ORDER_READ']}>
      <Stack.Screen options={{ title: q.data?.quotationNumber ?? 'Quotation' }} />
      <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}
        footer={canWrite && open ? (
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            {s === 'DRAFT' && <Button icon="send" style={{ flex: 1 }} loading={act.isPending} onPress={() => act.mutate({ path: 'send' })}>Send</Button>}
            <Button icon="check" style={{ flex: 1 }} onPress={() => setSheet(true)}>Accept</Button>
            <Button variant="ghost" onPress={() => setConfirm('reject')}>Rejected</Button>
            <Button variant="ghost" onPress={() => setConfirm('cancel')}>Cancel</Button>
          </View>
        ) : undefined}>
        <QueryState query={q}>
          {(x) => (
            <>
              <View style={{ gap: 6 }}>
                <Text variant="small" color="muted">{x.customerName} · {date(x.quoteDate)}{x.validUntil ? ` · valid until ${date(x.validUntil)}` : ''}</Text>
                <View style={{ flexDirection: 'row' }}><StatusBadge status={x.status} /></View>
              </View>
              {x.status === 'CONVERTED' && x.orderId && <Alert tone="success" title="Order placed">Order {x.orderNumber} at the quoted rates.</Alert>}
              <Card title="Items">
                {(x.items ?? []).map((i) => (
                  <ListRow key={i.id} title={i.productName} subtitle={`${quantity(i.quantity)} ${i.unit} × ${money(i.rate)}${i.discountPercent > 0 ? ` − ${i.discountPercent}%` : ''}`} right={<Text num>{money(i.lineTotal)}</Text>} />
                ))}
                <KeyValue items={[['Taxable', money(x.taxableTotal)], ['GST', money(x.taxTotal)], ['Total', <Text key="t" weight="700" num>{money(x.grandTotal)}</Text>]]} />
              </Card>
              <Card title="Details"><KeyValue items={[['Project', x.projectName], ['Terms', x.notes], ['Order', x.orderNumber]]} /></Card>
              {x.orderId && <Button variant="secondary" onPress={() => router.push(`/admin/order/${x.orderId}`)}>Open order</Button>}
            </>
          )}
        </QueryState>
        {sheet && <AcceptQuotationSheet loading={act.isPending} onClose={() => setSheet(false)} onAccept={(body) => act.mutate({ path: 'accept', body })} />}
        <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} tone="danger" loading={act.isPending}
          title={confirm === 'reject' ? 'Mark rejected?' : 'Cancel quotation?'} confirmLabel={confirm === 'reject' ? 'Mark rejected' : 'Cancel quotation'}
          onConfirm={() => act.mutate({ path: confirm ?? 'cancel', body: {} })} />
      </Screen>
    </RequirePermission>
  )
}

// ---------------------------------------------------------------- delivery challans

export function ChallansScreen() {
  const canWrite = useCan('INVOICE_WRITE')
  return (
    <RequirePermission anyOf={['INVOICE_READ']}>
      <PagedList<DeliveryChallan>
        queryKey={['challans']}
        fetchPage={() => api.page<DeliveryChallan>('/api/v1/delivery-challans')}
        keyOf={(x) => x.id}
        header={canWrite ? <Button icon="plus" onPress={() => router.push('/admin/challan-new')}>New challan</Button> : undefined}
        empty={<EmptyState icon="truck" title="No challans" />}
        renderItem={(x) => (
          <ListRow title={x.challanNumber} subtitle={`${x.customerName} · ${date(x.challanDate)}`} meta={<View style={{ marginTop: 6, flexDirection: 'row' }}><StatusBadge status={x.status} /></View>}
            right={<Text weight="700" num>{money(x.totalValue)}</Text>} onPress={() => router.push(`/admin/delivery-challan/${x.id}`)} />
        )}
      />
    </RequirePermission>
  )
}

export function ChallanNewScreen() {
  const qc = useQueryClient()
  const [customer, setCustomer] = useState<CustomerSummary | null>(null)
  const [projectId, setProjectId] = useState('')
  const [vehicle, setVehicle] = useState('')
  const [purpose, setPurpose] = useState('SUPPLY')
  const [lines, setLines] = useState<EditLine[]>([])
  const save = useMutation({
    mutationFn: () => api.post<DeliveryChallan>('/api/v1/delivery-challans', {
      customerId: customer!.id, projectId: projectId || undefined, purpose, vehicleNumber: vehicle || undefined, items: lines.map((l) => linePayload(l, false)),
    }),
    onSuccess: (x) => { toast.success('Challan issued', x.challanNumber); qc.invalidateQueries({ queryKey: ['challans'] }); router.replace(`/admin/delivery-challan/${x.id}`) },
  })
  const err = save.error instanceof ApiError ? save.error : null
  const valid = !!customer && lines.length > 0 && lines.every((l) => Number(l.quantity) > 0)
  return (
    <RequirePermission anyOf={['INVOICE_WRITE']}>
      <Screen footer={<Button block icon="file-text" disabled={!valid} loading={save.isPending} onPress={() => save.mutate()}>Issue challan</Button>}>
        <Card title="Customer & dispatch">
          <View style={{ gap: 14 }}>
            <CustomerPicker value={customer} onChange={(c) => { setCustomer(c); setProjectId('') }} />
            <ProjectSelect customerId={customer?.id} value={projectId} onChange={setProjectId} />
            <Field label="Purpose"><ChipGroup options={['SUPPLY', 'APPROVAL', 'JOB_WORK', 'OTHER'].map((v) => ({ value: v, label: titleCase(v) }))} value={purpose} onChange={setPurpose} /></Field>
            <Field label="Vehicle number"><Input value={vehicle} onChangeText={(t) => setVehicle(t.toUpperCase())} autoCapitalize="characters" accessibilityLabel="Vehicle number" /></Field>
          </View>
        </Card>
        <Card title={`Items · ${lines.length}`}>
          <View style={{ gap: 10 }}>
            <Text variant="xs" color="muted">Stock leaves when you issue the challan.</Text>
            <ProductPickerButton exclude={lines.filter((l) => l.product.units.length === 0).map((l) => l.product.id)} onPick={(p) => setLines([...lines, newLine(p, '')])} />
            {lines.map((l, i) => (
              <LineEditor key={l.key} line={l} mode="sale" ratePlaceholder="Customer price" onChange={(patch) => setLines(lines.map((x, idx) => (idx === i ? { ...x, ...patch, serials: [] } : x)))}
                onRemove={() => setLines(lines.filter((_, idx) => idx !== i))} />
            ))}
          </View>
        </Card>
        {err && <Alert tone="danger">{err.message}</Alert>}
      </Screen>
    </RequirePermission>
  )
}

export function ChallanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const qc = useQueryClient()
  const canWrite = useCan('INVOICE_WRITE')
  const [sheet, setSheet] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [paymentType, setPaymentType] = useState('CASH')
  const q = useQuery({ queryKey: ['challan', id], queryFn: () => api.get<DeliveryChallan>(`/api/v1/delivery-challans/${id}`) })
  const refresh = () => { qc.invalidateQueries({ queryKey: ['challan', id] }); qc.invalidateQueries({ queryKey: ['challans'] }) }
  const cancel = useMutation({
    mutationFn: (reason: string) => api.post(`/api/v1/delivery-challans/${id}/cancel`, { reason }),
    onSuccess: () => { toast.success('Challan cancelled; stock is back'); setConfirm(false); refresh() },
    onError: (e) => toast.error(e),
  })
  const invoice = useMutation({
    mutationFn: () => api.post<{ invoiceId: string; invoiceNumber: string }>(`/api/v1/delivery-challans/${id}/invoice`, { paymentType }),
    onSuccess: (r) => { toast.success('Invoice generated', r.invoiceNumber); setSheet(false); refresh(); qc.invalidateQueries({ queryKey: ['invoices'] }); router.push(`/admin/invoice/${r.invoiceId}`) },
  })
  const invoiceErr = invoice.error instanceof ApiError ? invoice.error : null
  return (
    <RequirePermission anyOf={['INVOICE_READ']}>
      <Stack.Screen options={{ title: q.data?.challanNumber ?? 'Delivery challan' }} />
      <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}
        footer={canWrite && q.data?.status === 'ISSUED' ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button variant="ghost" onPress={() => setConfirm(true)}>Cancel</Button>
            <Button icon="file-text" style={{ flex: 1 }} onPress={() => setSheet(true)}>Create invoice</Button>
          </View>
        ) : undefined}>
        <QueryState query={q}>
          {(x) => (
            <>
              <View style={{ gap: 6 }}>
                <Text variant="small" color="muted">{x.customerName} · {date(x.challanDate)} · {titleCase(x.purpose)}</Text>
                <View style={{ flexDirection: 'row' }}><StatusBadge status={x.status} /></View>
              </View>
              {x.invoiceId && <Alert tone="success" title="Invoiced">Billed on invoice {x.invoiceNumber}.</Alert>}
              {x.cancelReason && <Alert tone="danger" title="Cancelled">{x.cancelReason}</Alert>}
              <Card title="Items">
                {(x.items ?? []).map((i) => (
                  <ListRow key={i.id} title={i.productName} subtitle={[`${quantity(i.quantity)} ${i.unit} × ${money(i.rate)}`, i.batchDetails, i.serialNumbers.length ? `S/N ${i.serialNumbers.join(', ')}` : null].filter(Boolean).join(' · ')}
                    right={<Text num>{money(i.quantity * i.rate)}</Text>} />
                ))}
                <KeyValue items={[['Value before tax', <Text key="v" weight="700" num>{money(x.totalValue)}</Text>]]} />
              </Card>
              <Card title="Dispatch"><KeyValue items={[['Project', x.projectName], ['Vehicle', x.vehicleNumber], ['Transport', x.transport], ['Destination', x.destination], ['Notes', x.notes]]} /></Card>
              {x.invoiceId && <Button variant="secondary" onPress={() => router.push(`/admin/invoice/${x.invoiceId}`)}>Open invoice</Button>}
            </>
          )}
        </QueryState>
        <Sheet open={sheet} onClose={() => setSheet(false)} title="Invoice this challan" footer={<Button block loading={invoice.isPending} onPress={() => invoice.mutate()}>Generate invoice</Button>}>
          <Text variant="small" color="muted">Stock already left with the challan; the invoice does not move it again.</Text>
          <Field label="Payment"><ChipGroup options={PAY_OPTIONS} value={paymentType} onChange={setPaymentType} /></Field>
          {invoiceErr && <Alert tone="danger">{invoiceErr.message}</Alert>}
        </Sheet>
        <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} tone="danger" requireReason loading={cancel.isPending} title="Cancel this challan?"
          message="The goods come back into stock." confirmLabel="Cancel challan" onConfirm={(reason) => cancel.mutate(reason ?? '')} />
      </Screen>
    </RequirePermission>
  )
}

// ---------------------------------------------------------------- job work

interface QtyLine { product: Product; quantity: string }

function QtyLines({ lines, onChange, label }: { lines: QtyLine[]; onChange: (l: QtyLine[]) => void; label: string }) {
  return (
    <View style={{ gap: 8 }}>
      <ProductPickerButton label={label} exclude={lines.map((l) => l.product.id)} onPick={(p) => onChange([...lines, { product: p, quantity: '1' }])} />
      {lines.map((l, i) => (
        <View key={l.product.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ flex: 1 }}>{l.product.name}</Text>
          <View style={{ width: 90 }}><QtyInput value={l.quantity} onChangeText={(t) => onChange(lines.map((x, idx) => (idx === i ? { ...x, quantity: t } : x)))} accessibilityLabel={`Quantity of ${l.product.name}`} /></View>
          <IconButton icon="trash-2" label={`Remove ${l.product.name}`} onPress={() => onChange(lines.filter((_, idx) => idx !== i))} />
        </View>
      ))}
    </View>
  )
}

export function JobWorkScreen() {
  const canWrite = useCan('STOCK_WRITE')
  const [adding, setAdding] = useState(false)
  return (
    <RequirePermission anyOf={['STOCK_READ']}>
      <PagedList<JobWork>
        queryKey={['job-work']}
        fetchPage={() => api.page<JobWork>('/api/v1/job-work')}
        keyOf={(x) => x.id}
        header={canWrite ? <Button icon="plus" onPress={() => setAdding(true)}>Send for job work</Button> : undefined}
        empty={<EmptyState icon="tool" title="No job work" />}
        renderItem={(x) => (
          <ListRow title={x.jobNumber} subtitle={`${x.jobWorkerName} · ${x.process}`} meta={<View style={{ marginTop: 6, flexDirection: 'row' }}><StatusBadge status={x.status} /></View>}
            right={<Text variant="small" color="muted">{date(x.issueDate)}</Text>} onPress={() => router.push(`/admin/job-work/${x.id}`)} />
        )}
      />
      {adding && <NewJobWorkSheet onClose={() => setAdding(false)} />}
    </RequirePermission>
  )
}

function NewJobWorkSheet({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const suppliers = useSuppliers()
  const [v, setV] = useState({ supplierId: '', jobWorkerName: '', process: '' })
  const [lines, setLines] = useState<QtyLine[]>([])
  const m = useMutation({
    mutationFn: () => api.post<JobWork>('/api/v1/job-work', { ...Object.fromEntries(Object.entries(v).filter(([, x]) => x)), items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })) }),
    onSuccess: (j) => { toast.success('Material sent', j.jobNumber); qc.invalidateQueries({ queryKey: ['job-work'] }); onClose(); router.push(`/admin/job-work/${j.id}`) },
  })
  const err = m.error instanceof ApiError ? m.error : null
  const valid = !!v.process.trim() && (!!v.supplierId || !!v.jobWorkerName.trim()) && lines.length > 0 && lines.every((l) => Number(l.quantity) > 0)
  return (
    <Sheet open onClose={onClose} title="Send for job work" footer={<Button block loading={m.isPending} disabled={!valid} onPress={() => m.mutate()}>Send material</Button>}>
      <Field label="Supplier (optional)"><Select label="Supplier" value={v.supplierId} onChange={(x) => setV({ ...v, supplierId: x })} placeholder="Not a supplier" searchable
        options={[{ value: '', label: 'Not a supplier' }, ...(suppliers.data?.items ?? []).map((s) => ({ value: s.id, label: s.name }))]} /></Field>
      <Field label="Job worker name"><Input value={v.jobWorkerName} onChangeText={(t) => setV({ ...v, jobWorkerName: t })} accessibilityLabel="Job worker name" /></Field>
      <Field label="Process" required><Input value={v.process} onChangeText={(t) => setV({ ...v, process: t })} placeholder="Dyeing, stitching…" accessibilityLabel="Process" /></Field>
      <QtyLines lines={lines} onChange={setLines} label="Add material" />
      {err && <Alert tone="danger">{err.message}</Alert>}
    </Sheet>
  )
}

export function JobWorkDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const qc = useQueryClient()
  const canWrite = useCan('STOCK_WRITE')
  const [receiving, setReceiving] = useState(false)
  const q = useQuery({ queryKey: ['job', id], queryFn: () => api.get<JobWork>(`/api/v1/job-work/${id}`) })
  const done = (j: JobWork, msg: string) => { toast.success(msg); setReceiving(false); qc.setQueryData(['job', id], j); qc.invalidateQueries({ queryKey: ['job-work'] }) }
  const cancel = useMutation({ mutationFn: () => api.post<JobWork>(`/api/v1/job-work/${id}/cancel`), onSuccess: (j) => done(j, 'Job work cancelled'), onError: (e) => toast.error(e) })
  const open = q.data?.status === 'OPEN' || q.data?.status === 'PARTIAL'
  return (
    <RequirePermission anyOf={['STOCK_READ']}>
      <Stack.Screen options={{ title: q.data?.jobNumber ?? 'Job work' }} />
      <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}
        footer={canWrite && open ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {q.data?.status === 'OPEN' && <Button variant="ghost" loading={cancel.isPending} onPress={() => cancel.mutate()}>Cancel</Button>}
            <Button icon="package" style={{ flex: 1 }} onPress={() => setReceiving(true)}>Receive back</Button>
          </View>
        ) : undefined}>
        <QueryState query={q}>
          {(j) => (
            <>
              <View style={{ gap: 6 }}>
                <Text variant="small" color="muted">{j.jobWorkerName} · {j.process} · sent {date(j.issueDate)}</Text>
                <View style={{ flexDirection: 'row' }}><StatusBadge status={j.status} /></View>
              </View>
              <Card title="Material sent">
                {(j.lines ?? []).filter((l) => l.direction === 'ISSUE').map((l) => (
                  <ListRow key={l.id} title={l.productName} subtitle={`Sent ${quantity(l.quantity)} · returned ${quantity(l.returnedQuantity)} · used ${quantity(l.consumedQuantity)}`}
                    right={<Text weight="700" num>{quantity(l.pendingQuantity)} out</Text>} />
                ))}
              </Card>
              <Card title="Finished goods received">
                {(j.lines ?? []).filter((l) => l.direction === 'RECEIVE').length === 0 ? <Text variant="small" color="muted">Nothing yet.</Text>
                  : (j.lines ?? []).filter((l) => l.direction === 'RECEIVE').map((l) => <ListRow key={l.id} title={l.productName} subtitle={date(l.lineDate)} right={<Text num>{quantity(l.quantity)} {l.unit}</Text>} />)}
              </Card>
              <Card title="Summary"><KeyValue items={[['Charges', money(j.charges)], ['Expected back', date(j.expectedDate)], ['Notes', j.notes]]} /></Card>
              {receiving && <ReceiveSheet job={j} onClose={() => setReceiving(false)} onDone={(x) => done(x, 'Received')} />}
            </>
          )}
        </QueryState>
      </Screen>
    </RequirePermission>
  )
}

function ReceiveSheet({ job, onClose, onDone }: { job: JobWork; onClose: () => void; onDone: (j: JobWork) => void }) {
  const issued = (job.lines ?? []).filter((l) => l.direction === 'ISSUE' && l.pendingQuantity > 0)
  const [finished, setFinished] = useState<QtyLine[]>([])
  const [returned, setReturned] = useState<Record<string, string>>({})
  const [consumed, setConsumed] = useState<Record<string, string>>({})
  const [charges, setCharges] = useState('')
  const toLines = (r: Record<string, string>) => Object.entries(r).filter(([, x]) => Number(x) > 0).map(([productId, x]) => ({ productId, quantity: x }))
  const m = useMutation({
    mutationFn: () => api.post<JobWork>(`/api/v1/job-work/${job.id}/receive`, {
      finished: finished.map((l) => ({ productId: l.product.id, quantity: l.quantity })), returned: toLines(returned), consumed: toLines(consumed), charges: charges || undefined,
    }),
    onSuccess: onDone,
  })
  const err = m.error instanceof ApiError ? m.error : null
  return (
    <Sheet open onClose={onClose} title="Receive from job work" footer={<Button block icon="package" loading={m.isPending} onPress={() => m.mutate()}>Save</Button>}>
      <Text weight="600">Finished goods</Text>
      <QtyLines lines={finished} onChange={setFinished} label="Add finished product" />
      {issued.map((l) => (
        <View key={l.id} style={{ gap: 6 }}>
          <Text weight="600">{l.productName} · {quantity(l.pendingQuantity)} {l.unit} out</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Field label="Returned"><QtyInput value={returned[l.productId] ?? ''} onChangeText={(t) => setReturned({ ...returned, [l.productId]: t })} accessibilityLabel={`Returned ${l.productName}`} /></Field></View>
            <View style={{ flex: 1 }}><Field label="Used up"><QtyInput value={consumed[l.productId] ?? ''} onChangeText={(t) => setConsumed({ ...consumed, [l.productId]: t })} accessibilityLabel={`Used up ${l.productName}`} /></Field></View>
          </View>
        </View>
      ))}
      <Field label="Job work charges"><MoneyInput value={charges} onChangeText={setCharges} accessibilityLabel="Job work charges" /></Field>
      {err && <Alert tone="danger">{err.message}</Alert>}
    </Sheet>
  )
}

// ---------------------------------------------------------------- agents and commission

export function AgentsScreen() {
  const qc = useQueryClient()
  const canWrite = useCan('CUSTOMER_WRITE')
  const canReport = useCan('REPORT_FINANCIAL')
  const [tab, setTab] = useState('agents')
  const [editing, setEditing] = useState<Agent | 'new' | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const agents = useQuery({ queryKey: ['agents'], queryFn: () => api.get<Agent[]>('/api/v1/commissions/agents') })
  const report = useQuery({ queryKey: ['commission', 'PENDING'], enabled: tab === 'commission', queryFn: () => api.get<CommissionReport>('/api/v1/commissions/report', { status: 'PENDING' }) })
  const pay = useMutation({
    mutationFn: () => api.post<{ marked: number }>('/api/v1/commissions/pay', { invoiceIds: selected }),
    onSuccess: (r) => { toast.success(`Marked paid on ${r.marked} invoice(s)`); setSelected([]); qc.invalidateQueries({ queryKey: ['commission'] }); qc.invalidateQueries({ queryKey: ['agents'] }) },
    onError: (e) => toast.error(e),
  })
  return (
    <RequirePermission anyOf={['CUSTOMER_READ']}>
      <Screen onRefresh={() => { agents.refetch(); report.refetch() }} refreshing={agents.isRefetching}
        footer={tab === 'commission' && selected.length > 0 ? <Button block icon="check" loading={pay.isPending} onPress={() => pay.mutate()}>Mark {selected.length} paid</Button>
          : tab === 'agents' && canWrite ? <Button block icon="plus" onPress={() => setEditing('new')}>Add agent</Button> : undefined}>
        {canReport && <ChipGroup options={[{ value: 'agents', label: 'Agents' }, { value: 'commission', label: 'Pending commission' }]} value={tab} onChange={setTab} />}
        {tab === 'agents' ? (
          <QueryState query={agents} isEmpty={(d) => d.length === 0} empty={<EmptyState icon="users" title="No agents" description="Link customers to an agent from the customer screen." />}>
            {(d) => (
              <Card padded={false}>
                {d.map((a) => (
                  <ListRow key={a.id} title={a.name} subtitle={`${a.commissionPercent}% · ${a.customerCount} customers`} meta={a.active ? undefined : <StatusBadge status="INACTIVE" />}
                    right={<Text num weight="600">{money(a.pendingCommission)}</Text>} onPress={canWrite ? () => setEditing(a) : undefined} />
                ))}
              </Card>
            )}
          </QueryState>
        ) : (
          <QueryState query={report} isEmpty={(d) => d.rows.length === 0} empty={<EmptyState icon="check-circle" title="No pending commission" />}>
            {(d) => (
              <Card padded={false}>
                <View style={{ padding: 12 }}><Text weight="700">Pending {money(d.pending)}</Text></View>
                {d.rows.map((r) => {
                  const on = selected.includes(r.invoiceId)
                  return (
                    <ListRow key={r.invoiceId} title={`${r.invoiceNumber} · ${r.agentName}`} subtitle={`${r.customerName} · ${date(r.invoiceDate)}`}
                      right={<Text num weight="600" color={on ? 'primary' : undefined}>{on ? '✓ ' : ''}{money(r.commissionAmount)}</Text>}
                      accessibilityLabel={`Select ${r.invoiceNumber}`} onPress={() => setSelected(on ? selected.filter((s) => s !== r.invoiceId) : [...selected, r.invoiceId])} />
                  )
                })}
              </Card>
            )}
          </QueryState>
        )}
        {editing && <AgentSheet agent={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      </Screen>
    </RequirePermission>
  )
}

function AgentSheet({ agent, onClose }: { agent: Agent | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [v, setV] = useState({ name: agent?.name ?? '', mobileNumber: agent?.mobileNumber?.replace('+91', '') ?? '', commissionPercent: agent ? String(agent.commissionPercent) : '', active: agent?.active ?? true })
  const m = useMutation({
    mutationFn: () => {
      const body = { name: v.name, mobileNumber: v.mobileNumber || undefined, commissionPercent: v.commissionPercent, active: v.active }
      return agent ? api.put<Agent>(`/api/v1/commissions/agents/${agent.id}`, body) : api.post<Agent>('/api/v1/commissions/agents', body)
    },
    onSuccess: () => { toast.success('Agent saved'); qc.invalidateQueries({ queryKey: ['agents'] }); onClose() },
  })
  const err = m.error instanceof ApiError ? m.error : null
  return (
    <Sheet open onClose={onClose} title={agent ? 'Edit agent' : 'Add agent'} footer={<Button block loading={m.isPending} disabled={!v.name.trim() || v.commissionPercent === ''} onPress={() => m.mutate()}>Save</Button>}>
      <Field label="Name" required><Input value={v.name} onChangeText={(t) => setV({ ...v, name: t })} accessibilityLabel="Agent name" /></Field>
      <Field label="Mobile"><QtyInput value={v.mobileNumber} onChangeText={(t) => setV({ ...v, mobileNumber: t.replace(/\D/g, '').slice(0, 10) })} accessibilityLabel="Agent mobile" style={{ textAlign: 'left' }} /></Field>
      <Field label="Commission %" required hint="Applies to invoices generated from now on"><QtyInput value={v.commissionPercent} onChangeText={(t) => setV({ ...v, commissionPercent: t })} accessibilityLabel="Commission percent" /></Field>
      {agent && <SwitchRow label="Active" value={v.active} onChange={(on) => setV({ ...v, active: on })} />}
      {err && <Alert tone="danger">{err.message}</Alert>}
    </Sheet>
  )
}

// ---------------------------------------------------------------- projects

export function ProjectsScreen() {
  const [statement, setStatement] = useState<string | null>(null)
  return (
    <RequirePermission anyOf={['CUSTOMER_READ']}>
      <PagedList<Project>
        queryKey={['projects', 'all']}
        fetchPage={() => api.page<Project>('/api/v1/projects', { status: 'ACTIVE' })}
        keyOf={(p) => p.id}
        header={<Text variant="small" color="muted">Add a project from the customer&apos;s screen.</Text>}
        empty={<EmptyState icon="map-pin" title="No projects" />}
        renderItem={(p) => (
          <ListRow title={p.name} subtitle={`${p.customerName} · billed ${money(p.billed)}`} right={<Text num weight="600">{money(p.outstanding)} due</Text>} onPress={() => setStatement(p.id)} />
        )}
      />
      {statement && <ProjectStatementSheet path={`/api/v1/projects/${statement}/statement`} onClose={() => setStatement(null)} />}
    </RequirePermission>
  )
}
