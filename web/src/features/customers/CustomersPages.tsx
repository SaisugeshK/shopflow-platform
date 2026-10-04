import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Ban, Check, Plus, Trash2, UserPlus, Wallet, X } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { Button, IconButton } from '@/components/ui/Button'
import { Card, DataTable, KeyValue, PageHeader, Pagination, StatCard, StatusBadge, Tabs } from '@/components/ui/Data'
import { Alert, EmptyState, QueryState } from '@/components/ui/Feedback'
import { Field, Input, PhoneInput, PriceInput, SearchInput, Select, Switch, Textarea } from '@/components/ui/Form'
import { ConfirmDialog, Modal } from '@/components/ui/Overlay'
import { useToast } from '@/components/ui/Toast'
import { STATES } from '@/features/auth/RegisterPage'
import { RecordPaymentDialog } from '@/features/payments/RecordPaymentDialog'
import { ProductPicker } from '@/features/products/ProductPicker'
import { useListParams } from '@/hooks/useListParams'
import { api, ApiError } from '@/services/api'
import type { CustomerDetail, CustomerSummary, Invoice, LedgerEntry, Order, Payment } from '@/services/types'
import { useCan } from '@/stores/auth'
import { date, dateTime, money, titleCase } from '@/utils/format'
import { CustomerTradeCards } from '@/features/trade/TradeParts'

/** O13/AD04 Customers. */
export function CustomersPage() {
  const list = useListParams()
  const navigate = useNavigate()
  const canWrite = useCan('CUSTOMER_WRITE')
  const q = useQuery({ queryKey: ['customers', list.query], queryFn: () => api.page<CustomerSummary>('/api/v1/customers', { ...list.query, pageSize: 20 }) })
  return (
    <div className="stack">
      <PageHeader title="Customers" subtitle="Retail shops buying from the business" actions={canWrite && <Button icon={<UserPlus size={16} />} onClick={() => navigate('/app/customers/new')}>Add customer</Button>} />
      <Card padded={false}>
        <div className="toolbar">
          <SearchInput className="search" value={list.search} onChange={list.setSearch} placeholder="Shop, contact, mobile, code or GSTIN" />
          <div className="chips" role="group" aria-label="Status">
            {[['', 'All'], ['PENDING_APPROVAL', 'Pending'], ['APPROVED', 'Approved'], ['BLOCKED', 'Blocked'], ['REJECTED', 'Rejected']].map(([v, l]) => (
              <button key={v} className="chip" aria-pressed={list.get('status') === v} onClick={() => list.set('status', v)}>{l}</button>
            ))}
          </div>
          <Select aria-label="Outstanding" value={list.get('hasOutstanding')} onChange={(e) => list.set('hasOutstanding', e.target.value)} style={{ width: 180 }}
            options={[{ value: '', label: 'Any balance' }, { value: 'true', label: 'With outstanding' }, { value: 'false', label: 'No outstanding' }]} />
        </div>
        <QueryState query={q} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No customers found" />}>
          {(d) => (
            <>
              <DataTable rows={d.items} rowKey={(c) => c.id} onRowClick={(c) => navigate(`/app/customers/${c.id}`)} sort={list.sort} onSortChange={list.setSort} columns={[
                { key: 'n', header: 'Customer', sortKey: 'shopName', render: (c) => <div><div style={{ fontWeight: 600 }}>{c.shopName}</div><div className="xs muted">{c.customerCode} · {c.contactName}</div></div> },
                { key: 'm', header: 'Mobile', render: (c) => c.mobileNumber },
                { key: 'ci', header: 'City', render: (c) => c.city ?? '—' },
                { key: 'g', header: 'GSTIN', render: (c) => <span className="mono xs">{c.gstin ?? '—'}</span> },
                { key: 's', header: 'Status', render: (c) => <StatusBadge status={c.status} /> },
                { key: 'cl', header: 'Credit limit', align: 'right', render: (c) => money(c.creditLimit) },
                { key: 'ts', header: 'Total sales', align: 'right', render: (c) => money(c.totalSales) },
                { key: 'o', header: 'Outstanding', align: 'right', render: (c) => <span className={c.outstanding > 0 ? 'warning-text' : ''}>{money(c.outstanding)}</span> },
                { key: 'l', header: 'Last activity', render: (c) => date(c.lastTransactionAt) },
              ]} />
              <Pagination meta={d.pagination} onPage={list.setPage} />
            </>
          )}
        </QueryState>
      </Card>
    </div>
  )
}

