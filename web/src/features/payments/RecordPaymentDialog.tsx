import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Feedback'
import { Field, Input, PriceInput, Select, Textarea } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Overlay'
import { useToast } from '@/components/ui/Toast'
import { api, ApiError, newIdempotencyKey } from '@/services/api'
import type { CustomerSummary, Invoice, Payment } from '@/services/types'
import { money } from '@/utils/format'

interface Props {
  open: boolean
  onClose: () => void
  customerId?: string
  invoiceId?: string
  maxAmount?: number
  onDone?: (p: Payment) => void
}

/**
 * Records a cash / UPI / bank-transfer payment. Allocation, ledger and invoice status are handled by the backend; an
 * idempotency key protects against double submission.
 */
export function RecordPaymentDialog({ open, onClose, customerId: fixedCustomer, invoiceId: fixedInvoice, maxAmount, onDone }: Props) {
  const toast = useToast()
  const qc = useQueryClient()
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerId, setCustomerId] = useState(fixedCustomer ?? '')
  const [invoiceId, setInvoiceId] = useState(fixedInvoice ?? '')
  const [amount, setAmount] = useState(maxAmount ? String(maxAmount) : '')
  const [method, setMethod] = useState('CASH')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const key = useMemo(() => (open ? newIdempotencyKey() : ''), [open])

  useEffect(() => {
    if (open) {
      setCustomerId(fixedCustomer ?? '')
      setInvoiceId(fixedInvoice ?? '')
      setAmount(maxAmount ? String(maxAmount) : '')
      setReference('')
      setNotes('')
    }
  }, [open, fixedCustomer, fixedInvoice, maxAmount])

  const customers = useQuery({
    queryKey: ['customers', 'picker', customerSearch],
    queryFn: () => api.page<CustomerSummary>('/api/v1/customers', { q: customerSearch, status: 'APPROVED', pageSize: 20 }),
    enabled: open && !fixedCustomer,
  })
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
      qc.invalidateQueries({ queryKey: ['payments'] })
      qc.invalidateQueries({ queryKey: ['invoice'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['customer'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      onDone?.(p)
      onClose()
    },
  })
  const err = save.error instanceof ApiError ? save.error : null

  return (
    <Modal open={open} onClose={onClose} title="Record payment" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button loading={save.isPending} disabled={!customerId || !(Number(amount) > 0)} onClick={() => save.mutate()}>Record payment</Button>
      </>
    }>
      <div className="form-grid">
        {!fixedCustomer && (
          <>
            <Field label="Find customer" htmlFor="pay-cust-search">
              <Input id="pay-cust-search" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Name, code or mobile" />
            </Field>
            <Field label="Customer" htmlFor="pay-cust" required>
              <Select id="pay-cust" value={customerId} onChange={(e) => { setCustomerId(e.target.value); setInvoiceId('') }} placeholder="Select customer"
                options={(customers.data?.items ?? []).map((c) => ({ value: c.id, label: `${c.shopName} (${c.customerCode}) · due ${money(c.outstanding)}` }))} />
            </Field>
          </>
        )}
        {!fixedInvoice && (
          <Field label="Apply to invoice" htmlFor="pay-inv" className="span-2" hint="Leave empty to apply to the oldest open invoices automatically">
            <Select id="pay-inv" value={invoiceId} onChange={(e) => {
              setInvoiceId(e.target.value)
              const inv = openInvoices.find((i) => i.id === e.target.value)
              if (inv) setAmount(String(inv.outstanding))
            }} placeholder="Oldest first (automatic)" options={openInvoices.map((i) => ({ value: i.id, label: `${i.invoiceNumber} · due ${money(i.outstanding)}` }))} />
          </Field>
        )}
        <Field label="Amount" htmlFor="pay-amount" required error={err?.fieldError('amount')} hint={maxAmount ? `Outstanding ${money(maxAmount)}` : undefined}>
          <PriceInput id="pay-amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Method" htmlFor="pay-method" required>
          <Select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value)} options={[
            { value: 'CASH', label: 'Cash' }, { value: 'UPI', label: 'UPI' }, { value: 'BANK_TRANSFER', label: 'Bank transfer' }, { value: 'OTHER', label: 'Other' },
          ]} />
        </Field>
        <Field label="Reference number" htmlFor="pay-ref" hint="UPI / UTR / cheque number"><Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
        <Field label="Notes" htmlFor="pay-notes"><Textarea id="pay-notes" value={notes} onChange={(e) => setNotes(e.target.value)} style={{ minHeight: 40 }} /></Field>
        {err && <div className="span-2"><Alert tone="danger">{err.message}</Alert></div>}
      </div>
    </Modal>
  )
}
