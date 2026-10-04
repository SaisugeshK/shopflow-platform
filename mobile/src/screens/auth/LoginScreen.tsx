import { Feather } from '@expo/vector-icons'
import { useMutation } from '@tanstack/react-query'
import { router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { Platform, Pressable, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Badge } from '@/components/ui/Data'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Feedback'
import { Field, OTPInput, PhoneInput } from '@/components/ui/Form'
import { KeyboardAwareScroll } from '@/components/ui/KeyboardAware'
import { Text } from '@/components/ui/Text'
import { toast } from '@/components/ui/Toast'
import { homeFor } from '@/features/session'
import { choiceKey, TenantPicker } from '@/components/ui/TenantPicker'
import { api, ApiError, applySession, type AuthResponse, type TenantChoice } from '@/services/api'
import { useAuthStore } from '@/store/auth'
import { colors, radius, shadow } from '@/theme/tokens'

interface Challenge {
  requestId: string
  maskedMobile: string
  expiresInSeconds: number
  resendAfterSeconds: number
  /** Present only when the server runs in demo mode (mock OTP provider, no SMS sent). */
  demoOtp?: string
}

/** The business a join link (/join/{code}) belongs to: sign-in enters, or registers with, that business. */
export interface JoinTenant {
  tenantCode: string
  name: string
  city?: string
}

/**
 * A02 Mobile Login + A03 OTP Verification. A number in several businesses picks one (§0B.4); new numbers continue to
 * customer registration (§4.2) — for the join link's business, or the default one.
 */
export default function LoginScreen({ join }: { join?: JoinTenant } = {}) {
  const [selection, setSelection] = useState<{ token: string; tenants: TenantChoice[] } | null>(null)
  const [mobile, setMobile] = useState('')
  const [otp, setOtp] = useState('')
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [keyboardOpen, setKeyboardOpen] = useState(false)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown((c) => c - 1), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  const request = useMutation({
    mutationFn: () => api.post<Challenge>('/api/v1/auth/otp/request', { mobileNumber: mobile }),
    onSuccess: (c) => {
      setChallenge(c)
      setOtp('')
      setCooldown(c.resendAfterSeconds)
      if (c.demoOtp) {
        const code = c.demoOtp
        toast.info(`Demo OTP: ${code}`, 'Demo mode: no SMS is sent. Use this code to sign in.', { duration: 20_000 })
      }
    },
  })

  const complete = async (r: AuthResponse) => {
    toast.clear()
    if (r.selectionRequired) {
      setSelection({ token: r.selectionToken!, tenants: r.tenants ?? [] })
      return
    }
    if (r.registrationRequired) {
      useAuthStore.getState().setRegistration({ token: r.registrationToken!, mobile, business: r.registrationBusiness })
      router.replace('/register')
      return
    }
    await applySession(r)
    router.replace(homeFor(r.user!.role, r.user!.customer?.status))
  }

  const verify = useMutation({
    mutationFn: () => api.post<AuthResponse>('/api/v1/auth/otp/verify', {
      mobileNumber: mobile, otp, requestId: challenge!.requestId, deviceInfo: `ShopFlow ${Platform.OS}`, tenantCode: join?.tenantCode,
    }),
    onSuccess: complete,
  })

  const select = useMutation({
    mutationFn: (c: TenantChoice) => api.postWithToken<AuthResponse>('/api/v1/auth/select-tenant', selection!.token, { businessId: c.businessId }),
    onSuccess: complete,
  })

  useEffect(() => {
    if (otp.length === 6 && challenge && !verify.isPending) verify.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp])

  const mobileValid = /^[6-9]\d{9}$/.test(mobile)
  const requestError = request.error instanceof ApiError ? request.error : null
  const verifyError = verify.error instanceof ApiError ? verify.error : null
  const selectError = select.error instanceof ApiError ? select.error : null
  const title = join ? join.name : 'ShopFlow'

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      {/* Android draws edge-to-edge, so the window is not resized for the keyboard: pad on both platforms. */}
      {/* Moves above the keyboard on Android edge-to-edge and iOS; header turns compact while typing. */}
      <KeyboardAwareScroll contentContainerStyle={[styles.scroll, keyboardOpen && styles.scrollKeyboard]} onKeyboardChange={setKeyboardOpen}>
          {keyboardOpen ? (
            <View style={styles.heroCompact}>
              <View style={[styles.brand, styles.brandSmall]}><Feather name="shopping-bag" size={18} color={colors.white} /></View>
              <Text variant="h2" color="white" numberOfLines={1}>{title}</Text>
            </View>
          ) : (
            <View style={styles.hero}>
              <View style={styles.brand}><Feather name="shopping-bag" size={22} color={colors.white} /></View>
              <Text variant="h1" color="white" align="center">{title}</Text>
              <Text style={{ color: '#CBD5E1' }} align="center">
                {join ? `Order from ${join.name}${join.city ? `, ${join.city}` : ''}. New retailers register in one step.`
                  : 'Orders, stock, GST invoices, credit and payments — in your pocket.'}
              </Text>
            </View>
          )}

          <View style={styles.card}>
            {selection ? (
              <View style={{ gap: 16 }}>
                <View style={{ gap: 4 }}>
                  <Text variant="h2" accessibilityRole="header">Choose a business</Text>
                  <Text variant="small" color="muted">Your number is registered with more than one business. You can switch later from the menu.</Text>
                </View>
                <TenantPicker choices={selection.tenants} busyKey={select.isPending ? choiceKey(select.variables!) : null} onPick={(c) => select.mutate(c)} />
                {selectError && <Alert tone="danger">{selectError.message}</Alert>}
                <Pressable accessibilityRole="button" onPress={() => { setSelection(null); setChallenge(null) }} style={styles.back} hitSlop={8}>
                  <Feather name="arrow-left" size={16} color={colors.primary} />
                  <Text variant="small" color="primary" weight="600">Use another number</Text>
                </Pressable>
              </View>
            ) : !challenge ? (
              <View style={{ gap: 16 }}>
                <View style={{ gap: 4 }}>
                  <Text variant="h2" accessibilityRole="header">{join ? `Sign in to ${join.name}` : 'Sign in'}</Text>
                  <Text variant="small" color="muted">
                    {join ? 'Enter your mobile number. If you are new to this shop, you can register with the same step.'
                      : 'Enter your registered mobile number. New retailers can register with the same step.'}
                  </Text>
                </View>
                <Field label="Mobile number" error={requestError?.fieldError('mobileNumber')}>
                  <PhoneInput
                    testID="mobile-input"
                    accessibilityLabel="Mobile number"
                    value={mobile}
                    onChangeText={(t) => setMobile(t.replace(/\D/g, '').slice(0, 10))}
                    autoFocus
                    invalid={!!requestError?.fieldError('mobileNumber')}
                    returnKeyType="send"
                    onSubmitEditing={() => mobileValid && request.mutate()}
                  />
                </Field>
                {requestError && !requestError.fieldError('mobileNumber') && <Alert tone="danger">{requestError.message}</Alert>}
                <Button size="lg" block loading={request.isPending} disabled={!mobileValid} onPress={() => request.mutate()}>Send OTP</Button>
                {!join && <Button variant="ghost" onPress={() => router.push('/signup')}>Run a business? Get ShopFlow</Button>}
              </View>
            ) : (
              <View style={{ gap: 16 }}>
                <Pressable accessibilityRole="button" onPress={() => setChallenge(null)} style={styles.back} hitSlop={8}>
                  <Feather name="arrow-left" size={16} color={colors.primary} />
                  <Text variant="small" color="primary" weight="600">Change number</Text>
                </Pressable>
                <View style={{ gap: 4 }}>
                  <Text variant="h2" accessibilityRole="header">Verify OTP</Text>
                  <Text variant="small" color="muted">
                    Enter the 6-digit code sent to <Text variant="small" weight="700">{challenge.maskedMobile}</Text>. It expires in {Math.round(challenge.expiresInSeconds / 60)} minutes.
                  </Text>
                </View>
                <OTPInput value={otp} onChange={setOtp} autoFocus disabled={verify.isPending} />
                {verifyError && <Alert tone="danger">{verifyError.message}</Alert>}
                <Button size="lg" block loading={verify.isPending} disabled={otp.length !== 6} onPress={() => verify.mutate()}>Verify & continue</Button>
                <Button variant="ghost" size="sm" disabled={cooldown > 0 || request.isPending} onPress={() => request.mutate()}>
                  {cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}
                </Button>
                {challenge.demoOtp && (
                  <View style={styles.demo}>
                    <Badge tone="warning">Demo mode</Badge>
                    <Text variant="xs" color="muted">No SMS is sent. Your code is </Text>
                    <Text variant="xs" weight="700" testID="demo-otp">{challenge.demoOtp}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
          {!keyboardOpen && <View style={styles.secure}>
            <Feather name="shield" size={14} color={colors.muted} />
            <Text variant="xs" color="muted">Secure sign-in with a one-time password. No passwords to remember.</Text>
          </View>}
      </KeyboardAwareScroll>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy },
  scroll: { flexGrow: 1, padding: 20, justifyContent: 'center', gap: 20, width: '100%', maxWidth: 480, alignSelf: 'center' },
  scrollKeyboard: { justifyContent: 'flex-start', paddingTop: 12, gap: 14 },
  hero: { alignItems: 'center', gap: 10, paddingVertical: 12 },
  heroCompact: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  brandSmall: { width: 36, height: 36, borderRadius: 11 },
  brand: { width: 52, height: 52, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 22, ...shadow.raised },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  demo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 6 },
  secure: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.surface, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
})
