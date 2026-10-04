import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight, Plus, Trash2, Warehouse } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, IconButton } from '@/components/ui/Button'
import { Card, DataTable, PageHeader, StatusBadge, Tabs } from '@/components/ui/Data'
import { Alert, EmptyState, QueryState } from '@/components/ui/Feedback'
import { Field, Input, SearchInput, Select, Switch, Textarea } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Overlay'
import { useToast } from '@/components/ui/Toast'
import { ProductPicker } from '@/features/products/ProductPicker'
import { api, ApiError } from '@/services/api'
import type { Branch, BranchStockRow, Product, StockTransfer } from '@/services/types'
import { useAuthStore, useCan, useModule } from '@/stores/auth'
import { useBranchStore } from '@/stores/branch'
import { date, quantity, titleCase } from '@/utils/format'

export function useBranches(enabled = true) {
  return useQuery({ queryKey: ['branches'], enabled, queryFn: () => api.get<Branch[]>('/api/v1/branches'), staleTime: 60_000 })
}

/** Working-branch chooser (BRANCHES module): in the header on wide screens, on the Branches page everywhere. */
export function BranchSwitcher({ inHeader = false }: { inHeader?: boolean }) {
  const on = useModule('BRANCHES')
  const businessId = useAuthStore((s) => s.user?.business?.id ?? null)
  const { branchId, load, choose } = useBranchStore()
  const qc = useQueryClient()
  const branches = useBranches(on)
  useEffect(() => load(on ? businessId : null), [on, businessId, load])
  const active = (branches.data ?? []).filter((b) => b.active)
  if (!on || active.length < 2) return null
  const current = active.find((b) => b.id === branchId) ?? active.find((b) => b.isDefault)
  return (
    <Select aria-label="Working branch" className={inHeader ? 'desktop-only' : undefined} style={{ width: inHeader ? 180 : 240 }} value={current?.id ?? ''}
      onChange={(e) => { choose(e.target.value); qc.invalidateQueries() }}
      options={active.map((b) => ({ value: b.id, label: b.isDefault ? `${b.name} (main)` : b.name }))} />
  )
}

/** Branches / warehouses, stock per branch and transfers (§0B.14). */
export function BranchesPage() {
  const canManage = useCan('SETTINGS_MANAGE')
  const canMove = useCan('STOCK_WRITE')
  const [tab, setTab] = useState<'branches' | 'stock' | 'transfers'>('branches')
  const [editing, setEditing] = useState<Branch | 'new' | null>(null)
  const [moving, setMoving] = useState(false)
  const branches = useBranches()
  return (
    <div className="stack">
      <PageHeader title="Branches & warehouses" subtitle="Stock is kept per branch; the main branch holds whatever is not in another one"
        actions={<div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {canMove && <Button variant="secondary" icon={<ArrowLeftRight size={16} />} onClick={() => setMoving(true)}>Transfer stock</Button>}
          {canManage && <Button icon={<Plus size={16} />} onClick={() => setEditing('new')}>Add branch</Button>}
        </div>} />
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}><span className="small muted">Working at</span><BranchSwitcher /></div>
      <Tabs label="Sections" value={tab} onChange={setTab} tabs={[{ value: 'branches', label: 'Branches' }, { value: 'stock', label: 'Stock by branch' }, { value: 'transfers', label: 'Transfers' }]} />
      {tab === 'branches' && (
        <Card padded={false}>
          <QueryState query={branches} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No branches" />}>
            {(d) => (
              <DataTable rows={d} rowKey={(b) => b.id} onRowClick={canManage ? (b) => setEditing(b) : undefined} columns={[
                { key: 'n', header: 'Branch', render: (b) => <div><strong>{b.name}</strong>{b.isDefault && <span className="xs muted"> · main</span>}<div className="xs muted">{b.code} · {titleCase(b.kind)}</div></div> },
                { key: 'c', header: 'City', priority: 'low', render: (b) => b.city ?? '—' },
                { key: 'p', header: 'Products in stock', align: 'right', render: (b) => b.productsInStock },
                { key: 's', header: 'Status', render: (b) => <StatusBadge status={b.active ? 'ACTIVE' : 'INACTIVE'} /> },
              ]} />
            )}
          </QueryState>
        </Card>
      )}
      {tab === 'stock' && <BranchStock branches={branches.data ?? []} />}
      {tab === 'transfers' && <Transfers />}
      <BranchDialog branch={editing} onClose={() => setEditing(null)} />
      <TransferDialog open={moving} branches={(branches.data ?? []).filter((b) => b.active)} onClose={() => setMoving(false)} onDone={() => { setMoving(false); setTab('transfers') }} />
    </div>
  )
}

