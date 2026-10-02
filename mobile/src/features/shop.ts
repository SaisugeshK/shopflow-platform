import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/Toast'
import type { TimelineStep } from '@/components/ui/Data'
import { api } from '@/services/api'
import type { Cart, Order, OrderStatus, StatusHistory } from '@/services/types'
import { dateTime, titleCase } from '@/utils/format'

export function useCart(enabled = true) {
  return useQuery({ queryKey: ['cart'], queryFn: () => api.get<Cart>('/api/v1/cart'), enabled })
}

export function useAddToCart() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ productId, qty }: { productId: string; qty: number }) => api.post<Cart>('/api/v1/cart/items', { productId, quantity: String(qty) }),
    onSuccess: (cart) => {
      qc.setQueryData(['cart'], cart)
      toast.success('Added to cart')
    },
    onError: (e) => toast.error(e),
  })
}

const FLOW: OrderStatus[] = ['PLACED', 'ACCEPTED', 'PACKING', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED']

/** Order tracking steps from the status history (same logic as the web order timeline). */
export function orderTimeline(order: Order, history: StatusHistory[]): TimelineStep[] {
  const when = (s: string) => history.find((h) => h.newStatus === s)
  const terminalFailure = ['CANCELLED', 'REJECTED', 'DELIVERY_FAILED'].includes(order.status)
  const reached = terminalFailure ? history.map((h) => h.newStatus) : FLOW.slice(0, FLOW.indexOf(order.status) + 1)
  const steps: TimelineStep[] = FLOW.filter((s) => !terminalFailure || reached.includes(s)).map((s) => {
    const h = when(s)
    const done = reached.includes(s) && (s !== order.status || s === 'COMPLETED')
    return {
      label: titleCase(s === 'PLACED' ? 'Order placed' : s),
      state: s === order.status && !terminalFailure && s !== 'COMPLETED' ? 'current' : done ? 'done' : 'upcoming',
      detail: h ? `${dateTime(h.changedAt)}${h.changedBy ? ` · ${h.changedBy}` : ''}${h.note ? ` · ${h.note}` : ''}` : undefined,
    }
  })
  if (terminalFailure) {
    const h = when(order.status)
    steps.push({ label: titleCase(order.status), state: 'failed', detail: h ? `${dateTime(h.changedAt)}${h.note ? ` · ${h.note}` : ''}` : undefined })
  }
  return steps
}
