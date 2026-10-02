import { useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { ProductCard } from '@/components/shop/ProductCard'
import { Button } from '@/components/ui/Button'
import { StatCard } from '@/components/ui/Data'
import { EmptyState, QueryState } from '@/components/ui/Feedback'
import { SearchBar } from '@/components/ui/Form'
import { Grid, Screen, SectionTitle, useColumns } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { useCart } from '@/features/shop'
import { api } from '@/services/api'
import type { CatalogProduct, Category, Order } from '@/services/types'
import { useAuthStore } from '@/store/auth'
import { colors, radius } from '@/theme/tokens'

interface CustomerHome {
  outstanding: number
  openOrders: number
  openInvoices: number
  recentOrders: Order[]
  recentlyOrderedProducts: { productId: string; product: string }[]
}

function Chip({ label, icon, onPress }: { label: string; icon?: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.chip, pressed && { backgroundColor: colors.surface2 }]}>
      <Text variant="small" weight="600">{icon ? `${icon} ` : ''}{label}</Text>
    </Pressable>
  )
}

/** Three summary cards: side by side on tablets, a swipeable row on phones. */
function StatRow({ children, wide }: { children: React.ReactNode[]; wide: boolean }) {
  if (wide) return <Grid columns={children.length}>{children}</Grid>
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 4 }} style={{ marginHorizontal: -16 }}>
      <View style={{ width: 4 }} />
      {children.map((c, i) => <View key={i} style={{ width: 200 }}>{c}</View>)}
    </ScrollView>
  )
}

/** C01 Customer home (§35). */
export default function CustomerHomeScreen() {
  const user = useAuthStore((s) => s.user)!
  const [q, setQ] = useState('')
  const home = useQuery({ queryKey: ['customer-home'], queryFn: () => api.get<CustomerHome>('/api/v1/dashboard/customer') })
  const categories = useQuery({ queryKey: ['catalog-categories'], queryFn: () => api.get<Category[]>('/api/v1/catalog/categories') })
  const featured = useQuery({ queryKey: ['catalog', 'featured'], queryFn: () => api.page<CatalogProduct>('/api/v1/catalog/products', { featured: true, pageSize: 8 }) })
  const cart = useCart()
  const columns = useColumns(170)
  const statColumns = useColumns(160)
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const refreshing = home.isRefetching || featured.isRefetching

  return (
    <Screen onRefresh={() => { home.refetch(); categories.refetch(); featured.refetch(); cart.refetch() }} refreshing={refreshing}>
      <View>
        <Text variant="h1">{greeting}, {user.fullName.split(' ')[0]}</Text>
        <Text color="muted">{user.customer?.shopName}</Text>
      </View>
      <SearchBar value={q} onChangeText={setQ} placeholder="Search products" onSubmit={() => router.push({ pathname: '/shop/products', params: { q } })} />
      <StatRow wide={statColumns >= 3}>
        {[
          <StatCard key="o" label="Outstanding balance" value={home.data?.outstanding} hint={`${home.data?.openInvoices ?? 0} open invoices`} tone="warning" icon="credit-card" onPress={() => router.push('/shop/outstanding')} />,
          <StatCard key="c" label="Current orders" value={home.data?.openOrders ?? '—'} isMoney={false} hint="Track delivery status" tone="primary" icon="truck" onPress={() => router.push('/shop/orders')} />,
          <StatCard key="k" label="Cart" value={cart.data?.grandTotal} hint={`${cart.data?.itemCount ?? 0} items`} tone="success" icon="shopping-cart" onPress={() => router.push('/shop/cart')} />,
        ]}
      </StatRow>
      {categories.data && categories.data.length > 0 && (
        <View style={{ gap: 8 }}>
          <SectionTitle>Categories</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {categories.data.map((c) => <Chip key={c.id} label={c.name} onPress={() => router.push({ pathname: '/shop/products', params: { categoryId: c.id } })} />)}
          </ScrollView>
        </View>
      )}
      {(home.data?.recentlyOrderedProducts.length ?? 0) > 0 && (
        <View style={{ gap: 8 }}>
          <SectionTitle>Quick reorder</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {home.data!.recentlyOrderedProducts.map((p) => <Chip key={p.productId} icon="↻" label={p.product} onPress={() => router.push(`/shop/product/${p.productId}`)} />)}
          </ScrollView>
        </View>
      )}
      <SectionTitle action={<Button variant="ghost" size="sm" onPress={() => router.push('/shop/products')}>See all</Button>}>Featured products</SectionTitle>
      <QueryState query={featured} isEmpty={(d) => d.items.length === 0} empty={<EmptyState icon="package" title="No featured products" action={<Button onPress={() => router.push('/shop/products')}>Browse catalogue</Button>} />}>
        {(d) => <Grid columns={columns}>{d.items.map((p) => <ProductCard key={p.id} p={p} />)}</Grid>}
      </QueryState>
    </Screen>
  )
}

const styles = StyleSheet.create({
  chip: { height: 36, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, justifyContent: 'center' },
})
