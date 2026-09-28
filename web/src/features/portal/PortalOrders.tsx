import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CreditCard, FileText, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card, DataTable, KeyValue, Pagination, StatusBadge, TaxBreakdown, Timeline } from '@/components/ui/Data'
import { Alert, EmptyState, QueryState } from '@/components/ui/Feedback'
import { ConfirmDialog } from '@/components/ui/Overlay'
import { useToast } from '@/components/ui/Toast'
import { orderTimeline } from '@/features/orders/OrdersPages'
import { api } from '@/services/api'
import type { Order, PaymentIntent, StatusHistory } from '@/services/types'
import { date, dateTime, money, quantity, titleCase } from '@/utils/format'
import { MockCheckoutDialog } from './MockCheckout'

/** C07 Order list. */
export function MyOrdersPage() {
  const [page, setPage] = useState(1)
  const navigate = useNavigate()
  const q = useQuery({ queryKey: ['my-orders', page], queryFn: () => api.page<Order>('/api/v1/orders', { page, pageSize: 15 }) })
  return (
    <div className="stack">
      <h1>My orders</h1>
      <QueryState query={q} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No orders yet" action={<Link to="/shop/products" className="btn btn-primary">Start shopping</Link>} />}>
        {(d) => (
          <div className="stack-sm">
            {d.items.map((o) => (
              <button key={o.id} className="card card-hover" style={{ padding: 16, textAlign: 'left', cursor: 'pointer', border: '1px solid var(--color-border)' }} onClick={() => navigate(`/shop/orders/${o.id}`)}>
                <div className="row-between">
                  <div><strong>{o.orderNumber}</strong><div className="xs muted">{dateTime(o.placedAt)} · {titleCase(o.paymentMethod)}</div></div>
                  <div className="row" style={{ gap: 6 }}><StatusBadge status={o.status} /><StatusBadge status={o.paymentStatus} /></div>
                </div>
                <div className="row-between" style={{ marginTop: 8 }}>
                  <span className="small muted">{o.balanceDue > 0 ? `Balance due ${money(o.balanceDue)}` : ''}</span>
                  <span style={{ fontWeight: 700 }}>{money(o.grandTotal)}</span>
                </div>
              </button>
            ))}
            <Pagination meta={d.pagination} onPage={setPage} />
          </div>
        )}
      </QueryState>
    </div>
  )
}

