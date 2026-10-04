import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CircleCheck, Download, Eye, FilePlus, MessageCircle, Printer, RotateCcw, Trash2, Wallet, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, IconButton } from '@/components/ui/Button'
import { Badge, Card, DataTable, KeyValue, PageHeader, Pagination, StatusBadge, TaxBreakdown } from '@/components/ui/Data'
import { Alert, EmptyState, QueryState, Spinner } from '@/components/ui/Feedback'
import { Field, Input, PriceInput, SearchInput, Select, Textarea } from '@/components/ui/Form'
import { PageActions } from '@/components/ui/PageActions'
import { ConfirmDialog, Modal } from '@/components/ui/Overlay'
import { useToast } from '@/components/ui/Toast'
import { RecordPaymentDialog } from '@/features/payments/RecordPaymentDialog'
import { ProductPicker } from '@/features/products/ProductPicker'
import { unitFactor, unitOptions } from '@/features/products/ProductOptions'
import { ChargesEditor, ChargesTable, LineDescription, SerialChooser } from './LineExtras'
import { InvoiceTradeCard, ProjectChooser } from '@/features/trade/TradeParts'
import type { ChargeLine } from './LineExtras'
import { useListParams } from '@/hooks/useListParams'
import { api, ApiError, download, newIdempotencyKey } from '@/services/api'
import type { CustomerSummary, Invoice, Party, Product, WhatsAppMessage } from '@/services/types'
import { useCan, useModule } from '@/stores/auth'
import { date, dateTime, money, quantity, titleCase, today } from '@/utils/format'

