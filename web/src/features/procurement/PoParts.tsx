import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, Paperclip } from 'lucide-react'
import { useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { Badge, Card, DataTable, StatusBadge } from '@/components/ui/Data'
import { EmptyState } from '@/components/ui/Feedback'
import { useToast } from '@/components/ui/Toast'
import { api, download } from '@/services/api'
import type { GoodsReceipt, PoAttachment, PoLine, PoRevision, PoSnapshotLine, PurchaseOrder } from '@/services/types'
import { date, dateTime, money, quantity, titleCase } from '@/utils/format'

/** Read-only lines of a purchase order (both sides). */
export function PoLinesTable({ po, showReceipt }: { po: PurchaseOrder; showReceipt?: boolean }) {
  return (
    <DataTable rows={po.lines ?? []} rowKey={(l) => l.id} caption="Order lines" columns={[
      { key: 'n', header: '#', render: (l) => l.lineNumber },
      { key: 'd', header: 'Item', render: (l) => <LineCell l={l} /> },
      { key: 'q', header: 'Qty', align: 'right', render: (l) => `${quantity(l.quantity)} ${l.unit}` },
      { key: 'r', header: 'Rate', align: 'right', render: (l) => money(l.rate) },
      { key: 'g', header: 'GST', align: 'right', priority: 'low', render: (l) => `${l.taxRate}%` },
      { key: 't', header: 'Total', align: 'right', render: (l) => money(l.lineTotal) },
      ...(showReceipt ? [{ key: 'rc', header: 'Received', align: 'right' as const, render: (l: PoLine) => (l.status === 'ACCEPTED' ? `${quantity(l.receivedQuantity)} / ${quantity(l.quantity)}` : '—') }] : []),
      { key: 's', header: 'Status', render: (l) => <StatusBadge status={l.status === 'OPEN' ? (l.availability === 'AVAILABLE' ? 'OPEN' : l.availability) : l.status} /> },
    ]} />
  )
}

function LineCell({ l }: { l: PoLine }) {
  return (
    <div>
      <div style={{ fontWeight: 600 }}>{l.description} {l.addedBy === 'SUPPLIER' && <Badge tone="purple">Added by supplier</Badge>}</div>
      {l.sku && <div className="xs muted">{l.sku}</div>}
      {l.deliveryDate && <div className="xs muted">Delivery {date(l.deliveryDate)}</div>}
      {l.lineNote && <div className="xs muted">Note: {l.lineNote}</div>}
      {l.substituteNote && <div className="xs muted">Substitute: {l.substituteNote}</div>}
    </div>
  )
}

/** What changed in a revision compared with the one before it (rate, quantity, availability, status, new lines). */
export function revisionChanges(prev: PoRevision | undefined, cur: PoRevision): string[] {
  const now = cur.snapshot?.lines ?? []
  if (!prev?.snapshot) return []
  const before = new Map<string, PoSnapshotLine>(prev.snapshot.lines.map((l) => [l.lineId, l]))
  const out: string[] = []
  for (const l of now) {
    const b = before.get(l.lineId)
    if (!b) {
      out.push(`Added: ${l.description} — ${Number(l.quantity)} ${l.unit} at ${money(l.rate)}`)
      continue
    }
    const parts: string[] = []
    if (Number(b.rate) !== Number(l.rate)) parts.push(`rate ${money(b.rate)} → ${money(l.rate)}`)
    if (Number(b.quantity) !== Number(l.quantity)) parts.push(`qty ${Number(b.quantity)} → ${Number(l.quantity)}`)
    if (b.availability !== l.availability) parts.push(titleCase(l.availability).toLowerCase())
    if (b.status !== l.status) parts.push(titleCase(l.status).toLowerCase())
    if ((b.deliveryDate ?? '') !== (l.deliveryDate ?? '')) parts.push(`delivery ${l.deliveryDate ? date(l.deliveryDate) : 'cleared'}`)
    if (parts.length) out.push(`${l.description}: ${parts.join(', ')}`)
  }
  if (Number(prev.grandTotal) !== Number(cur.grandTotal)) out.push(`Total ${money(prev.grandTotal)} → ${money(cur.grandTotal)}`)
  return out
}

/** Every round, newest first, with the line-by-line differences to the round before. */
export function RevisionsCard({ revisions }: { revisions?: PoRevision[] }) {
  const list = revisions ?? []
  return (
    <Card title="Rounds & history">
      {list.length === 0 ? <EmptyState title="Not sent yet" /> : (
        <ol className="revision-list">
          {[...list].reverse().map((r) => {
            const prev = list.find((x) => x.revision === r.revision - 1)
            const changes = revisionChanges(prev, r)
            return (
              <li key={r.id}>
                <div className="row-between">
                  <strong>{titleCase(r.action)}</strong>
                  <span className="xs muted">{dateTime(r.createdAt)}</span>
                </div>
                <div className="xs muted">{r.actorName ?? titleCase(r.actorType)} · round {r.revision} · {money(r.grandTotal)}</div>
                {r.note && <div className="small">“{r.note}”</div>}
                {changes.length > 0 && <ul className="xs revision-changes">{changes.map((c) => <li key={c}>{c}</li>)}</ul>}
              </li>
            )
          })}
        </ol>
      )}
    </Card>
  )
}

/** Attachments (quotations, invoices) with upload; {@code base} is the API path of the order. */
export function AttachmentsCard({ po, base, canUpload }: { po: PurchaseOrder; base: string; canUpload: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()
  const toast = useToast()
  const upload = useMutation({
    mutationFn: (f: File) => api.upload<PoAttachment>(`${base}/attachments`, f),
    onSuccess: () => { toast.success('File attached'); qc.invalidateQueries({ queryKey: ['po', po.id] }) },
    onError: (e) => toast.error(e),
  })
  return (
    <Card title="Attachments" padded={false} actions={canUpload && (
      <>
        <input ref={ref} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = '' }} />
        <Button size="sm" variant="secondary" icon={<Paperclip size={14} />} loading={upload.isPending} onClick={() => ref.current?.click()}>Attach</Button>
      </>
    )}>
      {(po.attachments ?? []).length === 0 ? <div style={{ padding: 16 }} className="small muted">No files. PDF or image up to 10 MB.</div> : (
        <DataTable rows={po.attachments ?? []} rowKey={(a) => a.id} columns={[
          { key: 'n', header: 'File', render: (a) => a.fileName ?? 'File' },
          { key: 'b', header: 'From', render: (a) => titleCase(a.uploadedByType) },
          { key: 'd', header: '', render: (a) => <Button size="sm" variant="ghost" icon={<Download size={14} />} onClick={() => download(`${base}/attachments/${a.id}`, undefined, a.fileName ?? 'attachment')}>Download</Button> },
        ]} />
      )}
    </Card>
  )
}

