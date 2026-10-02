import { useMutation, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import { View } from 'react-native'
import { LineEditor, type EditLine } from '@/components/admin/LineEditor'
import { CustomerPicker, DateInput, isValidDate, ProductPickerButton } from '@/components/admin/Pickers'
import { RequirePermission } from '@/components/admin/RequirePermission'
import { Button } from '@/components/ui/Button'
import { Card, TaxBreakdown } from '@/components/ui/Data'
import { Alert, EmptyState } from '@/components/ui/Feedback'
import { Field, Input, Select } from '@/components/ui/Form'
import { Screen } from '@/components/ui/Screen'
import { toast } from '@/components/ui/Toast'
import { api, ApiError, newIdempotencyKey } from '@/services/api'
import type { CustomerSummary, Invoice } from '@/services/types'
import { titleCase, today } from '@/utils/format'

/** O19/AD10 Admin-created invoice (§22.2). The backend prices, taxes and totals the invoice; stock leaves on generation. */
export default function InvoiceNewScreen() {
  const qc = useQueryClient()
  const [customer, setCustomer] = useState<CustomerSummary | null>(null)
  const [paymentType, setPaymentType] = useState('CASH')
  const [invoiceDate, setInvoiceDate] = useState(today())
  const [lines, setLines] = useState<EditLine[]>([])
  const [header, setHeader] = useState({ transport: '', vehicleNumber: '', destination: '', buyerOrderNumber: '', notes: '' })
  const [draft, setDraft] = useState<Invoice | null>(null)
  // A new key per draft: regenerating after an edit is a different request.
  const draftId = draft?.id
  const key = useMemo(() => (draftId ? newIdempotencyKey() : ''), [draftId])
  const create = useMutation({
    mutationFn: () => api.post<Invoice>('/api/v1/invoices', {
      customerId: customer!.id, paymentType, invoiceDate, ...Object.fromEntries(Object.entries(header).filter(([, v]) => v)),
      items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity, rate: l.rate || undefined, discountPercent: l.discountPercent || undefined })),
    }),
    onSuccess: (inv) => setDraft(inv),
  })
  const generate = useMutation({
    mutationFn: () => api.post<Invoice>(`/api/v1/invoices/${draft!.id}/generate`, undefined, { 'Idempotency-Key': key }),
    onSuccess: (inv) => {
      toast.success('Invoice generated', inv.invoiceNumber)
      qc.invalidateQueries({ queryKey: ['invoices'] })
      router.replace(`/admin/invoice/${inv.id}`)
    },
  })
  const anyError = create.error ?? generate.error
  const err = anyError instanceof ApiError ? anyError : null
  const changed = () => setDraft(null)
  const update = (i: number, patch: Partial<EditLine>) => { setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l))); changed() }
  const valid = !!customer && isValidDate(invoiceDate) && lines.length > 0 && lines.every((l) => Number(l.quantity) > 0)

  return (
    <RequirePermission anyOf={['INVOICE_WRITE']}>
      <Screen footer={!draft ? (
        <Button block size="lg" disabled={!valid} loading={create.isPending} onPress={() => create.mutate()}>Calculate (save draft)</Button>
      ) : (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button variant="secondary" style={{ flex: 1 }} onPress={() => router.replace(`/admin/invoice/${draft.id}`)}>Keep as draft</Button>
          <Button icon="check-circle" style={{ flex: 1.4 }} loading={generate.isPending} onPress={() => generate.mutate()}>Generate invoice</Button>
        </View>
      )}>
        <Alert>Calculate to review GST and totals from the server, then generate. Stock leaves on generation.</Alert>
        <Card title="Customer & payment">
          <View style={{ gap: 14 }}>
            <Field label="Customer" required><CustomerPicker value={customer} onChange={(c) => { setCustomer(c); changed() }} /></Field>
            <Field label="Payment type" required>
              <Select label="Payment type" value={paymentType} onChange={(v) => { setPaymentType(v); changed() }} options={['CASH', 'UPI', 'BANK_TRANSFER', 'CREDIT', 'OTHER'].map((v) => ({ value: v, label: v === 'CREDIT' ? 'Credit bill' : titleCase(v) }))} />
            </Field>
            <Field label="Invoice date" hint="Back-dating requires Owner permission"><DateInput label="Invoice date" value={invoiceDate} onChange={(v) => { setInvoiceDate(v); changed() }} allowEmpty={false} /></Field>
          </View>
        </Card>
        <Card title={`Items · ${lines.length}`}>
          <View style={{ gap: 10 }}>
            <ProductPickerButton exclude={lines.map((l) => l.product.id)} onPick={(p) => { setLines([...lines, { product: p, quantity: '1', rate: '', discountPercent: '' }]); changed() }} />
            {lines.length === 0 ? <EmptyState icon="package" title="No items" description="Search and add products." /> : lines.map((l, i) => (
              <LineEditor key={l.product.id} line={l} ratePlaceholder="Customer price" onChange={(patch) => update(i, patch)} onRemove={() => { setLines(lines.filter((_, idx) => idx !== i)); changed() }} />
            ))}
          </View>
        </Card>
        <Card title="Dispatch details (optional)">
          <View style={{ gap: 14 }}>
            <Field label="Buyer's order no."><Input value={header.buyerOrderNumber} onChangeText={(t) => { setHeader({ ...header, buyerOrderNumber: t }); changed() }} accessibilityLabel="Buyer's order number" /></Field>
            <Field label="Transport"><Input value={header.transport} onChangeText={(t) => { setHeader({ ...header, transport: t }); changed() }} accessibilityLabel="Transport" /></Field>
            <Field label="Vehicle number"><Input value={header.vehicleNumber} onChangeText={(t) => { setHeader({ ...header, vehicleNumber: t.toUpperCase() }); changed() }} autoCapitalize="characters" accessibilityLabel="Vehicle number" /></Field>
            <Field label="Destination"><Input value={header.destination} onChangeText={(t) => { setHeader({ ...header, destination: t }); changed() }} accessibilityLabel="Destination" /></Field>
            <Field label="Notes"><Input value={header.notes} onChangeText={(t) => { setHeader({ ...header, notes: t }); changed() }} multiline accessibilityLabel="Notes" /></Field>
          </View>
        </Card>
        {draft && (
          <Card title={`Calculated by server · ${draft.interState ? 'Inter-state (IGST)' : 'Intra-state (CGST + SGST)'}`}>
            <TaxBreakdown t={draft} />
          </Card>
        )}
        {err && <Alert tone="danger">{err.message}</Alert>}
      </Screen>
    </RequirePermission>
  )
}
