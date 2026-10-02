import { router } from 'expo-router'
import { View } from 'react-native'
import { ListRow, StatusBadge } from '@/components/ui/Data'
import { Alert, EmptyState } from '@/components/ui/Feedback'
import { PagedList } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { api } from '@/services/api'
import type { SalesReturn } from '@/services/types'
import { date, money } from '@/utils/format'

/** Customer return requests and their credit notes. */
export default function MyReturnsScreen() {
  return (
    <PagedList<SalesReturn>
      queryKey={['my-returns']}
      fetchPage={(page, pageSize) => api.page<SalesReturn>('/api/v1/sales-returns', { page, pageSize })}
      keyOf={(r) => r.id}
      header={<Alert>To request a return, open a delivered invoice and choose “Request return”.</Alert>}
      empty={<EmptyState icon="rotate-ccw" title="No returns" />}
      renderItem={(r) => (
        <ListRow
          onPress={() => router.push(`/shop/invoice/${r.invoiceId}`)}
          title={r.returnNumber}
          subtitle={`Invoice ${r.invoiceNumber ?? ''} · ${date(r.requestedAt)}`}
          meta={<View style={{ marginTop: 4 }}><StatusBadge status={r.status} /></View>}
          right={r.creditAmount != null ? <Text weight="700" num color="success">{money(r.creditAmount)}</Text> : undefined}
        />
      )}
    />
  )
}
