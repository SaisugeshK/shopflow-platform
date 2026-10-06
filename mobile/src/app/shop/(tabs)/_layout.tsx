import { Feather } from '@expo/vector-icons'
import { Tabs } from 'expo-router'
import { View } from 'react-native'
import { NotificationBell } from '@/features/notifications'
import { useCart } from '@/features/shop'
import { BusinessBrand } from '@/components/ui/BusinessBrand'
import { useTabBarOptions } from '@/components/ui/tabBar'
import { wordify } from '@/store/words'

/** §6.3 recommended customer bottom navigation: Home | Products | Cart | Orders | Profile. */
export default function ShopTabs() {
  const cart = useCart()
  const count = cart.data?.itemCount ?? 0
  const tabOptions = useTabBarOptions()
  return (
    <Tabs
      screenOptions={{
        ...tabOptions,
        headerRight: () => <View style={{ marginRight: 8 }}><NotificationBell /></View>,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', headerTitle: () => <BusinessBrand />, tabBarIcon: ({ color, size }) => <Feather name="home" color={color} size={size - 2} /> }} />
      <Tabs.Screen name="products" options={{ title: wordify('Products'), tabBarIcon: ({ color, size }) => <Feather name="package" color={color} size={size - 2} /> }} />
      <Tabs.Screen name="cart" options={{ title: 'Cart', tabBarBadge: count > 0 ? count : undefined, tabBarIcon: ({ color, size }) => <Feather name="shopping-cart" color={color} size={size - 2} /> }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: ({ color, size }) => <Feather name="clipboard" color={color} size={size - 2} /> }} />
      <Tabs.Screen name="account" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Feather name="user" color={color} size={size - 2} /> }} />
    </Tabs>
  )
}
