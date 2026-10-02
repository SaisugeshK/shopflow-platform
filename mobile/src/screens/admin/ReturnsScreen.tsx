import { useMutation, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { ListFilters } from '@/components/admin/Filters'
import { RequirePermission } from '@/components/admin/RequirePermission'
import { Button } from '@/components/ui/Button'
import { KeyValue, ListRow, StatusBadge } from '@/components/ui/Data'
import { EmptyState } from '@/components/ui/Feedback'
import { Field, Input } from '@/components/ui/Form'
import { Sheet } from '@/components/ui/Overlay'
import { PagedList } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { toast } from '@/components/ui/Toast'
import { api } from '@/services/api'
import type { SalesReturn } from '@/services/types'
import { useCan } from '@/store/auth'
import { dateTime, money, quantity } from '@/utils/format'

/** Sales returns review (§17): approve → stock IN + credit note, or reject. */
export default function ReturnsScreen() {
  const qc = useQueryClient()
  const canWrite = useCan('RETURN_WRITE')
  const [status, setStatus] = useState('REQUESTED')
  const [open, setOpen] = useState<SalesReturn | null>(null)
  const [note, setNote] = useState('')
  useEffect(() => { setNote('') }, [open])
  const review = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) => api.post<SalesReturn>(`/api/v1/sales-returns/${id}/${action}`, { note: note || undefined }),
    onSuccess: (r) => {
      toast.success(`Return ${r.status.toLowerCase()}`, r.creditNoteNumber ? `Credit note ${r.creditNoteNumber} · ${money(r.creditAmount)}` : undefined)
      setOpen(null)
      qc.invalidateQueries({ queryKey: ['returns'] })
    },
    onError: (e) => toast.error(e),
  })
  return (
    <RequirePermission anyOf={['RETURN_READ']}>
      <PagedList<SalesReturn>
        queryKey={['returns', status]}
        fetchPage={(page, pageSize) => api.page<SalesReturn>('/api/v1/sales-returns', { status, page, pageSize })}
        keyOf={(r) => r.id}
        header={<ListFilters chips={[{ value: 'REQUESTED', label: 'Awaiting review' }, { value: 'APPROVED', label: 'Approved' }, { value: 'REJECTED', label: 'Rejected' }, { value: '', label: 'All' }]} chip={status} onChip={setStatus} />}
        empty={<EmptyState icon="rotate-ccw" title="No returns" />}
        renderItem={(r) => (
          <ListRow onPress={() => setOpen(r)} title={r.returnNumber} subtitle={`${r.customerName} · ${r.invoiceNumber ?? ''} · ${dateTime(r.requestedAt)}`}
            meta={<View style={{ marginTop: 4 }}><StatusBadge status={r.status} /></View>}
            right={r.creditAmount != null ? <Text weight="700" num>{money(r.creditAmount)}</Text> : undefined} />
        )}
      />
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? `Return ${open.returnNumber}` : ''} footer={open && canWrite && open.status === 'REQUESTED' ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button variant="danger" icon="x" style={{ flex: 1 }} loading={review.isPending && review.variables?.action === 'reject'} onPress={() => review.mutate({ id: open.id, action: 'reject' })}>Reject</Button>
          <Button variant="success" icon="check" style={{ flex: 1 }} loading={review.isPending && review.variables?.action === 'approve'} onPress={() => review.mutate({ id: open.id, action: 'approve' })}>Approve</Button>
        </View>
      ) : undefined}>
        {open && (
          <>
            <KeyValue items={[['Customer', open.customerName], ['Invoice', open.invoiceNumber], ['Reason', open.reason], ['Status', <StatusBadge key="s" status={open.status} />], ['Review note', open.reviewNote], ['Credit note', open.creditNoteNumber]]} />
            {open.items.map((i) => (
              <View key={i.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <View style={{ flex: 1 }}><Text weight="600">{i.productName}</Text>{i.reason && <Text variant="xs" color="muted">{i.reason}</Text>}</View>
                <Text num>{quantity(i.quantity)}</Text>
              </View>
            ))}
            <Button size="sm" variant="ghost" icon="file-text" style={{ alignSelf: 'flex-start' }} onPress={() => { const inv = open.invoiceId; setOpen(null); router.push(`/admin/invoice/${inv}`) }}>Open invoice</Button>
            {canWrite && open.status === 'REQUESTED' && <Field label="Review note"><Input value={note} onChangeText={setNote} accessibilityLabel="Review note" /></Field>}
          </>
        )}
      </Sheet>
    </RequirePermission>
  )
}
