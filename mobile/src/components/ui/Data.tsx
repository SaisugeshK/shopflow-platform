import { Feather } from '@expo/vector-icons'
import type { ReactNode } from 'react'
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { colors, radius, shadow, tones, type Tone } from '@/theme/tokens'
import { money, moneyCompact, titleCase } from '@/utils/format'
import type { IconName } from './Button'
import { Text } from './Text'

export function Card({ title, actions, children, padded = true, style, onPress, accessibilityLabel }: { title?: string; actions?: ReactNode; children?: ReactNode; padded?: boolean; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string }) {
  const body = (
    <>
      {(title || actions) && (
        <View style={styles.cardHeader}>
          {title ? <Text variant="h3" style={{ flex: 1 }}>{title}</Text> : <View style={{ flex: 1 }} />}
          {actions}
        </View>
      )}
      {children != null && <View style={padded ? styles.cardBody : undefined}>{children}</View>}
    </>
  )
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}>
        {body}
      </Pressable>
    )
  }
  return <View style={[styles.card, style]}>{body}</View>
}

export function Badge({ tone = 'neutral', children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  const t = tones[tone]
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      {dot && <View style={[styles.dot, { backgroundColor: t.fg }]} />}
      <Text variant="xs" weight="600" style={{ color: t.fg }} numberOfLines={1}>{children}</Text>
    </View>
  )
}

const STATUS_TONES: Record<string, Tone> = {
  PLACED: 'warning', PENDING: 'warning', PENDING_APPROVAL: 'warning', REQUESTED: 'warning', DRAFT: 'neutral', UNPAID: 'warning', QUEUED: 'neutral', SENDING: 'accent',
  ACCEPTED: 'primary', APPROVED: 'success', AUTHORIZED: 'primary', GENERATED: 'primary', SENT: 'accent', POSTED: 'success',
  PACKING: 'accent', READY_FOR_DELIVERY: 'teal', OUT_FOR_DELIVERY: 'purple', DELIVERED: 'success', READ: 'success',
  COMPLETED: 'success', PAID: 'success', CAPTURED: 'success', ACTIVE: 'success', IN_STOCK: 'success',
  CANCELLED: 'danger', REJECTED: 'danger', FAILED: 'danger', DELIVERY_FAILED: 'danger', BLOCKED: 'danger', OUT_OF_STOCK: 'danger',
  CREDIT: 'warning', PARTIALLY_PAID: 'warning', LOW_STOCK: 'warning', REFUNDED: 'neutral', INACTIVE: 'neutral', NOT_REQUIRED: 'neutral',
}

/** Same status colours as the web app. */
export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONES[status] ?? 'neutral'} dot>{titleCase(status)}</Badge>
}

/** Label/value rows; empty values are hidden. */
export function KeyValue({ items }: { items: [string, ReactNode | undefined | null][] }) {
  const shown = items.filter(([, v]) => v !== undefined && v !== null && v !== '')
  return (
    <View style={{ gap: 10 }}>
      {shown.map(([k, v]) => (
        <View key={k} style={styles.kv}>
          <Text variant="small" color="muted" style={styles.kvKey}>{k}</Text>
          <View style={styles.kvValue}>{typeof v === 'string' || typeof v === 'number' ? <Text variant="small" weight="500" align="right">{v}</Text> : v}</View>
        </View>
      ))}
    </View>
  )
}

export function Divider({ spacing = 12 }: { spacing?: number }) {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing }} />
}

export function StatCard({ label, value, hint, tone = 'primary', icon, onPress, isMoney = true, compact }: { label: string; value: number | string | null | undefined; hint?: string; tone?: Tone; icon?: IconName; onPress?: () => void; isMoney?: boolean; compact?: boolean }) {
  const t = tones[tone]
  const display = typeof value === 'number' && isMoney ? (compact ? moneyCompact(value) : money(value)) : value ?? '—'
  return (
    <Card onPress={onPress} accessibilityLabel={`${label}: ${display}`} style={styles.stat}>
      <View style={{ gap: 6 }}>
        <View style={styles.statHead}>
          {icon && (
            <View style={[styles.statIcon, { backgroundColor: t.bg }]}>
              <Feather name={icon} size={15} color={t.fg} />
            </View>
          )}
          <Text variant="xs" color="muted" weight="600" style={{ flex: 1 }} numberOfLines={2}>{label.toUpperCase()}</Text>
        </View>
        <Text variant="h2" num numberOfLines={1} adjustsFontSizeToFit>{display}</Text>
        {hint && <Text variant="xs" color="muted" numberOfLines={2}>{hint}</Text>}
      </View>
    </Card>
  )
}

