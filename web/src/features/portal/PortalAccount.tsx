import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Download, MapPin, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, IconButton } from '@/components/ui/Button'
import { Card, DataTable, KeyValue, Pagination, StatCard, StatusBadge, TaxBreakdown } from '@/components/ui/Data'
import { Alert, EmptyState, QueryState } from '@/components/ui/Feedback'
import { Field, Input, Select, Textarea } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Overlay'
import { useToast } from '@/components/ui/Toast'
import { STATES } from '@/features/auth/RegisterPage'
import { Ledger } from '@/features/customers/CustomersPages'
import { api, ApiError, download } from '@/services/api'
import type { CustomerDetail, Invoice, Outstanding, Payment, SalesReturn } from '@/services/types'
import { date, dateTime, money, quantity, titleCase } from '@/utils/format'

/** C10 Invoices. */
export function MyInvoicesPage() {
  const [page, setPage] = useState(1)
  const navigate = useNavigate()
  const q = useQuery({ queryKey: ['my-invoices', page], queryFn: () => api.page<Invoice>('/api/v1/invoices', { page, pageSize: 15 }) })
  return (
    <div className="stack">
      <h1>Invoices</h1>
      <Card padded={false}>
        <QueryState query={q} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No invoices yet" />}>
          {(d) => (
            <>
              <DataTable rows={d.items} rowKey={(i) => i.id} onRowClick={(i) => navigate(`/shop/invoices/${i.id}`)} columns={[
                { key: 'n', header: 'Invoice', render: (i) => <strong>{i.invoiceNumber}</strong> },
                { key: 'd', header: 'Date', render: (i) => date(i.invoiceDate) },
                { key: 'du', header: 'Due', render: (i) => <span className={i.overdue ? 'danger-text' : ''}>{date(i.dueDate)}</span> },
                { key: 's', header: 'Status', render: (i) => <StatusBadge status={i.status} /> },
                { key: 't', header: 'Total', align: 'right', render: (i) => money(i.grandTotal) },
                { key: 'o', header: 'Due amount', align: 'right', render: (i) => money(i.outstanding) },
              ]} />
              <Pagination meta={d.pagination} onPage={setPage} />
            </>
          )}
        </QueryState>
      </Card>
    </div>
  )
}

