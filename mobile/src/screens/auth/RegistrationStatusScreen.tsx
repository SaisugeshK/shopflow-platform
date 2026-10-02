import { Feather } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import { Redirect, router } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Button, type IconName } from '@/components/ui/Button'
import { Loading } from '@/components/ui/Feedback'
import { Text } from '@/components/ui/Text'
import { useSignOut } from '@/features/session'
import { api, refreshSession } from '@/services/api'
import { useAuthStore } from '@/store/auth'
import { colors, radius, shadow, tones, type Tone } from '@/theme/tokens'

interface RegistrationStatus {
  customerCode: string
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'BLOCKED'
  reason?: string
}

/** A05 Registration Pending / A06 Account Blocked. Rechecking refreshes the session to pick up approval. */
export default function RegistrationStatusScreen() {
  const user = useAuthStore((s) => s.user)
  const signOut = useSignOut()
  const q = useQuery({
    queryKey: ['registration-status'],
    queryFn: () => api.get<RegistrationStatus>('/api/v1/customer-registration/status'),
    refetchInterval: 30_000,
    enabled: !!user,
  })
  if (!user) return <Redirect href="/login" />
  const recheck = async () => {
    await refreshSession()
    if (useAuthStore.getState().user?.customer?.status === 'APPROVED') router.replace('/shop')
    else q.refetch()
  }
  const status = q.data?.status
  let view: { icon: IconName; tone: Tone; title: string; body: string }
  if (status === 'APPROVED') view = { icon: 'check-circle', tone: 'success', title: 'Your account is approved', body: 'You can now browse products and place orders.' }
  else if (status === 'BLOCKED' || status === 'REJECTED') view = { icon: 'slash', tone: 'danger', title: status === 'BLOCKED' ? 'Account blocked' : 'Registration not approved', body: q.data?.reason ?? 'Please contact the shop for help.' }
  else view = { icon: 'clock', tone: 'warning', title: 'Registration received', body: `Customer code ${q.data?.customerCode ?? '—'}. The shop will review your details; you can order once approved.` }

  return (
    <SafeAreaView style={styles.root}>
      {q.isLoading ? <Loading /> : (
        <View style={styles.card}>
          <View style={[styles.icon, { backgroundColor: tones[view.tone].bg }]}><Feather name={view.icon} size={28} color={tones[view.tone].fg} /></View>
          <Text variant="h2" align="center" accessibilityRole="header">{view.title}</Text>
          <Text color="muted" align="center">{view.body}</Text>
          {status === 'APPROVED' ? (
            <Button block onPress={recheck}>Start shopping</Button>
          ) : status === 'BLOCKED' || status === 'REJECTED' ? (
            <Button variant="secondary" block onPress={signOut}>Sign out</Button>
          ) : (
            <View style={{ gap: 10, alignSelf: 'stretch' }}>
              <Button variant="secondary" icon="refresh-cw" block onPress={recheck}>Check again</Button>
              <Button variant="ghost" block onPress={signOut}>Sign out</Button>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 20 },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 28, gap: 14, alignItems: 'center', width: '100%', maxWidth: 440, alignSelf: 'center', ...shadow.card },
  icon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
})
