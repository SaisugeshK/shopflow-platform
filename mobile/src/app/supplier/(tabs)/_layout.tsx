import { Feather } from '@expo/vector-icons'
import { Tabs } from 'expo-router'
import { View } from 'react-native'
import { BusinessBrand } from '@/components/ui/BusinessBrand'
import { useTabBarOptions } from '@/components/ui/tabBar'
import { NotificationBell } from '@/features/notifications'

/** Supplier tabs: Orders | Deliveries | Profile. */
export default function SupplierTabs() {
  const tabOptions = useTabBarOptions()
  return (
    <Tabs screenOptions={{ ...tabOptions, headerRight: () => <View style={{ marginRight: 8 }}><NotificationBell /></View> }}>
      <Tabs.Screen name="index" options={{ title: 'Orders', headerTitle: () => <BusinessBrand />, tabBarIcon: ({ color, size }) => <Feather name="clipboard" color={color} size={size - 2} /> }} />
      <Tabs.Screen name="deliveries" options={{ title: 'Deliveries', tabBarIcon: ({ color, size }) => <Feather name="truck" color={color} size={size - 2} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Feather name="user" color={color} size={size - 2} /> }} />
    </Tabs>
  )
}
