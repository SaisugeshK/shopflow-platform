import { Feather } from '@expo/vector-icons'
import { router, Tabs } from 'expo-router'
import { View } from 'react-native'
import { IconButton } from '@/components/ui/Button'
import { BusinessBrand } from '@/components/ui/BusinessBrand'
import { useTabBarOptions } from '@/components/ui/tabBar'
import { NotificationBell } from '@/features/notifications'
import { useAuthStore } from '@/store/auth'

/** Owner/Admin bottom tabs. Tabs the user has no permission for are hidden (href: null). */
export default function AdminTabs() {
  const perms = useAuthStore((s) => s.user?.permissions ?? [])
  const has = (...p: string[]) => p.some((x) => perms.includes(x))
  const tabOptions = useTabBarOptions()
  return (
    <Tabs
      screenOptions={{
        ...tabOptions,
        headerRight: () => (
          <View style={{ flexDirection: 'row', marginRight: 8 }}>
            <IconButton icon="search" label="Search" onPress={() => router.push('/admin/search')} />
            <NotificationBell />
          </View>
        ),
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dashboard', headerTitle: () => <BusinessBrand />, href: has('DASHBOARD_VIEW', 'DASHBOARD_OWNER_VIEW') ? undefined : null, tabBarIcon: ({ color, size }) => <Feather name="grid" color={color} size={size - 2} /> }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders', href: has('ORDER_READ') ? undefined : null, tabBarIcon: ({ color, size }) => <Feather name="shopping-cart" color={color} size={size - 2} /> }} />
      <Tabs.Screen name="products" options={{ title: 'Products', href: has('PRODUCT_READ') ? undefined : null, tabBarIcon: ({ color, size }) => <Feather name="package" color={color} size={size - 2} /> }} />
      <Tabs.Screen name="customers" options={{ title: 'Customers', href: has('CUSTOMER_READ') ? undefined : null, tabBarIcon: ({ color, size }) => <Feather name="users" color={color} size={size - 2} /> }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: ({ color, size }) => <Feather name="menu" color={color} size={size - 2} /> }} />
    </Tabs>
  )
}
