import { Redirect } from 'expo-router'
import { homeFor } from '@/features/session'
import { useAuthStore } from '@/store/auth'

/** Entry: the role comes from the account, never from a user choice (§4.1). */
export default function Index() {
  const user = useAuthStore((s) => s.user)
  return <Redirect href={homeFor(user?.role, user?.customer?.status)} />
}
