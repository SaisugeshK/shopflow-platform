import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useDismiss } from '@/hooks/useDismiss'
import { useNavigate } from 'react-router-dom'
import { IconButton } from '@/components/ui/Button'
import { EmptyState, Spinner } from '@/components/ui/Feedback'
import { api } from '@/services/api'
import type { Notification } from '@/services/types'
import { useAuthStore } from '@/stores/auth'
import { relativeTime } from '@/utils/format'

function linkFor(n: Notification, isCustomer: boolean): string | null {
  if (!n.entityId) return null
  const base = isCustomer ? '/shop' : '/app'
  switch (n.entityType) {
    case 'ORDER': return `${base}/orders/${n.entityId}`
    case 'INVOICE': return `${base}/invoices/${n.entityId}`
    case 'CUSTOMER': return isCustomer ? '/shop/profile' : `/app/customers/${n.entityId}`
    case 'PAYMENT': return isCustomer ? '/shop/payments' : `/app/payments/${n.entityId}`
    case 'SALES_RETURN': return isCustomer ? '/shop/returns' : '/app/returns'
    default: return null
  }
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useDismiss<HTMLDivElement>(open, useCallback(() => setOpen(false), []))
  const qc = useQueryClient()
  const navigate = useNavigate()
  const isCustomer = useAuthStore((s) => s.user?.role === 'CUSTOMER')
  const unread = useQuery({ queryKey: ['notifications', 'unread'], queryFn: () => api.get<{ unread: number }>('/api/v1/notifications/unread-count'), refetchInterval: 60_000 })
  const list = useQuery({ queryKey: ['notifications', 'list'], queryFn: () => api.page<Notification>('/api/v1/notifications', { pageSize: 15 }), enabled: open })
  const markAll = useMutation({ mutationFn: () => api.post('/api/v1/notifications/read-all'), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) })
  const markOne = useMutation({ mutationFn: (id: string) => api.post(`/api/v1/notifications/${id}/read`), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) })
  const count = unread.data?.unread ?? 0

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <IconButton label={count ? `Notifications, ${count} unread` : 'Notifications'} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Bell size={19} />
        {count > 0 && <span className="dot-indicator" aria-hidden />}
      </IconButton>
      {open && (
          <div className="menu notification-panel" role="dialog" aria-label="Notifications">
            <div className="row-between" style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border)' }}>
              <strong>Notifications</strong>
              <button className="btn btn-ghost btn-sm" onClick={() => markAll.mutate()} disabled={count === 0}>
                <CheckCheck size={14} /> Mark all read
              </button>
            </div>
            {list.isLoading ? (
              <div style={{ padding: 24 }}><Spinner /></div>
            ) : list.data?.items.length ? (
              list.data.items.map((n) => (
                <button
                  key={n.id}
                  className={`notification ${n.read ? '' : 'unread'}`}
                  style={{ width: '100%', textAlign: 'left', border: 'none', background: undefined }}
                  onClick={() => {
                    if (!n.read) markOne.mutate(n.id)
                    const to = linkFor(n, isCustomer)
                    setOpen(false)
                    if (to) navigate(to)
                  }}
                >
                  <div className="row-between"><strong className="small">{n.title}</strong><span className="xs muted">{relativeTime(n.createdAt)}</span></div>
                  {n.body && <div className="xs muted">{n.body}</div>}
                </button>
              ))
            ) : (
              <EmptyState title="You're all caught up" icon={<Bell size={24} />} />
            )}
          </div>
      )}
    </div>
  )
}
