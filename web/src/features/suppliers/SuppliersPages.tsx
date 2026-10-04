import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Pencil, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card, DataTable, KeyValue, PageHeader, Pagination, StatusBadge } from '@/components/ui/Data'
import { Alert, EmptyState, QueryState } from '@/components/ui/Feedback'
import { Field, Input, SearchInput, Select, Switch } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Overlay'
import { useToast } from '@/components/ui/Toast'
import { STATES } from '@/features/auth/RegisterPage'
import { useListParams } from '@/hooks/useListParams'
import { api, ApiError } from '@/services/api'
import type { Purchase, Supplier } from '@/services/types'
import { PortalAccessCard } from '@/features/procurement/PortalAccessCard'
import { useCan } from '@/stores/auth'
import { date, money, titleCase } from '@/utils/format'

/** O16 Suppliers. */
export function SuppliersPage() {
  const list = useListParams()
  const navigate = useNavigate()
  const canWrite = useCan('SUPPLIER_WRITE')
  const [creating, setCreating] = useState(false)
  const q = useQuery({ queryKey: ['suppliers', list.query], queryFn: () => api.page<Supplier>('/api/v1/suppliers', { ...list.query, pageSize: 20 }) })
  return (
    <div className="stack">
      <PageHeader title="Suppliers" subtitle="Vendors you purchase stock from" actions={canWrite && <Button icon={<Plus size={16} />} onClick={() => setCreating(true)}>Add supplier</Button>} />
      <Card padded={false}>
        <div className="toolbar"><SearchInput className="search" value={list.search} onChange={list.setSearch} placeholder="Name, code, GSTIN or mobile" /></div>
        <QueryState query={q} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No suppliers" />}>
          {(d) => (
            <>
              <DataTable rows={d.items} rowKey={(s) => s.id} onRowClick={(s) => navigate(`/app/suppliers/${s.id}`)} sort={list.sort} onSortChange={list.setSort} columns={[
                { key: 'n', header: 'Supplier', sortKey: 'name', render: (s) => <div><div style={{ fontWeight: 600 }}>{s.name}</div><div className="xs muted">{s.supplierCode}</div></div> },
                { key: 'c', header: 'Contact', render: (s) => <div>{s.contactPerson ?? '—'}<div className="xs muted">{s.mobileNumber}</div></div> },
                { key: 'g', header: 'GSTIN', render: (s) => <span className="mono xs">{s.gstin ?? '—'}</span> },
                { key: 't', header: 'Terms', render: (s) => s.paymentTerms ?? `${s.creditDays} days` },
                { key: 's', header: 'Status', render: (s) => <StatusBadge status={s.active ? 'ACTIVE' : 'INACTIVE'} /> },
                { key: 'o', header: 'Payable', align: 'right', render: (s) => money(s.outstanding) },
              ]} />
              <Pagination meta={d.pagination} onPage={list.setPage} />
            </>
          )}
        </QueryState>
      </Card>
      <SupplierDialog open={creating} onClose={() => setCreating(false)} onSaved={(s) => navigate(`/app/suppliers/${s.id}`)} />
    </div>
  )
}

