import { useInfiniteQuery } from '@tanstack/react-query'
import { StyleSheet, View } from 'react-native'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Data'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/Feedback'
import { Text } from '@/components/ui/Text'
import { api } from '@/services/api'
import type { LedgerEntry } from '@/services/types'
import { colors } from '@/theme/tokens'
import { date, money, titleCase } from '@/utils/format'

/** Account statement (customer ledger). Rendered inside a scroll view, so it pages with a "Load more" button. */
export function Ledger({ path }: { path: string }) {
  const q = useInfiniteQuery({
    queryKey: ['ledger', path],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.page<LedgerEntry>(path, { page: pageParam, pageSize: 25 }),
    getNextPageParam: (last) => (last.pagination.page < last.pagination.totalPages ? last.pagination.page + 1 : undefined),
  })
  if (q.isLoading) return <ListSkeleton rows={4} />
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const rows = q.data?.pages.flatMap((p) => p.items) ?? []
  if (!rows.length) return <EmptyState icon="book-open" title="No transactions yet" />
  return (
    <Card padded={false}>
      {rows.map((e, i) => (
        <View key={e.id} style={[styles.row, i > 0 && styles.sep]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text weight="600">{e.referenceNumber}</Text>
            <Text variant="xs" color="muted">{date(e.date)} · {titleCase(e.entryType)}</Text>
            {e.narration && <Text variant="xs" color="muted" numberOfLines={2}>{e.narration}</Text>}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            {e.debit > 0 && <Text variant="small" num color="danger">+{money(e.debit)}</Text>}
            {e.credit > 0 && <Text variant="small" num color="success">−{money(e.credit)}</Text>}
            <Text variant="xs" color="muted" num>Bal {money(e.balance)}</Text>
          </View>
        </View>
      ))}
      {q.hasNextPage && (
        <View style={{ padding: 12 }}>
          <Button variant="secondary" loading={q.isFetchingNextPage} onPress={() => q.fetchNextPage()}>Load more</Button>
        </View>
      )}
    </Card>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, padding: 14 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
})
