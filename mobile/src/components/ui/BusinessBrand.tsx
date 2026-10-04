import { useState } from 'react'
import { Image, Linking, StyleSheet, View } from 'react-native'
import { API_BASE } from '@/services/api'
import { useAuthStore } from '@/store/auth'
import { colors, radius } from '@/theme/tokens'
import { initials } from '@/utils/format'
import { Text } from './Text'

/** The signed-in session's business (tenant branding, §0B.10). Falls back to the product name before it loads. */
export function useBusiness() {
  const business = useAuthStore((s) => s.user?.business)
  return { name: business?.name || 'ShopFlow', logoUrl: business?.logoUrl ? `${API_BASE}${business.logoUrl}` : undefined }
}

/** Logo (or initials) + business name, used as the header title on the home tabs. */
export function BusinessBrand({ size = 30 }: { size?: number }) {
  const { name, logoUrl } = useBusiness()
  const [broken, setBroken] = useState(false)
  return (
    <View style={styles.row} accessibilityRole="header" accessibilityLabel={name}>
      {logoUrl && !broken ? (
        <Image source={{ uri: logoUrl }} style={[styles.logo, { width: size, height: size }]} resizeMode="contain" onError={() => setBroken(true)} />
      ) : (
        <View style={[styles.mark, { width: size, height: size }]}>
          <Text variant="xs" weight="700" color="white">{initials(name)}</Text>
        </View>
      )}
      <Text variant="h3" numberOfLines={1} style={styles.name}>{name}</Text>
    </View>
  )
}

/** Small product credit under the tenant's own branding. */
/** The company behind ShopFlow, linked from every "Powered by" footer. */
const COMPANY_URL = 'https://techsparksoftwaresolutions.com'

export function PoweredBy() {
  return (
    <Text variant="xs" color="muted" align="center">
      Powered by <Text variant="xs" weight="700">ShopFlow</Text> ·{' '}
      <Text variant="xs" weight="700" color="primary" accessibilityRole="link" onPress={() => Linking.openURL(COMPANY_URL)}>TechSpark Software Solutions</Text>
    </Text>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 240 },
  logo: { borderRadius: radius.sm, backgroundColor: colors.white },
  mark: { borderRadius: radius.sm, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  name: { flexShrink: 1 },
})
