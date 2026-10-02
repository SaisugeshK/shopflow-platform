import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as ImagePicker from 'expo-image-picker'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { Image, StyleSheet, View } from 'react-native'
import { RequirePermission } from '@/components/admin/RequirePermission'
import { imageUri } from '@/components/shop/ProductCard'
import { Button, IconButton } from '@/components/ui/Button'
import { Badge, Card, KeyValue, ListRow, StatusBadge } from '@/components/ui/Data'
import { EmptyState, QueryState } from '@/components/ui/Feedback'
import { Grid, Screen, useColumns } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { toast } from '@/components/ui/Toast'
import { api, uploadImage } from '@/services/api'
import type { MovementRow, Product } from '@/services/types'
import { useCan } from '@/store/auth'
import { colors, radius } from '@/theme/tokens'
import { dateTime, money, quantity, titleCase } from '@/utils/format'

/** O05 Product detail: price/GST, stock, recent movements and images. */
export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const qc = useQueryClient()
  const canWrite = useCan('PRODUCT_WRITE')
  const canStock = useCan('STOCK_READ')
  const columns = Math.max(2, Math.min(4, useColumns(150)))
  const q = useQuery({ queryKey: ['product', id], queryFn: () => api.get<Product>(`/api/v1/products/${id}`) })
  const movements = useQuery({ queryKey: ['movements', id], queryFn: () => api.page<MovementRow>('/api/v1/stock/movements', { productId: id, pageSize: 10 }), enabled: canStock })
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['product', id] }); qc.invalidateQueries({ queryKey: ['products'] }) }
  const toggle = useMutation({
    mutationFn: (active: boolean) => api.post<Product>(`/api/v1/products/${id}/${active ? 'activate' : 'deactivate'}`),
    onSuccess: (p) => { toast.success(p.active ? 'Product activated' : 'Product deactivated'); invalidate() },
    onError: (e) => toast.error(e),
  })
  const upload = useMutation({
    mutationFn: (asset: ImagePicker.ImagePickerAsset) => uploadImage(`/api/v1/products/${id}/images`, asset),
    onSuccess: () => { toast.success('Image uploaded'); invalidate() },
    onError: (e) => toast.error(e),
  })
  const imageAction = useMutation({
    mutationFn: ({ imageId, action }: { imageId: string; action: 'primary' | 'remove' }) =>
      action === 'primary' ? api.post(`/api/v1/products/${id}/images/${imageId}/primary`) : api.del(`/api/v1/products/${id}/images/${imageId}`),
    onSuccess: invalidate,
    onError: (e) => toast.error(e),
  })
  const pick = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [1, 1] })
    if (!r.canceled && r.assets[0]) upload.mutate(r.assets[0])
  }
  const p = q.data
  return (
    <RequirePermission anyOf={['PRODUCT_READ']}>
      <Stack.Screen options={{ title: p?.name ?? 'Product' }} />
      <Screen
        onRefresh={() => { q.refetch(); movements.refetch() }}
        refreshing={q.isRefetching}
        footer={canWrite && p ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button variant="secondary" style={{ flex: 1 }} loading={toggle.isPending} onPress={() => toggle.mutate(!p.active)}>{p.active ? 'Deactivate' : 'Activate'}</Button>
            <Button icon="edit-2" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/admin/product-form', params: { id: p.id } })}>Edit</Button>
          </View>
        ) : undefined}
      >
        <QueryState query={q}>
          {(p) => (
            <>
              <View style={{ gap: 6 }}>
                <Text variant="small" color="muted">{p.sku} · {p.categoryName}</Text>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  <StatusBadge status={p.stockStatus} />
                  {!p.active && <Badge>Inactive</Badge>}
                  {p.featured && <Badge tone="primary">Featured</Badge>}
                </View>
              </View>
              <Card title="Stock">
                <KeyValue items={[
                  ['On hand', `${quantity(p.onHand)} ${p.unit}`], ['Reserved', quantity(p.reserved)],
                  ['Available', <Text key="a" weight="700" num>{quantity(p.available)}</Text>], ['Minimum', quantity(p.minimumStock)],
                ]} />
              </Card>
              <Card title="Price & tax">
                <KeyValue items={[
                  ['Selling price', money(p.sellingPrice)], ['Purchase price (internal)', money(p.purchasePrice)], ['MRP', p.mrp != null ? money(p.mrp) : undefined],
                  ['GST rate', `${p.gstRate}%`], ['HSN', p.hsnCode], ['Unit', p.unit], ['Brand', p.brand], ['Updated', dateTime(p.updatedAt)],
                ]} />
                {p.description && <Text variant="small" color="muted" style={{ marginTop: 10 }}>{p.description}</Text>}
              </Card>
              <Card title="Images" actions={canWrite ? <Button size="sm" variant="secondary" icon="upload" loading={upload.isPending} onPress={pick}>Upload</Button> : undefined}>
                {p.images.length === 0 ? <EmptyState icon="image" title="No images" description="PNG, JPEG or WebP up to 5 MB." /> : (
                  <Grid columns={columns}>
                    {p.images.map((img) => (
                      <View key={img.id} style={styles.imageCard}>
                        <Image source={{ uri: imageUri(img.url) }} style={styles.image} resizeMode="cover" accessibilityLabel={p.name} />
                        {canWrite && (
                          <View style={styles.imageActions}>
                            {img.primary ? <Badge tone="primary">Primary</Badge> : <IconButton icon="star" label="Make primary" size={18} onPress={() => imageAction.mutate({ imageId: img.id, action: 'primary' })} />}
                            <IconButton icon="trash-2" label="Remove image" size={18} color={colors.danger} onPress={() => imageAction.mutate({ imageId: img.id, action: 'remove' })} />
                          </View>
                        )}
                      </View>
                    ))}
                  </Grid>
                )}
              </Card>
              {canStock && (
                <Card title="Recent stock movements" padded={false} actions={<Button size="sm" variant="ghost" onPress={() => router.push({ pathname: '/admin/movements', params: { productId: p.id } })}>All</Button>}>
                  <QueryState query={movements} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No movements yet" />}>
                    {(d) => <>{d.items.map((m) => (
                      <ListRow key={m.id} title={titleCase(m.movementType)} subtitle={`${dateTime(m.createdAt)}${m.referenceNumber ? ` · ${m.referenceNumber}` : ''}`}
                        right={<><Text weight="700" num color={m.direction === 'IN' ? 'success' : 'danger'}>{m.direction === 'IN' ? '+' : '−'}{quantity(m.quantity)}</Text><Text variant="xs" color="muted">Bal {quantity(m.balanceAfter)}</Text></>} />
                    ))}</>}
                  </QueryState>
                </Card>
              )}
            </>
          )}
        </QueryState>
      </Screen>
    </RequirePermission>
  )
}

const styles = StyleSheet.create({
  imageCard: { borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  image: { width: '100%', aspectRatio: 1, backgroundColor: colors.surface2 },
  imageActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
})
