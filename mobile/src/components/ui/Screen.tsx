import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query'
import { useState, type ReactElement, type ReactNode } from 'react'
import { FlatList, RefreshControl, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Paged } from '@/services/api'
import { colors, MAX_CONTENT_WIDTH } from '@/theme/tokens'
import { EmptyState, ErrorState, ListSkeleton, Spinner } from './Feedback'
import { KeyboardAwareScroll } from './KeyboardAware'
import { Text } from './Text'
import { wordify } from '@/store/words'

/**
 * Scrollable page body: pull-to-refresh, centred and width-capped on tablets. Keyboard-aware: the content and the
 * footer move above the on-screen keyboard and the focused field is scrolled into view.
 */
export function Screen({ children, onRefresh, refreshing = false, footer, contentStyle, scroll = true }: { children: ReactNode; onRefresh?: () => void; refreshing?: boolean; footer?: ReactNode; contentStyle?: StyleProp<ViewStyle>; scroll?: boolean }) {
  const insets = useSafeAreaInsets()
  const footerNode = footer ? <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}><View style={styles.inner}>{footer}</View></View> : undefined
  if (!scroll) {
    return (
      <View style={styles.root}>
        <View style={[styles.content, { flex: 1 }, contentStyle]}><View style={[styles.inner, { flex: 1 }]}>{children}</View></View>
        {footerNode}
      </View>
    )
  }
  return (
    <KeyboardAwareScroll
      style={styles.root}
      footer={footerNode}
      contentContainerStyle={[styles.content, { paddingBottom: footer ? 16 : insets.bottom + 24 }, contentStyle]}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} /> : undefined}
    >
      <View style={styles.inner}>{children}</View>
    </KeyboardAwareScroll>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="h3" style={{ flex: 1 }} accessibilityRole="header">{wordify(children)}</Text>
      {action}
    </View>
  )
}

/** Columns for card grids: 1 on small phones, 2 on phones, 3–4 on tablets. */
export function useColumns(minItemWidth = 170): number {
  const { width } = useWindowDimensions()
  const usable = Math.min(width, MAX_CONTENT_WIDTH) - 32
  return Math.max(1, Math.min(4, Math.floor(usable / minItemWidth)))
}

export function Grid({ children, columns, gap = 12 }: { children: ReactNode[]; columns: number; gap?: number }) {
  const rows: ReactNode[][] = []
  children.forEach((c, i) => {
    if (i % columns === 0) rows.push([])
    rows[rows.length - 1]!.push(c)
  })
  return (
    <View style={{ gap }}>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', gap }}>
          {r.map((c, j) => <View key={j} style={{ flex: 1 }}>{c}</View>)}
          {Array.from({ length: columns - r.length }).map((_, j) => <View key={`pad${j}`} style={{ flex: 1 }} />)}
        </View>
      ))}
    </View>
  )
}

/**
 * Paged API list with infinite scroll and pull-to-refresh. The query key must include every filter so changing a
 * filter starts from page 1.
 */
export function PagedList<T>({ queryKey, fetchPage, renderItem, keyOf, header, empty, pageSize = 20, columns = 1, contentPadding = true }: {
  queryKey: QueryKey
  fetchPage: (page: number, pageSize: number) => Promise<Paged<T>>
  renderItem: (item: T, index: number) => ReactElement
  keyOf: (item: T) => string
  header?: ReactElement
  empty?: ReactElement
  pageSize?: number
  columns?: number
  contentPadding?: boolean
}) {
  const insets = useSafeAreaInsets()
  const [manualRefresh, setManualRefresh] = useState(false)
  const q = useInfiniteQuery({
    queryKey,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => fetchPage(pageParam, pageSize),
    getNextPageParam: (last) => (last.pagination.page < last.pagination.totalPages ? last.pagination.page + 1 : undefined),
  })
  const items = q.data?.pages.flatMap((p) => p.items) ?? []
  const total = q.data?.pages[0]?.pagination.totalItems
  return (
    <FlatList
      key={columns}
      data={items}
      numColumns={columns}
      keyExtractor={keyOf}
      renderItem={({ item, index }) => (columns > 1 ? <View style={{ flex: 1 / columns, padding: 6 }}>{renderItem(item, index)}</View> : renderItem(item, index))}
      columnWrapperStyle={columns > 1 ? { paddingHorizontal: contentPadding ? 10 : 0 } : undefined}
      style={styles.root}
      contentContainerStyle={[{ paddingBottom: insets.bottom + 24 }, styles.listContent]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      ListHeaderComponent={
        <View style={{ gap: 12, padding: contentPadding ? 16 : 0, paddingBottom: 8 }}>
          {header}
          {total != null && total > 0 && <Text variant="xs" color="muted">{total} {total === 1 ? 'result' : 'results'}</Text>}
        </View>
      }
      ListEmptyComponent={q.isLoading ? <ListSkeleton /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : empty ?? <EmptyState title="Nothing here yet" />}
      ListFooterComponent={q.isFetchingNextPage ? <View style={{ padding: 16 }}><Spinner /></View> : null}
      onEndReachedThreshold={0.4}
      onEndReached={() => {
        if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage()
      }}
      refreshControl={
        <RefreshControl
          refreshing={manualRefresh}
          onRefresh={async () => {
            setManualRefresh(true)
            await q.refetch()
            setManualRefresh(false)
          }}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    />
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16 },
  inner: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', gap: 16 },
  listContent: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  footer: { paddingHorizontal: 16, paddingTop: 10, backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  section: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
})
