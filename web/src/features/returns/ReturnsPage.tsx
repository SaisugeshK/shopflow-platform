import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card, DataTable, KeyValue, PageHeader, Pagination, StatusBadge } from '@/components/ui/Data'
import { EmptyState, QueryState } from '@/components/ui/Feedback'
import { Field, Input } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Overlay'
import { useToast } from '@/components/ui/Toast'
import { useListParams } from '@/hooks/useListParams'
import { api } from '@/services/api'
import type { SalesReturn } from '@/services/types'
import { useCan } from '@/stores/auth'
import { dateTime, money, quantity } from '@/utils/format'

/** Sales returns review (§17): approve → stock IN + credit note, or reject. */
export function ReturnsPage() {
  const list = useListParams({ status: 'REQUESTED' })
  const qc = useQueryClient()
  const toast = useToast()
  const canWrite = useCan('RETURN_WRITE')
  const [open, setOpen] = useState<SalesReturn | null>(null)
  const [note, setNote] = useState('')
  const q = useQuery({ queryKey: ['returns', list.query], queryFn: () => api.page<SalesReturn>('/api/v1/sales-returns', { ...list.query, pageSize: 20 }) })
  const review = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) => api.post<SalesReturn>(`/api/v1/sales-returns/${id}/${action}`, { note: note || undefined }),
    onSuccess: (r) => {
      toast.success(`Return ${r.status.toLowerCase()}`, r.creditNoteNumber ? `Credit note ${r.creditNoteNumber} · ${money(r.creditAmount)}` : undefined)
      setOpen(null)
      setNote('')
      qc.invalidateQueries({ queryKey: ['returns'] })
    },
    onError: (e) => toast.error(e),
  })
  return (
    <div className="stack">
      <PageHeader title="Sales returns" subtitle="Returns against delivered invoices. Approving adds stock back and issues a credit note." />
      <Card padded={false}>
        <div className="toolbar">
          <div className="chips" role="group" aria-label="Status">
            {[['REQUESTED', 'Awaiting review'], ['APPROVED', 'Approved'], ['REJECTED', 'Rejected'], ['', 'All']].map(([v, l]) => (
              <button key={v} className="chip" aria-pressed={list.get('status') === v} onClick={() => list.set('status', v)}>{l}</button>
            ))}
          </div>
        </div>
        <QueryState query={q} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No returns" />}>
          {(d) => (
            <>
              <DataTable rows={d.items} rowKey={(r) => r.id} onRowClick={setOpen} columns={[
                { key: 'n', header: 'Return', render: (r) => <strong>{r.returnNumber}</strong> },
                { key: 'c', header: 'Customer', render: (r) => r.customerName },
                { key: 'i', header: 'Invoice', render: (r) => <Link to={`/app/invoices/${r.invoiceId}`} onClick={(e) => e.stopPropagation()}>{r.invoiceNumber}</Link> },
                { key: 'r', header: 'Reason', render: (r) => <span className="small">{r.reason}</span> },
                { key: 'd', header: 'Requested', render: (r) => dateTime(r.requestedAt) },
                { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                { key: 'a', header: 'Credit', align: 'right', render: (r) => (r.creditAmount != null ? money(r.creditAmount) : '—') },
              ]} />
              <Pagination meta={d.pagination} onPage={list.setPage} />
            </>
          )}
        </QueryState>
      </Card>
      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `Return ${open.returnNumber}` : ''} wide footer={open && canWrite && open.status === 'REQUESTED' && (
        <>
          <Button variant="danger" icon={<X size={16} />} loading={review.isPending && review.variables?.action === 'reject'} onClick={() => review.mutate({ id: open.id, action: 'reject' })}>Reject</Button>
          <Button variant="success" icon={<Check size={16} />} loading={review.isPending && review.variables?.action === 'approve'} onClick={() => review.mutate({ id: open.id, action: 'approve' })}>Approve</Button>
        </>
      )}>
        {open && (
          <div className="stack">
            <KeyValue items={[['Customer', open.customerName], ['Invoice', open.invoiceNumber], ['Reason', open.reason], ['Status', <StatusBadge key="s" status={open.status} />], ['Review note', open.reviewNote], ['Credit note', open.creditNoteNumber]]} />
            <DataTable rows={open.items} rowKey={(i) => i.id} columns={[
              { key: 'p', header: 'Product', render: (i) => i.productName },
              { key: 'q', header: 'Quantity', align: 'right', render: (i) => quantity(i.quantity) },
              { key: 'r', header: 'Reason', render: (i) => i.reason ?? '—' },
            ]} />
            {canWrite && open.status === 'REQUESTED' && <Field label="Review note" htmlFor="rv-note"><Input id="rv-note" value={note} onChange={(e) => setNote(e.target.value)} /></Field>}
          </div>
        )}
      </Modal>
    </div>
  )
}
