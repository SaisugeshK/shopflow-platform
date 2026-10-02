import { router } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import { Button } from '@/components/ui/Button'
import { Card, StatusBadge } from '@/components/ui/Data'
import { EmptyState } from '@/components/ui/Feedback'
import { PagedList } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { api } from '@/services/api'
import type { Order } from '@/services/types'
import { dateTime, money, titleCase } from '@/utils/format'

/** C07 Order list. */
export default function MyOrdersScreen() {
  return (
    <PagedList<Order>
      queryKey={['my-orders']}
      fetchPage={(page, pageSize) => api.page<Order>('/api/v1/orders', { page, pageSize })}
      keyOf={(o) => o.id}
      empty={<EmptyState icon="clipboard" title="No orders yet" action={<Button onPress={() => router.push('/shop/products')}>Start shopping</Button>} />}
      renderItem={(o) => (
        <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
          <Card onPress={() => router.push(`/shop/order/${o.id}`)} accessibilityLabel={`Order ${o.orderNumber}, ${titleCase(o.status)}, ${money(o.grandTotal)}`}>
            <View style={{ gap: 8 }}>
              <View style={styles.between}>
                <View style={{ flex: 1 }}>
                  <Text weight="700">{o.orderNumber}</Text>
                  <Text variant="xs" color="muted">{dateTime(o.placedAt)} · {titleCase(o.paymentMethod)}</Text>
                </View>
                <Text variant="h3" num>{money(o.grandTotal)}</Text>
              </View>
              <View style={[styles.between, { flexWrap: 'wrap' }]}>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  <StatusBadge status={o.status} />
                  <StatusBadge status={o.paymentStatus} />
                </View>
                {o.balanceDue > 0 && <Text variant="xs" color="warning" weight="600">Due {money(o.balanceDue)}</Text>}
              </View>
            </View>
          </Card>
        </View>
      )}
    />
  )
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
})
