import { Redirect, Stack } from 'expo-router'
import { useAuthStore } from '@/store/auth'
import { colors } from '@/theme/tokens'

/** Owner/Admin area. Customers are redirected to the shop. */
export default function AdminLayout() {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Redirect href="/login" />
  if (user.role === 'CUSTOMER') return <Redirect href="/shop" />
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
      <Stack.Screen name="search" options={{ title: 'Search' }} />
      <Stack.Screen name="order/[id]" options={{ title: 'Order' }} />
      <Stack.Screen name="product/[id]" options={{ title: 'Product' }} />
      <Stack.Screen name="product-form" options={{ title: 'Product' }} />
      <Stack.Screen name="categories" options={{ title: 'Categories' }} />
      <Stack.Screen name="stock" options={{ title: 'Stock' }} />
      <Stack.Screen name="movements" options={{ title: 'Stock movements' }} />
      <Stack.Screen name="purchases" options={{ title: 'Purchases' }} />
      <Stack.Screen name="purchase/[id]" options={{ title: 'Purchase' }} />
      <Stack.Screen name="purchase-new" options={{ title: 'Add purchase' }} />
      <Stack.Screen name="purchase-returns" options={{ title: 'Purchase returns' }} />
      <Stack.Screen name="customer/[id]" options={{ title: 'Customer' }} />
      <Stack.Screen name="customer-new" options={{ title: 'Add customer' }} />
      <Stack.Screen name="suppliers" options={{ title: 'Suppliers' }} />
      <Stack.Screen name="supplier/[id]" options={{ title: 'Supplier' }} />
      <Stack.Screen name="invoices" options={{ title: 'Invoices' }} />
      <Stack.Screen name="invoice/[id]" options={{ title: 'Invoice' }} />
      <Stack.Screen name="invoice-new" options={{ title: 'Create invoice' }} />
      <Stack.Screen name="payments" options={{ title: 'Payments' }} />
      <Stack.Screen name="payment/[id]" options={{ title: 'Payment' }} />
      <Stack.Screen name="returns" options={{ title: 'Sales returns' }} />
      <Stack.Screen name="reports" options={{ title: 'Reports' }} />
      <Stack.Screen name="users" options={{ title: 'Users' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="audit" options={{ title: 'Audit logs' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
    </Stack>
  )
}
