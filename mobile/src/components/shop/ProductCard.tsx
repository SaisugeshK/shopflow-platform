import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useState } from 'react'
import { Image, Pressable, StyleSheet, View } from 'react-native'
import { Button } from '@/components/ui/Button'
import { Badge, StatusBadge } from '@/components/ui/Data'
import { QuantityStepper } from '@/components/ui/Form'
import { Text } from '@/components/ui/Text'
import { useAddToCart } from '@/features/shop'
import { API_BASE } from '@/services/api'
import type { CatalogProduct } from '@/services/types'
import { colors, radius, shadow } from '@/theme/tokens'
import { money } from '@/utils/format'

/** Image URLs from the API may be relative to the backend. */
export function imageUri(url?: string): string | undefined {
  if (!url) return undefined
  return /^https?:/.test(url) ? url : `${API_BASE}${url}`
}

export function ProductImage({ url, size }: { url?: string; size?: number }) {
  const uri = imageUri(url)
  return (
    <View style={[styles.image, size ? { width: size, height: size, aspectRatio: undefined } : null]}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors /> : <Feather name="package" size={size ? size / 3 : 34} color={colors.muted} />}
    </View>
  )
}

export function ProductCard({ p }: { p: CatalogProduct }) {
  const [qty, setQty] = useState(1)
  const add = useAddToCart()
  const out = p.stockStatus === 'OUT_OF_STOCK'
  return (
    <View style={styles.card}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${p.name}, ${money(p.price)}`} onPress={() => router.push(`/shop/product/${p.id}`)}>
        <ProductImage url={p.imageUrl} />
        <View style={styles.body}>
          <View style={styles.rowBetween}>
            <Text variant="xs" color="muted" numberOfLines={1} style={{ flex: 1 }}>{p.categoryName}</Text>
            {p.customPrice && <Badge tone="success">Your price</Badge>}
          </View>
          <Text weight="600" numberOfLines={2} style={{ minHeight: 44 }}>{p.name}</Text>
          <View style={styles.price}>
            <Text variant="h3" num>{money(p.price)}</Text>
            {p.mrp != null && p.mrp > p.price && <Text variant="xs" color="muted" style={{ textDecorationLine: 'line-through' }}>{money(p.mrp)}</Text>}
          </View>
          <Text variant="xs" color="muted">per {p.unit} · + {p.gstRate}% GST</Text>
          <StatusBadge status={p.stockStatus} />
        </View>
      </Pressable>
      <View style={styles.actions}>
        <QuantityStepper value={qty} onChange={setQty} min={1} max={p.availableQuantity ?? undefined} disabled={out} label={`Quantity of ${p.name}`} />
        <Button size="sm" icon="shopping-cart" disabled={out} loading={add.isPending} onPress={() => add.mutate({ productId: p.id, qty })} style={{ flex: 1 }} accessibilityLabel={`Add ${p.name} to cart`}>Add</Button>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', flex: 1, ...shadow.card },
  image: { width: '100%', aspectRatio: 4 / 3, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  body: { padding: 12, gap: 6 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  price: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 12, marginTop: 'auto' },
})
