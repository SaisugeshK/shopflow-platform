import { useQuery } from '@tanstack/react-query'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native'
import { imageUri, ProductImage } from '@/components/shop/ProductCard'
import { Button } from '@/components/ui/Button'
import { Badge, StatusBadge } from '@/components/ui/Data'
import { QueryState } from '@/components/ui/Feedback'
import { QuantityStepper } from '@/components/ui/Form'
import { Screen } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { useAddToCart } from '@/features/shop'
import { api } from '@/services/api'
import type { CatalogProduct } from '@/services/types'
import { colors, radius } from '@/theme/tokens'
import { money, quantity } from '@/utils/format'

/** C03 Product detail (§36): never shows internal purchase cost. */
export default function CatalogProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [qty, setQty] = useState(1)
  const [image, setImage] = useState(0)
  const add = useAddToCart()
  const { width } = useWindowDimensions()
  const wide = width >= 720
  const q = useQuery({ queryKey: ['catalog-product', id], queryFn: () => api.get<CatalogProduct>(`/api/v1/catalog/products/${id}`) })
  const p = q.data
  const out = p?.stockStatus === 'OUT_OF_STOCK'
  return (
    <>
      <Stack.Screen options={{ title: p?.name ?? 'Product' }} />
      <Screen
        onRefresh={() => q.refetch()}
        refreshing={q.isRefetching}
        footer={p && (
          <View style={styles.cta}>
            <QuantityStepper value={qty} onChange={setQty} min={1} max={p.availableQuantity ?? undefined} disabled={out} />
            <Button size="lg" icon="shopping-cart" style={{ flex: 1 }} loading={add.isPending} disabled={out}
              onPress={() => add.mutate({ productId: p.id, qty }, { onSuccess: () => router.push('/shop/cart') })}>
              {out ? 'Out of stock' : 'Add to cart'}
            </Button>
          </View>
        )}
      >
        <QueryState query={q}>
          {(p) => (
            <View style={{ flexDirection: wide ? 'row' : 'column', gap: 20 }}>
              <View style={{ flex: wide ? 1 : undefined, gap: 10 }}>
                <View style={styles.hero}>
                  {p.images.length ? <Image source={{ uri: imageUri(p.images[image]) }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel={p.name} /> : <ProductImage />}
                </View>
                {p.images.length > 1 && (
                  <ScrollView horizontal contentContainerStyle={{ gap: 8 }} showsHorizontalScrollIndicator={false}>
                    {p.images.map((src, i) => (
                      <Pressable key={src} accessibilityRole="button" accessibilityLabel={`Image ${i + 1}`} onPress={() => setImage(i)} style={[styles.thumb, i === image && { borderColor: colors.primary, borderWidth: 2 }]}>
                        <Image source={{ uri: imageUri(src) }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </View>
              <View style={{ flex: wide ? 1 : undefined, gap: 12 }}>
                <View style={{ gap: 4 }}>
                  <Text variant="small" color="muted">{p.categoryName}{p.brand ? ` · ${p.brand}` : ''}</Text>
                  <Text variant="h1">{p.name}</Text>
                  <Text variant="xs" color="muted">SKU {p.sku}{p.hsnCode ? ` · HSN ${p.hsnCode}` : ''}</Text>
                </View>
                <View style={styles.priceRow}>
                  <Text style={{ fontSize: 28, fontWeight: '800' }} num>{money(p.price)}</Text>
                  {p.mrp != null && p.mrp > p.price && <Text color="muted" style={{ textDecorationLine: 'line-through' }}>MRP {money(p.mrp)}</Text>}
                </View>
                {p.customPrice && <Badge tone="success">Your special price</Badge>}
                <Text variant="small" color="muted">Per {p.unit}, excluding {p.gstRate}% GST. Final prices and tax are confirmed at checkout.</Text>
                <View style={styles.priceRow}>
                  <StatusBadge status={p.stockStatus} />
                  {p.availableQuantity != null && <Text variant="small" color="muted">{quantity(p.availableQuantity)} {p.unit} available</Text>}
                </View>
                {p.description && <Text>{p.description}</Text>}
              </View>
            </View>
          )}
        </QueryState>
      </Screen>
    </>
  )
}

const styles = StyleSheet.create({
  hero: { width: '100%', aspectRatio: 1, borderRadius: radius.lg, backgroundColor: colors.surface2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 64, height: 64, borderRadius: radius.sm, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
})
