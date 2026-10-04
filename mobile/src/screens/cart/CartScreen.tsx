import { useMutation, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { Pressable, StyleSheet, View } from 'react-native'
import { ProductImage } from '@/components/shop/ProductCard'
import { Button, IconButton } from '@/components/ui/Button'
import { Card, TaxBreakdown } from '@/components/ui/Data'
import { Alert, EmptyState, QueryState } from '@/components/ui/Feedback'
import { QuantityStepper } from '@/components/ui/Form'
import { Screen } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { toast } from '@/components/ui/Toast'
import { useCart } from '@/features/shop'
import { api } from '@/services/api'
import type { Cart } from '@/services/types'
import { colors, radius } from '@/theme/tokens'
import { money, quantity } from '@/utils/format'

/** C04 Cart (§37). Every figure comes from the backend. */
export default function CartScreen() {
  const cart = useCart()
  const qc = useQueryClient()
  const update = useMutation({
    mutationFn: ({ id, qty }: { id: string; qty: number }) => api.patch<Cart>(`/api/v1/cart/items/${id}`, { quantity: String(qty) }),
    onSuccess: (c) => qc.setQueryData(['cart'], c),
    onError: (e) => toast.error(e),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.del<Cart>(`/api/v1/cart/items/${id}`),
    onSuccess: (c) => qc.setQueryData(['cart'], c),
    onError: (e) => toast.error(e),
  })
  const c = cart.data
  const hasItems = !!c && c.items.length > 0
  return (
    <Screen
      onRefresh={() => cart.refetch()}
      refreshing={cart.isRefetching}
      footer={hasItems ? (
        <View style={{ gap: 6 }}>
          <View style={styles.rowBetween}>
            <Text color="muted">{c.itemCount} items</Text>
            <Text variant="h3" num>{money(c.grandTotal)}</Text>
          </View>
          <Button size="lg" block disabled={!c.checkoutReady} onPress={() => router.push('/shop/checkout')}>Proceed to checkout</Button>
        </View>
      ) : undefined}
    >
      <QueryState query={cart} isEmpty={(x) => x.items.length === 0}
        empty={<EmptyState icon="shopping-cart" title="Your cart is empty" action={<Button onPress={() => router.push('/shop/products')}>Browse products</Button>} />}>
        {(c) => (
          <>
            {c.items.map((i) => (
              <Card key={i.id} padded>
                <View style={styles.line}>
                  <Pressable onPress={() => router.push(`/shop/product/${i.productId}`)} accessibilityRole="button" accessibilityLabel={i.productName} style={styles.thumb}>
                    <ProductImage url={i.imageUrl} size={72} />
                  </Pressable>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text weight="600" numberOfLines={2}>{i.productName}</Text>
                    <Text variant="xs" color="muted">{money(i.unitPrice)} / {i.unit}{i.unitFactor !== 1 ? ` (${Number(i.unitFactor)} units)` : ''} · {i.taxRate}% GST</Text>
                    {i.schemeName && <Text variant="xs" color="success">{i.freeQuantity ? `${quantity(i.freeQuantity)} free · ` : ''}{i.schemeName}</Text>}
                    {i.issue && <Text variant="xs" color="danger">{i.issue}</Text>}
                    <View style={styles.rowBetween}>
                      <QuantityStepper value={Number(i.quantity)} min={1} onChange={(v) => update.mutate({ id: i.id, qty: v })} label={`Quantity of ${i.productName}`} />
                      <Text weight="700" num>{money(i.lineTotal)}</Text>
                    </View>
                  </View>
                  <IconButton icon="trash-2" label={`Remove ${i.productName}`} color={colors.danger} onPress={() => remove.mutate(i.id)} />
                </View>
              </Card>
            ))}
            <Card title="Summary"><TaxBreakdown t={c} /></Card>
            {!c.checkoutReady && <Alert tone="warning">Some items are unavailable in the requested quantity. Adjust them to continue.</Alert>}
          </>
        )}
      </QueryState>
    </Screen>
  )
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  thumb: { borderRadius: radius.md, overflow: 'hidden' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
})