const customerSchema = z.object({
  mobileNumber: z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number'),
  shopName: z.string().trim().min(2, 'Required').max(200),
  contactName: z.string().trim().min(2, 'Required').max(200),
  addressLine1: z.string().trim().min(3, 'Required'),
  addressLine2: z.string().optional(),
  city: z.string().trim().min(2, 'Required'),
  state: z.string().min(2),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/, 'Enter a valid pincode'),
  gstin: z.string().toUpperCase().refine((v) => !v || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v), 'Invalid GSTIN').optional(),
  pan: z.string().toUpperCase().refine((v) => !v || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v), 'Invalid PAN').optional(),
  email: z.string().optional(),
  notes: z.string().optional(),
  creditEnabled: z.boolean(),
  creditLimit: z.string().optional(),
  creditDays: z.string().optional(),
})
type CustomerForm = z.infer<typeof customerSchema>

/** Staff-created customers are approved immediately and can sign in with their mobile. */
export function CustomerFormPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const form = useForm<CustomerForm>({ resolver: zodResolver(customerSchema), defaultValues: { state: 'Tamil Nadu', creditEnabled: false, creditLimit: '0', creditDays: '30' } })
  const save = useMutation({
    mutationFn: (v: CustomerForm) => api.post<CustomerDetail>('/api/v1/customers', {
      mobileNumber: v.mobileNumber, shopName: v.shopName, contactName: v.contactName, gstin: v.gstin || undefined, pan: v.pan || undefined,
      email: v.email || undefined, notes: v.notes || undefined,
      address: { addressLine1: v.addressLine1, addressLine2: v.addressLine2 || undefined, city: v.city, state: v.state, pincode: v.pincode },
      credit: { creditEnabled: v.creditEnabled, creditLimit: v.creditLimit || '0', creditDays: Number(v.creditDays || 0) },
    }),
    onSuccess: (c) => { toast.success('Customer created', c.customerCode); qc.invalidateQueries({ queryKey: ['customers'] }); navigate(`/app/customers/${c.id}`) },
  })
  const err = save.error instanceof ApiError ? save.error : null
  const e = form.formState.errors
  const fe = (k: keyof CustomerForm) => e[k]?.message ?? err?.fieldError(k)
  return (
    <div className="stack">
      <PageHeader breadcrumb={<Link to="/app/customers" className="row" style={{ gap: 4 }}><ArrowLeft size={14} /> Customers</Link>} title="Add customer" />
      <form className="stack" onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate>
        <Card title="Business">
          <div className="form-grid">
            <Field label="Mobile number" htmlFor="mob" required error={fe('mobileNumber')}><PhoneInput id="mob" {...form.register('mobileNumber')} invalid={!!fe('mobileNumber')} /></Field>
            <Field label="Shop / business name" htmlFor="shop" required error={fe('shopName')}><Input id="shop" {...form.register('shopName')} /></Field>
            <Field label="Contact person" htmlFor="contact" required error={fe('contactName')}><Input id="contact" {...form.register('contactName')} /></Field>
            <Field label="Email" htmlFor="email"><Input id="email" type="email" {...form.register('email')} /></Field>
            <Field label="GSTIN" htmlFor="gstin" error={fe('gstin')}><Input id="gstin" maxLength={15} style={{ textTransform: 'uppercase' }} {...form.register('gstin')} /></Field>
            <Field label="PAN" htmlFor="pan" error={fe('pan')}><Input id="pan" maxLength={10} style={{ textTransform: 'uppercase' }} {...form.register('pan')} /></Field>
          </div>
        </Card>
        <Card title="Billing address">
          <div className="form-grid">
            <Field label="Address line 1" htmlFor="a1" required error={fe('addressLine1')} className="span-2"><Input id="a1" {...form.register('addressLine1')} /></Field>
            <Field label="Address line 2" htmlFor="a2" className="span-2"><Input id="a2" {...form.register('addressLine2')} /></Field>
            <Field label="City" htmlFor="city" required error={fe('city')}><Input id="city" {...form.register('city')} /></Field>
            <Field label="State" htmlFor="state" required><Select id="state" {...form.register('state')} options={STATES.map((s) => ({ value: s, label: s }))} /></Field>
            <Field label="Pincode" htmlFor="pin" required error={fe('pincode')}><Input id="pin" inputMode="numeric" maxLength={6} {...form.register('pincode')} /></Field>
          </div>
        </Card>
        <Card title="Credit">
          <div className="form-grid">
            <div className="span-2"><Switch label="Allow purchases on credit" checked={form.watch('creditEnabled')} onChange={(v) => form.setValue('creditEnabled', v)} /></div>
            <Field label="Credit limit" htmlFor="cl"><PriceInput id="cl" {...form.register('creditLimit')} /></Field>
            <Field label="Credit days" htmlFor="cd"><Input id="cd" type="number" min={0} max={365} {...form.register('creditDays')} /></Field>
            <Field label="Internal notes" htmlFor="notes" className="span-2"><Textarea id="notes" {...form.register('notes')} /></Field>
          </div>
        </Card>
        {err && !err.details.length && <Alert tone="danger">{err.message}</Alert>}
        <div className="form-actions">
          <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" loading={save.isPending}>Create customer</Button>
        </div>
      </form>
    </div>
  )
}