/** O20/AD09 Invoice list. */
export function InvoicesPage() {
  const list = useListParams()
  const navigate = useNavigate()
  const canWrite = useCan('INVOICE_WRITE')
  const q = useQuery({ queryKey: ['invoices', list.query], queryFn: () => api.page<Invoice>('/api/v1/invoices', { ...list.query, pageSize: 20 }) })
  return (
    <div className="stack">
      <PageHeader title="Invoices" subtitle="GST tax invoices for orders and counter sales" actions={canWrite && <Button icon={<FilePlus size={16} />} onClick={() => navigate('/app/invoices/new')}>Create invoice</Button>} />
      <Card padded={false}>
        <div className="toolbar">
          <SearchInput className="search" value={list.search} onChange={list.setSearch} placeholder="Invoice number or customer" />
          <Select aria-label="Status" value={list.get('status')} onChange={(e) => list.set('status', e.target.value)} style={{ width: 170 }} placeholder="Any status"
            options={['DRAFT', 'GENERATED', 'SENT', 'CREDIT', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'].map((v) => ({ value: v, label: titleCase(v) }))} />
          <Select aria-label="Source" value={list.get('source')} onChange={(e) => list.set('source', e.target.value)} style={{ width: 160 }} placeholder="Any source"
            options={[{ value: 'ORDER', label: 'Order-based' }, { value: 'MANUAL', label: 'Admin-created' }]} />
          <button className="chip" aria-pressed={list.get('overdue') === 'true'} onClick={() => list.set('overdue', list.get('overdue') === 'true' ? '' : 'true')}>Overdue only</button>
          <Input type="date" aria-label="From date" value={list.get('from')} onChange={(e) => list.set('from', e.target.value)} style={{ width: 150 }} />
          <Input type="date" aria-label="To date" value={list.get('to')} onChange={(e) => list.set('to', e.target.value)} style={{ width: 150 }} />
        </div>
        <QueryState query={q} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No invoices" />}>
          {(d) => (
            <>
              <DataTable rows={d.items} rowKey={(i) => i.id} onRowClick={(i) => navigate(`/app/invoices/${i.id}`)} sort={list.sort} onSortChange={list.setSort} columns={[
                { key: 'n', header: 'Invoice', sortKey: 'invoiceNumber', render: (i) => <div><strong>{i.invoiceNumber ?? 'Draft'}</strong><div className="xs muted">{i.source === 'ORDER' ? i.orderNumber : 'Counter sale'}</div></div> },
                { key: 'c', header: 'Customer', render: (i) => i.buyer?.name ?? '—' },
                { key: 'd', header: 'Date', sortKey: 'invoiceDate', render: (i) => date(i.invoiceDate) },
                { key: 'du', header: 'Due', render: (i) => <span className={i.overdue ? 'danger-text' : ''}>{i.dueDate ? date(i.dueDate) : '—'}</span> },
                { key: 's', header: 'Status', render: (i) => <div className="row" style={{ gap: 6 }}><StatusBadge status={i.status} />{i.overdue && <Badge tone="danger">Overdue</Badge>}</div> },
                { key: 't', header: 'Total', align: 'right', sortKey: 'grandTotal', render: (i) => money(i.grandTotal) },
                { key: 'o', header: 'Outstanding', align: 'right', render: (i) => (i.outstanding > 0 ? money(i.outstanding) : '—') },
              ]} />
              <Pagination meta={d.pagination} onPage={list.setPage} />
            </>
          )}
        </QueryState>
      </Card>
    </div>
  )
}

interface Line { key: string; product: Product; quantity: string; rate: string; discountPercent: string; unit: string; serials: string[] }

function useAllowedRates() {
  return useQuery({ queryKey: ['tax-settings'], queryFn: () => api.get<{ allowedGstRates: number[]; defaultGstRate: number }>('/api/v1/business/tax-settings'), staleTime: 300_000 })
}

/** O19/AD10 Admin-created invoice (§22.2). The backend prices, taxes and totals the invoice. */
export function CreateInvoicePage() {
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [paymentType, setPaymentType] = useState('CASH')
  const [invoiceDate, setInvoiceDate] = useState(today())
  const [lines, setLines] = useState<Line[]>([])
  const [header, setHeader] = useState({ transport: '', vehicleNumber: '', destination: '', buyerOrderNumber: '', notes: '' })
  const [draft, setDraft] = useState<Invoice | null>(null)
  const [charges, setCharges] = useState<ChargeLine[]>([])
  const [projectId, setProjectId] = useState('')
  const chargesOn = useModule('CHARGES')
  const rates = useAllowedRates()
  const key = useMemo(() => newIdempotencyKey(), [draft?.id])
  const customers = useQuery({ queryKey: ['customers', 'picker', search], queryFn: () => api.page<CustomerSummary>('/api/v1/customers', { q: search, status: 'APPROVED', pageSize: 20 }) })
  const create = useMutation({
    mutationFn: () => api.post<Invoice>('/api/v1/invoices', {
      customerId, paymentType, invoiceDate, projectId: projectId || undefined, ...Object.fromEntries(Object.entries(header).filter(([, v]) => v)),
      items: lines.map((l) => ({
        productId: l.product.id, quantity: l.quantity, rate: l.rate || undefined, discountPercent: l.discountPercent || undefined,
        unit: l.unit !== l.product.unit ? l.unit : undefined, serialNumbers: l.product.trackSerials ? l.serials : undefined,
      })),
      charges: chargesOn ? charges.filter((c) => Number(c.amount) > 0).map((c) => ({ type: c.type, description: c.description || undefined, amount: c.amount, taxRate: c.taxRate })) : undefined,
    }),
    onSuccess: (inv) => setDraft(inv),
  })
  const generate = useMutation({
    mutationFn: () => api.post<Invoice>(`/api/v1/invoices/${draft!.id}/generate`, undefined, { 'Idempotency-Key': key }),
    onSuccess: (inv) => {
      toast.success('Invoice generated', inv.invoiceNumber)
      qc.invalidateQueries({ queryKey: ['invoices'] })
      navigate(`/app/invoices/${inv.id}`)
    },
  })
  const anyError = create.error ?? generate.error
  const err = anyError instanceof ApiError ? anyError : null
  const update = (i: number, patch: Partial<Line>) => { setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l))); setDraft(null) }
  const valid = customerId && lines.length > 0 && lines.every((l) => Number(l.quantity) > 0
    && (!l.product.trackSerials || l.serials.length === Number(l.quantity) * unitFactor(l.product, l.unit)))

  return (
    <div className="stack">
      <PageHeader breadcrumb={<Link to="/app/invoices" className="row" style={{ gap: 4 }}><ArrowLeft size={14} /> Invoices</Link>} title="Create invoice"
        subtitle="Calculate to review GST and totals from the server, then generate. Stock leaves on generation." />
      <Card title="Customer & payment">
        <div className="form-grid">
          <Field label="Find customer" htmlFor="inv-cs"><Input id="inv-cs" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, code or mobile" /></Field>
          <Field label="Customer" htmlFor="inv-c" required>
            <Select id="inv-c" value={customerId} onChange={(e) => { setCustomerId(e.target.value); setProjectId(''); setDraft(null) }} placeholder="Select customer"
              options={(customers.data?.items ?? []).map((c) => ({ value: c.id, label: `${c.shopName} (${c.customerCode})` }))} />
          </Field>
          <Field label="Payment type" htmlFor="inv-pt" required>
            <Select id="inv-pt" value={paymentType} onChange={(e) => { setPaymentType(e.target.value); setDraft(null) }} options={['CASH', 'UPI', 'BANK_TRANSFER', 'CREDIT', 'OTHER'].map((v) => ({ value: v, label: v === 'CREDIT' ? 'Credit bill' : titleCase(v) }))} />
          </Field>
          <ProjectChooser idPrefix="inv" customerId={customerId} value={projectId} onChange={(id) => { setProjectId(id); setDraft(null) }} />
          <Field label="Invoice date" htmlFor="inv-d" hint="Back-dating requires Owner permission"><Input id="inv-d" type="date" max={today()} value={invoiceDate} onChange={(e) => { setInvoiceDate(e.target.value); setDraft(null) }} /></Field>
        </div>
      </Card>
      <Card title="Items" padded={false}>
        <div style={{ padding: 16 }}><ProductPicker exclude={lines.filter((l) => l.product.units.length === 0).map((l) => l.product.id)}
          onPick={(p) => { setLines([...lines, { key: `${p.id}-${Date.now()}`, product: p, quantity: '1', rate: '', discountPercent: '', unit: p.unit, serials: [] }]); setDraft(null) }} /></div>
        {lines.length === 0 ? <EmptyState title="No items" description="Search and add products." /> : (
          <DataTable rows={lines.map((l, i) => ({ ...l, i }))} rowKey={(l) => l.key} columns={[
            { key: 'p', header: 'Product', render: (l) => (
              <div className="stack-sm">
                <div><div style={{ fontWeight: 600 }}>{l.product.name}</div><div className="xs muted">{l.product.sku} · {l.product.gstRate}% GST · {quantity(l.product.available)} {l.product.unit} available{l.product.trackBatches ? ' · batches sold first-expiry-first-out' : ''}</div></div>
                {l.product.trackSerials && Number(l.quantity) > 0 && (
                  <SerialChooser productId={l.product.id} count={Number(l.quantity) * unitFactor(l.product, l.unit)} value={l.serials} onChange={(serials) => update(l.i, { serials })} />
                )}
              </div>
            ) },
            { key: 'q', header: 'Qty', align: 'right', render: (l) => (
              <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                <Input aria-label={`Quantity of ${l.product.name}`} type="number" min={0} step={l.product.decimalQuantity ? 'any' : 1} style={{ width: 80, textAlign: 'right' }} value={l.quantity} onChange={(e) => update(l.i, { quantity: e.target.value, serials: [] })} />
                {l.product.units.length > 0 ? (
                  <Select aria-label={`Unit of ${l.product.name}`} style={{ width: 110 }} value={l.unit} onChange={(e) => update(l.i, { unit: e.target.value, serials: [] })} options={unitOptions(l.product)} />
                ) : <span className="xs muted">{l.product.unit}</span>}
              </div>
            ) },
            { key: 'r', header: 'Rate', align: 'right', render: (l) => <PriceInput aria-label={`Rate of ${l.product.name}`} placeholder="Customer price" style={{ width: 150 }} value={l.rate} onChange={(e) => update(l.i, { rate: e.target.value })} /> },
            { key: 'd', header: 'Disc %', align: 'right', render: (l) => <Input aria-label={`Discount for ${l.product.name}`} type="number" min={0} max={100} step="0.01" style={{ width: 80, textAlign: 'right' }} value={l.discountPercent} onChange={(e) => update(l.i, { discountPercent: e.target.value })} /> },
            { key: 'x', header: '', render: (l) => <IconButton label={`Remove ${l.product.name}`} onClick={() => { setLines(lines.filter((_, idx) => idx !== l.i)); setDraft(null) }}><Trash2 size={16} /></IconButton> },
          ]} />
        )}
      </Card>
      {chargesOn && <ChargesEditor value={charges} onChange={(c) => { setCharges(c); setDraft(null) }} rates={rates.data?.allowedGstRates ?? [0, 5, 12, 18, 28]} />}
      <Card title="Dispatch details (optional)">
        <div className="form-grid">
          <Field label="Buyer's order no." htmlFor="h-bo"><Input id="h-bo" value={header.buyerOrderNumber} onChange={(e) => setHeader({ ...header, buyerOrderNumber: e.target.value })} /></Field>
          <Field label="Transport" htmlFor="h-t"><Input id="h-t" value={header.transport} onChange={(e) => setHeader({ ...header, transport: e.target.value })} /></Field>
          <Field label="Vehicle number" htmlFor="h-v"><Input id="h-v" value={header.vehicleNumber} onChange={(e) => setHeader({ ...header, vehicleNumber: e.target.value.toUpperCase() })} /></Field>
          <Field label="Destination" htmlFor="h-d"><Input id="h-d" value={header.destination} onChange={(e) => setHeader({ ...header, destination: e.target.value })} /></Field>
          <Field label="Notes" htmlFor="h-n" className="span-2"><Textarea id="h-n" value={header.notes} onChange={(e) => setHeader({ ...header, notes: e.target.value })} /></Field>
        </div>
      </Card>
      {draft && (
        <Card title={`Draft calculated by server · ${draft.interState ? 'Inter-state (IGST)' : 'Intra-state (CGST + SGST)'}`} padded={false}>
          {(draft.items ?? []).some((i) => i.freeItem || i.schemeName) && (
            <DataTable rows={draft.items ?? []} rowKey={(i) => i.id} caption="Lines with schemes" columns={[
              { key: 'p', header: 'Line', render: (i) => <LineDescription i={i} /> },
              { key: 'q', header: 'Qty', align: 'right', render: (i) => `${quantity(i.quantity)} ${i.unit}` },
              { key: 'd', header: 'Disc', align: 'right', render: (i) => (i.discountAmount > 0 ? `${i.discountPercent}%` : '—') },
              { key: 'a', header: 'Amount', align: 'right', render: (i) => money(i.lineTotal) },
            ]} />
          )}
          <ChargesTable charges={draft.charges} />
          <div className="card-body" style={{ display: 'flex', justifyContent: 'flex-end' }}><div style={{ width: 'min(360px, 100%)' }}><TaxBreakdown t={draft} /></div></div>
        </Card>
      )}
      {err && <Alert tone="danger">{err.message}</Alert>}
      <div className="form-actions">
        <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
        {!draft ? (
          <Button disabled={!valid} loading={create.isPending} onClick={() => create.mutate()}>Calculate (save draft)</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={() => navigate(`/app/invoices/${draft.id}`)}>Keep as draft</Button>
            <Button icon={<CircleCheck size={16} />} loading={generate.isPending} onClick={() => generate.mutate()}>Generate invoice</Button>
          </>
        )}
      </div>
    </div>
  )
}

