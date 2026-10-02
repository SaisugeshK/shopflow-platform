import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useState } from 'react'
import { View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Loading } from '@/components/ui/Feedback'
import { ToastHost } from '@/components/ui/Toast'
import { useBootstrapSession } from '@/features/session'
import { ApiError } from '@/services/api'
import { colors } from '@/theme/tokens'

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
      },
    },
  })
}

function Root() {
  const ready = useBootstrapSession()
  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Loading />
      </View>
    )
  }
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="registration-status" />
      <Stack.Screen name="shop" />
      <Stack.Screen name="admin" />
    </Stack>
  )
}

export default function RootLayout() {
  const [client] = useState(makeClient)
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <StatusBar style="dark" />
        <Root />
        <ToastHost />
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}