export function MyInvoiceDetailPage() {
  const { id } = useParams()
  const toast = useToast()
  const qc = useQueryClient()
  const [returning, setReturning] = useState(false)
  const [qty, setQty] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  const q = useQuery({ queryKey: ['invoice', id], queryFn: () => api.get<Invoice>(`/api/v1/invoices/${id}`) })
  const requestReturn = useMutation({
    mutationFn: () => api.post<SalesReturn>('/api/v1/sales-returns', { invoiceId: id, reason, items: Object.entries(qty).filter(([, v]) => Number(v) > 0).map(([invoiceItemId, quantity]) => ({ invoiceItemId, quantity })) }),
    onSuccess: (r) => { toast.success('Return requested', r.returnNumber); setReturning(false); setQty({}); setReason(''); qc.invalidateQueries({ queryKey: ['my-returns'] }) },
  })
  const err = requestReturn.error instanceof ApiError ? requestReturn.error : null
  return (
    <QueryState query={q}>
      {(inv) => (
        <div className="stack">
          <Link to="/shop/invoices" className="row small" style={{ gap: 4 }}><ArrowLeft size={14} /> Invoices</Link>
          <div className="row-between">
            <div><h1>{inv.invoiceNumber}</h1><p className="muted small">{date(inv.invoiceDate)} · <StatusBadge status={inv.status} /></p></div>
            <div className="row">
              <Button variant="secondary" icon={<RotateCcw size={16} />} onClick={() => setReturning(true)}>Request return</Button>
              <Button icon={<Download size={16} />} onClick={() => download(`/api/v1/invoices/${inv.id}/pdf`, undefined, 'invoice.pdf').catch((e) => toast.error(e))}>Download PDF</Button>
            </div>
          </div>
          <div className="detail-grid">
            <Card title="Items" padded={false}>
              <DataTable rows={inv.items ?? []} rowKey={(i) => i.id} columns={[
                { key: 'p', header: 'Product', render: (i) => i.productName },
                { key: 'q', header: 'Qty', align: 'right', render: (i) => `${quantity(i.quantity)} ${i.unit}` },
                { key: 'r', header: 'Rate', align: 'right', render: (i) => money(i.rate) },
                { key: 'g', header: 'GST', align: 'right', render: (i) => `${i.taxRate}%` },
                { key: 'a', header: 'Amount', align: 'right', render: (i) => money(i.lineTotal) },
              ]} />
              <div className="card-body" style={{ display: 'flex', justifyContent: 'flex-end' }}><div style={{ width: 'min(320px, 100%)' }}><TaxBreakdown t={inv} /></div></div>
            </Card>
            <Card title="Payment">
              <KeyValue items={[['Total', money(inv.grandTotal)], ['Credit notes', inv.creditedAmount > 0 ? money(inv.creditedAmount) : '—'], ['Paid', money(inv.paidAmount)], ['Due', <strong key="d">{money(inv.outstanding)}</strong>], ['Due date', date(inv.dueDate)]]} />
            </Card>
          </div>
          <Modal open={returning} onClose={() => setReturning(false)} title="Request a return" wide footer={
            <><Button variant="secondary" onClick={() => setReturning(false)}>Cancel</Button><Button loading={requestReturn.isPending} disabled={reason.trim().length < 3 || !Object.values(qty).some((v) => Number(v) > 0)} onClick={() => requestReturn.mutate()}>Submit request</Button></>
          }>
            <div className="stack">
              <p className="small muted">Returns are accepted for delivered orders and reviewed by the shop. Approved returns are credited to your account.</p>
              <DataTable rows={inv.items ?? []} rowKey={(i) => i.id} columns={[
                { key: 'p', header: 'Product', render: (i) => i.productName },
                { key: 'q', header: 'Bought', align: 'right', render: (i) => quantity(i.quantity) },
                { key: 'r', header: 'Return qty', align: 'right', render: (i) => <Input aria-label={`Return quantity for ${i.productName}`} type="number" min={0} max={i.quantity} step="any" style={{ width: 100, textAlign: 'right' }} value={qty[i.id] ?? ''} onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })} /> },
              ]} />
              <Field label="Reason" htmlFor="ret-reason" required><Textarea id="ret-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
              {err && <Alert tone="danger">{err.message}</Alert>}
            </div>
          </Modal>
        </div>
      )}
    </QueryState>
  )
}

