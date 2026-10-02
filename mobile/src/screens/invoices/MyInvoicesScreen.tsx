import { router } from 'expo-router'
import { View } from 'react-native'
import { ListRow, StatusBadge } from '@/components/ui/Data'
import { EmptyState } from '@/components/ui/Feedback'
import { PagedList } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { api } from '@/services/api'
import type { Invoice } from '@/services/types'
import { date, money } from '@/utils/format'

/** C10 Invoices. */
export default function MyInvoicesScreen() {
  return (
    <PagedList<Invoice>
      queryKey={['my-invoices']}
      fetchPage={(page, pageSize) => api.page<Invoice>('/api/v1/invoices', { page, pageSize })}
      keyOf={(i) => i.id}
      empty={<EmptyState icon="file-text" title="No invoices yet" />}
      renderItem={(i) => (
        <ListRow
          onPress={() => router.push(`/shop/invoice/${i.id}`)}
          title={i.invoiceNumber ?? 'Draft'}
          subtitle={`${date(i.invoiceDate)}${i.dueDate ? ` · due ${date(i.dueDate)}` : ''}`}
          meta={<View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}><StatusBadge status={i.status} />{i.overdue && <StatusBadge status="OVERDUE" />}</View>}
          right={
            <>
              <Text weight="700" num>{money(i.grandTotal)}</Text>
              {i.outstanding > 0 && <Text variant="xs" color={i.overdue ? 'danger' : 'warning'} num>Due {money(i.outstanding)}</Text>}
            </>
          }
        />
      )}
    />
  )
}
