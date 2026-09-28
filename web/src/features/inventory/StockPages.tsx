import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card, DataTable, PageHeader, Pagination, StatusBadge } from '@/components/ui/Data'
import { Alert, EmptyState, QueryState } from '@/components/ui/Feedback'
import { Field, Input, SearchInput, Select, Textarea } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Overlay'
import { useToast } from '@/components/ui/Toast'
import { useCategories } from '@/features/products/ProductsPages'
import { useListParams } from '@/hooks/useListParams'
import { api, ApiError } from '@/services/api'
import type { MovementRow, StockRow } from '@/services/types'
import { useCan } from '@/stores/auth'
import { dateTime, money, quantity, titleCase } from '@/utils/format'

/** O08/AD07 Stock. Available = on hand − reserved for open orders. */
export function StockPage() {
  const list = useListParams()
  const categories = useCategories()
  const canWrite = useCan('STOCK_WRITE')
  const [adjusting, setAdjusting] = useState<StockRow | null>(null)
  const q = useQuery({ queryKey: ['stock', list.query], queryFn: () => api.page<StockRow>('/api/v1/stock', { ...list.query, pageSize: 25 }) })
  return (
    <div className="stack">
      <PageHeader title="Stock" subtitle="Balances are derived from the immutable stock movement journal" actions={<Link to="/app/stock/movements" className="btn btn-secondary">Movements</Link>} />
      <Card padded={false}>
        <div className="toolbar">
          <SearchInput className="search" value={list.search} onChange={list.setSearch} placeholder="Product or SKU" />
          <Select aria-label="Category" value={list.get('categoryId')} onChange={(e) => list.set('categoryId', e.target.value)} style={{ width: 200 }} placeholder="All categories"
            options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          <div className="chips" role="group" aria-label="Stock status">
            {[['', 'All'], ['IN_STOCK', 'In stock'], ['LOW_STOCK', 'Low'], ['OUT_OF_STOCK', 'Out of stock']].map(([v, l]) => (
              <button key={v} className="chip" aria-pressed={list.get('status') === v} onClick={() => list.set('status', v)}>{l}</button>
            ))}
          </div>
        </div>
        <QueryState query={q} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No products match" />}>
          {(d) => (
            <>
              <DataTable rows={d.items} rowKey={(r) => r.productId} caption="Stock" columns={[
                { key: 'p', header: 'Product', render: (r) => <Link to={`/app/products/${r.productId}`}><div style={{ fontWeight: 600 }}>{r.productName}</div><div className="xs muted">{r.sku} · {r.category}</div></Link> },
                { key: 'o', header: 'On hand', align: 'right', render: (r) => `${quantity(r.onHand)} ${r.unit}` },
                { key: 'r', header: 'Reserved', align: 'right', render: (r) => quantity(r.reserved) },
                { key: 'a', header: 'Available', align: 'right', render: (r) => <strong>{quantity(r.available)}</strong> },
                { key: 'm', header: 'Minimum', align: 'right', render: (r) => quantity(r.minimumStock) },
                { key: 'v', header: 'Value (cost)', align: 'right', render: (r) => money(r.stockValue) },
                { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                { key: 'x', header: '', render: (r) => canWrite && <Button size="sm" variant="ghost" icon={<SlidersHorizontal size={14} />} onClick={() => setAdjusting(r)}>Adjust</Button> },
              ]} />
              <Pagination meta={d.pagination} onPage={list.setPage} />
            </>
          )}
        </QueryState>
      </Card>
      <AdjustDialog row={adjusting} onClose={() => setAdjusting(null)} />
    </div>
  )
}

function AdjustDialog({ row, onClose }: { row: StockRow | null; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [type, setType] = useState('ADJUSTMENT_IN')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('')
  const save = useMutation({
    mutationFn: () => api.post('/api/v1/stock/adjustments', { productId: row!.productId, type, quantity: qty, reason }),
    onSuccess: () => {
      toast.success('Stock adjusted', row?.productName)
      qc.invalidateQueries({ queryKey: ['stock'] })
      qc.invalidateQueries({ queryKey: ['movements'] })
      setQty('')
      setReason('')
      onClose()
    },
  })
  const err = save.error instanceof ApiError ? save.error : null
  return (
    <Modal open={!!row} onClose={onClose} title={`Adjust stock · ${row?.productName ?? ''}`} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button loading={save.isPending} disabled={!(Number(qty) > 0) || reason.trim().length < 3} onClick={() => save.mutate()}>Post adjustment</Button>
      </>
    }>
      <div className="stack">
        <p className="small muted">Current: {quantity(row?.onHand)} on hand, {quantity(row?.available)} available. Adjustments are permanent journal entries.</p>
        <div className="form-grid">
          <Field label="Type" htmlFor="adj-type" required>
            <Select id="adj-type" value={type} onChange={(e) => setType(e.target.value)} options={[
              { value: 'ADJUSTMENT_IN', label: 'Adjustment in (+)' }, { value: 'ADJUSTMENT_OUT', label: 'Adjustment out (−)' },
              { value: 'DAMAGE_OUT', label: 'Damage (−)' }, { value: 'LOSS_OUT', label: 'Loss (−)' },
            ]} />
          </Field>
          <Field label="Quantity" htmlFor="adj-qty" required><Input id="adj-qty" type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
          <Field label="Reason" htmlFor="adj-reason" required className="span-2"><Textarea id="adj-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></Field>
        </div>
        {err && <Alert tone="danger">{err.message}</Alert>}
      </div>
    </Modal>
  )
}

/** O09 Stock movement history. */
export function MovementsPage() {
  const list = useListParams()
  const q = useQuery({ queryKey: ['movements', list.query], queryFn: () => api.page<MovementRow>('/api/v1/stock/movements', { ...list.query, pageSize: 30 }) })
  return (
    <div className="stack">
      <PageHeader title="Stock movements" subtitle="Every stock change, newest first" />
      <Card padded={false}>
        <div className="toolbar">
          <Select aria-label="Movement type" value={list.get('type')} onChange={(e) => list.set('type', e.target.value)} style={{ width: 220 }} placeholder="All types"
            options={['OPENING', 'PURCHASE_IN', 'SALE_OUT', 'SALES_RETURN_IN', 'PURCHASE_RETURN_OUT', 'DAMAGE_OUT', 'LOSS_OUT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'].map((v) => ({ value: v, label: titleCase(v) }))} />
          <Input type="date" aria-label="From date" value={list.get('from')} onChange={(e) => list.set('from', e.target.value)} style={{ width: 160 }} />
          <Input type="date" aria-label="To date" value={list.get('to')} onChange={(e) => list.set('to', e.target.value)} style={{ width: 160 }} />
          {list.get('productId') && <Button size="sm" variant="ghost" onClick={() => list.set('productId', '')}>Clear product filter</Button>}
        </div>
        <QueryState query={q} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No movements" />}>
          {(d) => (
            <>
              <DataTable rows={d.items} rowKey={(m) => m.id} columns={[
                { key: 'd', header: 'When', render: (m) => dateTime(m.createdAt) },
                { key: 'p', header: 'Product', render: (m) => <Link to={`/app/products/${m.productId}`}>{m.productName}</Link> },
                { key: 't', header: 'Type', render: (m) => titleCase(m.movementType) },
                { key: 'r', header: 'Reference', render: (m) => m.referenceNumber ?? '—' },
                { key: 'n', header: 'Reason', render: (m) => <span className="small muted">{m.reason ?? ''}</span> },
                { key: 'q', header: 'Qty', align: 'right', render: (m) => <span className={m.direction === 'IN' ? 'success-text' : 'danger-text'}>{m.direction === 'IN' ? '+' : '−'}{quantity(m.quantity)}</span> },
                { key: 'b', header: 'Balance', align: 'right', render: (m) => quantity(m.balanceAfter) },
              ]} />
              <Pagination meta={d.pagination} onPage={list.setPage} />
            </>
          )}
        </QueryState>
      </Card>
    </div>
  )
}
