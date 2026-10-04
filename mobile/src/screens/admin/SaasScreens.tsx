import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { View } from 'react-native'
import { ProductPickerButton } from '@/components/admin/Pickers'
import { RequirePermission } from '@/components/admin/RequirePermission'
import { Button, IconButton } from '@/components/ui/Button'
import { Card, KeyValue, ListRow, StatusBadge } from '@/components/ui/Data'
import { Alert, EmptyState, QueryState } from '@/components/ui/Feedback'
import { ChipGroup, Field, QtyInput, Select } from '@/components/ui/Form'
import { Sheet } from '@/components/ui/Overlay'
import { Screen } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { toast } from '@/components/ui/Toast'
import { api, ApiError } from '@/services/api'
import type { Branch, BranchStockRow, Product, StockTransfer, Subscription } from '@/services/types'
import { useCan, useModule } from '@/store/auth'
import { useBranchStore } from '@/store/branch'
import { date, money, quantity, titleCase } from '@/utils/format'

export function useBranches(enabled = true) {
  return useQuery({ queryKey: ['branches'], enabled, queryFn: () => api.get<Branch[]>('/api/v1/branches'), staleTime: 60_000 })
}

/** Working-branch chooser for staff (BRANCHES module, two or more open branches). */
export function BranchSwitcherCard() {
  const on = useModule('BRANCHES')
  const qc = useQueryClient()
  const { branchId, choose } = useBranchStore()
  const branches = useBranches(on)
  const open = (branches.data ?? []).filter((b) => b.active)
  if (!on || open.length < 2) return null
  const current = open.find((b) => b.id === branchId) ?? open.find((b) => b.isDefault)
  return (
    <Card title="Working branch">
      <Select label="Working branch" value={current?.id ?? ''} onChange={(v) => { choose(v); qc.invalidateQueries() }}
        options={open.map((b) => ({ value: b.id, label: b.isDefault ? `${b.name} (main)` : b.name }))} />
      <Text variant="xs" color="muted" style={{ marginTop: 6 }}>Sales, purchases and stock changes you make happen at this branch.</Text>
    </Card>
  )
}

/** Branches & transfers (§0B.14). */
export function BranchesScreen() {
  const canMove = useCan('STOCK_WRITE')
  const [tab, setTab] = useState('branches')
  const [stockAt, setStockAt] = useState('')
  const [moving, setMoving] = useState(false)
  const branches = useBranches()
  const chosen = stockAt || branches.data?.find((b) => b.isDefault)?.id || ''
  const stock = useQuery({ queryKey: ['branch-stock', chosen], enabled: tab === 'stock' && !!chosen, queryFn: () => api.get<BranchStockRow[]>(`/api/v1/branches/${chosen}/stock`) })
  const transfers = useQuery({ queryKey: ['stock-transfers'], enabled: tab === 'transfers', queryFn: () => api.get<StockTransfer[]>('/api/v1/stock-transfers') })
  return (
    <RequirePermission anyOf={['STOCK_READ']}>
      <Screen onRefresh={() => { branches.refetch(); stock.refetch(); transfers.refetch() }} refreshing={branches.isRefetching}
        footer={canMove ? <Button block icon="repeat" onPress={() => setMoving(true)}>Transfer stock</Button> : undefined}>
        <ChipGroup value={tab} onChange={setTab} options={[{ value: 'branches', label: 'Branches' }, { value: 'stock', label: 'Stock' }, { value: 'transfers', label: 'Transfers' }]} />
        {tab === 'branches' && (
          <QueryState query={branches} isEmpty={(d) => d.length === 0} empty={<EmptyState icon="home" title="No branches" />}>
            {(d) => (
              <Card padded={false}>
                {d.map((b) => (
                  <ListRow key={b.id} title={`${b.name}${b.isDefault ? ' (main)' : ''}`} subtitle={`${b.code} · ${titleCase(b.kind)}${b.city ? ` · ${b.city}` : ''}`}
                    right={<Text variant="small" color="muted">{b.productsInStock} items</Text>} meta={b.active ? undefined : <StatusBadge status="INACTIVE" />} />
                ))}
              </Card>
            )}
          </QueryState>
        )}
        {tab === 'stock' && (
          <>
            <Select label="Branch" value={chosen} onChange={setStockAt} options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))} />
            <QueryState query={stock} isEmpty={(d) => d.length === 0} empty={<EmptyState icon="package" title="No stock at this branch" />}>
              {(d) => (
                <Card padded={false}>
                  {d.map((r) => <ListRow key={r.productId} title={r.productName} subtitle={`${r.sku} · all branches ${quantity(r.totalOnHand)}`} right={<Text weight="700" num>{quantity(r.onHand)} {r.unit}</Text>} />)}
                </Card>
              )}
            </QueryState>
          </>
        )}
        {tab === 'transfers' && (
          <QueryState query={transfers} isEmpty={(d) => d.length === 0} empty={<EmptyState icon="repeat" title="No transfers yet" />}>
            {(d) => (
              <Card padded={false}>
                {d.map((t) => <ListRow key={t.id} title={t.transferNumber} subtitle={`${t.fromBranchName} → ${t.toBranchName} · ${date(t.transferDate)}`} />)}
              </Card>
            )}
          </QueryState>
        )}
        {moving && <TransferSheet branches={(branches.data ?? []).filter((b) => b.active)} onClose={() => setMoving(false)} onDone={() => { setMoving(false); setTab('transfers') }} />}
      </Screen>
    </RequirePermission>
  )
}

