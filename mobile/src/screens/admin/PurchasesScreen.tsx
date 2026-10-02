import { router } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { ListFilters } from '@/components/admin/Filters'
import { DateInput, isValidDate } from '@/components/admin/Pickers'
import { RequirePermission } from '@/components/admin/RequirePermission'
import { Button } from '@/components/ui/Button'
import { ListRow, StatusBadge } from '@/components/ui/Data'
import { EmptyState } from '@/components/ui/Feedback'
import { Field, Select } from '@/components/ui/Form'
import { PagedList } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { useSuppliers } from '@/features/catalog'
import { useDebounced } from '@/hooks/useDebounced'
import { api } from '@/services/api'
import type { Purchase } from '@/services/types'
import { useCan } from '@/store/auth'
import { date, money } from '@/utils/format'

/** O10/AD08 Purchase history. */
export default function PurchasesScreen() {
  const canWrite = useCan('PURCHASE_WRITE')
  const suppliers = useSuppliers()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const q = useDebounced(search)
  const f = isValidDate(from) ? from : ''
  const t = isValidDate(to) ? to : ''
  return (
    <RequirePermission anyOf={['PURCHASE_READ']}>
      <PagedList<Purchase>
        queryKey={['purchases', q, status, supplierId, f, t]}
        fetchPage={(page, pageSize) => api.page<Purchase>('/api/v1/purchases', { q, status, supplierId, from: f, to: t, page, pageSize })}
        keyOf={(p) => p.id}
        header={
          <ListFilters search={search} onSearch={setSearch} placeholder="Purchase or supplier invoice no."
            chips={[{ value: '', label: 'All' }, { value: 'DRAFT', label: 'Draft' }, { value: 'POSTED', label: 'Posted' }, { value: 'CANCELLED', label: 'Cancelled' }]} chip={status} onChip={setStatus}
            activeCount={[supplierId, f, t].filter(Boolean).length} onClear={() => { setSupplierId(''); setFrom(''); setTo('') }}
            action={canWrite ? <Button icon="plus" onPress={() => router.push('/admin/purchase-new')} accessibilityLabel="Add purchase">Add</Button> : undefined}
            sheet={
              <>
                <Field label="Supplier"><Select label="Supplier" value={supplierId} onChange={setSupplierId} searchable options={[{ value: '', label: 'All suppliers' }, ...(suppliers.data?.items ?? []).map((s) => ({ value: s.id, label: s.name }))]} /></Field>
                <Field label="From"><DateInput label="From date" value={from} onChange={setFrom} /></Field>
                <Field label="To"><DateInput label="To date" value={to} onChange={setTo} /></Field>
              </>
            } />
        }
        empty={<EmptyState icon="truck" title="No purchases" action={canWrite ? <Button onPress={() => router.push('/admin/purchase-new')}>Add purchase</Button> : undefined} />}
        renderItem={(p) => (
          <ListRow
            onPress={() => router.push(`/admin/purchase/${p.id}`)}
            title={p.purchaseNumber}
            subtitle={`${p.supplierName} · ${date(p.purchaseDate)}${p.supplierInvoiceNumber ? ` · ${p.supplierInvoiceNumber}` : ''}`}
            meta={<View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}><StatusBadge status={p.status} /><StatusBadge status={p.paymentStatus === 'UNPAID' ? 'PENDING' : p.paymentStatus} /></View>}
            right={<Text weight="700" num>{money(p.grandTotal)}</Text>}
          />
        )}
      />
    </RequirePermission>
  )
}
