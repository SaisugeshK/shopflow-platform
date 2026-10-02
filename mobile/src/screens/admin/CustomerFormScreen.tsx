import { useMutation, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { View } from 'react-native'
import { z } from 'zod'
import { RequirePermission } from '@/components/admin/RequirePermission'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Data'
import { Alert } from '@/components/ui/Feedback'
import { Field, Input, MoneyInput, PhoneInput, Select, SwitchRow } from '@/components/ui/Form'
import { Screen } from '@/components/ui/Screen'
import { toast } from '@/components/ui/Toast'
import { useForm } from '@/hooks/useForm'
import { api, ApiError } from '@/services/api'
import type { CustomerDetail } from '@/services/types'
import { EMAIL, GSTIN, MOBILE, PAN, PINCODE, STATE_OPTIONS } from '@/utils/india'

const schema = z.object({
  mobileNumber: z.string().regex(MOBILE, 'Enter a 10-digit mobile number'),
  shopName: z.string().trim().min(2, 'Required').max(200),
  contactName: z.string().trim().min(2, 'Required').max(200),
  addressLine1: z.string().trim().min(3, 'Required'),
  addressLine2: z.string(),
  city: z.string().trim().min(2, 'Required'),
  state: z.string().min(2),
  pincode: z.string().regex(PINCODE, 'Enter a valid pincode'),
  gstin: z.string().refine((v) => !v || GSTIN.test(v), 'Invalid GSTIN'),
  pan: z.string().refine((v) => !v || PAN.test(v), 'Invalid PAN'),
  email: z.string().refine((v) => !v || EMAIL.test(v), 'Invalid email'),
  notes: z.string(),
  creditEnabled: z.boolean(),
  creditLimit: z.string(),
  creditDays: z.string(),
})

/** Staff-created customers are approved immediately and can sign in with their mobile. */
export default function CustomerFormScreen() {
  const qc = useQueryClient()
  const form = useForm(schema, { mobileNumber: '', shopName: '', contactName: '', addressLine1: '', addressLine2: '', city: '', state: 'Tamil Nadu', pincode: '', gstin: '', pan: '', email: '', notes: '', creditEnabled: false, creditLimit: '0', creditDays: '30' })
  const save = useMutation({
    mutationFn: (v: z.output<typeof schema>) => api.post<CustomerDetail>('/api/v1/customers', {
      mobileNumber: v.mobileNumber, shopName: v.shopName, contactName: v.contactName, gstin: v.gstin || undefined, pan: v.pan || undefined,
      email: v.email || undefined, notes: v.notes || undefined,
      address: { addressLine1: v.addressLine1, addressLine2: v.addressLine2 || undefined, city: v.city, state: v.state, pincode: v.pincode },
      credit: { creditEnabled: v.creditEnabled, creditLimit: v.creditLimit || '0', creditDays: Number(v.creditDays || 0) },
    }),
    onSuccess: (c) => { toast.success('Customer created', c.customerCode); qc.invalidateQueries({ queryKey: ['customers'] }); router.replace(`/admin/customer/${c.id}`) },
  })
  const err = save.error instanceof ApiError ? save.error : null
  const fe = (k: string) => form.error(k, err?.fieldError(k))
  const v = form.values
  return (
    <RequirePermission anyOf={['CUSTOMER_WRITE']}>
      <Screen footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button variant="secondary" style={{ flex: 1 }} onPress={() => router.back()}>Cancel</Button>
          <Button style={{ flex: 2 }} loading={save.isPending} onPress={() => form.submit((x) => save.mutate(x))}>Create customer</Button>
        </View>
      }>
        <Card title="Business">
          <View style={{ gap: 14 }}>
            <Field label="Mobile number" required error={fe('mobileNumber')}><PhoneInput value={v.mobileNumber} onChangeText={(t) => form.set('mobileNumber', t.replace(/\D/g, ''))} accessibilityLabel="Mobile number" invalid={!!fe('mobileNumber')} /></Field>
            <Field label="Shop / business name" required error={fe('shopName')}><Input value={v.shopName} onChangeText={(t) => form.set('shopName', t)} accessibilityLabel="Shop name" /></Field>
            <Field label="Contact person" required error={fe('contactName')}><Input value={v.contactName} onChangeText={(t) => form.set('contactName', t)} accessibilityLabel="Contact person" /></Field>
            <Field label="Email" error={fe('email')}><Input value={v.email} onChangeText={(t) => form.set('email', t.trim())} keyboardType="email-address" autoCapitalize="none" accessibilityLabel="Email" /></Field>
            <Field label="GSTIN" error={fe('gstin')}><Input value={v.gstin} onChangeText={(t) => form.set('gstin', t.toUpperCase())} maxLength={15} autoCapitalize="characters" accessibilityLabel="GSTIN" /></Field>
            <Field label="PAN" error={fe('pan')}><Input value={v.pan} onChangeText={(t) => form.set('pan', t.toUpperCase())} maxLength={10} autoCapitalize="characters" accessibilityLabel="PAN" /></Field>
          </View>
        </Card>
        <Card title="Billing address">
          <View style={{ gap: 14 }}>
            <Field label="Address line 1" required error={fe('addressLine1')}><Input value={v.addressLine1} onChangeText={(t) => form.set('addressLine1', t)} accessibilityLabel="Address line 1" /></Field>
            <Field label="Address line 2"><Input value={v.addressLine2} onChangeText={(t) => form.set('addressLine2', t)} accessibilityLabel="Address line 2" /></Field>
            <Field label="City" required error={fe('city')}><Input value={v.city} onChangeText={(t) => form.set('city', t)} accessibilityLabel="City" /></Field>
            <Field label="State" required><Select label="State" value={v.state} onChange={(s) => form.set('state', s)} options={STATE_OPTIONS} searchable /></Field>
            <Field label="Pincode" required error={fe('pincode')}><Input value={v.pincode} onChangeText={(t) => form.set('pincode', t.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={6} accessibilityLabel="Pincode" /></Field>
          </View>
        </Card>
        <Card title="Credit">
          <View style={{ gap: 14 }}>
            <SwitchRow label="Allow purchases on credit" value={v.creditEnabled} onChange={(b) => form.set('creditEnabled', b)} />
            <Field label="Credit limit"><MoneyInput value={v.creditLimit} onChangeText={(t) => form.set('creditLimit', t)} accessibilityLabel="Credit limit" /></Field>
            <Field label="Credit days"><Input value={v.creditDays} onChangeText={(t) => form.set('creditDays', t.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={3} accessibilityLabel="Credit days" /></Field>
            <Field label="Internal notes"><Input value={v.notes} onChangeText={(t) => form.set('notes', t)} multiline accessibilityLabel="Internal notes" /></Field>
          </View>
        </Card>
        {err && !err.details.length && <Alert tone="danger">{err.message}</Alert>}
      </Screen>
    </RequirePermission>
  )
}
