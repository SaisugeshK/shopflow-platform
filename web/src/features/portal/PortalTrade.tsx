import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card, DataTable, KeyValue, StatusBadge } from '@/components/ui/Data'
import { Alert, EmptyState, QueryState } from '@/components/ui/Feedback'
import { ConfirmDialog } from '@/components/ui/Overlay'
import { useToast } from '@/components/ui/Toast'
import { AcceptQuotationDialog } from '@/features/trade/SalesDocsPages'
import { ProjectStatementDialog } from '@/features/trade/TradeParts'
import { api } from '@/services/api'
import type { Project, Quotation } from '@/services/types'
import { date, money, quantity } from '@/utils/format'

/** Quotations from the business (§0B.9): accept to place the order at the quoted rates, or decline. */
export function MyQuotationsPage() {
  const navigate = useNavigate()
  const q = useQuery({ queryKey: ['my-quotations'], queryFn: () => api.get<Quotation[]>('/api/v1/my/quotations') })
  return (
    <div className="stack">
      <h1>Quotations</h1>
      <Card padded={false}>
        <QueryState query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No quotations" description="Quotations from the business appear here." />}>
          {(d) => (
            <DataTable rows={d} rowKey={(x) => x.id} onRowClick={(x) => navigate(`/shop/quotations/${x.id}`)} columns={[
              { key: 'n', header: 'Quotation', render: (x) => <div><strong>{x.quotationNumber}</strong><div className="xs muted">{date(x.quoteDate)}</div></div> },
              { key: 'v', header: 'Valid until', render: (x) => date(x.validUntil) },
              { key: 't', header: 'Total', align: 'right', render: (x) => money(x.grandTotal) },
              { key: 's', header: 'Status', render: (x) => <StatusBadge status={x.status === 'SENT' ? 'PENDING' : x.status} /> },
            ]} />
          )}
        </QueryState>
      </Card>
    </div>
  )
}

export function MyQuotationDetailPage() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const [dialog, setDialog] = useState<'accept' | 'reject' | null>(null)
  const q = useQuery({ queryKey: ['my-quotation', id], queryFn: () => api.get<Quotation>(`/api/v1/my/quotations/${id}`) })
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api.post<Quotation>(`/api/v1/my/quotations/${id}/${path}`, body),
    onSuccess: (x) => {
      setDialog(null)
      qc.setQueryData(['my-quotation', id], x)
      qc.invalidateQueries({ queryKey: ['my-quotations'] })
      qc.invalidateQueries({ queryKey: ['my-orders'] })
      if (x.status === 'CONVERTED' && x.orderId) { toast.success('Order placed', x.orderNumber); navigate(`/shop/orders/${x.orderId}`) } else toast.success('Quotation declined')
    },
    onError: (e) => toast.error(e),
  })
  return (
    <QueryState query={q}>
      {(x) => (
        <div className="stack">
          <Link to="/shop/quotations" className="row small" style={{ gap: 4 }}><ArrowLeft size={14} /> Quotations</Link>
          <div className="row-between">
            <h1 className="row">{x.quotationNumber} <StatusBadge status={x.status === 'SENT' ? 'PENDING' : x.status} /></h1>
            {x.status === 'SENT' && (
              <div className="row" style={{ gap: 8 }}>
                <Button variant="ghost" icon={<X size={16} />} onClick={() => setDialog('reject')}>Decline</Button>
                <Button icon={<Check size={16} />} onClick={() => setDialog('accept')}>Accept</Button>
              </div>
            )}
          </div>
          {x.status === 'SENT' && x.validUntil && <Alert tone="info">Valid until {date(x.validUntil)}. Accepting places an order at these prices.</Alert>}
          {x.status === 'CONVERTED' && x.orderId && <Alert tone="success">Accepted · order <Link to={`/shop/orders/${x.orderId}`}>{x.orderNumber}</Link></Alert>}
          <Card title="Items" padded={false}>
            <DataTable rows={x.items ?? []} rowKey={(i) => i.id} columns={[
              { key: 'p', header: 'Product', render: (i) => i.productName },
              { key: 'q', header: 'Qty', align: 'right', render: (i) => `${quantity(i.quantity)} ${i.unit}` },
              { key: 'r', header: 'Rate', align: 'right', render: (i) => money(i.rate) },
              { key: 'd', header: 'Disc', align: 'right', render: (i) => (i.discountPercent > 0 ? `${i.discountPercent}%` : '—') },
              { key: 'a', header: 'Amount', align: 'right', render: (i) => money(i.lineTotal) },
            ]} />
            <div className="card-body"><KeyValue items={[['Taxable', money(x.taxableTotal)], ['GST', money(x.taxTotal)], ['Total', <strong key="t">{money(x.grandTotal)}</strong>],
              ['Project', x.projectName], ['Terms', x.notes]]} /></div>
          </Card>
          <AcceptQuotationDialog open={dialog === 'accept'} loading={act.isPending} onClose={() => setDialog(null)} onAccept={(body) => act.mutate({ path: 'accept', body })} />
          <ConfirmDialog open={dialog === 'reject'} onClose={() => setDialog(null)} tone="danger" loading={act.isPending} title="Decline this quotation?"
            confirmLabel="Decline" message="The business is told you declined." onConfirm={() => act.mutate({ path: 'reject', body: {} })} />
        </div>
      )}
    </QueryState>
  )
}

/** My projects / sites with billing and dues per site. */
export function MyProjectsPage() {
  const [statement, setStatement] = useState<string | null>(null)
  const q = useQuery({ queryKey: ['my-projects'], queryFn: () => api.get<Project[]>('/api/v1/my/projects') })
  return (
    <div className="stack">
      <h1>Projects</h1>
      <Card padded={false}>
        <QueryState query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No projects" description="Your sites appear here once the business sets them up." />}>
          {(d) => (
            <DataTable rows={d} rowKey={(p) => p.id} onRowClick={(p) => setStatement(p.id)} columns={[
              { key: 'n', header: 'Project', render: (p) => <div><strong>{p.name}</strong><div className="xs muted">{p.siteAddress}</div></div> },
              { key: 'b', header: 'Billed', align: 'right', render: (p) => money(p.billed) },
              { key: 'o', header: 'Due', align: 'right', render: (p) => money(p.outstanding) },
              { key: 's', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
            ]} />
          )}
        </QueryState>
      </Card>
      <ProjectStatementDialog id={statement} onClose={() => setStatement(null)} path={(id) => `/api/v1/my/projects/${id}/statement`} linkBase="/shop" />
    </div>
  )
}