/** C08 Order detail + C09 tracking (§39). */
export function MyOrderDetailPage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const toast = useToast()
  const [cancelling, setCancelling] = useState(false)
  const [intent, setIntent] = useState<PaymentIntent | null>(null)
  const q = useQuery({ queryKey: ['order', id], queryFn: () => api.get<Order>(`/api/v1/orders/${id}`) })
  const history = useQuery({ queryKey: ['order', id, 'history'], queryFn: () => api.get<StatusHistory[]>(`/api/v1/orders/${id}/status-history`) })
  const cancel = useMutation({
    mutationFn: (reason: string) => api.post(`/api/v1/orders/${id}/cancel`, { reason }),
    onSuccess: () => { toast.success('Order cancelled'); setCancelling(false); qc.invalidateQueries({ queryKey: ['order', id] }); qc.invalidateQueries({ queryKey: ['my-orders'] }) },
    onError: (e) => toast.error(e),
  })
  const pay = useMutation({
    mutationFn: () => api.post<PaymentIntent>(`/api/v1/orders/${id}/payment-intent`),
    onSuccess: setIntent,
    onError: (e) => toast.error(e),
  })
  return (
    <QueryState query={q}>
      {(o) => {
        const canPay = o.paymentMethod === 'ONLINE' && o.balanceDue > 0 && !['CANCELLED', 'REJECTED', 'DELIVERY_FAILED'].includes(o.status)
        return (
          <div className="stack">
            <Link to="/shop/orders" className="row small" style={{ gap: 4 }}><ArrowLeft size={14} /> My orders</Link>
            <div className="row-between">
              <div><h1>{o.orderNumber}</h1><p className="muted small">Placed {dateTime(o.placedAt)}</p></div>
              <div className="row">
                {canPay && <Button icon={<CreditCard size={16} />} loading={pay.isPending} onClick={() => (o.paymentIntent ? setIntent(o.paymentIntent) : pay.mutate())}>Pay {money(o.balanceDue)}</Button>}
                {o.customerCanCancel && <Button variant="ghost" icon={<XCircle size={16} />} onClick={() => setCancelling(true)}>Cancel order</Button>}
              </div>
            </div>
            {o.paymentStatus === 'FAILED' && <Alert tone="warning" title="Payment not completed">Your last payment attempt failed. You can try again.</Alert>}
            {o.creditApprovalStatus === 'PENDING' && <Alert tone="info">This credit order is waiting for the shop's approval.</Alert>}
            {(o.cancelReason || o.rejectReason) && <Alert tone="danger" title={titleCase(o.status)}>{o.cancelReason ?? o.rejectReason}</Alert>}
            <div className="detail-grid">
              <div className="stack">
                <Card title="Items" padded={false}>
                  <DataTable rows={o.items ?? []} rowKey={(i) => i.id} columns={[
                    { key: 'p', header: 'Product', render: (i) => i.productName },
                    { key: 'q', header: 'Qty', align: 'right', render: (i) => `${quantity(o.status === 'PLACED' ? i.orderedQuantity : i.acceptedQuantity - i.cancelledQuantity)} ${i.unit}` },
                    { key: 'd', header: 'Delivered', align: 'right', render: (i) => quantity(i.deliveredQuantity) },
                    { key: 'r', header: 'Rate', align: 'right', render: (i) => money(i.rate) },
                    { key: 'l', header: 'Amount', align: 'right', render: (i) => money(i.lineTotal) },
                  ]} />
                  <div className="card-body" style={{ display: 'flex', justifyContent: 'flex-end' }}><div style={{ width: 'min(320px, 100%)' }}><TaxBreakdown t={o} /></div></div>
                </Card>
                <Card title="Invoice & payment">
                  <KeyValue items={[
                    ['Payment', <StatusBadge key="p" status={o.paymentStatus} />], ['Method', titleCase(o.paymentMethod)], ['Paid', money(o.paidAmount)], ['Balance', money(o.balanceDue)],
                    ['Invoice', o.invoices?.length ? o.invoices.map((i) => <Link key={i.id} to={`/shop/invoices/${i.id}`} className="row" style={{ gap: 4 }}><FileText size={14} />{i.invoiceNumber}</Link>) : 'Issued after the shop accepts the order'],
                  ]} />
                </Card>
              </div>
              <div className="stack">
                <Card title="Tracking"><Timeline steps={orderTimeline(o, history.data ?? [])} /></Card>
                <Card title="Delivery">
                  <KeyValue items={[
                    ['Address', o.deliveryAddress], ['Contact', o.contactMobile],
                    ['Delivery person', o.delivery?.deliveryPerson], ['Vehicle', o.delivery?.vehicleNumber],
                    ['Delivered', o.delivery?.deliveredAt ? date(o.delivery.deliveredAt) : undefined],
                  ]} />
                </Card>
              </div>
            </div>
            <ConfirmDialog open={cancelling} onClose={() => setCancelling(false)} title="Cancel this order?" tone="danger" requireReason loading={cancel.isPending} confirmLabel="Cancel order"
              message="Online payments are refunded automatically. Cash already paid stays as credit on your account." onConfirm={(r) => cancel.mutate(r)} />
            {intent && <MockCheckoutDialog open={!!intent} intent={intent} onClose={() => { setIntent(null); qc.invalidateQueries({ queryKey: ['order', id] }) }} />}
          </div>
        )
      }}
    </QueryState>
  )
}