/** C11/C13 Payments history. */
export function MyPaymentsPage() {
  const [page, setPage] = useState(1)
  const toast = useToast()
  const q = useQuery({ queryKey: ['my-payments', page], queryFn: () => api.page<Payment>('/api/v1/payments', { page, pageSize: 15 }) })
  return (
    <div className="stack">
      <h1>Payments</h1>
      <Card padded={false}>
        <QueryState query={q} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No payments yet" />}>
          {(d) => (
            <>
              <DataTable rows={d.items} rowKey={(p) => p.id} columns={[
                { key: 'n', header: 'Receipt', render: (p) => <strong>{p.paymentNumber}</strong> },
                { key: 'd', header: 'Date', render: (p) => dateTime(p.paidAt ?? p.createdAt) },
                { key: 'm', header: 'Method', render: (p) => titleCase(p.method) },
                { key: 's', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
                { key: 'a', header: 'Amount', align: 'right', render: (p) => money(p.amount) },
                { key: 'r', header: '', render: (p) => ['CAPTURED', 'PARTIALLY_PAID'].includes(p.status) && (
                  <IconButton label={`Download receipt ${p.paymentNumber}`} onClick={() => download(`/api/v1/payments/${p.id}/receipt`, undefined, 'receipt.pdf').catch((e) => toast.error(e))}><Download size={16} /></IconButton>
                ) },
              ]} />
              <Pagination meta={d.pagination} onPage={setPage} />
            </>
          )}
        </QueryState>
      </Card>
    </div>
  )
}

/** C12 Credit / outstanding with statement. */
export function MyOutstandingPage() {
  const q = useQuery({ queryKey: ['my-outstanding'], queryFn: () => api.get<Outstanding>('/api/v1/my/outstanding') })
  return (
    <div className="stack">
      <h1>Credit & outstanding</h1>
      <QueryState query={q}>
        {(o) => (
          <div className="kpi-grid">
            <StatCard label="Outstanding balance" value={o.ledgerBalance} tone="warning" hint={o.ledgerBalance < 0 ? 'You have credit with the shop' : `${o.openInvoiceCount} open invoices`} />
            <StatCard label="Overdue" value={o.overdueAmount} tone="danger" hint={o.oldestDueDate ? `Oldest due ${date(o.oldestDueDate)}` : 'Nothing overdue'} />
            <StatCard label="Credit limit" value={o.creditLimit} tone="primary" hint={o.creditEnabled ? `${o.creditDays} days to pay` : 'Credit not enabled'} />
            <StatCard label="Available credit" value={o.availableCredit} tone="success" />
          </div>
        )}
      </QueryState>
      <h3>Statement</h3>
      <Ledger path="/api/v1/my/ledger" />
    </div>
  )
}

export function MyReturnsPage() {
  const [page, setPage] = useState(1)
  const q = useQuery({ queryKey: ['my-returns', page], queryFn: () => api.page<SalesReturn>('/api/v1/sales-returns', { page, pageSize: 15 }) })
  return (
    <div className="stack">
      <h1>Returns</h1>
      <p className="muted small">To request a return, open a delivered invoice and choose “Request return”.</p>
      <Card padded={false}>
        <QueryState query={q} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No returns" />}>
          {(d) => (
            <>
              <DataTable rows={d.items} rowKey={(r) => r.id} columns={[
                { key: 'n', header: 'Return', render: (r) => <strong>{r.returnNumber}</strong> },
                { key: 'i', header: 'Invoice', render: (r) => <Link to={`/shop/invoices/${r.invoiceId}`}>{r.invoiceNumber}</Link> },
                { key: 'd', header: 'Requested', render: (r) => date(r.requestedAt) },
                { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                { key: 'c', header: 'Credit', align: 'right', render: (r) => (r.creditAmount != null ? money(r.creditAmount) : '—') },
              ]} />
              <Pagination meta={d.pagination} onPage={setPage} />
            </>
          )}
        </QueryState>
      </Card>
    </div>
  )
}

/** C14 Profile, C15 Business details, C16 Addresses. */
export function ProfilePage() {
  const qc = useQueryClient()
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const [a, setA] = useState({ label: '', addressLine1: '', addressLine2: '', city: '', state: 'Tamil Nadu', pincode: '' })
  const q = useQuery({ queryKey: ['my-profile'], queryFn: () => api.get<CustomerDetail>('/api/v1/my/profile') })
  const [edit, setEdit] = useState<{ email: string; alternateMobile: string; gstin: string } | null>(null)
  const saveProfile = useMutation({
    mutationFn: () => api.patch('/api/v1/my/profile', { email: edit!.email || undefined, alternateMobile: edit!.alternateMobile || undefined, gstin: edit!.gstin || undefined }),
    onSuccess: () => { toast.success('Profile updated'); setEdit(null); qc.invalidateQueries({ queryKey: ['my-profile'] }) },
    onError: (e) => toast.error(e),
  })
  const addAddress = useMutation({
    mutationFn: () => api.post('/api/v1/my/addresses', { ...a, label: a.label || undefined, addressLine2: a.addressLine2 || undefined }),
    onSuccess: () => { toast.success('Address added'); setAdding(false); qc.invalidateQueries({ queryKey: ['my-profile'] }); qc.invalidateQueries({ queryKey: ['my-addresses'] }) },
    onError: (e) => toast.error(e),
  })
  const removeAddress = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/my/addresses/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-profile'] }); qc.invalidateQueries({ queryKey: ['my-addresses'] }) },
  })
  return (
    <QueryState query={q}>
      {(c) => (
        <div className="stack">
          <h1>Account</h1>
          <div className="grid-2">
            <Card title="Business details" actions={<Button size="sm" variant="secondary" onClick={() => setEdit({ email: c.email ?? '', alternateMobile: c.alternateMobile?.replace('+91', '') ?? '', gstin: c.gstin ?? '' })}>Edit</Button>}>
              <KeyValue items={[['Shop', c.shopName], ['Customer code', c.customerCode], ['Contact', c.contactName], ['Mobile', c.mobileNumber], ['Alternate', c.alternateMobile], ['Email', c.email], ['GSTIN', c.gstin], ['PAN', c.pan]]} />
            </Card>
            <Card title="Addresses" actions={<Button size="sm" icon={<Plus size={14} />} onClick={() => setAdding(true)}>Add</Button>}>
              {c.addresses.length === 0 ? <EmptyState icon={<MapPin size={24} />} title="No addresses" /> : (
                <ul className="list-plain">
                  {c.addresses.map((ad) => (
                    <li key={ad.id}>
                      <span className="small">{ad.label && <strong>{ad.label}: </strong>}{ad.addressLine1}, {ad.city}, {ad.state} – {ad.pincode}{ad.isDefault && ' (default)'}</span>
                      <IconButton label="Remove address" onClick={() => removeAddress.mutate(ad.id)}><Trash2 size={16} /></IconButton>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
          <div className="row">
            <Link to="/shop/payments" className="btn btn-secondary">Payment history</Link>
            <Link to="/shop/returns" className="btn btn-secondary">Returns</Link>
            <Link to="/shop/outstanding" className="btn btn-secondary">Statement</Link>
          </div>
          <Modal open={adding} onClose={() => setAdding(false)} title="Add address" footer={<><Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button><Button loading={addAddress.isPending} onClick={() => addAddress.mutate()}>Save</Button></>}>
            <div className="form-grid">
              <Field label="Label" htmlFor="ad-l"><Input id="ad-l" value={a.label} onChange={(e) => setA({ ...a, label: e.target.value })} placeholder="e.g. Godown" /></Field>
              <Field label="Pincode" htmlFor="ad-p" required><Input id="ad-p" maxLength={6} value={a.pincode} onChange={(e) => setA({ ...a, pincode: e.target.value })} /></Field>
              <Field label="Address line 1" htmlFor="ad-1" required className="span-2"><Input id="ad-1" value={a.addressLine1} onChange={(e) => setA({ ...a, addressLine1: e.target.value })} /></Field>
              <Field label="Address line 2" htmlFor="ad-2" className="span-2"><Input id="ad-2" value={a.addressLine2} onChange={(e) => setA({ ...a, addressLine2: e.target.value })} /></Field>
              <Field label="City" htmlFor="ad-c" required><Input id="ad-c" value={a.city} onChange={(e) => setA({ ...a, city: e.target.value })} /></Field>
              <Field label="State" htmlFor="ad-s" required><Select id="ad-s" value={a.state} onChange={(e) => setA({ ...a, state: e.target.value })} options={STATES.map((s) => ({ value: s, label: s }))} /></Field>
            </div>
          </Modal>
          <Modal open={!!edit} onClose={() => setEdit(null)} title="Edit business details" footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button loading={saveProfile.isPending} onClick={() => saveProfile.mutate()}>Save</Button></>}>
            {edit && (
              <div className="stack">
                <Field label="Email" htmlFor="pf-e"><Input id="pf-e" type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
                <Field label="Alternate mobile" htmlFor="pf-m"><Input id="pf-m" inputMode="numeric" maxLength={10} value={edit.alternateMobile} onChange={(e) => setEdit({ ...edit, alternateMobile: e.target.value.replace(/\D/g, '') })} /></Field>
                <Field label="GSTIN" htmlFor="pf-g"><Input id="pf-g" maxLength={15} value={edit.gstin} onChange={(e) => setEdit({ ...edit, gstin: e.target.value.toUpperCase() })} /></Field>
                <p className="xs muted">To change the shop name or registered mobile, contact the shop.</p>
              </div>
            )}
          </Modal>
        </div>
      )}
    </QueryState>
  )
}
