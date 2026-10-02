import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Feedback'
import { Field, Input, MoneyInput, Select } from '@/components/ui/Form'
import { Sheet } from '@/components/ui/Overlay'
import { toast } from '@/components/ui/Toast'
import { api, ApiError, newIdempotencyKey } from '@/services/api'
import type { CustomerSummary, Invoice, Payment } from '@/services/types'
import { money } from '@/utils/format'
import { CustomerPicker } from './Pickers'

/**
 * Records a cash / UPI / bank-transfer payment. Allocation, ledger and invoice status are handled by the backend; an
 * idempotency key protects against double submission.
 */
export function RecordPaymentSheet({ open, onClose, customerId: fixedCustomer, invoiceId: fixedInvoice, maxAmount, onDone }: {
  open: boolean
  onClose: () => void
  customerId?: string
  invoiceId?: string
  maxAmount?: number
  onDone?: (p: Payment) => void
}) {
  const qc = useQueryClient()
  const [customer, setCustomer] = useState<CustomerSummary | null>(null)
  const [invoiceId, setInvoiceId] = useState(fixedInvoice ?? '')
  const [amount, setAmount] = useState(maxAmount ? String(maxAmount) : '')
  const [method, setMethod] = useState('CASH')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const key = useMemo(() => (open ? newIdempotencyKey() : ''), [open])
  const customerId = fixedCustomer ?? customer?.id ?? ''

  useEffect(() => {
    if (open) {
      setCustomer(null)
      setInvoiceId(fixedInvoice ?? '')
      setAmount(maxAmount ? String(maxAmount) : '')
      setReference('')
      setNotes('')
    }
  }, [open, fixedInvoice, maxAmount])

  const invoices = useQuery({
    queryKey: ['invoices', 'open', customerId],
    queryFn: () => api.page<Invoice>('/api/v1/invoices', { customerId, pageSize: 50 }),
    enabled: open && !!customerId && !fixedInvoice,
  })
  const openInvoices = (invoices.data?.items ?? []).filter((i) => i.outstanding > 0)

  const save = useMutation({
    mutationFn: () => api.post<Payment>('/api/v1/payments', {
      customerId, invoiceId: invoiceId || undefined, amount, method, referenceNumber: reference || undefined, notes: notes || undefined,
    }, { 'Idempotency-Key': key }),
    onSuccess: (p) => {
      toast.success('Payment recorded', `${p.paymentNumber} · ${money(p.amount)}`)
      for (const k of ['payments', 'invoice', 'invoices', 'customer', 'customers', 'dashboard', 'order', 'orders', 'ledger']) qc.invalidateQueries({ queryKey: [k] })
      onDone?.(p)
      onClose()
    },
  })
  const err = save.error instanceof ApiError ? save.error : null

  return (
    <Sheet open={open} onClose={onClose} title="Record payment" footer={
      <Button block loading={save.isPending} disabled={!customerId || !(Number(amount) > 0)} onPress={() => save.mutate()}>Record payment</Button>
    }>
      {!fixedCustomer && (
        <Field label="Customer" required>
          <CustomerPicker value={customer} onChange={(c) => { setCustomer(c); setInvoiceId('') }} />
        </Field>
      )}
      {!fixedInvoice && !!customerId && (
        <Field label="Apply to invoice" hint="Leave as automatic to apply to the oldest open invoices">
          <Select label="Apply to invoice" value={invoiceId} onChange={(v) => {
            setInvoiceId(v)
            const inv = openInvoices.find((i) => i.id === v)
            if (inv) setAmount(String(inv.outstanding))
          }} options={[{ value: '', label: 'Oldest first (automatic)' }, ...openInvoices.map((i) => ({ value: i.id, label: `${i.invoiceNumber} · due ${money(i.outstanding)}` }))]} />
        </Field>
      )}
      <Field label="Amount" required error={err?.fieldError('amount')} hint={maxAmount ? `Outstanding ${money(maxAmount)}` : undefined}>
        <MoneyInput value={amount} onChangeText={setAmount} accessibilityLabel="Amount" />
      </Field>
      <Field label="Method" required>
        <Select label="Method" value={method} onChange={setMethod} options={[
          { value: 'CASH', label: 'Cash' }, { value: 'UPI', label: 'UPI' }, { value: 'BANK_TRANSFER', label: 'Bank transfer' }, { value: 'OTHER', label: 'Other' },
        ]} />
      </Field>
      <Field label="Reference number" hint="UPI / UTR / cheque number">
        <Input value={reference} onChangeText={setReference} accessibilityLabel="Reference number" autoCapitalize="characters" />
      </Field>
      <Field label="Notes">
        <Input value={notes} onChangeText={setNotes} multiline accessibilityLabel="Notes" />
      </Field>
      {err && <Alert tone="danger">{err.message}</Alert>}
    </Sheet>
  )
}
