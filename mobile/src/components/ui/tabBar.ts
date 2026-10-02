import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '@/theme/tokens'

/** Shared bottom tab bar style: label never clipped, respects the home-indicator inset. */
export function useTabBarOptions() {
  const insets = useSafeAreaInsets()
  return {
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.muted,
    tabBarLabelStyle: { fontSize: 11, lineHeight: 14, fontWeight: '600' as const },
    // Fixed icon box so the label always gets its own line (otherwise the icon flex-grows and clips the label).
    tabBarIconStyle: { flexGrow: 0, height: 26, width: 26 },
    tabBarItemStyle: { paddingVertical: 2, justifyContent: 'center' as const },
    tabBarStyle: { height: 62 + insets.bottom, paddingTop: 0, paddingBottom: insets.bottom, borderTopColor: colors.border, backgroundColor: colors.surface },
    headerTitleStyle: { fontWeight: '700' as const },
    headerShadowVisible: false,
    headerStyle: { backgroundColor: colors.surface },
    sceneStyle: { backgroundColor: colors.bg },
  }
}
