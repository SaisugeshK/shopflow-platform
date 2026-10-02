/** Design tokens shared with the web app (APPLICATION-ARCHITECTURE.md §59, web/src/styles/tokens.css). */
export const colors = {
  primary: '#2563EB',
  primaryDark: '#1D4ED8',
  primarySoft: '#DBEAFE',
  navy: '#0F2747',
  accent: '#06B6D4',
  accentSoft: '#CFFAFE',
  teal: '#0D9488',
  tealSoft: '#CCFBF1',
  purple: '#7C3AED',
  purpleSoft: '#EDE9FE',
  success: '#16A34A',
  successSoft: '#DCFCE7',
  warning: '#F59E0B',
  warningStrong: '#B45309',
  warningSoft: '#FEF3C7',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  surface2: '#F1F5F9',
  text: '#0F172A',
  muted: '#64748B',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  white: '#FFFFFF',
} as const

export type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral' | 'accent' | 'teal' | 'purple'

export const tones: Record<Tone, { fg: string; bg: string }> = {
  primary: { fg: colors.primary, bg: colors.primarySoft },
  success: { fg: colors.success, bg: colors.successSoft },
  warning: { fg: colors.warningStrong, bg: colors.warningSoft },
  danger: { fg: colors.danger, bg: colors.dangerSoft },
  neutral: { fg: colors.muted, bg: colors.surface2 },
  accent: { fg: '#0E7490', bg: colors.accentSoft },
  teal: { fg: colors.teal, bg: colors.tealSoft },
  purple: { fg: colors.purple, bg: colors.purpleSoft },
}

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 } as const
export const radius = { sm: 6, md: 10, lg: 14, xl: 18, pill: 999 } as const

/** §60 hierarchy, tuned for phones. */
export const font = {
  h1: { fontSize: 26, fontWeight: '700' as const, lineHeight: 32 },
  h2: { fontSize: 21, fontWeight: '700' as const, lineHeight: 28 },
  h3: { fontSize: 17, fontWeight: '600' as const, lineHeight: 24 },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  small: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
  xs: { fontSize: 12, fontWeight: '400' as const, lineHeight: 16 },
}

export const shadow = {
  card: { shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  raised: { shadowColor: '#0F172A', shadowOpacity: 0.14, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
}

/** Minimum touch target (§64). */
export const TOUCH = 44
/** Content is centred and capped on tablets / wide browser windows. */
export const MAX_CONTENT_WIDTH = 960