function SupplierDialog({ open, supplier, onClose, onSaved }: { open: boolean; supplier?: Supplier; onClose: () => void; onSaved: (s: Supplier) => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const blank = { name: '', contactPerson: '', mobileNumber: '', email: '', gstin: '', pan: '', paymentTerms: '', creditDays: '30', active: true, addressLine1: '', city: '', state: 'Tamil Nadu', pincode: '' }
  const [f, setF] = useState(blank)
  useEffect(() => {
    if (!open) return
    setF(supplier ? {
      name: supplier.name, contactPerson: supplier.contactPerson ?? '', mobileNumber: supplier.mobileNumber?.replace('+91', '') ?? '', email: supplier.email ?? '',
      gstin: supplier.gstin ?? '', pan: supplier.pan ?? '', paymentTerms: supplier.paymentTerms ?? '', creditDays: String(supplier.creditDays), active: supplier.active,
      addressLine1: supplier.address?.addressLine1 ?? '', city: supplier.address?.city ?? '', state: supplier.address?.state ?? 'Tamil Nadu', pincode: supplier.address?.pincode ?? '',
    } : blank)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, supplier])
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: f.name, contactPerson: f.contactPerson, mobileNumber: f.mobileNumber || undefined, email: f.email || undefined,
        gstin: f.gstin ? f.gstin.toUpperCase() : undefined, pan: f.pan ? f.pan.toUpperCase() : undefined, paymentTerms: f.paymentTerms, creditDays: Number(f.creditDays || 0), active: f.active,
        address: f.addressLine1 ? { addressLine1: f.addressLine1, city: f.city, state: f.state, pincode: f.pincode } : undefined,
      }
      return supplier ? api.patch<Supplier>(`/api/v1/suppliers/${supplier.id}`, body) : api.post<Supplier>('/api/v1/suppliers', body)
    },
    onSuccess: (s) => { toast.success('Supplier saved'); qc.invalidateQueries({ queryKey: ['suppliers'] }); qc.invalidateQueries({ queryKey: ['supplier', s.id] }); onClose(); onSaved(s) },
  })
  const err = save.error instanceof ApiError ? save.error : null
  return (
    <Modal open={open} onClose={onClose} title={supplier ? 'Edit supplier' : 'Add supplier'} wide footer={
      <><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={f.name.trim().length < 2} onClick={() => save.mutate()}>Save</Button></>
    }>
      <div className="form-grid">
        <Field label="Name" htmlFor="s-name" required className="span-2"><Input id="s-name" value={f.name} onChange={set('name')} /></Field>
        <Field label="Contact person" htmlFor="s-cp"><Input id="s-cp" value={f.contactPerson} onChange={set('contactPerson')} /></Field>
        <Field label="Mobile" htmlFor="s-m" error={err?.fieldError('mobileNumber')}><Input id="s-m" inputMode="numeric" maxLength={10} value={f.mobileNumber} onChange={set('mobileNumber')} /></Field>
        <Field label="Email" htmlFor="s-e"><Input id="s-e" type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="GSTIN" htmlFor="s-g" error={err?.fieldError('gstin')}><Input id="s-g" maxLength={15} value={f.gstin} onChange={set('gstin')} style={{ textTransform: 'uppercase' }} /></Field>
        <Field label="PAN" htmlFor="s-p" error={err?.fieldError('pan')}><Input id="s-p" maxLength={10} value={f.pan} onChange={set('pan')} style={{ textTransform: 'uppercase' }} /></Field>
        <Field label="Payment terms" htmlFor="s-t"><Input id="s-t" value={f.paymentTerms} onChange={set('paymentTerms')} placeholder="e.g. Net 30" /></Field>
        <Field label="Credit days" htmlFor="s-cd"><Input id="s-cd" type="number" min={0} value={f.creditDays} onChange={set('creditDays')} /></Field>
        <Field label="Address" htmlFor="s-a1" className="span-2"><Input id="s-a1" value={f.addressLine1} onChange={set('addressLine1')} /></Field>
        <Field label="City" htmlFor="s-c"><Input id="s-c" value={f.city} onChange={set('city')} /></Field>
        <Field label="State" htmlFor="s-st"><Select id="s-st" value={f.state} onChange={set('state')} options={STATES.map((s) => ({ value: s, label: s }))} /></Field>
        <Field label="Pincode" htmlFor="s-pin"><Input id="s-pin" maxLength={6} value={f.pincode} onChange={set('pincode')} /></Field>
        <div><Switch label="Active" checked={f.active} onChange={(v) => setF({ ...f, active: v })} /></div>
        {err && <div className="span-2"><Alert tone="danger">{err.message}</Alert></div>}
      </div>
    </Modal>
  )
}

