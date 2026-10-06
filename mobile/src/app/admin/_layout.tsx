import { Redirect, Stack } from 'expo-router'
import { homeFor } from '@/features/session'
import { useAuthStore } from '@/store/auth'
import { colors } from '@/theme/tokens'
import { wordify } from '@/store/words'

/** Owner/Admin area. Customers are redirected to the shop. */
export default function AdminLayout() {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Redirect href="/login" />
  if (user.role !== 'OWNER' && user.role !== 'ADMIN') return <Redirect href={homeFor(user.role, user.customer?.status)} />
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
      <Stack.Screen name="product/[id]" options={{ title: wordify('Product') }} />
      <Stack.Screen name="product-form" options={{ title: wordify('Product') }} />
      <Stack.Screen name="categories" options={{ title: 'Categories' }} />
      <Stack.Screen name="stock" options={{ title: 'Stock' }} />
      <Stack.Screen name="movements" options={{ title: 'Stock movements' }} />
      <Stack.Screen name="purchases" options={{ title: 'Purchases' }} />
      <Stack.Screen name="purchase/[id]" options={{ title: 'Purchase' }} />
      <Stack.Screen name="purchase-new" options={{ title: 'Add purchase' }} />
      <Stack.Screen name="purchase-returns" options={{ title: 'Purchase returns' }} />
      <Stack.Screen name="customer/[id]" options={{ title: wordify('Customer') }} />
      <Stack.Screen name="customer-new" options={{ title: wordify('Add customer') }} />
      <Stack.Screen name="suppliers" options={{ title: wordify('Suppliers') }} />
      <Stack.Screen name="supplier/[id]" options={{ title: wordify('Supplier') }} />
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
      <Stack.Screen name="daily-rates" options={{ title: 'Daily rates' }} />
      <Stack.Screen name="purchase-orders" options={{ title: 'Purchase orders' }} />
      <Stack.Screen name="purchase-order-new" options={{ title: 'New purchase order' }} />
      <Stack.Screen name="purchase-order/[id]" options={{ title: 'Purchase order' }} />
      <Stack.Screen name="schemes" options={{ title: 'Schemes' }} />
      <Stack.Screen name="batches" options={{ title: 'Batches & expiry' }} />
      <Stack.Screen name="serials" options={{ title: 'Serial numbers' }} />
      <Stack.Screen name="quotations" options={{ title: 'Quotations' }} />
      <Stack.Screen name="quotation-new" options={{ title: 'New quotation' }} />
      <Stack.Screen name="quotation/[id]" options={{ title: 'Quotation' }} />
      <Stack.Screen name="delivery-challans" options={{ title: 'Delivery challans' }} />
      <Stack.Screen name="challan-new" options={{ title: 'New delivery challan' }} />
      <Stack.Screen name="delivery-challan/[id]" options={{ title: 'Delivery challan' }} />
      <Stack.Screen name="job-work/index" options={{ title: 'Job work' }} />
      <Stack.Screen name="job-work/[id]" options={{ title: 'Job work' }} />
      <Stack.Screen name="agents" options={{ title: 'Agents & commission' }} />
      <Stack.Screen name="projects" options={{ title: 'Projects / sites' }} />
      <Stack.Screen name="branches" options={{ title: 'Branches & transfers' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
    </Stack>
  )
}
