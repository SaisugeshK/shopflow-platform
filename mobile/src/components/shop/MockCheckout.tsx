import { Feather } from '@expo/vector-icons'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { View } from 'react-native'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Feedback'
import { Sheet } from '@/components/ui/Overlay'
import { Text } from '@/components/ui/Text'
import { toast } from '@/components/ui/Toast'
import { api } from '@/services/api'
import type { PaymentIntent } from '@/services/types'
import { colors } from '@/theme/tokens'
import { money } from '@/utils/format'

/**
 * Stage 1 stand-in for the provider's hosted checkout. It asks the mock gateway to send signed webhooks; the order is
 * marked paid only when the backend processes the webhook, exactly as with the real gateway.
 */
export function MockCheckoutSheet({ open, intent, onClose }: { open: boolean; intent: PaymentIntent; onClose: () => void }) {
  const qc = useQueryClient()
  const simulate = useMutation({
    mutationFn: (outcome: 'SUCCESS' | 'FAILED' | 'CANCELLED') =>
      api.post<{ providerPaymentId: string; clientSignature: string }>(`/api/v1/dev/payments/${intent.paymentId}/simulate`, { outcome }),
    onSuccess: async (r, outcome) => {
      if (outcome === 'SUCCESS') {
        await api.post(`/api/v1/payments/${intent.paymentId}/verify`, { providerPaymentId: r.providerPaymentId, signature: r.clientSignature }).catch(() => undefined)
        toast.success('Payment successful')
      } else {
        toast.warning(outcome === 'FAILED' ? 'Payment failed' : 'Payment cancelled', 'You can retry from the order page.')
      }
      qc.invalidateQueries({ queryKey: ['order'] })
      qc.invalidateQueries({ queryKey: ['my-orders'] })
      onClose()
    },
    onError: (e) => toast.error(e),
  })
  if (intent.provider !== 'mock') {
    return (
      <Sheet open={open} onClose={onClose} title="Payment">
        <Alert>{`Online checkout for ${intent.provider} opens here once the production gateway is enabled.`}</Alert>
      </Sheet>
    )
  }
  return (
    <Sheet open={open} onClose={onClose} title="Test payment gateway" footer={
      <View style={{ gap: 8 }}>
        <Button variant="success" icon="check-circle" size="lg" block loading={simulate.isPending && simulate.variables === 'SUCCESS'} onPress={() => simulate.mutate('SUCCESS')}>Pay now</Button>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button variant="secondary" style={{ flex: 1 }} loading={simulate.isPending && simulate.variables === 'CANCELLED'} onPress={() => simulate.mutate('CANCELLED')}>Cancel</Button>
          <Button variant="danger" icon="x-circle" style={{ flex: 1 }} loading={simulate.isPending && simulate.variables === 'FAILED'} onPress={() => simulate.mutate('FAILED')}>Simulate failure</Button>
        </View>
      </View>
    }>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="credit-card" size={26} color={colors.primary} />
        </View>
        <Text variant="small" color="muted">Amount</Text>
        <Text style={{ fontSize: 30, fontWeight: '800' }} num>{money(intent.amount)}</Text>
        <Text variant="xs" color="muted">{intent.paymentNumber} · {intent.providerOrderId}</Text>
      </View>
      <Alert tone="warning">Development mode: no real money is charged.</Alert>
    </Sheet>
  )
}
