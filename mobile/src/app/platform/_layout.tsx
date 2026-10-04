import { Redirect, Stack } from 'expo-router'
import { homeFor } from '@/features/session'
import { useAuthStore } from '@/store/auth'
import { colors } from '@/theme/tokens'

/** Super Admin console on the app (§0B.5, Phase 5): SUPER_ADMIN logins only. */
export default function PlatformLayout() {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Redirect href="/login" />
  if (user.role !== 'SUPER_ADMIN') return <Redirect href={homeFor(user.role, user.customer?.status)} />
  return (
    <Stack screenOptions={{ headerTintColor: colors.text, headerTitleStyle: { fontWeight: '700' }, headerStyle: { backgroundColor: colors.surface },
      headerShadowVisible: false, headerBackButtonDisplayMode: 'minimal', contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="index" options={{ title: 'ShopFlow Platform' }} />
      <Stack.Screen name="tenant/[id]" options={{ title: 'Business' }} />
      <Stack.Screen name="signups" options={{ title: 'Sign-up requests' }} />
    </Stack>
  )
}
