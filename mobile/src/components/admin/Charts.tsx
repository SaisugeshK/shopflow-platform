import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/Text'
import { colors, radius } from '@/theme/tokens'
import { money, moneyCompact } from '@/utils/format'

export interface Series {
  key: string
  label: string
  color: string
}

/**
 * Lightweight column chart drawn with views (no native chart dependency). Tap a column to read its exact values.
 * Values arrive from the backend; the chart only scales them for display.
 */
export function ColumnChart({ rows, labelKey, series, height = 150 }: { rows: Record<string, string | number | null>[]; labelKey: string; series: Series[]; height?: number }) {
  const [active, setActive] = useState<number | null>(null)
  const values = rows.flatMap((r) => series.map((s) => Number(r[s.key] ?? 0)))
  const max = Math.max(1, ...values)
  const shown = active != null ? rows[active] : undefined
  const step = Math.max(1, Math.ceil(rows.length / 6))
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.legendRow}>
        {series.map((s) => (
          <View key={s.key} style={styles.legend}>
            <View style={[styles.swatch, { backgroundColor: s.color }]} />
            <Text variant="xs" color="muted">{s.label}</Text>
          </View>
        ))}
        <View style={{ flex: 1 }} />
        <Text variant="xs" color="muted">max {moneyCompact(max)}</Text>
      </View>
      <View style={[styles.plot, { height }]} accessibilityLabel={`Chart of ${series.map((s) => s.label).join(' and ')}`}>
        {rows.map((r, i) => (
          <Pressable key={i} onPress={() => setActive(active === i ? null : i)} style={[styles.col, active === i && styles.colActive]} accessibilityRole="button"
            accessibilityLabel={`${String(r[labelKey])}: ${series.map((s) => `${s.label} ${money(Number(r[s.key] ?? 0))}`).join(', ')}`}>
            <View style={styles.bars}>
              {series.map((s) => (
                <View key={s.key} style={{ flex: 1, height: `${(Number(r[s.key] ?? 0) / max) * 100}%`, minHeight: Number(r[s.key] ?? 0) > 0 ? 2 : 0, backgroundColor: s.color, borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />
              ))}
            </View>
          </Pressable>
        ))}
      </View>
      <View style={styles.axis}>
        {rows.map((r, i) => (
          <Text key={i} variant="xs" color="muted" style={{ flex: 1, textAlign: 'center' }} numberOfLines={1}>
            {i % step === 0 ? String(r[labelKey]).slice(5) : ''}
          </Text>
        ))}
      </View>
      {shown && (
        <View style={styles.tooltip}>
          <Text variant="xs" weight="700">{String(shown[labelKey])}</Text>
          {series.map((s) => <Text key={s.key} variant="xs" color="muted">{s.label}: {money(Number(shown[s.key] ?? 0))}</Text>)}
        </View>
      )}
    </View>
  )
}

const PALETTE = ['#2563EB', '#06B6D4', '#0D9488', '#7C3AED', '#F59E0B', '#16A34A', '#DC2626', '#64748B']

/** Share of total as horizontal bars (replaces the web pie chart on small screens). */
export function ShareBars({ rows, labelKey, valueKey }: { rows: Record<string, string | number | null>[]; labelKey: string; valueKey: string }) {
  const total = rows.reduce((n, r) => n + Number(r[valueKey] ?? 0), 0) || 1
  return (
    <View style={{ gap: 10 }}>
      {rows.map((r, i) => {
        const v = Number(r[valueKey] ?? 0)
        const pct = (v / total) * 100
        return (
          <View key={i} style={{ gap: 4 }}>
            <View style={styles.shareHead}>
              <Text variant="small" weight="600" style={{ flex: 1 }} numberOfLines={1}>{String(r[labelKey])}</Text>
              <Text variant="small" num>{money(v)}</Text>
              <Text variant="xs" color="muted" style={{ width: 40, textAlign: 'right' }}>{pct.toFixed(0)}%</Text>
            </View>
            <View style={styles.track}>
              <View style={{ width: `${pct}%`, height: '100%', backgroundColor: PALETTE[i % PALETTE.length], borderRadius: 4 }} />
            </View>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  plot: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, borderBottomWidth: 1, borderBottomColor: colors.border },
  col: { flex: 1, height: '100%', justifyContent: 'flex-end', borderRadius: 4 },
  colActive: { backgroundColor: colors.primarySoft },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 1, height: '100%', paddingHorizontal: 1 },
  axis: { flexDirection: 'row', gap: 2 },
  tooltip: { alignSelf: 'flex-start', padding: 8, borderRadius: radius.sm, backgroundColor: colors.surface2, gap: 2 },
  shareHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surface2, overflow: 'hidden' },
})
