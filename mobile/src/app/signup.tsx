import { useMutation, useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Data'
import { Alert } from '@/components/ui/Feedback'
import { Field, Input, OTPInput, PhoneInput, Select } from '@/components/ui/Form'
import { PoweredBy } from '@/components/ui/BusinessBrand'
import { Screen } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { api, ApiError } from '@/services/api'
import { GST_STATES, stateCodeOf } from '@/utils/india'

interface Challenge { requestId: string; maskedMobile: string; demoOtp?: string }

/** Business self-signup (§0B.14): OTP-verified request that the ShopFlow team approves. */
export default function SignupScreen() {
  const [mobile, setMobile] = useState('')
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [otp, setOtp] = useState('')
  const [f, setF] = useState({ businessName: '', ownerName: '', state: 'Tamil Nadu', city: '', industry: 'GROCERY' })
  const [done, setDone] = useState(false)
  const industries = useQuery({ queryKey: ['public-industries'], queryFn: () => api.get<{ code: string; label: string }[]>('/api/v1/public/industries') })
  const sendOtp = useMutation({ mutationFn: () => api.post<Challenge>('/api/v1/public/signup/otp', { mobileNumber: mobile }), onSuccess: setChallenge })
  const submit = useMutation({
    mutationFn: () => api.post('/api/v1/public/signup', {
      requestId: challenge!.requestId, otp, mobileNumber: mobile, businessName: f.businessName, ownerName: f.ownerName, state: f.state,
      stateCode: stateCodeOf(f.state), city: f.city || undefined, industry: f.industry,
    }),
    onSuccess: () => setDone(true),
  })
  const anyErr = sendOtp.error ?? submit.error
  const err = anyErr instanceof ApiError ? anyErr : null
  const valid = !!challenge && otp.length === 6 && f.businessName.trim().length >= 2 && f.ownerName.trim().length >= 2
  return (
    <Screen footer={done ? <Button block onPress={() => router.replace('/login')}>Go to sign in</Button>
      : !challenge ? <Button block loading={sendOtp.isPending} disabled={!/^[6-9]\d{9}$/.test(mobile)} onPress={() => sendOtp.mutate()}>Send OTP</Button>
        : <Button block icon="check" loading={submit.isPending} disabled={!valid} onPress={() => submit.mutate()}>Send request</Button>}>
      <Text variant="h2">Get ShopFlow for your business</Text>
      {done ? (
        <Alert tone="success" title="Request received">We will check your details and switch your business on. Then sign in with {challenge?.maskedMobile}.</Alert>
      ) : (
        <Card>
          <View style={{ gap: 14 }}>
            <Field label="Your mobile number" hint="You will sign in with this number">
              <PhoneInput value={mobile} editable={!challenge} onChangeText={(t) => setMobile(t.replace(/\D/g, '').slice(0, 10))} accessibilityLabel="Your mobile number" testID="signup-mobile" />
            </Field>
            {challenge && (
              <>
                <Field label="OTP" hint={`Sent to ${challenge.maskedMobile}`}><OTPInput value={otp} onChange={setOtp} /></Field>
                {challenge.demoOtp && <Text variant="xs" color="muted">Demo mode: your code is <Text variant="xs" weight="700" testID="signup-demo-otp">{challenge.demoOtp}</Text></Text>}
                <Field label="Business name" required><Input value={f.businessName} onChangeText={(t) => setF({ ...f, businessName: t })} accessibilityLabel="Business name" /></Field>
                <Field label="Your name" required><Input value={f.ownerName} onChangeText={(t) => setF({ ...f, ownerName: t })} accessibilityLabel="Your name" /></Field>
                <Field label="State"><Select label="State" value={f.state} onChange={(v) => setF({ ...f, state: v })} searchable options={GST_STATES.map((s) => ({ value: s.name, label: s.name }))} /></Field>
                <Field label="City"><Input value={f.city} onChangeText={(t) => setF({ ...f, city: t })} accessibilityLabel="City" /></Field>
                <Field label="Trade"><Select label="Trade" value={f.industry} onChange={(v) => setF({ ...f, industry: v })} options={(industries.data ?? []).map((i) => ({ value: i.code, label: i.label }))} /></Field>
              </>
            )}
          </View>
        </Card>
      )}
      {err && <Alert tone="danger">{err.message}</Alert>}
      {!done && <Button variant="ghost" onPress={() => router.replace('/login')}>Back to sign in</Button>}
      <PoweredBy />
    </Screen>
  )
}