interface SupplierLedgerRow { id: string; date: string; entryType: string; referenceNumber: string; debit: number; credit: number; balance: number; narration?: string }

export function SupplierDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const canWrite = useCan('SUPPLIER_WRITE')
  const [editing, setEditing] = useState(false)
  const q = useQuery({ queryKey: ['supplier', id], queryFn: () => api.get<Supplier>(`/api/v1/suppliers/${id}`) })
  const ledger = useQuery({ queryKey: ['supplier', id, 'ledger'], queryFn: () => api.page<SupplierLedgerRow>(`/api/v1/suppliers/${id}/ledger`, { pageSize: 50 }) })
  const purchases = useQuery({ queryKey: ['purchases', 'supplier', id], queryFn: () => api.page<Purchase>('/api/v1/purchases', { supplierId: id, pageSize: 10 }) })
  return (
    <QueryState query={q}>
      {(s) => (
        <div className="stack">
          <PageHeader breadcrumb={<Link to="/app/suppliers" className="row" style={{ gap: 4 }}><ArrowLeft size={14} /> Suppliers</Link>}
            title={<span className="row">{s.name} <StatusBadge status={s.active ? 'ACTIVE' : 'INACTIVE'} /></span>} subtitle={s.supplierCode}
            actions={canWrite && <Button variant="secondary" icon={<Pencil size={16} />} onClick={() => setEditing(true)}>Edit</Button>} />
          <div className="detail-grid">
            <div className="stack">
              <Card title="Ledger" padded={false}>
                <QueryState query={ledger} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No transactions" />}>
                  {(d) => (
                    <DataTable rows={d.items} rowKey={(e) => e.id} columns={[
                      { key: 'd', header: 'Date', render: (e) => date(e.date) },
                      { key: 'r', header: 'Reference', render: (e) => e.referenceNumber },
                      { key: 't', header: 'Type', render: (e) => titleCase(e.entryType) },
                      { key: 'dr', header: 'Paid / returned', align: 'right', render: (e) => (e.debit > 0 ? money(e.debit) : '—') },
                      { key: 'cr', header: 'Purchased', align: 'right', render: (e) => (e.credit > 0 ? money(e.credit) : '—') },
                      { key: 'b', header: 'Payable', align: 'right', render: (e) => <strong>{money(e.balance)}</strong> },
                    ]} />
                  )}
                </QueryState>
              </Card>
              <Card title="Recent purchases" padded={false}>
                <QueryState query={purchases} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No purchases" />}>
                  {(d) => (
                    <DataTable rows={d.items} rowKey={(p) => p.id} onRowClick={(p) => navigate(`/app/purchases/${p.id}`)} columns={[
                      { key: 'n', header: 'Purchase', render: (p) => p.purchaseNumber },
                      { key: 'd', header: 'Date', render: (p) => date(p.purchaseDate) },
                      { key: 's', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
                      { key: 't', header: 'Total', align: 'right', render: (p) => money(p.grandTotal) },
                    ]} />
                  )}
                </QueryState>
              </Card>
            </div>
            <div className="stack">
            <PortalAccessCard supplierId={s.id} defaultMobile={s.mobileNumber} />
            <Card title="Details">
              <KeyValue items={[
                ['Payable', <strong key="o">{money(s.outstanding)}</strong>], ['Contact', s.contactPerson], ['Mobile', s.mobileNumber], ['Email', s.email],
                ['GSTIN', s.gstin], ['PAN', s.pan], ['Terms', s.paymentTerms], ['Credit days', String(s.creditDays)],
                ['Address', s.address ? `${s.address.addressLine1}, ${s.address.city}, ${s.address.state} – ${s.address.pincode}` : undefined],
              ]} />
            </Card>
            </div>
          </div>
          <SupplierDialog open={editing} supplier={s} onClose={() => setEditing(false)} onSaved={() => undefined} />
        </div>
      )}
    </QueryState>
  )
}