type Tab = 'overview' | 'orders' | 'invoices' | 'payments' | 'ledger' | 'prices'

/** O14/O15 Customer detail with tabs (§16). */
export function CustomerDetailPage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const toast = useToast()
  const canWrite = useCan('CUSTOMER_WRITE')
  const canPay = useCan('PAYMENT_WRITE')
  const [tab, setTab] = useState<Tab>('overview')
  const [dialog, setDialog] = useState<'reject' | 'block' | 'credit' | 'payment' | null>(null)
  const q = useQuery({ queryKey: ['customer', id], queryFn: () => api.get<CustomerDetail>(`/api/v1/customers/${id}`) })
  const refresh = () => { qc.invalidateQueries({ queryKey: ['customer', id] }); qc.invalidateQueries({ queryKey: ['customers'] }) }
  const status = useMutation({
    mutationFn: ({ path, reason }: { path: string; reason?: string }) => api.post<CustomerDetail>(`/api/v1/customers/${id}/${path}`, { reason }),
    onSuccess: (c) => { toast.success(`Customer ${titleCase(c.status)}`); setDialog(null); refresh() },
    onError: (e) => toast.error(e),
  })
  return (
    <QueryState query={q}>
      {(c) => (
        <div className="stack">
          <PageHeader
            breadcrumb={<Link to="/app/customers" className="row" style={{ gap: 4 }}><ArrowLeft size={14} /> Customers</Link>}
            title={<span className="row">{c.shopName} <StatusBadge status={c.status} /></span>}
            subtitle={`${c.customerCode} · ${c.contactName} · ${c.mobileNumber}`}
            actions={
              <>
                {canWrite && c.status === 'PENDING_APPROVAL' && <Button variant="danger" icon={<X size={16} />} onClick={() => setDialog('reject')}>Reject</Button>}
                {canWrite && c.status !== 'APPROVED' && c.status !== 'REJECTED' && <Button variant="success" icon={<Check size={16} />} loading={status.isPending} onClick={() => status.mutate({ path: 'approve' })}>{c.status === 'BLOCKED' ? 'Unblock' : 'Approve'}</Button>}
                {canWrite && c.status === 'APPROVED' && <Button variant="ghost" icon={<Ban size={16} />} onClick={() => setDialog('block')}>Block</Button>}
                {canPay && c.status === 'APPROVED' && <Button icon={<Wallet size={16} />} onClick={() => setDialog('payment')}>Record payment</Button>}
              </>
            }
          />
          {c.statusReason && <Alert tone={c.status === 'APPROVED' ? 'info' : 'warning'} title={`Status note (${date(c.statusChangedAt)})`}>{c.statusReason}</Alert>}
          <div className="kpi-grid">
            <StatCard label="Outstanding" value={c.outstanding.ledgerBalance} tone="warning" hint={`${c.outstanding.openInvoiceCount} open invoices`} />
            <StatCard label="Overdue" value={c.outstanding.overdueAmount} tone="danger" hint={c.outstanding.oldestDueDate ? `Oldest due ${date(c.outstanding.oldestDueDate)}` : 'Nothing overdue'} />
            <StatCard label="Credit limit" value={c.credit.creditLimit} tone="primary" hint={c.credit.creditEnabled ? `${c.credit.creditDays} days · policy ${titleCase(c.outstanding.creditPolicy)}` : 'Credit disabled'} />
            <StatCard label="Available credit" value={c.outstanding.availableCredit} tone="success" />
          </div>
          <Tabs label="Customer sections" value={tab} onChange={setTab} tabs={[
            { value: 'overview', label: 'Overview' }, { value: 'orders', label: 'Orders' }, { value: 'invoices', label: 'Invoices' },
            { value: 'payments', label: 'Payments' }, { value: 'ledger', label: 'Ledger' }, { value: 'prices', label: 'Special prices' },
          ]} />
          {tab === 'overview' && (
            <div className="grid-2">
              <Card title="Profile" actions={canWrite && <Button size="sm" variant="secondary" onClick={() => setDialog('credit')}>Edit credit</Button>}>
                <KeyValue items={[
                  ['Contact', c.contactName], ['Mobile', c.mobileNumber], ['Alternate', c.alternateMobile], ['Email', c.email],
                  ['GSTIN', c.gstin], ['PAN', c.pan], ['Login', c.hasLogin ? 'Can sign in' : 'No login'], ['Credit', c.credit.creditEnabled ? 'Enabled' : 'Disabled'],
                  ['Credit days', String(c.credit.creditDays)], ['Policy override', c.credit.creditPolicyOverride ? titleCase(c.credit.creditPolicyOverride) : 'Business default'],
                  ['Notes', c.notes], ['Customer since', date(c.createdAt)],
                ]} />
              </Card>
              <Card title="Addresses">
                {c.addresses.length === 0 ? <EmptyState title="No address" /> : (
                  <ul className="list-plain">
                    {c.addresses.map((a) => (
                      <li key={a.id}><span>{a.label && <strong>{a.label}: </strong>}{a.addressLine1}{a.addressLine2 ? `, ${a.addressLine2}` : ''}, {a.city}, {a.state} ({a.stateCode}) – {a.pincode}</span>{a.isDefault && <StatusBadge status="DEFAULT" />}</li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          )}
          {tab === 'overview' && <CustomerTradeCards customer={c} onChanged={refresh} />}
          {tab === 'orders' && <CustomerOrders customerId={c.id} />}
          {tab === 'invoices' && <CustomerInvoices customerId={c.id} />}
          {tab === 'payments' && <CustomerPayments customerId={c.id} />}
          {tab === 'ledger' && <Ledger path={`/api/v1/customers/${c.id}/ledger`} />}
          {tab === 'prices' && <CustomerPrices customerId={c.id} />}
          <ConfirmDialog open={dialog === 'reject'} onClose={() => setDialog(null)} title="Reject registration" tone="danger" requireReason loading={status.isPending}
            message="The applicant is signed out and cannot order." onConfirm={(reason) => status.mutate({ path: 'reject', reason })} />
          <ConfirmDialog open={dialog === 'block'} onClose={() => setDialog(null)} title="Block customer" tone="danger" requireReason loading={status.isPending}
            message="The customer is signed out immediately and cannot order until unblocked." onConfirm={(reason) => status.mutate({ path: 'block', reason })} />
          <CreditDialog open={dialog === 'credit'} customer={c} onClose={() => setDialog(null)} onDone={refresh} />
          <RecordPaymentDialog open={dialog === 'payment'} onClose={() => setDialog(null)} customerId={c.id} onDone={refresh} />
        </div>
      )}
    </QueryState>
  )
}

function CreditDialog({ open, customer, onClose, onDone }: { open: boolean; customer: CustomerDetail; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const canOverride = useCan('CREDIT_OVERRIDE')
  const [enabled, setEnabled] = useState(customer.credit.creditEnabled)
  const [limit, setLimit] = useState(String(customer.credit.creditLimit))
  const [days, setDays] = useState(String(customer.credit.creditDays))
  const [policy, setPolicy] = useState(customer.credit.creditPolicyOverride ?? '')
  const save = useMutation({
    mutationFn: () => api.patch(`/api/v1/customers/${customer.id}/credit`, {
      creditEnabled: enabled, creditLimit: limit, creditDays: Number(days),
      ...(canOverride ? (policy ? { creditPolicy: policy } : { clearCreditPolicy: true }) : {}),
    }),
    onSuccess: () => { toast.success('Credit updated'); onClose(); onDone() },
    onError: (e) => toast.error(e),
  })
  return (
    <Modal open={open} onClose={onClose} title="Credit profile" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} onClick={() => save.mutate()}>Save</Button></>}>
      <div className="form-grid">
        <div className="span-2"><Switch label="Credit enabled" checked={enabled} onChange={setEnabled} /></div>
        <Field label="Credit limit" htmlFor="cr-l"><PriceInput id="cr-l" value={limit} onChange={(e) => setLimit(e.target.value)} /></Field>
        <Field label="Credit days" htmlFor="cr-d"><Input id="cr-d" type="number" min={0} max={365} value={days} onChange={(e) => setDays(e.target.value)} /></Field>
        <Field label="Over-limit policy" htmlFor="cr-p" className="span-2" hint={canOverride ? undefined : 'Changing the policy requires CREDIT_OVERRIDE'}>
          <Select id="cr-p" value={policy} disabled={!canOverride} onChange={(e) => setPolicy(e.target.value as typeof policy)} options={[
            { value: '', label: 'Use business default' }, { value: 'BLOCK', label: 'Block' }, { value: 'REQUIRE_ADMIN_APPROVAL', label: 'Require admin approval' }, { value: 'ALLOW', label: 'Allow' },
          ]} />
        </Field>
      </div>
    </Modal>
  )
}

function CustomerOrders({ customerId }: { customerId: string }) {
  const [page, setPage] = useState(1)
  const navigate = useNavigate()
  const q = useQuery({ queryKey: ['orders', 'customer', customerId, page], queryFn: () => api.page<Order>('/api/v1/orders', { customerId, page, pageSize: 10 }) })
  return (
    <Card padded={false}>
      <QueryState query={q} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No orders" />}>
        {(d) => (
          <>
            <DataTable rows={d.items} rowKey={(o) => o.id} onRowClick={(o) => navigate(`/app/orders/${o.id}`)} columns={[
              { key: 'n', header: 'Order', render: (o) => <strong>{o.orderNumber}</strong> },
              { key: 'd', header: 'Placed', render: (o) => date(o.placedAt) },
              { key: 's', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
              { key: 'p', header: 'Payment', render: (o) => <StatusBadge status={o.paymentStatus} /> },
              { key: 't', header: 'Total', align: 'right', render: (o) => money(o.grandTotal) },
            ]} />
            <Pagination meta={d.pagination} onPage={setPage} />
          </>
        )}
      </QueryState>
    </Card>
  )
}

function CustomerInvoices({ customerId }: { customerId: string }) {
  const [page, setPage] = useState(1)
  const navigate = useNavigate()
  const q = useQuery({ queryKey: ['invoices', 'customer', customerId, page], queryFn: () => api.page<Invoice>('/api/v1/invoices', { customerId, page, pageSize: 10 }) })
  return (
    <Card padded={false}>
      <QueryState query={q} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No invoices" />}>
        {(d) => (
          <>
            <DataTable rows={d.items} rowKey={(i) => i.id} onRowClick={(i) => navigate(`/app/invoices/${i.id}`)} columns={[
              { key: 'n', header: 'Invoice', render: (i) => <strong>{i.invoiceNumber ?? 'Draft'}</strong> },
              { key: 'd', header: 'Date', render: (i) => date(i.invoiceDate) },
              { key: 'du', header: 'Due', render: (i) => <span className={i.overdue ? 'danger-text' : ''}>{date(i.dueDate)}</span> },
              { key: 's', header: 'Status', render: (i) => <StatusBadge status={i.status} /> },
              { key: 't', header: 'Total', align: 'right', render: (i) => money(i.grandTotal) },
              { key: 'o', header: 'Outstanding', align: 'right', render: (i) => money(i.outstanding) },
            ]} />
            <Pagination meta={d.pagination} onPage={setPage} />
          </>
        )}
      </QueryState>
    </Card>
  )
}

function CustomerPayments({ customerId }: { customerId: string }) {
  const [page, setPage] = useState(1)
  const navigate = useNavigate()
  const q = useQuery({ queryKey: ['payments', 'customer', customerId, page], queryFn: () => api.page<Payment>('/api/v1/payments', { customerId, page, pageSize: 10 }) })
  return (
    <Card padded={false}>
      <QueryState query={q} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No payments" />}>
        {(d) => (
          <>
            <DataTable rows={d.items} rowKey={(p) => p.id} onRowClick={(p) => navigate(`/app/payments/${p.id}`)} columns={[
              { key: 'n', header: 'Payment', render: (p) => <strong>{p.paymentNumber}</strong> },
              { key: 'd', header: 'Date', render: (p) => dateTime(p.paidAt ?? p.createdAt) },
              { key: 'm', header: 'Method', render: (p) => titleCase(p.method) },
              { key: 's', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
              { key: 'a', header: 'Amount', align: 'right', render: (p) => money(p.amount) },
            ]} />
            <Pagination meta={d.pagination} onPage={setPage} />
          </>
        )}
      </QueryState>
    </Card>
  )
}

/** Customer statement: debit/credit with running balance (§10). */
export function Ledger({ path }: { path: string }) {
  const [page, setPage] = useState(1)
  const q = useQuery({ queryKey: ['ledger', path, page], queryFn: () => api.page<LedgerEntry>(path, { page, pageSize: 25 }) })
  return (
    <Card padded={false}>
      <QueryState query={q} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No transactions yet" />}>
        {(d) => (
          <>
            <DataTable rows={d.items} rowKey={(e) => e.id} caption="Ledger" columns={[
              { key: 'd', header: 'Date', render: (e) => date(e.date) },
              { key: 'r', header: 'Reference', render: (e) => <strong>{e.referenceNumber}</strong> },
              { key: 't', header: 'Type', render: (e) => titleCase(e.entryType) },
              { key: 'n', header: 'Narration', render: (e) => <span className="small muted">{e.narration}</span> },
              { key: 'dr', header: 'Debit', align: 'right', render: (e) => (e.debit > 0 ? money(e.debit) : '—') },
              { key: 'cr', header: 'Credit', align: 'right', render: (e) => (e.credit > 0 ? money(e.credit) : '—') },
              { key: 'b', header: 'Balance', align: 'right', render: (e) => <strong>{money(e.balance)}</strong> },
            ]} />
            <Pagination meta={d.pagination} onPage={setPage} />
          </>
        )}
      </QueryState>
    </Card>
  )
}

interface CustomerPrice {
  productId: string
  sku: string
  productName: string
  defaultPrice: number
  customerPrice: number
}

function CustomerPrices({ customerId }: { customerId: string }) {
  const qc = useQueryClient()
  const toast = useToast()
  const canCustomerWrite = useCan('CUSTOMER_WRITE')
  const canProductWrite = useCan('PRODUCT_WRITE')
  const canWrite = canCustomerWrite && canProductWrite
  const [adding, setAdding] = useState<{ id: string; name: string; price: string } | null>(null)
  const q = useQuery({ queryKey: ['prices', customerId], queryFn: () => api.get<CustomerPrice[]>(`/api/v1/customers/${customerId}/prices`) })
  const save = useMutation({
    mutationFn: ({ productId, price }: { productId: string; price: string }) => api.put(`/api/v1/customers/${customerId}/prices/${productId}`, { price }),
    onSuccess: () => { toast.success('Price saved'); setAdding(null); qc.invalidateQueries({ queryKey: ['prices', customerId] }) },
    onError: (e) => toast.error(e),
  })
  const remove = useMutation({
    mutationFn: (productId: string) => api.del(`/api/v1/customers/${customerId}/prices/${productId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prices', customerId] }),
  })
  return (
    <Card title="Customer-specific prices" padded={false} actions={canWrite && <div style={{ width: 320 }}><ProductPicker placeholder="Add a product price…" onPick={(p) => setAdding({ id: p.id, name: p.name, price: String(p.sellingPrice) })} /></div>}>
      <QueryState query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No special prices" description="This customer pays the default selling price." />}>
        {(d) => (
          <DataTable rows={d} rowKey={(p) => p.productId} columns={[
            { key: 'p', header: 'Product', render: (p) => <div>{p.productName}<div className="xs muted">{p.sku}</div></div> },
            { key: 'd', header: 'Default', align: 'right', render: (p) => money(p.defaultPrice) },
            { key: 'c', header: 'Customer price', align: 'right', render: (p) => <strong>{money(p.customerPrice)}</strong> },
            { key: 'x', header: '', render: (p) => canWrite && (
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <Button size="sm" variant="ghost" onClick={() => setAdding({ id: p.productId, name: p.productName, price: String(p.customerPrice) })}>Edit</Button>
                <IconButton label="Remove special price" onClick={() => remove.mutate(p.productId)}><Trash2 size={16} /></IconButton>
              </div>
            ) },
          ]} />
        )}
      </QueryState>
      <Modal open={!!adding} onClose={() => setAdding(null)} title={`Price for ${adding?.name ?? ''}`} footer={
        <><Button variant="secondary" onClick={() => setAdding(null)}>Cancel</Button><Button icon={<Plus size={16} />} loading={save.isPending} onClick={() => adding && save.mutate({ productId: adding.id, price: adding.price })}>Save price</Button></>
      }>
        <Field label="Price (before GST)" htmlFor="cp-price" hint="Applies to new orders and invoices only">
          <PriceInput id="cp-price" value={adding?.price ?? ''} onChange={(e) => adding && setAdding({ ...adding, price: e.target.value })} />
        </Field>
      </Modal>
    </Card>
  )
}
