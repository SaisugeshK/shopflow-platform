import { useMutation, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { LineEditor, lineProblem, newLine, type EditLine } from '@/components/admin/LineEditor'
import { DateInput, isValidDate, ProductPickerButton } from '@/components/admin/Pickers'
import { RequirePermission } from '@/components/admin/RequirePermission'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Data'
import { Alert, EmptyState } from '@/components/ui/Feedback'
import { Field, Input, Select } from '@/components/ui/Form'
import { Screen } from '@/components/ui/Screen'
import { toast } from '@/components/ui/Toast'
import { useSuppliers } from '@/features/catalog'
import { api, ApiError } from '@/services/api'
import type { Purchase } from '@/services/types'
import { today } from '@/utils/format'

/** O12 Add Purchase. Totals and GST are calculated by the backend when saved. */
export default function PurchaseFormScreen() {
  const qc = useQueryClient()
  const suppliers = useSuppliers()
  const [supplierId, setSupplierId] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(today())
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState('')
  const [supplierInvoiceDate, setSupplierInvoiceDate] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<EditLine[]>([])
  const save = useMutation({
    mutationFn: (post: boolean) => api.post<Purchase>('/api/v1/purchases', {
      supplierId, purchaseDate, supplierInvoiceNumber: supplierInvoiceNumber || undefined, supplierInvoiceDate: supplierInvoiceDate || undefined,
      notes: notes || undefined, post,
      items: lines.map((l) => ({
        productId: l.product.id, quantity: l.quantity, rate: l.rate, discountPercent: l.discountPercent || '0',
        unit: l.unit !== l.product.unit ? l.unit : undefined,
        batchNumber: l.product.trackBatches ? l.batchNumber.trim() : undefined,
        mfgDate: l.product.trackBatches && l.mfgDate ? l.mfgDate : undefined,
        expiryDate: l.product.trackBatches && l.expiryDate ? l.expiryDate : undefined,
        serialNumbers: l.product.trackSerials ? l.serials : undefined,
      })),
    }),
    onSuccess: (p) => {
      toast.success(p.status === 'POSTED' ? 'Purchase posted — stock received' : 'Purchase saved as draft', p.purchaseNumber)
      qc.invalidateQueries({ queryKey: ['purchases'] })
      qc.invalidateQueries({ queryKey: ['stock'] })
      router.replace(`/admin/purchase/${p.id}`)
    },
  })
  const err = save.error instanceof ApiError ? save.error : null
  const valid = !!supplierId && isValidDate(purchaseDate) && (!supplierInvoiceDate || isValidDate(supplierInvoiceDate)) && lines.length > 0 && lines.every((l) => Number(l.quantity) > 0 && l.rate !== '' && Number(l.rate) >= 0 && !lineProblem(l, 'purchase'))
  const update = (i: number, patch: Partial<EditLine>) => setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  return (
    <RequirePermission anyOf={['PURCHASE_WRITE']}>
      <Screen footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button variant="secondary" style={{ flex: 1 }} disabled={!valid} loading={save.isPending && save.variables === false} onPress={() => save.mutate(false)}>Save draft</Button>
          <Button icon="check-circle" style={{ flex: 1.4 }} disabled={!valid} loading={save.isPending && save.variables === true} onPress={() => save.mutate(true)}>Save & post</Button>
        </View>
      }>
        <Alert>Save as draft to review totals, or save and post to receive stock now.</Alert>
        <Card title="Supplier">
          <View style={{ gap: 14 }}>
            <Field label="Supplier" required>
              <Select label="Supplier" value={supplierId} onChange={setSupplierId} placeholder="Choose supplier" searchable options={(suppliers.data?.items ?? []).map((s) => ({ value: s.id, label: `${s.name} (${s.supplierCode})` }))} />
            </Field>
            <Field label="Purchase date" required><DateInput label="Purchase date" value={purchaseDate} onChange={setPurchaseDate} allowEmpty={false} /></Field>
            <Field label="Supplier invoice number"><Input value={supplierInvoiceNumber} onChangeText={setSupplierInvoiceNumber} autoCapitalize="characters" accessibilityLabel="Supplier invoice number" /></Field>
            <Field label="Supplier invoice date"><DateInput label="Supplier invoice date" value={supplierInvoiceDate} onChange={setSupplierInvoiceDate} /></Field>
          </View>
        </Card>
        <Card title={`Items · ${lines.length}`}>
          <View style={{ gap: 10 }}>
            <ProductPickerButton exclude={lines.filter((l) => !l.product.trackBatches && l.product.units.length === 0).map((l) => l.product.id)}
              onPick={(p) => setLines([...lines, { ...newLine(p, String(p.purchasePrice)), discountPercent: '0' }])} />
            {lines.length === 0 ? <EmptyState icon="package" title="No items yet" description="Search and add the products you received." /> : lines.map((l, i) => (
              <LineEditor key={l.key} line={l} mode="purchase" onChange={(patch) => update(i, patch)} onRemove={() => setLines(lines.filter((_, idx) => idx !== i))} />
            ))}
          </View>
        </Card>
        <Card title="Notes"><Input value={notes} onChangeText={setNotes} multiline accessibilityLabel="Notes" /></Card>
        {err && <Alert tone="danger">{err.message}</Alert>}
      </Screen>
    </RequirePermission>
  )
}
