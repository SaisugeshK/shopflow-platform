import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { ListFilters } from '@/components/admin/Filters'
import { DateInput, isValidDate } from '@/components/admin/Pickers'
import { RequirePermission } from '@/components/admin/RequirePermission'
import { Button } from '@/components/ui/Button'
import { Badge, ListRow, StatusBadge } from '@/components/ui/Data'
import { EmptyState } from '@/components/ui/Feedback'
import { Field, Select, SwitchRow } from '@/components/ui/Form'
import { PagedList } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { useDebounced } from '@/hooks/useDebounced'
import { api } from '@/services/api'
import type { Invoice } from '@/services/types'
import { useCan } from '@/store/auth'
import { date, money } from '@/utils/format'

const STATUS = [
  { value: '', label: 'All' }, { value: 'DRAFT', label: 'Draft' }, { value: 'GENERATED', label: 'Generated' }, { value: 'SENT', label: 'Sent' },
  { value: 'CREDIT', label: 'Credit' }, { value: 'PARTIALLY_PAID', label: 'Part paid' }, { value: 'PAID', label: 'Paid' }, { value: 'CANCELLED', label: 'Cancelled' },
]

/** O20/AD09 Invoice list. */
export default function InvoicesScreen() {
  const params = useLocalSearchParams<{ status?: string }>()
  const canWrite = useCan('INVOICE_WRITE')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState(params.status ?? '')
  useEffect(() => { if (params.status !== undefined) setStatus(params.status) }, [params.status])
  const [source, setSource] = useState('')
  const [overdue, setOverdue] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const q = useDebounced(search)
  const f = isValidDate(from) ? from : ''
  const t = isValidDate(to) ? to : ''
  return (
    <RequirePermission anyOf={['INVOICE_READ']}>
      <PagedList<Invoice>
        queryKey={['invoices', q, status, source, overdue, f, t]}
        fetchPage={(page, pageSize) => api.page<Invoice>('/api/v1/invoices', { q, status, source, overdue: overdue ? 'true' : undefined, from: f, to: t, page, pageSize })}
        keyOf={(i) => i.id}
        header={
          <ListFilters search={search} onSearch={setSearch} placeholder="Invoice number or customer" chips={STATUS} chip={status} onChip={setStatus}
            activeCount={[source, overdue ? 'o' : '', f, t].filter(Boolean).length} onClear={() => { setSource(''); setOverdue(false); setFrom(''); setTo('') }}
            action={canWrite ? <Button icon="file-plus" onPress={() => router.push('/admin/invoice-new')} accessibilityLabel="Create invoice">New</Button> : undefined}
            sheet={
              <>
                <Field label="Source"><Select label="Source" value={source} onChange={setSource} options={[{ value: '', label: 'Any source' }, { value: 'ORDER', label: 'Order-based' }, { value: 'MANUAL', label: 'Admin-created' }]} /></Field>
                <SwitchRow label="Overdue only" value={overdue} onChange={setOverdue} />
                <Field label="From"><DateInput label="From date" value={from} onChange={setFrom} /></Field>
                <Field label="To"><DateInput label="To date" value={to} onChange={setTo} /></Field>
              </>
            } />
        }
        empty={<EmptyState icon="file-text" title="No invoices" />}
        renderItem={(i) => (
          <ListRow onPress={() => router.push(`/admin/invoice/${i.id}`)} title={i.invoiceNumber ?? 'Draft'}
            subtitle={`${i.buyer?.name ?? '—'} · ${date(i.invoiceDate)} · ${i.source === 'ORDER' ? i.orderNumber ?? 'Order' : 'Counter sale'}`}
            meta={<View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}><StatusBadge status={i.status} />{i.overdue && <Badge tone="danger">Overdue</Badge>}</View>}
            right={<><Text weight="700" num>{money(i.grandTotal)}</Text>{i.outstanding > 0 && <Text variant="xs" num color={i.overdue ? 'danger' : 'warning'}>Due {money(i.outstanding)}</Text>}</>} />
        )}
      />
    </RequirePermission>
  )
}
