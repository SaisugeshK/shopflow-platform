import { Feather } from '@expo/vector-icons'
import type { UseQueryResult } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { ActivityIndicator, Animated, StyleSheet, View, type DimensionValue } from 'react-native'
import { ApiError } from '@/services/api'
import { colors, radius, tones, type Tone } from '@/theme/tokens'
import { Button, type IconName } from './Button'
import { Text } from './Text'

export function Spinner({ size = 'small' }: { size?: 'small' | 'large' }) {
  return <ActivityIndicator size={size} color={colors.primary} accessibilityLabel="Loading" />
}

export function Loading() {
  return (
    <View style={styles.center}>
      <Spinner size="large" />
    </View>
  )
}

export function Skeleton({ width = '100%', height = 16, rounded = 6 }: { width?: DimensionValue; height?: number; rounded?: number }) {
  const [opacity] = useState(() => new Animated.Value(0.5))
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [opacity])
  return <Animated.View accessibilityElementsHidden style={{ width, height, borderRadius: rounded, backgroundColor: colors.border, opacity }} />
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <View style={{ gap: 12, padding: 16 }} accessibilityLabel="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.skelRow}>
          <Skeleton width="55%" height={14} />
          <Skeleton width="35%" height={12} />
        </View>
      ))}
    </View>
  )
}

export function EmptyState({ title, description, icon = 'inbox', action }: { title: string; description?: string; icon?: IconName; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.surface2 }]}>
        <Feather name={icon} size={26} color={colors.muted} />
      </View>
      <Text variant="h3" align="center">{title}</Text>
      {description && <Text variant="small" color="muted" align="center">{description}</Text>}
      {action}
    </View>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const e = error instanceof ApiError ? error : null
  const offline = e?.code === 'NETWORK_ERROR'
  const forbidden = e?.status === 403
  return (
    <View style={styles.empty} accessibilityRole="alert">
      <View style={[styles.emptyIcon, { backgroundColor: colors.dangerSoft }]}>
        <Feather name={offline ? 'wifi-off' : forbidden ? 'lock' : 'alert-triangle'} size={26} color={colors.danger} />
      </View>
      <Text variant="h3" align="center">{offline ? 'You are offline' : forbidden ? 'No access' : e?.status === 404 ? 'Not found' : 'Something went wrong'}</Text>
      <Text variant="small" color="muted" align="center">{e?.message ?? 'Please try again.'}</Text>
      {onRetry && !forbidden && <Button variant="secondary" icon="refresh-cw" onPress={onRetry}>Try again</Button>}
    </View>
  )
}

export function Alert({ tone = 'primary', title, children }: { tone?: Tone; title?: string; children: ReactNode }) {
  const t = tones[tone]
  const icon: IconName = tone === 'danger' ? 'alert-octagon' : tone === 'warning' ? 'alert-triangle' : tone === 'success' ? 'check-circle' : 'info'
  return (
    <View style={[styles.alert, { backgroundColor: t.bg }]} accessibilityRole={tone === 'danger' ? 'alert' : undefined}>
      <Feather name={icon} size={17} color={t.fg} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, gap: 2 }}>
        {title && <Text variant="small" weight="700" style={{ color: t.fg }}>{title}</Text>}
        {typeof children === 'string' ? <Text variant="small" style={{ color: t.fg }}>{children}</Text> : children}
      </View>
    </View>
  )
}

/** Loading / error / empty / data states for a query, so every screen handles all four (§66). */
export function QueryState<T>({ query, children, isEmpty, empty, skeleton }: { query: UseQueryResult<T>; children: (data: T) => ReactNode; isEmpty?: (d: T) => boolean; empty?: ReactNode; skeleton?: ReactNode }) {
  if (query.isLoading) return <>{skeleton ?? <Loading />}</>
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  if (query.data === undefined) return null
  if (isEmpty?.(query.data)) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>
  return <>{children(query.data)}</>
}

const styles = StyleSheet.create({
  center: { flex: 1, minHeight: 200, alignItems: 'center', justifyContent: 'center' },
  skelRow: { gap: 8, padding: 14, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  emptyIcon: { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  alert: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radius.md },
})
