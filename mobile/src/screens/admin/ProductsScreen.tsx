import { router } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { ListFilters } from '@/components/admin/Filters'
import { RequirePermission } from '@/components/admin/RequirePermission'
import { ProductImage } from '@/components/shop/ProductCard'
import { Button } from '@/components/ui/Button'
import { Badge, ListRow, StatusBadge } from '@/components/ui/Data'
import { EmptyState } from '@/components/ui/Feedback'
import { Field, Select } from '@/components/ui/Form'
import { PagedList } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { useCategories } from '@/features/catalog'
import { useDebounced } from '@/hooks/useDebounced'
import { api } from '@/services/api'
import type { Product } from '@/services/types'
import { useCan } from '@/store/auth'
import { money, quantity } from '@/utils/format'

/** O04/AD06 Products: catalogue, prices, GST and stock. */
export default function ProductsScreen() {
  const canWrite = useCan('PRODUCT_WRITE')
  const categories = useCategories()
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [active, setActive] = useState('true')
  const q = useDebounced(search)
  return (
    <RequirePermission anyOf={['PRODUCT_READ']}>
      <PagedList<Product>
        queryKey={['products', q, categoryId, active]}
        fetchPage={(page, pageSize) => api.page<Product>('/api/v1/products', { q, categoryId, active, page, pageSize })}
        keyOf={(p) => p.id}
        header={
          <ListFilters search={search} onSearch={setSearch} placeholder="Name, SKU or HSN"
            chips={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }, { value: '', label: 'All' }]} chip={active} onChip={setActive}
            activeCount={categoryId ? 1 : 0} onClear={() => setCategoryId('')}
            action={canWrite ? <Button icon="plus" onPress={() => router.push('/admin/product-form')} accessibilityLabel="Add product">Add</Button> : undefined}
            sheet={
              <Field label="Category">
                <Select label="Category" value={categoryId} onChange={setCategoryId} options={[{ value: '', label: 'All categories' }, ...(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
              </Field>
            } />
        }
        empty={<EmptyState icon="package" title="No products" description="Add products with price, GST rate and opening stock." action={canWrite ? <Button onPress={() => router.push('/admin/product-form')}>Add product</Button> : undefined} />}
        renderItem={(p) => (
          <ListRow
            onPress={() => router.push(`/admin/product/${p.id}`)}
            title={
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <View style={{ borderRadius: 8, overflow: 'hidden' }}><ProductImage url={p.imageUrl} size={44} /></View>
                <View style={{ flex: 1 }}>
                  <Text weight="600" numberOfLines={1}>{p.name}</Text>
                  <Text variant="xs" color="muted" numberOfLines={1}>{p.sku} · {p.categoryName} · GST {p.gstRate}%</Text>
                </View>
              </View>
            }
            meta={
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                <StatusBadge status={p.stockStatus} />
                {!p.active && <Badge>Inactive</Badge>}
                {p.featured && <Badge tone="primary">Featured</Badge>}
              </View>
            }
            right={
              <>
                <Text weight="700" num>{money(p.sellingPrice)}</Text>
                <Text variant="xs" color="muted">{quantity(p.available)} {p.unit}</Text>
              </>
            }
          />
        )}
      />
    </RequirePermission>
  )
}