export function ReceiptsCard({ receipts }: { receipts?: GoodsReceipt[] }) {
  if (!receipts?.length) return null
  return (
    <Card title="Goods receipts" padded={false}>
      <DataTable rows={receipts} rowKey={(g) => g.id} columns={[
        { key: 'n', header: 'GRN', render: (g) => <div><strong>{g.grnNumber}</strong><div className="xs muted">{date(g.receiptDate)}{g.supplierInvoiceNumber ? ` · inv ${g.supplierInvoiceNumber}` : ''}</div></div> },
        { key: 'l', header: 'Items', render: (g) => (
          <div className="xs">{g.lines.map((l) => (
            <div key={l.id}>{l.description}: {quantity(l.receivedQuantity)}{l.damagedQuantity > 0 ? ` (${quantity(l.damagedQuantity)} damaged)` : ''}{l.mismatchNote ? <span className="warning-text"> · {l.mismatchNote}</span> : null}</div>
          ))}</div>
        ) },
        { key: 'm', header: '', render: (g) => (g.hasMismatch ? <Badge tone="warning">Differences</Badge> : <Badge tone="success">Matched</Badge>) },
        { key: 'p', header: 'Purchase', priority: 'low', render: (g) => g.purchaseNumber ?? '—' },
      ]} />
    </Card>
  )
}