function PartyBlock({ title, p }: { title: string; p: Party }) {
  return (
    <div className="stack-sm">
      <span className="xs muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{title}</span>
      <strong>{p.name ?? '—'}</strong>
      {p.contactName && <span className="small">Attn: {p.contactName}</span>}
      <span className="small muted">{[p.address, p.city, p.state, p.pincode].filter(Boolean).join(', ')}</span>
      <span className="small">GSTIN: {p.gstin ?? 'Unregistered'}{p.stateCode ? ` · State code ${p.stateCode}` : ''}</span>
      {p.phone && <span className="small muted">{p.phone}</span>}
    </div>
  )
}

/** O21/AD11 Invoice detail & preview. */
export function InvoiceDetailPage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const toast = useToast()
  const canWrite = useCan('INVOICE_WRITE')
  const canPay = useCan('PAYMENT_WRITE')
  const [dialog, setDialog] = useState<'cancel' | 'payment' | 'preview' | 'credit' | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const generateKey = useMemo(() => newIdempotencyKey(), [])
  const q = useQuery({ queryKey: ['invoice', id], queryFn: () => api.get<Invoice>(`/api/v1/invoices/${id}`) })
  const messages = useQuery({
    queryKey: ['invoice', id, 'whatsapp'],
    queryFn: () => api.get<WhatsAppMessage[]>(`/api/v1/invoices/${id}/whatsapp-messages`),
    refetchInterval: (query) => (query.state.data?.some((m) => m.status === 'QUEUED' || m.status === 'SENDING') ? 2000 : false),
  })
  const refresh = () => { qc.invalidateQueries({ queryKey: ['invoice', id] }); qc.invalidateQueries({ queryKey: ['invoices'] }) }
  const generate = useMutation({ mutationFn: () => api.post(`/api/v1/invoices/${id}/generate`, undefined, { 'Idempotency-Key': generateKey }), onSuccess: () => { toast.success('Invoice generated'); refresh() }, onError: (e) => toast.error(e) })
  const cancel = useMutation({ mutationFn: (reason: string) => api.post(`/api/v1/invoices/${id}/cancel`, { reason }), onSuccess: () => { toast.success('Invoice cancelled'); setDialog(null); refresh() }, onError: (e) => toast.error(e) })
  const send = useMutation({
    mutationFn: () => api.post<WhatsAppMessage>(`/api/v1/invoices/${id}/send-whatsapp`, undefined, { 'Idempotency-Key': newIdempotencyKey() }),
    onSuccess: () => { toast.success('Queued for WhatsApp delivery'); qc.invalidateQueries({ queryKey: ['invoice', id, 'whatsapp'] }) },
    onError: (e) => toast.error(e),
  })
  const retry = useMutation({ mutationFn: (mid: string) => api.post(`/api/v1/invoices/whatsapp-messages/${mid}/retry`), onSuccess: () => qc.invalidateQueries({ queryKey: ['invoice', id, 'whatsapp'] }), onError: (e) => toast.error(e) })

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl) }, [pdfUrl])
  const openPreview = async () => {
    setDialog('preview')
    try {
      const { url } = await api.blobUrl(`/api/v1/invoices/${id}/pdf`)
      setPdfUrl(url)
    } catch (e) {
      toast.error(e)
      setDialog(null)
    }
  }

  return (
    <QueryState query={q}>
      {(inv) => (
        <div className="stack">
          <PageHeader
            breadcrumb={<Link to="/app/invoices" className="row" style={{ gap: 4 }}><ArrowLeft size={14} /> Invoices</Link>}
            title={<span className="row">{inv.invoiceNumber ?? 'Draft invoice'} <StatusBadge status={inv.status} />{inv.overdue && <Badge tone="danger">Overdue</Badge>}</span>}
            subtitle={`${inv.paymentType === 'CREDIT' ? 'Credit bill' : titleCase(inv.paymentType)} · ${date(inv.invoiceDate)}${inv.orderNumber ? ` · Order ${inv.orderNumber}` : ''}`}
            actions={
              <PageActions
                primary={canWrite && inv.status === 'DRAFT'
                  ? { key: 'generate', label: 'Generate', icon: <CircleCheck size={16} />, loading: generate.isPending, onClick: () => generate.mutate() }
                  : { key: 'payment', label: 'Record payment', icon: <Wallet size={16} />, show: canPay && inv.outstanding > 0, onClick: () => setDialog('payment') }}
                actions={[
                  { key: 'preview', label: 'Preview', icon: <Eye size={16} />, onClick: openPreview },
                  { key: 'pdf', label: 'PDF', icon: <Download size={16} />, onClick: () => download(`/api/v1/invoices/${inv.id}/pdf`, undefined, 'invoice.pdf') },
                  { key: 'send', label: 'Send WhatsApp', icon: <MessageCircle size={16} />, show: canWrite && !['DRAFT', 'CANCELLED'].includes(inv.status), loading: send.isPending, onClick: () => send.mutate() },
                  { key: 'cancel', label: 'Cancel', icon: <XCircle size={16} />, variant: 'ghost', show: canWrite && inv.status !== 'CANCELLED', onClick: () => setDialog('cancel') },
                ]}
              />
            }
          />
          {inv.status === 'CANCELLED' && <Alert tone="danger" title="Cancelled">{inv.cancelReason}</Alert>}
          {inv.einvoiceStatus === 'TEST_IRN' && <Alert tone="warning" title="TEST ONLY e-invoice reference">This IRN comes from the mock e-invoice provider and is not government-issued.</Alert>}
          <div className="detail-grid">
            <div className="stack">
              <Card>
                <div className="grid-2">
                  <PartyBlock title="Seller" p={inv.seller} />
                  <PartyBlock title="Buyer (bill to)" p={inv.buyer} />
                </div>
              </Card>
              <Card title="Items" padded={false}>
                <DataTable rows={inv.items ?? []} rowKey={(i) => i.id} columns={[
                  { key: 'n', header: '#', render: (i) => i.lineNumber },
                  { key: 'p', header: 'Description', render: (i) => <LineDescription i={i} /> },
                  { key: 'h', header: 'HSN', render: (i) => i.hsnCode ?? '—' },
                  { key: 'q', header: 'Qty', align: 'right', render: (i) => `${quantity(i.quantity)} ${i.unit}` },
                  { key: 'r', header: 'Rate', align: 'right', render: (i) => money(i.rate) },
                  { key: 'd', header: 'Disc', align: 'right', render: (i) => (i.discountAmount > 0 ? `${i.discountPercent}%` : '—') },
                  { key: 't', header: 'Taxable', align: 'right', render: (i) => money(i.taxableAmount) },
                  { key: 'g', header: 'GST', align: 'right', render: (i) => `${i.taxRate}%` },
                  { key: 'a', header: 'Amount', align: 'right', render: (i) => money(i.lineTotal) },
                  { key: 'rt', header: 'Returned', align: 'right', render: (i) => (i.returnedQuantity > 0 ? quantity(i.returnedQuantity) : '') },
                ]} />
                <ChargesTable charges={inv.charges} />
                <div className="card-body grid-2">
                  <div className="stack-sm small">
                    <strong>Amount in words</strong>
                    <span className="muted">{inv.amountInWords ?? 'Calculated on generation'}</span>
                    {inv.taxSummary?.length ? (
                      <table className="table" style={{ marginTop: 8 }}>
                        <thead><tr><th>HSN</th><th className="right">Taxable</th><th className="right">Rate</th><th className="right">Tax</th></tr></thead>
                        <tbody>{inv.taxSummary.map((t) => <tr key={`${t.hsnCode}-${t.taxRate}`}><td data-label="HSN">{t.hsnCode ?? '—'}</td><td data-label="Taxable" className="right num">{money(t.taxableAmount)}</td><td data-label="Rate" className="right">{t.taxRate}%</td><td data-label="Tax" className="right num">{money(t.totalTax)}</td></tr>)}</tbody>
                      </table>
                    ) : null}
                  </div>
                  <TaxBreakdown t={inv} />
                </div>
              </Card>
              {(inv.creditNotes?.length ?? 0) > 0 && (
                <Card title="Credit notes" padded={false}>
                  <DataTable rows={inv.creditNotes!} rowKey={(c) => c.id} columns={[
                    { key: 'n', header: 'Number', render: (c) => c.creditNoteNumber },
                    { key: 'd', header: 'Date', render: (c) => date(c.noteDate) },
                    { key: 'r', header: 'Reason', render: (c) => <div>{titleCase(c.reasonType)}<div className="xs muted">{c.reason}</div></div> },
                    { key: 't', header: 'Amount', align: 'right', render: (c) => money(c.grandTotal) },
                  ]} />
                </Card>
              )}
            </div>
            <div className="stack">
              <Card title="Payment">
                <KeyValue items={[
                  ['Total', money(inv.grandTotal)], ['Credit notes', inv.creditedAmount > 0 ? `−${money(inv.creditedAmount)}` : '—'], ['Paid', money(inv.paidAmount)],
                  ['Outstanding', <strong key="o" className={inv.outstanding > 0 ? 'warning-text' : 'success-text'}>{money(inv.outstanding)}</strong>],
                  ['Due date', inv.dueDate ? date(inv.dueDate) : '—'], ['Terms', inv.paymentTerms],
                ]} />
                {canWrite && ['GENERATED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'CREDIT'].includes(inv.status) && (
                  <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} style={{ marginTop: 12 }} onClick={() => setDialog('credit')}>Issue credit note</Button>
                )}
              </Card>
              <Card title="Details">
                <KeyValue items={[
                  ['Source', inv.source === 'ORDER' ? 'Order' : inv.source === 'CHALLAN' ? 'Delivery challan' : 'Admin-created'], ['Order', inv.orderId ? <Link key="o" to={`/app/orders/${inv.orderId}`}>{inv.orderNumber}</Link> : undefined],
                  ['Buyer order no.', inv.buyerOrderNumber], ['Transport', inv.transport], ['Vehicle', inv.vehicleNumber], ['Destination', inv.destination],
                  ['E-invoice', titleCase(inv.einvoiceStatus)], ['IRN', inv.irn ? <span key="i" className="mono xs">{inv.irn}</span> : undefined],
                  ['Generated', dateTime(inv.generatedAt)], ['Notes', inv.notes],
                ]} />
              </Card>
              <InvoiceTradeCard inv={inv} onChanged={refresh} />
              <Card title="WhatsApp delivery">
                {messages.isLoading ? <Spinner /> : messages.data?.length ? (
                  <ul className="list-plain">
                    {messages.data.map((m) => (
                      <li key={m.id}>
                        <span className="stack-sm" style={{ gap: 2 }}>
                          <span className="small">{m.recipient} · {dateTime(m.queuedAt)}</span>
                          {m.failureReason && <span className="xs danger-text">{m.failureReason}{m.nextRetryAt ? ` · retry ${dateTime(m.nextRetryAt)}` : ''}</span>}
                        </span>
                        <span className="row" style={{ gap: 6 }}>
                          <StatusBadge status={m.status} />
                          {m.status === 'FAILED' && canWrite && <Button size="sm" variant="ghost" onClick={() => retry.mutate(m.id)}>Retry</Button>}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="small muted">Not sent yet.</p>}
              </Card>
            </div>
          </div>
          <ConfirmDialog open={dialog === 'cancel'} onClose={() => setDialog(null)} title="Cancel invoice" tone="danger" requireReason loading={cancel.isPending} confirmLabel="Cancel invoice"
            message="The invoice is kept for audit and marked cancelled. The ledger is reversed, payments become customer credit, and stock returns for admin-created invoices."
            onConfirm={(r) => cancel.mutate(r)} />
          <RecordPaymentDialog open={dialog === 'payment'} onClose={() => setDialog(null)} customerId={inv.customerId} invoiceId={inv.id} maxAmount={inv.outstanding} onDone={refresh} />
          <CreditNoteDialog open={dialog === 'credit'} invoice={inv} onClose={() => setDialog(null)} onDone={refresh} />
          <Modal open={dialog === 'preview'} onClose={() => { setDialog(null); setPdfUrl(null) }} title={`Invoice ${inv.invoiceNumber ?? '(draft)'}`} wide
            footer={pdfUrl && <Button icon={<Printer size={16} />} onClick={() => window.open(pdfUrl, '_blank', 'noopener')}>Open & print</Button>}>
            {pdfUrl ? <iframe className="pdf-frame" src={pdfUrl} title="Invoice PDF preview" /> : <Spinner label="Rendering PDF" />}
          </Modal>
        </div>
      )}
    </QueryState>
  )
}

function CreditNoteDialog({ open, invoice, onClose, onDone }: { open: boolean; invoice: Invoice; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [qty, setQty] = useState<Record<string, string>>({})
  const [reasonType, setReasonType] = useState('PRICE_ADJUSTMENT')
  const [reason, setReason] = useState('')
  const save = useMutation({
    mutationFn: () => api.post(`/api/v1/invoices/${invoice.id}/credit-notes`, {
      reasonType, reason, items: Object.entries(qty).filter(([, v]) => Number(v) > 0).map(([invoiceItemId, quantity]) => ({ invoiceItemId, quantity })),
    }),
    onSuccess: () => { toast.success('Credit note issued'); setQty({}); setReason(''); onClose(); onDone() },
    onError: (e) => toast.error(e),
  })
  return (
    <Modal open={open} onClose={onClose} title="Issue credit note" wide footer={
      <><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={reason.trim().length < 3 || !Object.values(qty).some((v) => Number(v) > 0)} onClick={() => save.mutate()}>Issue credit note</Button></>
    }>
      <div className="stack">
        <p className="small muted">Credited at the invoice's net rate and GST. Use Sales Returns for goods that come back to stock.</p>
        <DataTable rows={invoice.items ?? []} rowKey={(i) => i.id} columns={[
          { key: 'p', header: 'Product', render: (i) => i.productName },
          { key: 'q', header: 'Invoiced', align: 'right', render: (i) => quantity(i.quantity) },
          { key: 'c', header: 'Credit qty', align: 'right', render: (i) => <Input aria-label={`Credit quantity for ${i.productName}`} type="number" min={0} max={i.quantity} step="any" style={{ width: 100, textAlign: 'right' }} value={qty[i.id] ?? ''} onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })} /> },
        ]} />
        <div className="form-grid">
          <Field label="Reason type" htmlFor="cn-t"><Select id="cn-t" value={reasonType} onChange={(e) => setReasonType(e.target.value)} options={[{ value: 'PRICE_ADJUSTMENT', label: 'Price adjustment' }, { value: 'OTHER', label: 'Other' }]} /></Field>
          <Field label="Reason" htmlFor="cn-r" required><Input id="cn-r" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  )
}
