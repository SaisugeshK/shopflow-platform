import { useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { ColumnChart, ShareBars } from '@/components/admin/Charts'
import { DateInput, isValidDate } from '@/components/admin/Pickers'
import { Button, type IconName } from '@/components/ui/Button'
import { Card, ListRow, StatCard, StatusBadge } from '@/components/ui/Data'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { ChipGroup } from '@/components/ui/Form'
import { Grid, Screen, SectionTitle, useColumns } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { api } from '@/services/api'
import { useAuthStore } from '@/store/auth'
import type { Tone } from '@/theme/tokens'
import { date, money, quantity } from '@/utils/format'

type Row = Record<string, string | number | null>
interface Dashboard {
  period: { range: string; from: string; to: string }
  kpis: Record<string, number>
  salesTrend?: Row[]
  purchaseTrend?: Row[]
  paymentTrend?: Row[]
  outstandingTrend?: Row[]
  salesByCategory?: Row[]
  topProducts?: Row[]
  topCustomers?: Row[]
  outstandingCustomers?: Row[]
  recentOrders: Row[]
  lowStock: Row[]
  recentPayments?: Row[]
}

const RANGES = [
  { value: 'TODAY', label: 'Today' },
  { value: 'YESTERDAY', label: 'Yesterday' },
  { value: 'THIS_WEEK', label: 'This week' },
  { value: 'THIS_MONTH', label: 'This month' },
  { value: 'THIS_FINANCIAL_YEAR', label: 'This FY' },
  { value: 'CUSTOM', label: 'Custom' },
]

interface Kpi { label: string; value: number | undefined; tone: Tone; icon: IconName; hint?: string; count?: boolean; onPress?: () => void }

function KpiGrid({ kpis }: { kpis: Kpi[] | null }) {
  const columns = Math.max(2, Math.min(4, useColumns(160)))
  if (!kpis) {
    return <Grid columns={columns}>{Array.from({ length: 4 }).map((_, i) => <Card key={i}><View style={{ gap: 8 }}><Skeleton width="60%" height={12} /><Skeleton width="80%" height={22} /></View></Card>)}</Grid>
  }
  return (
    <Grid columns={columns}>
      {kpis.map((k) => (
        <StatCard key={k.label} label={k.label} value={k.count ? String(Math.round(k.value ?? 0)) : k.value} isMoney={!k.count} compact tone={k.tone} icon={k.icon} hint={k.hint} onPress={k.onPress} />
      ))}
    </Grid>
  )
}

function RecentOrders({ rows }: { rows?: Row[] }) {
  return (
    <Card title="Recent orders" padded={false} actions={<Button size="sm" variant="ghost" onPress={() => router.push('/admin/orders')}>All</Button>}>
      {!rows ? <View style={{ padding: 16 }}><Skeleton height={100} /></View> : rows.length === 0 ? <EmptyState icon="shopping-cart" title="No orders yet" /> : rows.map((r) => (
        <ListRow key={String(r.id)} onPress={() => router.push(`/admin/order/${r.id}`)} title={String(r.orderNumber)} subtitle={`${r.customer} · ${date(String(r.placedAt))}`}
          meta={<View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}><StatusBadge status={String(r.status)} /><StatusBadge status={String(r.paymentStatus)} /></View>}
          right={<Text weight="700" num>{money(Number(r.grandTotal))}</Text>} />
      ))}
    </Card>
  )
}

function RankList({ title, rows, label, value, fmt, sub, onPress, empty, action }: { title: string; rows?: Row[]; label: string; value: string; fmt: (v: number) => string; sub?: (r: Row) => string; onPress?: (r: Row) => void; empty: string; action?: React.ReactNode }) {
  return (
    <Card title={title} padded={false} actions={action}>
      {!rows ? <View style={{ padding: 16 }}><Skeleton height={80} /></View> : rows.length === 0 ? <EmptyState title={empty} /> : rows.slice(0, 6).map((r, i) => (
        <ListRow key={i} title={String(r[label] ?? '—')} subtitle={sub?.(r)} onPress={onPress ? () => onPress(r) : undefined} right={<Text weight="600" num>{fmt(Number(r[value] ?? 0))}</Text>} />
      ))}
    </Card>
  )
}

