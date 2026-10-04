import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { AcceptQuotationSheet, ProjectStatementSheet } from '@/components/trade/TradeParts'
import { Button } from '@/components/ui/Button'
import { Card, KeyValue, ListRow, StatusBadge } from '@/components/ui/Data'
import { Alert, EmptyState, QueryState } from '@/components/ui/Feedback'
import { ConfirmDialog } from '@/components/ui/Overlay'
import { PagedList, Screen } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { toast } from '@/components/ui/Toast'
import { api } from '@/services/api'
import type { Project, Quotation } from '@/services/types'
import { date, money, quantity } from '@/utils/format'

const shown = (s: string) => (s === 'SENT' ? 'PENDING' : s)

/** Quotations from the business (§0B.9). */
export function MyQuotationsScreen() {
  return (
    <PagedList<Quotation>
      queryKey={['my-quotations']}
      fetchPage={() => api.page<Quotation>('/api/v1/my/quotations')}
      keyOf={(x) => x.id}
      empty={<EmptyState icon="file-text" title="No quotations" description="Quotations from the shop appear here." />}
      renderItem={(x) => (
        <ListRow title={x.quotationNumber} subtitle={`${date(x.quoteDate)}${x.validUntil ? ` · valid until ${date(x.validUntil)}` : ''}`}
          meta={<View style={{ marginTop: 6, flexDirection: 'row' }}><StatusBadge status={shown(x.status)} /></View>}
          right={<Text weight="700" num>{money(x.grandTotal)}</Text>} onPress={() => router.push(`/shop/quotation/${x.id}`)} />
      )}
    />
  )
}

export function MyQuotationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const qc = useQueryClient()
  const [sheet, setSheet] = useState(false)
  const [declining, setDeclining] = useState(false)
  const q = useQuery({ queryKey: ['my-quotation', id], queryFn: () => api.get<Quotation>(`/api/v1/my/quotations/${id}`) })
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api.post<Quotation>(`/api/v1/my/quotations/${id}/${path}`, body),
    onSuccess: (x) => {
      setSheet(false); setDeclining(false)
      qc.setQueryData(['my-quotation', id], x)
      qc.invalidateQueries({ queryKey: ['my-quotations'] })
      qc.invalidateQueries({ queryKey: ['my-orders'] })
      if (x.status === 'CONVERTED' && x.orderId) { toast.success('Order placed', x.orderNumber); router.replace(`/shop/order/${x.orderId}`) } else toast.success('Quotation declined')
    },
    onError: (e) => toast.error(e),
  })
  return (
    <>
      <Stack.Screen options={{ title: q.data?.quotationNumber ?? 'Quotation' }} />
      <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}
        footer={q.data?.status === 'SENT' ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button variant="ghost" onPress={() => setDeclining(true)}>Decline</Button>
            <Button icon="check" style={{ flex: 1 }} onPress={() => setSheet(true)}>Accept</Button>
          </View>
        ) : undefined}>
        <QueryState query={q}>
          {(x) => (
            <>
              <View style={{ flexDirection: 'row' }}><StatusBadge status={shown(x.status)} /></View>
              {x.status === 'SENT' && <Alert>Accepting places an order at these prices.{x.validUntil ? ` Valid until ${date(x.validUntil)}.` : ''}</Alert>}
              {x.status === 'CONVERTED' && x.orderId && <Alert tone="success">Accepted · order {x.orderNumber}</Alert>}
              <Card title="Items">
                {(x.items ?? []).map((i) => (
                  <ListRow key={i.id} title={i.productName} subtitle={`${quantity(i.quantity)} ${i.unit} × ${money(i.rate)}${i.discountPercent > 0 ? ` − ${i.discountPercent}%` : ''}`} right={<Text num>{money(i.lineTotal)}</Text>} />
                ))}
                <KeyValue items={[['Taxable', money(x.taxableTotal)], ['GST', money(x.taxTotal)], ['Total', <Text key="t" weight="700" num>{money(x.grandTotal)}</Text>], ['Project', x.projectName], ['Terms', x.notes]]} />
              </Card>
            </>
          )}
        </QueryState>
        {sheet && <AcceptQuotationSheet loading={act.isPending} onClose={() => setSheet(false)} onAccept={(body) => act.mutate({ path: 'accept', body })} />}
        <ConfirmDialog open={declining} onClose={() => setDeclining(false)} tone="danger" loading={act.isPending} title="Decline this quotation?"
          confirmLabel="Decline" onConfirm={() => act.mutate({ path: 'reject', body: {} })} />
      </Screen>
    </>
  )
}

export function MyProjectsScreen() {
  const [statement, setStatement] = useState<string | null>(null)
  return (
    <>
      <PagedList<Project>
        queryKey={['my-projects']}
        fetchPage={() => api.page<Project>('/api/v1/my/projects')}
        keyOf={(p) => p.id}
        empty={<EmptyState icon="map-pin" title="No projects" description="Your sites appear here once the shop sets them up." />}
        renderItem={(p) => (
          <ListRow title={p.name} subtitle={`Billed ${money(p.billed)}`} right={<Text num weight="600">{money(p.outstanding)} due</Text>} onPress={() => setStatement(p.id)} />
        )}
      />
      {statement && <ProjectStatementSheet path={`/api/v1/my/projects/${statement}/statement`} onClose={() => setStatement(null)} />}
    </>
  )
}
