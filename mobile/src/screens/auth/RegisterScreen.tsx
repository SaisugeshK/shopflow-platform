import { useMutation } from '@tanstack/react-query'
import { Redirect, router } from 'expo-router'
import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Data'
import { Alert } from '@/components/ui/Feedback'
import { Field, Input, Select } from '@/components/ui/Form'
import { Screen } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { useForm } from '@/hooks/useForm'
import { api, ApiError, applySession, type AuthResponse } from '@/services/api'
import { useAuthStore } from '@/store/auth'
import { colors } from '@/theme/tokens'
import { EMAIL, GSTIN, PAN, PINCODE, STATE_OPTIONS } from '@/utils/india'

const schema = z.object({
  shopName: z.string().trim().min(2, 'Enter the shop or business name').max(200),
  contactName: z.string().trim().min(2, 'Enter the owner or contact name').max(200),
  addressLine1: z.string().trim().min(3, 'Enter the address').max(200),
  addressLine2: z.string().max(200),
  city: z.string().trim().min(2, 'Enter the city').max(100),
  state: z.string().min(2, 'Select the state'),
  pincode: z.string().regex(PINCODE, 'Enter a valid 6-digit pincode'),
  gstin: z.string().refine((v) => !v || GSTIN.test(v), 'Enter a valid GSTIN'),
  pan: z.string().refine((v) => !v || PAN.test(v), 'Enter a valid PAN'),
  email: z.string().refine((v) => !v || EMAIL.test(v), 'Enter a valid email'),
})

/** A04 Customer Registration with the single-use registration token from OTP verification (§4.2). */
export default function RegisterScreen() {
  const reg = useAuthStore((s) => s.registration)
  const form = useForm(schema, { shopName: '', contactName: '', addressLine1: '', addressLine2: '', city: '', state: 'Tamil Nadu', pincode: '', gstin: '', pan: '', email: '' })
  const submit = useMutation({
    mutationFn: (v: z.output<typeof schema>) =>
      api.postWithToken<AuthResponse>('/api/v1/customer-registration', reg!.token, {
        shopName: v.shopName, contactName: v.contactName, gstin: v.gstin || undefined, pan: v.pan || undefined, email: v.email || undefined,
        address: { addressLine1: v.addressLine1, addressLine2: v.addressLine2 || undefined, city: v.city, state: v.state, pincode: v.pincode },
      }),
    onSuccess: async (r) => {
      // Save the new session before dropping the single-use token, otherwise this screen re-renders without a
      // token and redirects to login in between.
      await applySession(r)
      router.replace('/registration-status')
      useAuthStore.getState().setRegistration(null)
    },
  })

  if (!reg && !submit.isPending && !submit.isSuccess) return <Redirect href="/login" />
  const err = submit.error instanceof ApiError ? submit.error : null
  const v = form.values

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <Screen footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button variant="secondary" onPress={() => { useAuthStore.getState().setRegistration(null); router.replace('/login') }} style={{ flex: 1 }}>Cancel</Button>
          <Button loading={submit.isPending} onPress={() => form.submit((x) => submit.mutate(x))} style={{ flex: 2 }}>Submit registration</Button>
        </View>
      }>
        <View style={{ gap: 4 }}>
          <Text variant="h1" accessibilityRole="header">Register your shop</Text>
          <Text variant="small" color="muted">
            Mobile +91 {reg?.mobile} is verified.{reg?.business ? ` You are registering with ${reg.business.name}.` : ''} The shop reviews your details before you can order.
          </Text>
        </View>
        <Card title="Business">
          <View style={{ gap: 14 }}>
            <Field label="Shop / business name" required error={form.error('shopName')}>
              <Input value={v.shopName} onChangeText={(t) => form.set('shopName', t)} accessibilityLabel="Shop or business name" invalid={!!form.error('shopName')} />
            </Field>
            <Field label="Owner / contact person" required error={form.error('contactName')}>
              <Input value={v.contactName} onChangeText={(t) => form.set('contactName', t)} accessibilityLabel="Owner or contact person" textContentType="name" invalid={!!form.error('contactName')} />
            </Field>
            <Field label="Email" error={form.error('email')}>
              <Input value={v.email} onChangeText={(t) => form.set('email', t.trim())} keyboardType="email-address" autoCapitalize="none" accessibilityLabel="Email" invalid={!!form.error('email')} />
            </Field>
            <Field label="GSTIN" hint="Required if you want GST input credit" error={form.error('gstin', err?.fieldError('gstin'))}>
              <Input value={v.gstin} onChangeText={(t) => form.set('gstin', t.toUpperCase())} autoCapitalize="characters" maxLength={15} accessibilityLabel="GSTIN" />
            </Field>
            <Field label="PAN" error={form.error('pan', err?.fieldError('pan'))}>
              <Input value={v.pan} onChangeText={(t) => form.set('pan', t.toUpperCase())} autoCapitalize="characters" maxLength={10} accessibilityLabel="PAN" />
            </Field>
          </View>
        </Card>
        <Card title="Address">
          <View style={{ gap: 14 }}>
            <Field label="Address line 1" required error={form.error('addressLine1')}>
              <Input value={v.addressLine1} onChangeText={(t) => form.set('addressLine1', t)} accessibilityLabel="Address line 1" invalid={!!form.error('addressLine1')} />
            </Field>
            <Field label="Address line 2">
              <Input value={v.addressLine2} onChangeText={(t) => form.set('addressLine2', t)} accessibilityLabel="Address line 2" />
            </Field>
            <Field label="City" required error={form.error('city')}>
              <Input value={v.city} onChangeText={(t) => form.set('city', t)} accessibilityLabel="City" invalid={!!form.error('city')} />
            </Field>
            <Field label="State" required error={form.error('state')}>
              <Select label="State" value={v.state} onChange={(s) => form.set('state', s)} options={STATE_OPTIONS} searchable />
            </Field>
            <Field label="Pincode" required error={form.error('pincode')}>
              <Input value={v.pincode} onChangeText={(t) => form.set('pincode', t.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={6} accessibilityLabel="Pincode" invalid={!!form.error('pincode')} />
            </Field>
          </View>
        </Card>
        {err && <Alert tone="danger">{err.message}</Alert>}
      </Screen>
    </SafeAreaView>
  )
}
