import { useQuery } from '@tanstack/react-query'
import { router, useLocalSearchParams } from 'expo-router'
import { View } from 'react-native'
import { Button } from '@/components/ui/Button'
import { EmptyState, Loading } from '@/components/ui/Feedback'
import { Screen } from '@/components/ui/Screen'
import LoginScreen from '@/screens/auth/LoginScreen'
import { api } from '@/services/api'
import { colors } from '@/theme/tokens'

interface PublicTenant {
  id: string
  tenantCode: string
  name: string
  city?: string
  active: boolean
}

/** Join link /join/{code} (§0B.4): sign in to, or register as a customer of, that business. */
export default function JoinRoute() {
  const { code = '' } = useLocalSearchParams<{ code: string }>()
  const q = useQuery({ queryKey: ['public-tenant', code], queryFn: () => api.get<PublicTenant>(`/api/v1/public/tenants/${encodeURIComponent(code)}`), retry: false })
  if (q.isLoading) return <View style={{ flex: 1, backgroundColor: colors.bg }}><Loading /></View>
  if (q.isError || !q.data || !q.data.active) {
    return (
      <Screen>
        <EmptyState icon="link-2" title={q.data && !q.data.active ? 'This shop is not available' : 'Link not found'}
          description={q.data && !q.data.active ? 'This business is not accepting sign-ins right now. Please contact the shop.'
            : 'Check the link your shop shared with you, or sign in with your mobile number.'} />
        <Button onPress={() => router.replace('/login')}>Go to sign in</Button>
      </Screen>
    )
  }
  return <LoginScreen join={{ tenantCode: q.data.tenantCode, name: q.data.name, city: q.data.city }} />
}
