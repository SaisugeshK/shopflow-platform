import { Redirect, Stack } from 'expo-router'
import { useAuthStore } from '@/store/auth'
import { colors } from '@/theme/tokens'

/** Customer area: only approved customers (others go to the registration status screen). */
export default function ShopLayout() {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Redirect href="/login" />
  if (user.role !== 'CUSTOMER') return <Redirect href="/admin" />
  if (user.customer?.status !== 'APPROVED') return <Redirect href="/registration-status" />
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        headerStyle: { backgroundColor: colors.surface },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="product/[id]" options={{ title: 'Product' }} />
      <Stack.Screen name="checkout" options={{ title: 'Checkout' }} />
      <Stack.Screen name="order/[id]" options={{ title: 'Order' }} />
      <Stack.Screen name="invoices" options={{ title: 'Invoices' }} />
      <Stack.Screen name="invoice/[id]" options={{ title: 'Invoice' }} />
      <Stack.Screen name="payments" options={{ title: 'Payments' }} />
      <Stack.Screen name="outstanding" options={{ title: 'Credit & outstanding' }} />
      <Stack.Screen name="returns" options={{ title: 'Returns' }} />
      <Stack.Screen name="quotations" options={{ title: 'Quotations' }} />
      <Stack.Screen name="quotation/[id]" options={{ title: 'Quotation' }} />
      <Stack.Screen name="projects" options={{ title: 'Projects' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
    </Stack>
  )
}