function BranchStock({ branches }: { branches: Branch[] }) {
  const [branchId, setBranchId] = useState('')
  const [q, setQ] = useState('')
  const chosen = branchId || branches.find((b) => b.isDefault)?.id || ''
  const stock = useQuery({ queryKey: ['branch-stock', chosen, q], enabled: !!chosen, queryFn: () => api.get<BranchStockRow[]>(`/api/v1/branches/${chosen}/stock`, { q: q || undefined }) })
  return (
    <Card padded={false}>
      <div className="toolbar">
        <Select aria-label="Branch" value={chosen} onChange={(e) => setBranchId(e.target.value)} style={{ width: 220 }} options={branches.map((b) => ({ value: b.id, label: b.name }))} />
        <SearchInput className="search" value={q} onChange={setQ} placeholder="Product or SKU" />
      </div>
      <QueryState query={stock} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No stock at this branch" />}>
        {(d) => (
          <DataTable rows={d} rowKey={(r) => r.productId} columns={[
            { key: 'p', header: 'Product', render: (r) => <div><strong>{r.productName}</strong><div className="xs muted">{r.sku}</div></div> },
            { key: 'h', header: 'At this branch', align: 'right', render: (r) => <strong>{quantity(r.onHand)} {r.unit}</strong> },
            { key: 't', header: 'All branches', align: 'right', priority: 'low', render: (r) => quantity(r.totalOnHand) },
          ]} />
        )}
      </QueryState>
    </Card>
  )
}

function Transfers() {
  const q = useQuery({ queryKey: ['stock-transfers'], queryFn: () => api.get<StockTransfer[]>('/api/v1/stock-transfers') })
  return (
    <Card padded={false}>
      <QueryState query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No transfers yet" />}>
        {(d) => (
          <DataTable rows={d} rowKey={(t) => t.id} columns={[
            { key: 'n', header: 'Transfer', render: (t) => <div><strong>{t.transferNumber}</strong><div className="xs muted">{date(t.transferDate)}</div></div> },
            { key: 'f', header: 'From', render: (t) => t.fromBranchName },
            { key: 't', header: 'To', render: (t) => t.toBranchName },
            { key: 'x', header: 'Note', priority: 'low', render: (t) => t.notes ?? '' },
          ]} />
        )}
      </QueryState>
    </Card>
  )
}