function OwnerDashboard() {
  const [range, setRange] = useState('THIS_MONTH')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const enabled = range !== 'CUSTOM' || (isValidDate(from) && isValidDate(to))
  const q = useQuery({
    queryKey: ['dashboard', 'owner', range, from, to],
    queryFn: () => api.get<Dashboard>('/api/v1/dashboard/owner', { range, from: range === 'CUSTOM' ? from : undefined, to: range === 'CUSTOM' ? to : undefined }),
    enabled,
  })
  const k = q.data?.kpis
  const wide = useColumns(340) >= 2
  const kpis: Kpi[] | null = k ? [
    { label: "Today's sales", value: k.todaySales, tone: 'primary', icon: 'trending-up', hint: `Period ${money(k.periodSales)}` },
    { label: "Today's profit", value: k.todayProfit, tone: 'success', icon: 'dollar-sign', hint: `Period ${money(k.periodProfit)}` },
    { label: 'Customers', value: k.totalCustomers, count: true, tone: 'accent', icon: 'users', hint: k.pendingApprovals ? `${k.pendingApprovals} awaiting approval` : 'All approved', onPress: () => router.push('/admin/customers') },
    { label: 'Stock value', value: k.stockValue, tone: 'purple', icon: 'layers', hint: 'At purchase cost', onPress: () => router.push('/admin/stock') },
    { label: 'Outstanding', value: k.outstanding, tone: 'warning', icon: 'credit-card', hint: `Overdue ${money(k.overdue)}`, onPress: () => router.push('/admin/customers?hasOutstanding=true') },
    { label: 'Pending orders', value: k.pendingOrders, count: true, tone: 'primary', icon: 'shopping-cart', onPress: () => router.push('/admin/orders') },
    { label: 'Pending payments', value: k.pendingPayments, tone: 'warning', icon: 'file-text', hint: 'Open invoice balance' },
    { label: 'Low-stock products', value: k.lowStockProducts, count: true, tone: 'danger', icon: 'alert-triangle', onPress: () => router.push('/admin/stock?status=LOW_STOCK') },
  ] : null
  const d = q.data
  const purchaseVsCollected = d?.purchaseTrend && d.paymentTrend ? d.purchaseTrend.map((r, i) => ({ date: r.date ?? null, purchases: Number(r.purchases), collected: Number(d.paymentTrend![i]?.collected ?? 0) })) : undefined

  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <View style={{ gap: 4 }}>
        <Text variant="h1">Dashboard</Text>
        <Text variant="small" color="muted">{d ? `${date(d.period.from)} – ${date(d.period.to)}` : 'Business overview'}</Text>
      </View>
      <ChipGroup value={range} onChange={setRange} options={RANGES} />
      {range === 'CUSTOM' && (
        <View style={{ gap: 8 }}>
          <DateInput label="From" value={from} onChange={setFrom} />
          <DateInput label="To" value={to} onChange={setTo} />
        </View>
      )}
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <>
          <KpiGrid kpis={kpis} />
          <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16 }}>
            <View style={{ flex: 1 }}>
              <Card title="Sales trend">{d?.salesTrend ? <ColumnChart rows={d.salesTrend} labelKey="date" series={[{ key: 'sales', label: 'Sales', color: '#2563EB' }]} /> : <Skeleton height={150} />}</Card>
            </View>
            <View style={{ flex: 1 }}>
              <Card title="Purchases vs collections">{purchaseVsCollected ? <ColumnChart rows={purchaseVsCollected} labelKey="date" series={[{ key: 'purchases', label: 'Purchases', color: '#7C3AED' }, { key: 'collected', label: 'Collected', color: '#16A34A' }]} /> : <Skeleton height={150} />}</Card>
            </View>
          </View>
          <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16 }}>
            <View style={{ flex: 1 }}>
              <Card title="Sales by category">{d?.salesByCategory?.length ? <ShareBars rows={d.salesByCategory} labelKey="category" valueKey="sales" /> : d ? <EmptyState title="No sales in this period" /> : <Skeleton height={120} />}</Card>
            </View>
            <View style={{ flex: 1 }}>
              <Card title="Outstanding trend">{d?.outstandingTrend ? <ColumnChart rows={d.outstandingTrend} labelKey="date" series={[{ key: 'outstanding', label: 'Outstanding', color: '#F59E0B' }]} /> : <Skeleton height={150} />}</Card>
            </View>
          </View>
          <RankList title="Top-selling products" rows={d?.topProducts} label="product" value="sales" fmt={money} sub={(r) => `Qty ${quantity(Number(r.quantity))}`} empty="No sales yet" />
          <RankList title="Top customers" rows={d?.topCustomers} label="customer" value="sales" fmt={money} sub={(r) => `${r.invoices} invoices`} onPress={(r) => router.push(`/admin/customer/${r.customerId}`)} empty="No sales yet" />
          <RankList title="Outstanding customers" rows={d?.outstandingCustomers} label="customer" value="outstanding" fmt={money} onPress={(r) => router.push(`/admin/customer/${r.customerId}`)} empty="Nothing outstanding"
            action={<Button size="sm" variant="ghost" onPress={() => router.push('/admin/customers?hasOutstanding=true')}>All</Button>} />
          <RankList title="Low stock" rows={d?.lowStock} label="product" value="available" fmt={quantity} sub={(r) => `Minimum ${quantity(Number(r.minimumStock))}`} empty="All products are well stocked"
            action={<Button size="sm" variant="ghost" onPress={() => router.push('/admin/stock?status=LOW_STOCK')}>All</Button>} />
          <RecentOrders rows={d?.recentOrders} />
          <RankList title="Recent payments" rows={d?.recentPayments} label="paymentNumber" value="amount" fmt={money} sub={(r) => `${r.customer} · ${r.method}`} onPress={(r) => router.push(`/admin/payment/${r.id}`)} empty="No payments yet" />
        </>
      )}
    </Screen>
  )
}

