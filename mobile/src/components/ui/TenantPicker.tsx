import { Feather } from '@expo/vector-icons'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native'
import { homeFor } from '@/features/session'
import { API_BASE, api, applySession } from '@/services/api'
import type { AuthResponse, TenantChoice } from '@/services/api'
import { useAuthStore } from '@/store/auth'
import { colors, radius } from '@/theme/tokens'
import { initials, titleCase } from '@/utils/format'
import { Card } from './Data'
import { Text } from './Text'
import { toast } from './Toast'

export function choiceKey(c: TenantChoice) {
  return c.platform ? 'platform' : c.businessId!
}

function Logo({ choice }: { choice: TenantChoice }) {
  const [broken, setBroken] = useState(false)
  if (choice.platform) {
    return <View style={styles.mark}><Feather name="shield" size={16} color={colors.white} /></View>
  }
  if (choice.logoUrl && !broken) {
    return <Image source={{ uri: `${API_BASE}${choice.logoUrl}` }} style={styles.logo} resizeMode="contain" onError={() => setBroken(true)} />
  }
  return <View style={styles.mark}><Text variant="xs" weight="700" color="white">{initials(choice.name)}</Text></View>
}

/**
 * Businesses a mobile number can enter (§0B.4). The Super Admin console is web-only for now (§0B.5), so on the app
 * it is listed but not selectable.
 */
export function TenantPicker({ choices, current, busyKey, onPick }: {
  choices: TenantChoice[]
  current?: string
  busyKey?: string | null
  onPick: (c: TenantChoice) => void
}) {
  return (
    <View style={{ gap: 8 }}>
      {choices.map((c) => {
        const key = choiceKey(c)
        const active = key === current
        const disabled = active || c.platform || !!busyKey
        return (
          <Pressable key={key} accessibilityRole="button" accessibilityLabel={c.name} accessibilityState={{ disabled, selected: active }}
            disabled={disabled} onPress={() => onPick(c)}
            style={({ pressed }) => [styles.choice, active && styles.active, pressed && { opacity: 0.7 }, c.platform && { opacity: 0.6 }]}>
            <Logo choice={c} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text weight="700" numberOfLines={1}>{c.name}</Text>
              <Text variant="xs" color="muted">{c.platform ? 'Open on the web (Super Admin console)' : titleCase(c.role)}</Text>
            </View>
            {active ? <Text variant="xs" color="primary" weight="700">Current</Text>
              : busyKey === key ? <ActivityIndicator color={colors.primary} />
                : !c.platform && <Feather name="chevron-right" size={18} color={colors.muted} />}
          </Pressable>
        )
      })}
    </View>
  )
}

/** "Switch business" card for numbers in several businesses (More / Account screens). */
export function BusinessSwitcher() {
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()
  const switcher = useMutation({
    mutationFn: (c: TenantChoice) => api.post<AuthResponse>('/api/v1/auth/switch-tenant', { businessId: c.businessId }),
    onSuccess: async (r) => {
      qc.clear()
      await applySession(r)
      toast.success(`Switched to ${r.user!.business?.name ?? 'business'}`)
      router.replace(homeFor(r.user!.role, r.user!.customer?.status))
    },
    onError: (e) => toast.error(e),
  })
  const choices = (user?.memberships ?? []).filter((c) => !c.platform)
  if (choices.length < 2) return null
  return (
    <Card title="Switch business">
      <TenantPicker choices={choices} current={user?.business?.id} busyKey={switcher.isPending ? choiceKey(switcher.variables!) : null}
        onPick={(c) => switcher.mutate(c)} />
    </Card>
  )
}

const styles = StyleSheet.create({
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 56, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  active: { borderColor: colors.primary },
  logo: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.white },
  mark: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
})