function TransferSheet({ branches, onClose, onDone }: { branches: Branch[]; onClose: () => void; onDone: () => void }) {
  const qc = useQueryClient()
  const [from, setFrom] = useState(branches.find((b) => b.isDefault)?.id ?? '')
  const [to, setTo] = useState('')
  const [lines, setLines] = useState<{ product: Product; quantity: string }[]>([])
  const m = useMutation({
    mutationFn: () => api.post<StockTransfer>('/api/v1/stock-transfers', { fromBranchId: from, toBranchId: to, items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })) }),
    onSuccess: (t) => {
      toast.success('Stock moved', t.transferNumber)
      qc.invalidateQueries({ queryKey: ['stock-transfers'] }); qc.invalidateQueries({ queryKey: ['branch-stock'] }); qc.invalidateQueries({ queryKey: ['branches'] })
      onDone()
    },
  })
  const err = m.error instanceof ApiError ? m.error : null
  const valid = !!from && !!to && from !== to && lines.length > 0 && lines.every((l) => Number(l.quantity) > 0)
  const options = branches.map((b) => ({ value: b.id, label: b.name }))
  return (
    <Sheet open onClose={onClose} title="Transfer stock" footer={<Button block loading={m.isPending} disabled={!valid} onPress={() => m.mutate()}>Move stock</Button>}>
      <Field label="From"><Select label="From" value={from} onChange={setFrom} options={options} /></Field>
      <Field label="To"><Select label="To" value={to} onChange={setTo} placeholder="Choose branch" options={options.filter((o) => o.value !== from)} /></Field>
      <ProductPickerButton exclude={lines.map((l) => l.product.id)} onPick={(p) => setLines([...lines, { product: p, quantity: '1' }])} />
      {lines.map((l, i) => (
        <View key={l.product.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ flex: 1 }}>{l.product.name}</Text>
          <View style={{ width: 90 }}><QtyInput value={l.quantity} onChangeText={(t) => setLines(lines.map((x, idx) => (idx === i ? { ...x, quantity: t } : x)))} accessibilityLabel={`Quantity of ${l.product.name}`} /></View>
          <IconButton icon="trash-2" label={`Remove ${l.product.name}`} onPress={() => setLines(lines.filter((_, idx) => idx !== i))} />
        </View>
      ))}
      {err && <Alert tone="danger">{err.message}</Alert>}
    </Sheet>
  )
}

/** The business's ShopFlow plan and usage (Settings). */
export function PlanUsageSection() {
  const q = useQuery({ queryKey: ['subscription'], queryFn: () => api.get<Subscription>('/api/v1/subscription') })
  const row = (used: number, max?: number) => `${used}${max != null ? ` of ${max}` : ' · no limit'}`
  return (
    <QueryState query={q}>
      {(s) => (
        <Card title={`${s.plan.name} plan`}>
          <KeyValue items={[
            ['Price', s.plan.priceMonthly != null ? `${money(s.plan.priceMonthly)} / month` : 'Custom'],
            ['Staff users', row(s.usage.staff, s.plan.maxStaff)], ['Products', row(s.usage.products, s.plan.maxProducts)],
            ['Customers', row(s.usage.customers, s.plan.maxCustomers)], ['Invoices this month', row(s.usage.invoicesThisMonth, s.plan.maxInvoicesPerMonth)],
            ['Branches', row(s.usage.branches, s.plan.maxBranches)], ['Files (MB)', row(s.usage.storageMb, s.plan.maxStorageMb)],
          ]} />
          <Text variant="xs" color="muted" style={{ marginTop: 8 }}>To change your plan, contact ShopFlow support.</Text>
        </Card>
      )}
    </QueryState>
  )
}
