import { Feather } from '@expo/vector-icons'
import type { ComponentProps, ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { colors, radius, TOUCH } from '@/theme/tokens'
import { Text } from './Text'

export type IconName = ComponentProps<typeof Feather>['name']
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, { bg: string; fg: string; border: string; pressed: string }> = {
  primary: { bg: colors.primary, fg: colors.white, border: colors.primary, pressed: colors.primaryDark },
  secondary: { bg: colors.surface, fg: colors.text, border: colors.borderStrong, pressed: colors.surface2 },
  ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent', pressed: colors.primarySoft },
  danger: { bg: colors.danger, fg: colors.white, border: colors.danger, pressed: '#B91C1C' },
  success: { bg: colors.success, fg: colors.white, border: colors.success, pressed: '#15803D' },
}
const HEIGHT: Record<Size, number> = { sm: 36, md: TOUCH, lg: 52 }

export interface ButtonProps {
  children: ReactNode
  onPress?: () => void
  variant?: Variant
  size?: Size
  icon?: IconName
  loading?: boolean
  disabled?: boolean
  block?: boolean
  style?: StyleProp<ViewStyle>
  accessibilityLabel?: string
  testID?: string
}

export function Button({ children, onPress, variant = 'primary', size = 'md', icon, loading, disabled, block, style, accessibilityLabel, testID }: ButtonProps) {
  const v = VARIANTS[variant]
  const inactive = disabled || loading
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      hitSlop={size === 'sm' ? 6 : 0}
      style={({ pressed }) => [
        styles.base,
        { height: HEIGHT[size], paddingHorizontal: size === 'sm' ? 12 : 18, backgroundColor: pressed ? v.pressed : v.bg, borderColor: v.border },
        block && styles.block,
        inactive && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.fg} />
      ) : (
        <View style={styles.inner}>
          {icon && <Feather name={icon} size={size === 'sm' ? 14 : 17} color={v.fg} />}
          <Text variant={size === 'sm' ? 'small' : 'body'} weight="600" style={{ color: v.fg }} numberOfLines={1}>
            {children}
          </Text>
        </View>
      )}
    </Pressable>
  )
}

export function IconButton({ icon, label, onPress, color = colors.text, size = 20, badge, disabled }: { icon: IconName; label: string; onPress?: () => void; color?: string; size?: number; badge?: number; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      style={({ pressed }) => [styles.icon, pressed && { backgroundColor: colors.surface2 }, disabled && styles.disabled]}
    >
      <Feather name={icon} size={size} color={color} />
      {!!badge && badge > 0 && (
        <View style={styles.badge}>
          <Text variant="xs" weight="700" color="white">{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  inner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  block: { alignSelf: 'stretch' },
  disabled: { opacity: 0.5 },
  icon: { width: TOUCH, height: TOUCH, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 4, right: 2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
})
