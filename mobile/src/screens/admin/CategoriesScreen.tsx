import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { RequirePermission } from '@/components/admin/RequirePermission'
import { Button } from '@/components/ui/Button'
import { Card, ListRow, StatusBadge } from '@/components/ui/Data'
import { EmptyState, QueryState } from '@/components/ui/Feedback'
import { Field, Input } from '@/components/ui/Form'
import { Sheet } from '@/components/ui/Overlay'
import { Screen } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { toast } from '@/components/ui/Toast'
import { useCategories } from '@/features/catalog'
import { api } from '@/services/api'
import type { Category } from '@/services/types'
import { useCan } from '@/store/auth'

/** O07 Categories. */
export default function CategoriesScreen() {
  const q = useCategories()
  const qc = useQueryClient()
  const canWrite = useCan('PRODUCT_WRITE')
  const [editing, setEditing] = useState<Category | 'new' | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  useEffect(() => {
    if (editing && editing !== 'new') { setName(editing.name); setDescription(editing.description ?? ''); setSortOrder(String(editing.sortOrder)) }
    else if (editing === 'new') { setName(''); setDescription(''); setSortOrder('0') }
  }, [editing])
  const save = useMutation({
    mutationFn: () => {
      const body = { name, description: description || undefined, sortOrder: Number(sortOrder) || 0 }
      return editing === 'new' ? api.post('/api/v1/categories', body) : api.patch(`/api/v1/categories/${(editing as Category).id}`, body)
    },
    onSuccess: () => { toast.success('Category saved'); setEditing(null); qc.invalidateQueries({ queryKey: ['categories'] }) },
    onError: (e) => toast.error(e),
  })
  const toggle = useMutation({
    mutationFn: (c: Category) => api.post(`/api/v1/categories/${c.id}/${c.active ? 'deactivate' : 'activate'}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); setEditing(null) },
    onError: (e) => toast.error(e),
  })
  return (
    <RequirePermission anyOf={['PRODUCT_READ']}>
      <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
        {canWrite && <Button icon="plus" onPress={() => setEditing('new')}>Add category</Button>}
        <QueryState query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState icon="grid" title="No categories" />}>
          {(d) => (
            <Card padded={false}>
              {d.map((c) => (
                <ListRow key={c.id} title={c.name} subtitle={c.description ?? `Display order ${c.sortOrder}`} onPress={canWrite ? () => setEditing(c) : undefined}
                  right={<><StatusBadge status={c.active ? 'ACTIVE' : 'INACTIVE'} /><Text variant="xs" color="muted">{c.productCount} products</Text></>} />
              ))}
            </Card>
          )}
        </QueryState>
        <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add category' : 'Edit category'} footer={
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {editing && editing !== 'new' && <Button variant="secondary" style={{ flex: 1 }} loading={toggle.isPending} onPress={() => toggle.mutate(editing)}>{editing.active ? 'Deactivate' : 'Activate'}</Button>}
            <Button style={{ flex: 1 }} loading={save.isPending} disabled={name.trim().length < 2} onPress={() => save.mutate()}>Save</Button>
          </View>
        }>
          <Field label="Name" required><Input value={name} onChangeText={setName} maxLength={120} accessibilityLabel="Category name" /></Field>
          <Field label="Description"><Input value={description} onChangeText={setDescription} multiline accessibilityLabel="Description" /></Field>
          <Field label="Display order"><Input value={sortOrder} onChangeText={(t) => setSortOrder(t.replace(/[^\d-]/g, ''))} keyboardType="number-pad" accessibilityLabel="Display order" /></Field>
        </Sheet>
      </Screen>
    </RequirePermission>
  )
}
