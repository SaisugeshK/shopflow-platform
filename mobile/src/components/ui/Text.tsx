import { Text as RNText, type TextProps, type TextStyle } from 'react-native'
import { colors, font } from '@/theme/tokens'

type Variant = keyof typeof font
type Color = 'text' | 'muted' | 'primary' | 'danger' | 'success' | 'warning' | 'white'

const COLOR: Record<Color, string> = {
  text: colors.text,
  muted: colors.muted,
  primary: colors.primary,
  danger: colors.danger,
  success: colors.success,
  warning: colors.warningStrong,
  white: colors.white,
}

export interface AppTextProps extends TextProps {
  variant?: Variant
  color?: Color
  weight?: TextStyle['fontWeight']
  align?: TextStyle['textAlign']
  /** Tabular digits for money and quantities. */
  num?: boolean
}

/** Typography (§60). Font sizes follow the OS text-size setting (allowFontScaling), capped to keep layouts intact. */
export function Text({ variant = 'body', color = 'text', weight, align, num, style, ...rest }: AppTextProps) {
  return (
    <RNText
      maxFontSizeMultiplier={1.6}
      style={[font[variant], { color: COLOR[color] }, weight ? { fontWeight: weight } : null, align ? { textAlign: align } : null, num ? { fontVariant: ['tabular-nums'] } : null, style]}
      {...rest}
    />
  )
}
