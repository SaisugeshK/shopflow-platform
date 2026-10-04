import { router } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Button } from '@/components/ui/Button'
import { Card, ListRow } from '@/components/ui/Data'
import { ConfirmDialog } from '@/components/ui/Overlay'
import { Screen, SectionTitle } from '@/components/ui/Screen'
import { PoweredBy } from '@/components/ui/BusinessBrand'
import { BusinessSwitcher } from '@/components/ui/TenantPicker'
import { Text } from '@/components/ui/Text'
import { useSignOut } from '@/features/session'
import { visibleMenu } from '@/navigation/staffMenu'
import { useAuthStore } from '@/store/auth'
import { colors } from '@/theme/tokens'
import { initials, titleCase } from '@/utils/format'
import { BranchSwitcherCard } from './SaasScreens'

/** Everything beyond the bottom tabs, grouped like the web sidebar and filtered by permission. */
export default function MoreScreen() {
  const user = useAuthStore((s) => s.user)!
  const signOut = useSignOut()
  const [confirm, setConfirm] = useState(false)
  const sections = visibleMenu(user.permissions, user.modules)
  return (
    <Screen>
      <Card>
        <View style={styles.profile}>
          <View style={styles.avatar}><Text weight="700" color="white">{initials(user.fullName)}</Text></View>
          <View style={{ flex: 1 }}>
            <Text variant="h3">{user.fullName}</Text>
            <Text variant="small" color="muted">{titleCase(user.role)} · {user.mobileNumber}</Text>
          </View>
        </View>
      </Card>
      {sections.map((s) => (
        <View key={s.title} style={{ gap: 8 }}>
          <SectionTitle>{s.title}</SectionTitle>
          <Card padded={false}>
            {s.items.map((i) => <ListRow key={i.href} icon={i.icon} title={i.label} onPress={() => router.push(i.href as never)} />)}
          </Card>
        </View>
      ))}
      <Card padded={false}>
        <ListRow icon="bell" title="Notifications" onPress={() => router.push('/admin/notifications')} />
      </Card>
      <BranchSwitcherCard />
      <BusinessSwitcher />
      <Button variant="secondary" icon="log-out" onPress={() => setConfirm(true)}>Sign out</Button>
      <PoweredBy />
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title="Sign out?" confirmLabel="Sign out" onConfirm={() => { setConfirm(false); signOut() }} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
})
