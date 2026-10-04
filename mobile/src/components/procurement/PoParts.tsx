import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as ImagePicker from 'expo-image-picker'
import { View } from 'react-native'
import { Button } from '@/components/ui/Button'
import { Badge, Card, ListRow } from '@/components/ui/Data'
import { EmptyState } from '@/components/ui/Feedback'
import { LineItems } from '@/components/ui/LineItems'
import { Text } from '@/components/ui/Text'
import { toast } from '@/components/ui/Toast'
import { uploadImage } from '@/services/api'
import { openDocument } from '@/services/documents'
import type { GoodsReceipt, PoRevision, PoSnapshotLine, PurchaseOrder } from '@/services/types'
import { date, dateTime, money, quantity, titleCase } from '@/utils/format'

export const WAITING = ['SENT', 'COUNTERED']

export function PoLines({ po }: { po: PurchaseOrder }) {
  return (
    <LineItems lines={(po.lines ?? []).map((l) => ({
      id: l.id, name: `${l.lineNumber}. ${l.description}${l.addedBy === 'SUPPLIER' ? ' (added by supplier)' : ''}`, qty: l.quantity, unit: l.unit, rate: l.rate, amount: l.lineTotal,
      note: [titleCase(l.status === 'OPEN' ? l.availability : l.status), `GST ${l.taxRate}%`, l.deliveryDate ? `delivery ${date(l.deliveryDate)}` : null,
        l.lineNote ? `note: ${l.lineNote}` : null, l.substituteNote ? `substitute: ${l.substituteNote}` : null,
        l.status === 'ACCEPTED' && l.receivedQuantity > 0 ? `received ${quantity(l.receivedQuantity)}` : null].filter(Boolean).join(' · '),
    }))} />
  )
}

/** What changed compared with the previous round. */
export function revisionChanges(prev: PoRevision | undefined, cur: PoRevision): string[] {
  if (!prev?.snapshot || !cur.snapshot) return []
  const before = new Map<string, PoSnapshotLine>(prev.snapshot.lines.map((l) => [l.lineId, l]))
  const out: string[] = []
  for (const l of cur.snapshot.lines) {
    const b = before.get(l.lineId)
    if (!b) {
      out.push(`Added ${l.description}`)
      continue
    }
    const parts: string[] = []
    if (Number(b.rate) !== Number(l.rate)) parts.push(`rate ${money(b.rate)} → ${money(l.rate)}`)
    if (Number(b.quantity) !== Number(l.quantity)) parts.push(`qty ${Number(b.quantity)} → ${Number(l.quantity)}`)
    if (b.availability !== l.availability) parts.push(titleCase(l.availability).toLowerCase())
    if (b.status !== l.status) parts.push(titleCase(l.status).toLowerCase())
    if (parts.length) out.push(`${l.description}: ${parts.join(', ')}`)
  }
  return out
}

export function RevisionsSection({ revisions }: { revisions?: PoRevision[] }) {
  const list = revisions ?? []
  return (
    <Card title="Rounds & history">
      {list.length === 0 ? <Text variant="small" color="muted">Not sent yet.</Text> : (
        <View style={{ gap: 12 }}>
          {[...list].reverse().map((r) => (
            <View key={r.id} style={{ gap: 2 }}>
              <Text weight="700">{titleCase(r.action)} · {money(r.grandTotal)}</Text>
              <Text variant="xs" color="muted">{r.actorName ?? titleCase(r.actorType)} · round {r.revision} · {dateTime(r.createdAt)}</Text>
              {r.note && <Text variant="small">“{r.note}”</Text>}
              {revisionChanges(list.find((x) => x.revision === r.revision - 1), r).map((c) => <Text key={c} variant="xs" color="muted">• {c}</Text>)}
            </View>
          ))}
        </View>
      )}
    </Card>
  )
}

export function ReceiptsSection({ receipts }: { receipts?: GoodsReceipt[] }) {
  if (!receipts?.length) return null
  return (
    <Card title="Goods receipts" padded={false}>
      {receipts.map((g) => (
        <ListRow key={g.id} title={g.grnNumber}
          subtitle={`${date(g.receiptDate)} · ${g.lines.map((l) => `${l.description} ${quantity(l.receivedQuantity)}${l.damagedQuantity > 0 ? ` (${quantity(l.damagedQuantity)} damaged)` : ''}`).join(', ')}`}
          right={<Badge tone={g.hasMismatch ? 'warning' : 'success'}>{g.hasMismatch ? 'Differences' : 'Matched'}</Badge>} />
      ))}
    </Card>
  )
}

/** Attachments with upload (PDF/image) and open; {@code base} is the API path of the order. */
export function AttachmentsSection({ po, base, canUpload }: { po: PurchaseOrder; base: string; canUpload: boolean }) {
  const qc = useQueryClient()
  const upload = useMutation({
    mutationFn: async () => {
      // A photo of the quotation or invoice (PDFs can be attached from the web app).
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 })
      if (r.canceled || !r.assets[0]) return null
      return uploadImage(`${base}/attachments`, r.assets[0])
    },
    onSuccess: (a) => { if (a) { toast.success('File attached'); qc.invalidateQueries({ queryKey: ['po', po.id] }) } },
    onError: (e) => toast.error(e),
  })
  return (
    <Card title="Attachments" padded={false} actions={canUpload ? <Button size="sm" variant="secondary" icon="paperclip" loading={upload.isPending} onPress={() => upload.mutate()}>Attach</Button> : undefined}>
      {(po.attachments ?? []).length === 0 ? <EmptyState icon="paperclip" title="No files" description="Photo of a quotation or invoice." /> : (po.attachments ?? []).map((a) => (
        <ListRow key={a.id} icon="file" title={a.fileName ?? 'File'} subtitle={`From ${titleCase(a.uploadedByType).toLowerCase()} · ${dateTime(a.createdAt)}`}
          onPress={() => openDocument(`${base}/attachments/${a.id}`, a.fileName ?? 'attachment').catch((e) => toast.error(e))} />
      ))}
    </Card>
  )
}
