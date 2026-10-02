import { useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { IconButton } from '@/components/ui/Button'
import { ListRow, StatusBadge } from '@/components/ui/Data'
import { EmptyState } from '@/components/ui/Feedback'
import { PagedList } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { toast } from '@/components/ui/Toast'
import { api } from '@/services/api'
import { openDocument } from '@/services/documents'
import type { Payment } from '@/services/types'
import { colors } from '@/theme/tokens'
import { dateTime, money, titleCase } from '@/utils/format'

/** C11/C13 Payment history with receipts. */
export default function MyPaymentsScreen() {
  const [busy, setBusy] = useState<string | null>(null)
  const receipt = async (p: Payment) => {
    setBusy(p.id)
    try {
      await openDocument(`/api/v1/payments/${p.id}/receipt`, `${p.paymentNumber}.pdf`)
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(null)
    }
  }
  return (
    <PagedList<Payment>
      queryKey={['my-payments']}
      fetchPage={(page, pageSize) => api.page<Payment>('/api/v1/payments', { page, pageSize })}
      keyOf={(p) => p.id}
      empty={<EmptyState icon="credit-card" title="No payments yet" />}
      renderItem={(p) => (
        <ListRow
          title={p.paymentNumber}
          subtitle={`${dateTime(p.paidAt ?? p.createdAt)} · ${titleCase(p.method)}`}
          meta={<View style={{ marginTop: 4 }}><StatusBadge status={p.status} /></View>}
          right={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text weight="700" num>{money(p.amount)}</Text>
              {['CAPTURED', 'PARTIALLY_PAID'].includes(p.status) && (busy === p.id
                ? <ActivityIndicator color={colors.primary} style={{ width: 44 }} />
                : <IconButton icon="download" label={`Download receipt ${p.paymentNumber}`} onPress={() => receipt(p)} color={colors.primary} />)}
            </View>
          }
        />
      )}
    />
  )
}