export interface Totals {
  subtotal: number
  discountTotal: number
  taxableTotal: number
  cgstTotal: number
  sgstTotal: number
  igstTotal: number
  roundOff: number
  grandTotal: number
  interState?: boolean
}

/** GST breakdown exactly as calculated by the backend; the app never computes totals. */
export function TaxBreakdown({ t }: { t: Totals }) {
  const row = (label: string, value: string, strong?: boolean) => (
    <View key={label} style={styles.totRow}>
      <Text variant={strong ? 'h3' : 'small'} color={strong ? 'text' : 'muted'}>{label}</Text>
      <Text variant={strong ? 'h3' : 'small'} num weight={strong ? '700' : '500'}>{value}</Text>
    </View>
  )
  return (
    <View style={{ gap: 6 }}>
      {row('Subtotal', money(t.subtotal))}
      {t.discountTotal > 0 && row('Discount', `−${money(t.discountTotal)}`)}
      {row('Taxable value', money(t.taxableTotal))}
      {t.interState || t.igstTotal > 0 ? row('IGST', money(t.igstTotal)) : [row('CGST', money(t.cgstTotal)), row('SGST/UTGST', money(t.sgstTotal))]}
      {t.roundOff !== 0 && row('Round off', money(t.roundOff))}
      <Divider spacing={4} />
      {row('Total', money(t.grandTotal), true)}
    </View>
  )
}

export interface TimelineStep {
  label: string
  state: 'done' | 'current' | 'upcoming' | 'failed'
  detail?: string
}

export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <View>
      {steps.map((s, i) => {
        const color = s.state === 'done' ? colors.success : s.state === 'current' ? colors.primary : s.state === 'failed' ? colors.danger : colors.borderStrong
        return (
          <View key={s.label + i} style={styles.tlRow} accessibilityLabel={`${s.label}, ${s.state}`}>
            <View style={styles.tlRail}>
              <View style={[styles.tlMarker, { borderColor: color, backgroundColor: s.state === 'upcoming' ? colors.surface : color }]}>
                {s.state === 'done' && <Feather name="check" size={12} color={colors.white} />}
                {s.state === 'failed' && <Feather name="x" size={12} color={colors.white} />}
              </View>
              {i < steps.length - 1 && <View style={[styles.tlLine, { backgroundColor: s.state === 'done' ? colors.success : colors.border }]} />}
            </View>
            <View style={{ flex: 1, paddingBottom: 16 }}>
              <Text weight={s.state === 'upcoming' ? '400' : '600'} color={s.state === 'upcoming' ? 'muted' : 'text'}>{s.label}</Text>
              {s.detail && <Text variant="xs" color="muted">{s.detail}</Text>}
            </View>
          </View>
        )
      })}
    </View>
  )
}

/** A tappable list row: title, subtitle, right-side value/badge and chevron. */
export function ListRow({ title, subtitle, meta, right, onPress, icon, accessibilityLabel }: { title: ReactNode; subtitle?: ReactNode; meta?: ReactNode; right?: ReactNode; onPress?: () => void; icon?: IconName; accessibilityLabel?: string }) {
  const content = (
    <>
      {icon && (
        <View style={styles.rowIcon}>
          <Feather name={icon} size={18} color={colors.primary} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        {typeof title === 'string' ? <Text weight="600" numberOfLines={1}>{title}</Text> : title}
        {subtitle ? typeof subtitle === 'string' ? <Text variant="small" color="muted" numberOfLines={2}>{subtitle}</Text> : subtitle : null}
        {meta}
      </View>
      {right && <View style={{ alignItems: 'flex-end', gap: 4 }}>{right}</View>}
      {onPress && <Feather name="chevron-right" size={18} color={colors.borderStrong} />}
    </>
  )
  if (!onPress) return <View style={styles.row}>{content}</View>
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {content}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  pressed: { opacity: 0.85, transform: [{ scale: 0.995 }] },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  cardBody: { padding: 16 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', height: 22, paddingHorizontal: 9, borderRadius: radius.pill },
  dot: { width: 6, height: 6, borderRadius: 3 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  kvKey: { flexShrink: 0, maxWidth: '45%' },
  kvValue: { flex: 1, alignItems: 'flex-end' },
  stat: { flex: 1, minWidth: 150 },
  statHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  totRow: { flexDirection: 'row', justifyContent: 'space-between' },
  tlRow: { flexDirection: 'row', gap: 12 },
  tlRail: { alignItems: 'center', width: 22 },
  tlMarker: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  tlLine: { width: 2, flex: 1, minHeight: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
})
