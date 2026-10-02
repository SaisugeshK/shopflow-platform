import { useQueries } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { Card, ListRow, StatusBadge } from '@/components/ui/Data'
import { EmptyState, Spinner } from '@/components/ui/Feedback'
import { SearchBar } from '@/components/ui/Form'
import { Screen } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { useDebounced } from '@/hooks/useDebounced'
import { api } from '@/services/api'
import type { CustomerSummary, Invoice, Order, Product } from '@/services/types'
import { useAuthStore } from '@/store/auth'
import { money } from '@/utils/format'

/** Global search across orders, customers, products and invoices (only sections the user may see). */
export default function SearchScreen() {
  const [text, setText] = useState('')
  const q = useDebounced(text.trim(), 350)
  const perms = useAuthStore((s) => s.user?.permissions ?? [])
  const sections = [
    { key: 'orders', perm: 'ORDER_READ', path: '/api/v1/orders' },
    { key: 'customers', perm: 'CUSTOMER_READ', path: '/api/v1/customers' },
    { key: 'products', perm: 'PRODUCT_READ', path: '/api/v1/products' },
    { key: 'invoices', perm: 'INVOICE_READ', path: '/api/v1/invoices' },
  ].filter((s) => perms.includes(s.perm))
  const results = useQueries({
    queries: sections.map((s) => ({ queryKey: ['search', s.key, q], queryFn: () => api.page<unknown>(s.path, { q, pageSize: 8 }), enabled: q.length > 0 })),
  })
  const by = Object.fromEntries(sections.map((s, i) => [s.key, results[i]?.data?.items ?? []])) as Record<string, unknown[]>
  const loading = q.length > 0 && results.some((r) => r.isLoading)
  const total = Object.values(by).reduce((n, l) => n + l.length, 0)
  return (
    <Screen>
      <SearchBar value={text} onChangeText={setText} placeholder="Order, customer, mobile, SKU or invoice" autoFocus />
      {!q ? <EmptyState icon="search" title="Search everything" description="Try an order number, customer name, mobile, SKU or invoice number." /> : loading ? <Spinner /> : total === 0 ? <EmptyState title="No matches" /> : (
        <View style={{ gap: 16 }}>
          {(by.orders?.length ?? 0) > 0 && (
            <Card title="Orders" padded={false}>
              {(by.orders as Order[]).map((o) => <ListRow key={o.id} title={o.orderNumber} subtitle={o.customerName} right={<StatusBadge status={o.status} />} onPress={() => router.push(`/admin/order/${o.id}`)} />)}
            </Card>
          )}
          {(by.customers?.length ?? 0) > 0 && (
            <Card title="Customers" padded={false}>
              {(by.customers as CustomerSummary[]).map((c) => <ListRow key={c.id} title={c.shopName} subtitle={`${c.customerCode} · ${c.mobileNumber}`} right={<Text num variant="small">{money(c.outstanding)}</Text>} onPress={() => router.push(`/admin/customer/${c.id}`)} />)}
            </Card>
          )}
          {(by.products?.length ?? 0) > 0 && (
            <Card title="Products" padded={false}>
              {(by.products as Product[]).map((p) => <ListRow key={p.id} title={p.name} subtitle={p.sku} right={<StatusBadge status={p.stockStatus} />} onPress={() => router.push(`/admin/product/${p.id}`)} />)}
            </Card>
          )}
          {(by.invoices?.length ?? 0) > 0 && (
            <Card title="Invoices" padded={false}>
              {(by.invoices as Invoice[]).map((i) => <ListRow key={i.id} title={i.invoiceNumber ?? 'Draft'} subtitle={i.buyer?.name} right={<Text num variant="small">{money(i.grandTotal)}</Text>} onPress={() => router.push(`/admin/invoice/${i.id}`)} />)}
            </Card>
          )}
        </View>
      )}
    </Screen>
  )
}
