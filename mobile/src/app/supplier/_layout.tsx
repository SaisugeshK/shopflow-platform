import { Redirect, Stack } from 'expo-router'
import { homeFor } from '@/features/session'
import { useAuthStore } from '@/store/auth'
import { colors } from '@/theme/tokens'

/** Supplier portal (§0B.8): SUPPLIER logins only. */
export default function SupplierLayout() {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Redirect href="/login" />
  if (user.role !== 'SUPPLIER') return <Redirect href={homeFor(user.role, user.customer?.status)} />
  return (
    <Stack screenOptions={{ headerTintColor: colors.text, headerTitleStyle: { fontWeight: '700' }, headerStyle: { backgroundColor: colors.surface },
      headerShadowVisible: false, headerBackButtonDisplayMode: 'minimal', contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="order/[id]" options={{ title: 'Purchase order' }} />
    </Stack>
  )
}
