import { Feather } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { MockCheckoutSheet } from '@/components/shop/MockCheckout'
import { Button, type IconName } from '@/components/ui/Button'
import { Card, TaxBreakdown } from '@/components/ui/Data'
import { Alert, EmptyState, QueryState } from '@/components/ui/Feedback'
import { Field, Input } from '@/components/ui/Form'
import { Screen } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { useCart } from '@/features/shop'
import { api, ApiError, newIdempotencyKey } from '@/services/api'
import type { Address, Order, Outstanding } from '@/services/types'
import { colors, radius, tones } from '@/theme/tokens'
import { money, quantity } from '@/utils/format'

const METHODS: { value: string; label: string; hint: string; icon: IconName }[] = [
  { value: 'ONLINE', label: 'Pay online now', hint: 'UPI, cards and net banking via the payment gateway', icon: 'credit-card' },
  { value: 'CREDIT', label: 'Buy on credit', hint: 'Added to your account balance', icon: 'book' },
  { value: 'CASH', label: 'Cash on delivery', hint: 'Pay the delivery person', icon: 'dollar-sign' },
  { value: 'UPI', label: 'UPI on delivery', hint: 'Pay by UPI when goods arrive', icon: 'smartphone' },
]

function Radio({ selected, onPress, children, label }: { selected: boolean; onPress: () => void; children: React.ReactNode; label: string }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={label} onPress={onPress} style={[styles.option, selected && styles.optionActive]}>
      <View style={[styles.radio, selected && { borderColor: colors.primary }]}>{selected && <View style={styles.radioDot} />}</View>
      <View style={{ flex: 1 }}>{children}</View>
    </Pressable>
  )
}

