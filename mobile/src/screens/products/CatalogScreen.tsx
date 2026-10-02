import { useQuery } from '@tanstack/react-query'
import { useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { ProductCard } from '@/components/shop/ProductCard'
import { EmptyState } from '@/components/ui/Feedback'
import { ChipGroup, SearchBar } from '@/components/ui/Form'
import { PagedList, useColumns } from '@/components/ui/Screen'
import { useDebounced } from '@/hooks/useDebounced'
import { api } from '@/services/api'
import type { CatalogProduct, Category } from '@/services/types'

/** C02 Product list: search, category filter, infinite scroll, responsive grid. */
export default function CatalogScreen() {
  const params = useLocalSearchParams<{ q?: string; categoryId?: string }>()
  const [q, setQ] = useState(params.q ?? '')
  const [categoryId, setCategoryId] = useState(params.categoryId ?? '')
  useEffect(() => {
    if (params.q !== undefined) setQ(params.q)
    if (params.categoryId !== undefined) setCategoryId(params.categoryId)
  }, [params.q, params.categoryId])
  const debounced = useDebounced(q)
  const columns = useColumns(170)
  const categories = useQuery({ queryKey: ['catalog-categories'], queryFn: () => api.get<Category[]>('/api/v1/catalog/categories') })
  return (
    <PagedList<CatalogProduct>
      queryKey={['catalog', debounced, categoryId]}
      fetchPage={(page, pageSize) => api.page<CatalogProduct>('/api/v1/catalog/products', { q: debounced, categoryId, page, pageSize })}
      keyOf={(p) => p.id}
      pageSize={24}
      columns={columns}
      header={
        <View style={{ gap: 12 }}>
          <SearchBar value={q} onChangeText={setQ} placeholder="Search by name or SKU" />
          <ChipGroup value={categoryId} onChange={setCategoryId} options={[{ value: '', label: 'All' }, ...(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
        </View>
      }
      empty={<EmptyState icon="search" title="No products found" description="Try another search or category." />}
      renderItem={(p) => <ProductCard p={p} />}
    />
  )
}
