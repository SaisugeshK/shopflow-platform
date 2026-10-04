import { useQuery } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/Button'
import { Badge, Card, DataTable } from '@/components/ui/Data'
import { Checkbox, Input, PriceInput, Select } from '@/components/ui/Form'
import { api } from '@/services/api'
import type { InvoiceCharge, InvoiceItem } from '@/services/types'
import { money, titleCase } from '@/utils/format'

/** Description cell of a document line: name plus scheme, free goods, batches and serial numbers (§0B.7). */
export function LineDescription({ i }: { i: InvoiceItem }) {
  return (
    <div>
      <div style={{ fontWeight: 600 }}>{i.productName} {i.freeItem && <Badge tone="success">Free</Badge>}</div>
      {i.description && <div className="xs muted">{i.description}</div>}
      {!i.freeItem && i.schemeName && <div className="xs muted">Scheme: {i.schemeName}</div>}
      {i.unitFactor !== 1 && <div className="xs muted">1 {i.unit} = {Number(i.unitFactor)} base units</div>}
      {i.batchDetails && !i.batchDetails.startsWith('BATCH:') && <div className="xs muted">Batch: {i.batchDetails}</div>}
      {i.serialNumbers.length > 0 && <div className="xs muted">Serial no.: {i.serialNumbers.join(', ')}</div>}
    </div>
  )
}

/** Picks exactly {@code count} in-stock serial numbers of a product. */
export function SerialChooser({ productId, count, value, onChange }: { productId: string; count: number; value: string[]; onChange: (v: string[]) => void }) {
  const q = useQuery({ queryKey: ['serials', 'in-stock', productId], queryFn: () => api.get<string[]>('/api/v1/serials/in-stock', { productId }) })
  const list = q.data ?? []
  return (
    <div className="stack-sm">
      <span className="xs muted">Choose {count} serial number{count === 1 ? '' : 's'} ({value.length} chosen){list.length === 0 && !q.isLoading ? ' — none in stock' : ''}</span>
      <div className="serial-grid">
        {list.slice(0, 60).map((s) => (
          <Checkbox key={s} label={s} checked={value.includes(s)} disabled={!value.includes(s) && value.length >= count}
            onChange={(on) => onChange(on ? [...value, s] : value.filter((x) => x !== s))} />
        ))}
      </div>
    </div>
  )
}

export interface ChargeLine {
  type: string
  description: string
  amount: string
  taxRate: string
}

const CHARGE_TYPES = ['TRANSPORT', 'LOADING', 'UNLOADING', 'CUTTING', 'PACKING', 'INSURANCE', 'OTHER']

/** Invoice-level charges editor (CHARGES module). */
export function ChargesEditor({ value, onChange, rates }: { value: ChargeLine[]; onChange: (v: ChargeLine[]) => void; rates: number[] }) {
  const set = (i: number, patch: Partial<ChargeLine>) => onChange(value.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  return (
    <Card title="Charges" actions={<Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => onChange([...value, { type: 'TRANSPORT', description: '', amount: '', taxRate: '18' }])}>Add charge</Button>}>
      {value.length === 0 ? <p className="small muted">Transport, loading or cutting charges with their own GST.</p> : (
        <div className="stack-sm">
          {value.map((c, i) => (
            <div key={i} className="charge-row">
              <Select aria-label="Charge type" value={c.type} onChange={(e) => set(i, { type: e.target.value })} options={CHARGE_TYPES.map((t) => ({ value: t, label: titleCase(t) }))} />
              <Input aria-label="Charge description" placeholder="Description (optional)" value={c.description} onChange={(e) => set(i, { description: e.target.value })} />
              <PriceInput aria-label="Charge amount" placeholder="Amount" value={c.amount} onChange={(e) => set(i, { amount: e.target.value })} />
              <Select aria-label="Charge GST" value={c.taxRate} onChange={(e) => set(i, { taxRate: e.target.value })} options={[0, ...rates.filter((r) => r > 0)].map((r) => ({ value: String(r), label: `${r}% GST` }))} />
              <IconButton label="Remove charge" onClick={() => onChange(value.filter((_, idx) => idx !== i))}><Trash2 size={16} /></IconButton>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

/** Charges block on an invoice detail / draft. */
export function ChargesTable({ charges }: { charges?: InvoiceCharge[] }) {
  if (!charges?.length) return null
  return (
    <DataTable rows={charges} rowKey={(c) => c.id} caption="Charges" columns={[
      { key: 'd', header: 'Charge', render: (c) => <div><strong>{c.description}</strong><div className="xs muted">SAC {c.sacCode}</div></div> },
      { key: 'a', header: 'Amount', align: 'right', render: (c) => money(c.amount) },
      { key: 'g', header: 'GST', align: 'right', render: (c) => `${c.taxRate}%` },
      { key: 't', header: 'Total', align: 'right', render: (c) => money(c.total) },
    ]} />
  )
}