/** C05 Checkout (§38) and C06 Order success. The order total is calculated by the backend. */
export default function CheckoutScreen() {
  const cart = useCart()
  const qc = useQueryClient()
  const addresses = useQuery({ queryKey: ['my-addresses'], queryFn: () => api.get<Address[]>('/api/v1/my/addresses') })
  const outstanding = useQuery({ queryKey: ['my-outstanding'], queryFn: () => api.get<Outstanding>('/api/v1/my/outstanding') })
  const [addressId, setAddressId] = useState('')
  const [method, setMethod] = useState('ONLINE')
  const [note, setNote] = useState('')
  const [placed, setPlaced] = useState<Order | null>(null)
  const [paying, setPaying] = useState(false)
  const key = useMemo(() => newIdempotencyKey(), [])
  const place = useMutation({
    mutationFn: () => api.post<Order>('/api/v1/orders', { addressId: addressId || undefined, paymentMethod: method, orderNote: note || undefined }, { 'Idempotency-Key': key }),
    onSuccess: (o) => {
      setPlaced(o)
      qc.invalidateQueries({ queryKey: ['cart'] })
      qc.invalidateQueries({ queryKey: ['customer-home'] })
      qc.invalidateQueries({ queryKey: ['my-orders'] })
      if (o.paymentMethod === 'ONLINE' && o.paymentIntent) setPaying(true)
    },
  })
  const err = place.error instanceof ApiError ? place.error : null
  const credit = outstanding.data
  const methods = METHODS.filter((m) => m.value !== 'CREDIT' || credit?.creditEnabled)
  const selectedAddress = addressId || addresses.data?.find((a) => a.isDefault)?.id || addresses.data?.[0]?.id

  if (placed) {
    return (
      <Screen>
        <Card>
          <View style={{ alignItems: 'center', gap: 12, paddingVertical: 12 }}>
            <View style={[styles.success, { backgroundColor: tones.success.bg }]}><Feather name="check-circle" size={34} color={colors.success} /></View>
            <Text variant="h2" accessibilityRole="header">Order placed</Text>
            <Text color="muted" align="center">Order <Text weight="700">{placed.orderNumber}</Text> for {money(placed.grandTotal)} has been sent to the shop.</Text>
            {placed.creditApprovalStatus === 'PENDING' && <Alert tone="warning">This credit order is above your available limit and needs the shop’s approval.</Alert>}
            {placed.paymentMethod === 'ONLINE' && !placed.paymentIntent && <Alert tone="warning">The payment service is busy. You can pay from the order page.</Alert>}
            <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch' }}>
              <Button variant="secondary" style={{ flex: 1 }} onPress={() => router.replace('/shop/products')}>Continue shopping</Button>
              <Button style={{ flex: 1 }} onPress={() => router.replace(`/shop/order/${placed.id}`)}>Track order</Button>
            </View>
          </View>
        </Card>
        {placed.paymentIntent && <MockCheckoutSheet open={paying} intent={placed.paymentIntent} onClose={() => { setPaying(false); router.replace(`/shop/order/${placed.id}`) }} />}
      </Screen>
    )
  }

  const c = cart.data
  return (
    <Screen footer={c && c.items.length > 0 ? (
      <View style={{ gap: 6 }}>
        {err && <Alert tone="danger">{err.message}</Alert>}
        <Button size="lg" block loading={place.isPending} disabled={!selectedAddress || !c.checkoutReady} onPress={() => place.mutate()}>
          {method === 'ONLINE' ? `Place order & pay ${money(c.grandTotal)}` : `Place order · ${money(c.grandTotal)}`}
        </Button>
      </View>
    ) : undefined}>
      <QueryState query={cart} isEmpty={(x) => x.items.length === 0} empty={<EmptyState icon="shopping-cart" title="Your cart is empty" action={<Button onPress={() => router.replace('/shop/products')}>Browse products</Button>} />}>
        {(c) => (
          <>
            <Card title="Delivery address" actions={<Button variant="ghost" size="sm" onPress={() => router.push('/shop/account')}>Manage</Button>}>
              <QueryState query={addresses} isEmpty={(a) => a.length === 0} empty={<EmptyState icon="map-pin" title="No address" action={<Button size="sm" onPress={() => router.push('/shop/account')}>Add address</Button>} />}>
                {(list) => (
                  <View style={{ gap: 8 }} accessibilityRole="radiogroup">
                    {list.map((a) => (
                      <Radio key={a.id} selected={selectedAddress === a.id} onPress={() => setAddressId(a.id)} label={`${a.label ?? 'Address'}: ${a.addressLine1}, ${a.city}`}>
                        <Text variant="small">{a.label ? <Text variant="small" weight="700">{a.label}: </Text> : null}{a.addressLine1}{a.addressLine2 ? `, ${a.addressLine2}` : ''}, {a.city}, {a.state} – {a.pincode}</Text>
                      </Radio>
                    ))}
                  </View>
                )}
              </QueryState>
            </Card>
            <Card title="Payment method">
              <View style={{ gap: 8 }} accessibilityRole="radiogroup">
                {methods.map((m) => (
                  <Radio key={m.value} selected={method === m.value} onPress={() => setMethod(m.value)} label={m.label}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Feather name={m.icon} size={18} color={colors.muted} />
                      <View style={{ flex: 1 }}>
                        <Text variant="small" weight="700">{m.label}</Text>
                        <Text variant="xs" color="muted">{m.hint}</Text>
                      </View>
                    </View>
                  </Radio>
                ))}
              </View>
              {method === 'CREDIT' && credit && (
                <View style={{ marginTop: 12 }}>
                  <Alert tone={credit.availableCredit >= c.grandTotal ? 'primary' : 'warning'}>
                    {`Available credit ${money(credit.availableCredit)} of ${money(credit.creditLimit)} · ${credit.creditDays} days to pay.${credit.availableCredit < c.grandTotal ? ' This order exceeds your available credit and may need approval.' : ''}`}
                  </Alert>
                </View>
              )}
            </Card>
            <Card title="Order note">
              <Field label="Note for the shop (optional)">
                <Input value={note} onChangeText={setNote} multiline maxLength={1000} accessibilityLabel="Note for the shop" />
              </Field>
            </Card>
            <Card title={`Order summary · ${c.itemCount} items`}>
              <View style={{ gap: 8 }}>
                {c.items.map((i) => (
                  <View key={i.id} style={styles.summaryRow}>
                    <Text variant="small" style={{ flex: 1 }}>{i.productName} × {quantity(i.quantity)}</Text>
                    <Text variant="small" num>{money(i.lineTotal)}</Text>
                  </View>
                ))}
                <View style={{ height: 8 }} />
                <TaxBreakdown t={c} />
              </View>
            </Card>
          </>
        )}
      </QueryState>
    </Screen>
  )
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, minHeight: 52 },
  optionActive: { borderColor: colors.primary, backgroundColor: '#F5F8FF' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  success: { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
})
