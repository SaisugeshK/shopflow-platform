import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Download, Plus, RotateCcw, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card, DataTable, KeyValue, PageHeader, Pagination, StatusBadge } from '@/components/ui/Data'
import { EmptyState, QueryState } from '@/components/ui/Feedback'
import { Input, SearchInput, Select } from '@/components/ui/Form'
import { ConfirmDialog } from '@/components/ui/Overlay'
import { useToast } from '@/components/ui/Toast'
import { useListParams } from '@/hooks/useListParams'
import { api, download } from '@/services/api'
import type { Payment } from '@/services/types'
import { useCan } from '@/stores/auth'
import { dateTime, money, titleCase } from '@/utils/format'
import { RecordPaymentDialog } from './RecordPaymentDialog'

/** O18/AD12 Payments. */
export function PaymentsPage() {
  const list = useListParams()
  const navigate = useNavigate()
  const canWrite = useCan('PAYMENT_WRITE')
  const [params, setParams] = useSearchParams()
  const [recording, setRecording] = useState(params.get('record') === '1')
  const q = useQuery({ queryKey: ['payments', list.query], queryFn: () => api.page<Payment>('/api/v1/payments', { ...list.query, record: undefined, pageSize: 20 }) })
  return (
    <div className="stack">
      <PageHeader title="Payments" subtitle="Money received from customers" actions={canWrite && <Button icon={<Plus size={16} />} onClick={() => setRecording(true)}>Record payment</Button>} />
      <Card padded={false}>
        <div className="toolbar">
          <SearchInput className="search" value={list.search} onChange={list.setSearch} placeholder="Payment or reference number" />
          <Select aria-label="Method" value={list.get('method')} onChange={(e) => list.set('method', e.target.value)} style={{ width: 160 }} placeholder="Any method"
            options={['CASH', 'ONLINE', 'UPI', 'BANK_TRANSFER', 'OTHER'].map((v) => ({ value: v, label: titleCase(v) }))} />
          <Select aria-label="Status" value={list.get('status')} onChange={(e) => list.set('status', e.target.value)} style={{ width: 160 }} placeholder="Any status"
            options={['CAPTURED', 'PENDING', 'UNPAID', 'FAILED', 'REFUNDED', 'CANCELLED'].map((v) => ({ value: v, label: titleCase(v) }))} />
          <Input type="date" aria-label="From date" value={list.get('from')} onChange={(e) => list.set('from', e.target.value)} style={{ width: 150 }} />
          <Input type="date" aria-label="To date" value={list.get('to')} onChange={(e) => list.set('to', e.target.value)} style={{ width: 150 }} />
        </div>
        <QueryState query={q} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No payments" description="Recorded and online payments appear here." />}>
          {(d) => (
            <>
              <DataTable rows={d.items} rowKey={(p) => p.id} onRowClick={(p) => navigate(`/app/payments/${p.id}`)} sort={list.sort} onSortChange={list.setSort}
                columns={[
                  { key: 'n', header: 'Payment', render: (p) => <strong>{p.paymentNumber}</strong> },
                  { key: 'c', header: 'Customer', render: (p) => p.customerName },
                  { key: 'm', header: 'Method', render: (p) => titleCase(p.method) },
                  { key: 'r', header: 'Reference', render: (p) => p.referenceNumber ?? p.invoiceNumber ?? p.orderNumber ?? '—' },
                  { key: 's', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
                  { key: 'd', header: 'Date', sortKey: 'paidAt', render: (p) => dateTime(p.paidAt ?? p.createdAt) },
                  { key: 'a', header: 'Amount', align: 'right', sortKey: 'amount', render: (p) => money(p.amount) },
                ]} />
              <Pagination meta={d.pagination} onPage={list.setPage} />
            </>
          )}
        </QueryState>
      </Card>
      <RecordPaymentDialog open={recording} onClose={() => { setRecording(false); if (params.get('record')) { params.delete('record'); setParams(params, { replace: true }) } }} onDone={(p) => navigate(`/app/payments/${p.id}`)} />
    </div>
  )
}

export function PaymentDetailPage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const toast = useToast()
  const canWrite = useCan('PAYMENT_WRITE')
  const [dialog, setDialog] = useState<'cancel' | 'refund' | null>(null)
  const q = useQuery({ queryKey: ['payment', id], queryFn: () => api.get<Payment>(`/api/v1/payments/${id}`) })
  const act = useMutation({
    mutationFn: ({ path, reason }: { path: string; reason: string }) => api.post<Payment>(`/api/v1/payments/${id}/${path}`, { reason }),
    onSuccess: (p) => {
      toast.success(`Payment ${titleCase(p.status)}`)
      setDialog(null)
      qc.invalidateQueries({ queryKey: ['payment', id] })
      qc.invalidateQueries({ queryKey: ['payments'] })
    },
    onError: (e) => toast.error(e),
  })
  return (
    <QueryState query={q}>
      {(p) => {
        const received = p.status === 'CAPTURED' || p.status === 'PARTIALLY_PAID'
        return (
          <div className="stack">
            <PageHeader
              breadcrumb={<Link to="/app/payments" className="row" style={{ gap: 4 }}><ArrowLeft size={14} /> Payments</Link>}
              title={<span className="row">{p.paymentNumber} <StatusBadge status={p.status} /></span>}
              subtitle={`${money(p.amount)} from ${p.customerName}`}
              actions={
                <>
                  {received && <Button variant="secondary" icon={<Download size={16} />} onClick={() => download(`/api/v1/payments/${p.id}/receipt`, undefined, `${p.paymentNumber}.pdf`)}>Receipt</Button>}
                  {canWrite && received && p.method !== 'ONLINE' && p.refundedAmount === 0 && <Button variant="ghost" icon={<Undo2 size={16} />} onClick={() => setDialog('cancel')}>Cancel entry</Button>}
                  {canWrite && received && p.refundedAmount < p.amount && <Button variant="danger" icon={<RotateCcw size={16} />} onClick={() => setDialog('refund')}>Refund</Button>}
                </>
              }
            />
            <div className="grid-2">
              <Card title="Details">
                <KeyValue items={[
                  ['Customer', <Link key="c" to={`/app/customers/${p.customerId}`}>{p.customerName}</Link>],
                  ['Amount', money(p.amount)],
                  ['Method', titleCase(p.method)],
                  ['Reference', p.referenceNumber],
                  ['Paid at', dateTime(p.paidAt)],
                  ['Collected by', p.collectedBy],
                  ['Order', p.orderId ? <Link key="o" to={`/app/orders/${p.orderId}`}>{p.orderNumber}</Link> : undefined],
                  ['Provider', p.provider ? `${p.provider} · ${p.providerOrderId}` : undefined],
                  ['Failure', p.failureReason],
                  ['Refunded', p.refundedAmount > 0 ? money(p.refundedAmount) : undefined],
                  ['Cancel reason', p.cancelReason],
                  ['Notes', p.notes],
                ]} />
              </Card>
              <Card title="Applied to invoices" padded={false}>
                {p.allocations?.length ? (
                  <DataTable rows={p.allocations} rowKey={(a) => a.invoiceId + a.amount + a.reversed} columns={[
                    { key: 'i', header: 'Invoice', render: (a) => <Link to={`/app/invoices/${a.invoiceId}`}>{a.invoiceNumber}</Link> },
                    { key: 's', header: 'Status', render: (a) => (a.reversed ? <StatusBadge status="CANCELLED" /> : <StatusBadge status="APPLIED" />) },
                    { key: 'a', header: 'Amount', align: 'right', render: (a) => money(a.amount) },
                  ]} />
                ) : <EmptyState title="Not applied yet" description="Unapplied money is held as customer credit and used on the next invoice." />}
                <div className="card-body">
                  <KeyValue items={[['Applied', money(p.allocatedAmount)], ['Unapplied (credit)', money(p.unallocatedAmount)]]} />
                </div>
              </Card>
            </div>
            <ConfirmDialog open={dialog === 'cancel'} onClose={() => setDialog(null)} title="Cancel payment entry" tone="danger" requireReason
              message="Use this only for an entry made in error. The ledger and invoices are reversed." loading={act.isPending} confirmLabel="Cancel payment"
              onConfirm={(reason) => act.mutate({ path: 'cancel', reason })} />
            <ConfirmDialog open={dialog === 'refund'} onClose={() => setDialog(null)} title="Refund payment" tone="danger" requireReason
              message={`Refund the remaining ${money(p.amount - p.refundedAmount)} to the customer${p.method === 'ONLINE' ? ' through the payment gateway' : ''}.`}
              loading={act.isPending} confirmLabel="Refund" onConfirm={(reason) => act.mutate({ path: 'refund', reason })} />
          </div>
        )
      }}
    </QueryState>
  )
}
