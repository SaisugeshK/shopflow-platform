import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { ListFilters } from '@/components/admin/Filters'
import { RequirePermission } from '@/components/admin/RequirePermission'
import { Button } from '@/components/ui/Button'
import { ListRow, StatusBadge } from '@/components/ui/Data'
import { EmptyState } from '@/components/ui/Feedback'
import { Field, Select } from '@/components/ui/Form'
import { PagedList } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { useDebounced } from '@/hooks/useDebounced'
import { api } from '@/services/api'
import type { CustomerSummary } from '@/services/types'
import { useCan } from '@/store/auth'
import { money } from '@/utils/format'

/** O13/AD04 Customers. */
export default function CustomersScreen() {
  const params = useLocalSearchParams<{ status?: string; hasOutstanding?: string }>()
  const canWrite = useCan('CUSTOMER_WRITE')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState(params.status ?? '')
  const [hasOutstanding, setHasOutstanding] = useState(params.hasOutstanding ?? '')
  useEffect(() => {
    if (params.status !== undefined) setStatus(params.status)
    if (params.hasOutstanding !== undefined) setHasOutstanding(params.hasOutstanding)
  }, [params.status, params.hasOutstanding])
  const q = useDebounced(search)
  return (
    <RequirePermission anyOf={['CUSTOMER_READ']}>
      <PagedList<CustomerSummary>
        queryKey={['customers', q, status, hasOutstanding]}
        fetchPage={(page, pageSize) => api.page<CustomerSummary>('/api/v1/customers', { q, status, hasOutstanding, page, pageSize })}
        keyOf={(c) => c.id}
        header={
          <ListFilters search={search} onSearch={setSearch} placeholder="Shop, contact, mobile, code or GSTIN"
            chips={[{ value: '', label: 'All' }, { value: 'PENDING_APPROVAL', label: 'Pending' }, { value: 'APPROVED', label: 'Approved' }, { value: 'BLOCKED', label: 'Blocked' }, { value: 'REJECTED', label: 'Rejected' }]}
            chip={status} onChip={setStatus}
            activeCount={hasOutstanding ? 1 : 0} onClear={() => setHasOutstanding('')}
            action={canWrite ? <Button icon="user-plus" onPress={() => router.push('/admin/customer-new')} accessibilityLabel="Add customer">Add</Button> : undefined}
            sheet={<Field label="Outstanding"><Select label="Outstanding" value={hasOutstanding} onChange={setHasOutstanding} options={[{ value: '', label: 'Any balance' }, { value: 'true', label: 'With outstanding' }, { value: 'false', label: 'No outstanding' }]} /></Field>} />
        }
        empty={<EmptyState icon="users" title="No customers found" />}
        renderItem={(c) => (
          <ListRow onPress={() => router.push(`/admin/customer/${c.id}`)} title={c.shopName}
            subtitle={`${c.customerCode} · ${c.contactName} · ${c.mobileNumber}${c.city ? ` · ${c.city}` : ''}`}
            meta={<View style={{ marginTop: 4 }}><StatusBadge status={c.status} /></View>}
            right={<><Text weight="700" num color={c.outstanding > 0 ? 'warning' : 'text'}>{money(c.outstanding)}</Text><Text variant="xs" color="muted">outstanding</Text></>} />
        )}
      />
    </RequirePermission>
  )
}