function BranchDialog({ branch, onClose }: { branch: Branch | 'new' | null; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const existing = branch && branch !== 'new' ? branch : null
  const [v, setV] = useState<Record<string, string> | null>(null)
  const [active, setActive] = useState<boolean | null>(null)
  const form = v ?? { code: existing?.code ?? '', name: existing?.name ?? '', kind: existing?.kind ?? 'BRANCH', addressLine1: existing?.addressLine1 ?? '', city: existing?.city ?? '', phone: existing?.phone ?? '' }
  const isActive = active ?? existing?.active ?? true
  const close = () => { setV(null); setActive(null); onClose() }
  const m = useMutation({
    mutationFn: () => {
      const body = { ...Object.fromEntries(Object.entries(form).map(([k, x]) => [k, x || undefined])), active: isActive }
      return existing ? api.put<Branch>(`/api/v1/branches/${existing.id}`, body) : api.post<Branch>('/api/v1/branches', body)
    },
    onSuccess: () => { toast.success('Branch saved'); qc.invalidateQueries({ queryKey: ['branches'] }); close() },
  })
  const err = m.error instanceof ApiError ? m.error : null
  const set = (k: string) => (e: { target: { value: string } }) => setV({ ...form, [k]: e.target.value })
  return (
    <Modal open={!!branch} onClose={close} title={existing ? `Edit ${existing.name}` : 'Add branch or warehouse'}
      footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button loading={m.isPending} disabled={!form.code.trim() || !form.name.trim()} onClick={() => m.mutate()}>Save</Button></>}>
      <div className="form-grid">
        <Field label="Code" htmlFor="br-code" required><Input id="br-code" value={form.code} onChange={(e) => setV({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') })} maxLength={20} /></Field>
        <Field label="Type" htmlFor="br-kind"><Select id="br-kind" value={form.kind} onChange={set('kind')} options={[{ value: 'BRANCH', label: 'Branch / shop' }, { value: 'WAREHOUSE', label: 'Warehouse / godown' }]} /></Field>
        <Field label="Name" htmlFor="br-name" required className="span-2"><Input id="br-name" value={form.name} onChange={set('name')} maxLength={200} /></Field>
        <Field label="Address" htmlFor="br-addr" className="span-2"><Input id="br-addr" value={form.addressLine1} onChange={set('addressLine1')} /></Field>
        <Field label="City" htmlFor="br-city"><Input id="br-city" value={form.city} onChange={set('city')} /></Field>
        <Field label="Phone" htmlFor="br-phone"><Input id="br-phone" value={form.phone} onChange={set('phone')} /></Field>
        {existing && !existing.isDefault && <Switch label="Open" checked={isActive} onChange={setActive} />}
      </div>
      {err && <Alert tone="danger">{err.message}</Alert>}
    </Modal>
  )
}

function TransferDialog({ open, branches, onClose, onDone }: { open: boolean; branches: Branch[]; onClose: () => void; onDone: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<{ product: Product; quantity: string }[]>([])
  const m = useMutation({
    mutationFn: () => api.post<StockTransfer>('/api/v1/stock-transfers', { fromBranchId: from, toBranchId: to, notes: notes || undefined,
      items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })) }),
    onSuccess: (t) => {
      toast.success('Stock moved', t.transferNumber)
      setLines([]); setNotes('')
      qc.invalidateQueries({ queryKey: ['stock-transfers'] }); qc.invalidateQueries({ queryKey: ['branch-stock'] }); qc.invalidateQueries({ queryKey: ['branches'] })
      onDone()
    },
  })
  const err = m.error instanceof ApiError ? m.error : null
  const valid = from && to && from !== to && lines.length > 0 && lines.every((l) => Number(l.quantity) > 0)
  const options = branches.map((b) => ({ value: b.id, label: b.name }))
  return (
    <Modal open={open} onClose={onClose} wide title="Transfer stock"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={<Warehouse size={16} />} loading={m.isPending} disabled={!valid} onClick={() => m.mutate()}>Move stock</Button></>}>
      <div className="stack">
        <div className="form-grid">
          <Field label="From" htmlFor="tr-from" required><Select id="tr-from" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Choose branch" options={options} /></Field>
          <Field label="To" htmlFor="tr-to" required><Select id="tr-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Choose branch" options={options.filter((o) => o.value !== from)} /></Field>
        </div>
        <ProductPicker exclude={lines.map((l) => l.product.id)} onPick={(p) => setLines([...lines, { product: p, quantity: '1' }])} />
        {lines.map((l, i) => (
          <div key={l.product.id} className="row" style={{ gap: 8 }}>
            <span className="grow">{l.product.name}</span>
            <Input aria-label={`Quantity of ${l.product.name}`} type="number" min={0} step="any" style={{ width: 100, textAlign: 'right' }} value={l.quantity}
              onChange={(e) => setLines(lines.map((x, idx) => (idx === i ? { ...x, quantity: e.target.value } : x)))} />
            <span className="xs muted" style={{ width: 40 }}>{l.product.unit}</span>
            <IconButton label={`Remove ${l.product.name}`} onClick={() => setLines(lines.filter((_, idx) => idx !== i))}><Trash2 size={16} /></IconButton>
          </div>
        ))}
        <Field label="Note" htmlFor="tr-note"><Textarea id="tr-note" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        {err && <Alert tone="danger">{err.message}</Alert>}
      </div>
    </Modal>
  )
}
