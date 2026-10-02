import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { View } from 'react-native'
import { Button, IconButton } from '@/components/ui/Button'
import { ListRow } from '@/components/ui/Data'
import { EmptyState } from '@/components/ui/Feedback'
import { PagedList } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { api } from '@/services/api'
import type { Notification } from '@/services/types'
import { useAuthStore } from '@/store/auth'
import { colors } from '@/theme/tokens'
import { relativeTime } from '@/utils/format'

function linkFor(n: Notification, isCustomer: boolean): string | null {
  if (!n.entityId) return null
  const base = isCustomer ? '/shop' : '/admin'
  switch (n.entityType) {
    case 'ORDER': return `${base}/order/${n.entityId}`
    case 'INVOICE': return `${base}/invoice/${n.entityId}`
    case 'CUSTOMER': return isCustomer ? '/shop/account' : `/admin/customer/${n.entityId}`
    case 'PAYMENT': return isCustomer ? '/shop/payments' : `/admin/payment/${n.entityId}`
    case 'SALES_RETURN': return isCustomer ? '/shop/returns' : '/admin/returns'
    default: return null
  }
}

/** Header bell with unread count; opens the notification list. */
export function NotificationBell() {
  const isCustomer = useAuthStore((s) => s.user?.role === 'CUSTOMER')
  const unread = useQuery({ queryKey: ['notifications', 'unread'], queryFn: () => api.get<{ unread: number }>('/api/v1/notifications/unread-count'), refetchInterval: 60_000 })
  const count = unread.data?.unread ?? 0
  return (
    <IconButton
      icon="bell"
      label={count ? `Notifications, ${count} unread` : 'Notifications'}
      badge={count}
      onPress={() => router.push(isCustomer ? '/shop/notifications' : '/admin/notifications')}
    />
  )
}

export function NotificationsScreen() {
  const qc = useQueryClient()
  const isCustomer = useAuthStore((s) => s.user?.role === 'CUSTOMER')
  const markAll = useMutation({ mutationFn: () => api.post('/api/v1/notifications/read-all'), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) })
  const markOne = useMutation({ mutationFn: (id: string) => api.post(`/api/v1/notifications/${id}/read`), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) })
  return (
    <PagedList<Notification>
      queryKey={['notifications', 'list']}
      fetchPage={(page, pageSize) => api.page<Notification>('/api/v1/notifications', { page, pageSize })}
      keyOf={(n) => n.id}
      header={<View style={{ alignItems: 'flex-end' }}><Button size="sm" variant="secondary" icon="check-square" loading={markAll.isPending} onPress={() => markAll.mutate()}>Mark all read</Button></View>}
      empty={<EmptyState icon="bell" title="You're all caught up" />}
      renderItem={(n) => (
        <ListRow
          icon={n.read ? 'bell' : 'bell'}
          title={<Text weight={n.read ? '500' : '700'} numberOfLines={1}>{n.title}</Text>}
          subtitle={n.body}
          meta={<Text variant="xs" color="muted">{relativeTime(n.createdAt)}</Text>}
          right={!n.read ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} accessibilityLabel="Unread" /> : undefined}
          onPress={() => {
            if (!n.read) markOne.mutate(n.id)
            const to = linkFor(n, isCustomer)
            if (to) router.push(to as never)
          }}
        />
      )}
    />
  )
}
