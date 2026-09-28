import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CircleCheck, CircleX, CreditCard } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Overlay'
import { useToast } from '@/components/ui/Toast'
import { api } from '@/services/api'
import type { PaymentIntent } from '@/services/types'
import { money } from '@/utils/format'

/**
 * Stage 1 stand-in for the provider's hosted checkout (§0A). It asks the mock gateway to send signed webhooks; the
 * order is marked paid only when the backend processes the webhook, exactly as with the real gateway.
 * In production this component is replaced by the provider's checkout (e.g. Razorpay).
 */
export function MockCheckoutDialog({ open, intent, onClose }: { open: boolean; intent: PaymentIntent; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const simulate = useMutation({
    mutationFn: (outcome: 'SUCCESS' | 'FAILED' | 'CANCELLED') =>
      api.post<{ providerPaymentId: string; clientSignature: string; webhookResults: string[] }>(`/api/v1/dev/payments/${intent.paymentId}/simulate`, { outcome }),
    onSuccess: async (r, outcome) => {
      if (outcome === 'SUCCESS') {
        await api.post(`/api/v1/payments/${intent.paymentId}/verify`, { providerPaymentId: r.providerPaymentId, signature: r.clientSignature }).catch(() => undefined)
        toast.success('Payment successful')
      } else {
        toast.show('warning', outcome === 'FAILED' ? 'Payment failed' : 'Payment cancelled', 'You can retry from the order page.')
      }
      qc.invalidateQueries({ queryKey: ['order'] })
      qc.invalidateQueries({ queryKey: ['my-orders'] })
      onClose()
    },
    onError: (e) => toast.error(e),
  })
  if (intent.provider !== 'mock') {
    return (
      <Modal open={open} onClose={onClose} title="Payment">
        <Alert tone="info">Online checkout for {intent.provider} opens here once the production gateway is enabled.</Alert>
      </Modal>
    )
  }
  return (
    <Modal open={open} onClose={onClose} title="Test payment gateway">
      <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
        <div className="icon-wrap tone-primary" style={{ width: 56, height: 56, borderRadius: 16, display: 'grid', placeItems: 'center' }}><CreditCard size={26} /></div>
        <div>
          <div className="small muted">Amount</div>
          <div className="price" style={{ fontSize: '1.75rem' }}>{money(intent.amount)}</div>
          <div className="xs muted">{intent.paymentNumber} · {intent.providerOrderId}</div>
        </div>
        <Alert tone="warning">Development mode: no real money is charged.</Alert>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Button variant="danger" icon={<CircleX size={16} />} loading={simulate.isPending && simulate.variables === 'FAILED'} onClick={() => simulate.mutate('FAILED')}>Simulate failure</Button>
          <Button variant="secondary" loading={simulate.isPending && simulate.variables === 'CANCELLED'} onClick={() => simulate.mutate('CANCELLED')}>Cancel</Button>
          <Button variant="success" icon={<CircleCheck size={16} />} loading={simulate.isPending && simulate.variables === 'SUCCESS'} onClick={() => simulate.mutate('SUCCESS')}>Pay now</Button>
        </div>
      </div>
    </Modal>
  )
}