const QUICK: { label: string; icon: IconName; href: string; perm: string }[] = [
  { label: 'Create invoice', icon: 'file-plus', href: '/admin/invoice-new', perm: 'INVOICE_WRITE' },
  { label: 'Record payment', icon: 'credit-card', href: '/admin/payments?record=1', perm: 'PAYMENT_WRITE' },
  { label: 'Add purchase', icon: 'truck', href: '/admin/purchase-new', perm: 'PURCHASE_WRITE' },
  { label: 'Add product', icon: 'plus-square', href: '/admin/product-form', perm: 'PRODUCT_WRITE' },
  { label: 'Add customer', icon: 'user-plus', href: '/admin/customer-new', perm: 'CUSTOMER_WRITE' },
]

function AdminDashboard() {
  const perms = useAuthStore((s) => s.user?.permissions ?? [])
  const q = useQuery({ queryKey: ['dashboard', 'admin'], queryFn: () => api.get<Dashboard>('/api/v1/dashboard/admin'), refetchInterval: 60_000 })
  const k = q.data?.kpis
  const kpis: Kpi[] | null = k ? [
    { label: "Today's orders", value: k.todayOrders, count: true, tone: 'primary', icon: 'clipboard', onPress: () => router.push('/admin/orders') },
    { label: 'New orders', value: k.placedOrders, count: true, tone: 'warning', icon: 'shopping-cart', hint: k.creditApprovals ? `${k.creditApprovals} need credit approval` : undefined, onPress: () => router.push('/admin/orders?status=PLACED') },
    { label: 'Accepted', value: k.acceptedOrders, count: true, tone: 'primary', icon: 'check-square', onPress: () => router.push('/admin/orders?status=ACCEPTED') },
    { label: 'Packing', value: k.packingOrders, count: true, tone: 'accent', icon: 'box', onPress: () => router.push('/admin/orders?status=PACKING') },
    { label: 'Ready for delivery', value: k.readyForDeliveryOrders, count: true, tone: 'success', icon: 'package', onPress: () => router.push('/admin/orders?status=READY_FOR_DELIVERY') },
    { label: 'Out for delivery', value: k.outForDeliveryOrders, count: true, tone: 'purple', icon: 'truck', onPress: () => router.push('/admin/orders?status=OUT_FOR_DELIVERY') },
    { label: "Today's sales", value: k.todaySales, tone: 'success', icon: 'trending-up' },
    { label: 'Pending payments', value: k.pendingPayments, tone: 'warning', icon: 'credit-card' },
    { label: 'Low stock', value: k.lowStockProducts, count: true, tone: 'danger', icon: 'alert-triangle', onPress: () => router.push('/admin/stock?status=LOW_STOCK') },
    { label: 'Approvals & returns', value: (k.pendingApprovals ?? 0) + (k.pendingReturns ?? 0), count: true, tone: 'neutral', icon: 'user-check', hint: `${k.pendingApprovals ?? 0} customers · ${k.pendingReturns ?? 0} returns` },
  ] : null
  const quick = QUICK.filter((a) => perms.includes(a.perm))
  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <View style={{ gap: 4 }}>
        <Text variant="h1">Operations</Text>
        <Text variant="small" color="muted">Today’s work at a glance</Text>
      </View>
      {quick.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {quick.map((a) => <Button key={a.href} size="sm" variant="secondary" icon={a.icon} onPress={() => router.push(a.href as never)}>{a.label}</Button>)}
        </ScrollView>
      )}
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <>
          <KpiGrid kpis={kpis} />
          <RecentOrders rows={q.data?.recentOrders} />
          <SectionTitle>Low stock</SectionTitle>
          <RankList title="Products below minimum" rows={q.data?.lowStock} label="product" value="available" fmt={quantity} sub={(r) => `${r.sku ?? ''} · minimum ${quantity(Number(r.minimumStock))}`} empty="All products are well stocked" />
        </>
      )}
    </Screen>
  )
}

/** O01 Owner dashboard (§33) or AD01 Admin dashboard (§34) depending on permissions. */
export default function DashboardScreen() {
  const owner = useAuthStore((s) => s.user?.permissions.includes('DASHBOARD_OWNER_VIEW') ?? false)
  return owner ? <OwnerDashboard /> : <AdminDashboard />
}
