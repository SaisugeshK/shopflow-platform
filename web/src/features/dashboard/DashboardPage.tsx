import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle, Boxes, ClipboardList, IndianRupee, PackageCheck, Plus, Receipt, ShoppingCart, TrendingUp, Truck, UserPlus, Users, Wallet,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, DataTable, PageHeader, StatCard, StatusBadge } from '@/components/ui/Data'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Input, Select } from '@/components/ui/Form'
import { PageActions } from '@/components/ui/PageActions'
import { api } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { date, money, moneyCompact, quantity } from '@/utils/format'

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
  { value: 'THIS_FINANCIAL_YEAR', label: 'This financial year' },
  { value: 'CUSTOM', label: 'Custom range' },
]
const PALETTE = ['#2563eb', '#06b6d4', '#0d9488', '#7c3aed', '#f59e0b', '#16a34a', '#dc2626', '#64748b']

/** O01 Owner dashboard (§33) or AD01 Admin dashboard (§34) depending on permissions. */
export function DashboardPage() {
  const isOwnerView = useAuthStore((s) => s.user?.permissions.includes('DASHBOARD_OWNER_VIEW') ?? false)
  return isOwnerView ? <OwnerDashboard /> : <AdminDashboard />
}

function RangeFilter({ range, setRange, from, setFrom, to, setTo }: { range: string; setRange: (v: string) => void; from: string; setFrom: (v: string) => void; to: string; setTo: (v: string) => void }) {
  return (
    <div className="row">
      <Select aria-label="Date range" value={range} onChange={(e) => setRange(e.target.value)} options={RANGES} style={{ width: 190 }} />
      {range === 'CUSTOM' && (
        <>
          <Input type="date" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 160 }} />
          <Input type="date" aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 160 }} />
        </>
      )}
    </div>
  )
}

function OwnerDashboard() {
  const [range, setRange] = useState('THIS_MONTH')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const navigate = useNavigate()
  const enabled = range !== 'CUSTOM' || (!!from && !!to)
  const q = useQuery({
    queryKey: ['dashboard', 'owner', range, from, to],
    queryFn: () => api.get<Dashboard>('/api/v1/dashboard/owner', { range, from: range === 'CUSTOM' ? from : undefined, to: range === 'CUSTOM' ? to : undefined }),
    enabled,
  })
  const k = q.data?.kpis
  return (
    <div className="stack">
      <PageHeader
        title="Dashboard"
        subtitle={q.data ? `${date(q.data.period.from)} – ${date(q.data.period.to)}` : 'Business overview'}
        actions={<RangeFilter range={range} setRange={setRange} from={from} setFrom={setFrom} to={to} setTo={setTo} />}
      />
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <>
          <div className="kpi-grid">
            {!k ? Array.from({ length: 8 }).map((_, i) => <div key={i} className="card stat-card"><Skeleton height={14} width="50%" /><Skeleton height={28} width="70%" /></div>) : (
              <>
                <StatCard index={0} label="Today's sales" value={k.todaySales} icon={<IndianRupee size={18} />} hint={`Period: ${money(k.periodSales)}`} />
                <StatCard index={1} label="Today's profit" value={k.todayProfit} tone="success" icon={<TrendingUp size={18} />} hint={`Period: ${money(k.periodProfit)}`} />
                <StatCard index={2} label="Customers" value={k.totalCustomers} format={(n) => String(Math.round(n))} tone="accent" icon={<Users size={18} />} hint={k.pendingApprovals ? `${k.pendingApprovals} awaiting approval` : 'All approved'} />
                <StatCard index={3} label="Stock value" value={k.stockValue} tone="purple" icon={<Boxes size={18} />} hint="At purchase cost" />
                <StatCard index={4} label="Outstanding" value={k.outstanding} tone="warning" icon={<Wallet size={18} />} hint={`Overdue ${money(k.overdue)}`} />
                <StatCard index={5} label="Pending orders" value={k.pendingOrders} format={(n) => String(Math.round(n))} tone="primary" icon={<ShoppingCart size={18} />} />
                <StatCard index={6} label="Pending payments" value={k.pendingPayments} tone="warning" icon={<Receipt size={18} />} hint="Open invoice balance" />
                <StatCard index={7} label="Low-stock products" value={k.lowStockProducts} format={(n) => String(Math.round(n))} tone="danger" icon={<AlertTriangle size={18} />} />
              </>
            )}
          </div>

          <div className="grid-2">
            <Card title="Sales trend">
              <div className="chart-box">
                {q.data?.salesTrend ? (
                  <ResponsiveContainer>
                    <AreaChart data={q.data.salesTrend.map((r) => ({ date: String(r.date).slice(5), sales: Number(r.sales) }))}>
                      <defs><linearGradient id="gSales" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity={0.35} /><stop offset="100%" stopColor="#2563eb" stopOpacity={0} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tickFormatter={(v) => moneyCompact(v)} tick={{ fontSize: 11 }} width={70} tickLine={false} axisLine={false} />
                      <Tooltip formatter={(v) => money(Number(v))} />
                      <Area type="monotone" dataKey="sales" stroke="#2563eb" strokeWidth={2} fill="url(#gSales)" animationDuration={500} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <Skeleton height="100%" />}
              </div>
            </Card>
            <Card title="Purchases vs collections">
              <div className="chart-box">
                {q.data?.purchaseTrend && q.data.paymentTrend ? (
                  <ResponsiveContainer>
                    <BarChart data={q.data.purchaseTrend.map((r, i) => ({ date: String(r.date).slice(5), purchases: Number(r.purchases), collected: Number(q.data!.paymentTrend![i]?.collected ?? 0) }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tickFormatter={(v) => moneyCompact(v)} tick={{ fontSize: 11 }} width={70} tickLine={false} axisLine={false} />
                      <Tooltip formatter={(v) => money(Number(v))} />
                      <Bar dataKey="purchases" name="Purchases" fill="#7c3aed" radius={[4, 4, 0, 0]} animationDuration={500} />
                      <Bar dataKey="collected" name="Collected" fill="#16a34a" radius={[4, 4, 0, 0]} animationDuration={500} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <Skeleton height="100%" />}
              </div>
            </Card>
            <Card title="Sales by category">
              <div className="chart-box">
                {q.data?.salesByCategory?.length ? (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={q.data.salesByCategory.map((r) => ({ name: String(r.category), value: Number(r.sales) }))} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2} animationDuration={500}>
                        {q.data.salesByCategory.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => money(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : q.data ? <EmptyState title="No sales in this period" /> : <Skeleton height="100%" />}
              </div>
            </Card>
            <Card title="Outstanding trend">
              <div className="chart-box">
                {q.data?.outstandingTrend ? (
                  <ResponsiveContainer>
                    <AreaChart data={q.data.outstandingTrend.map((r) => ({ date: String(r.date).slice(5), outstanding: Number(r.outstanding) }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tickFormatter={(v) => moneyCompact(v)} tick={{ fontSize: 11 }} width={70} tickLine={false} axisLine={false} />
                      <Tooltip formatter={(v) => money(Number(v))} />
                      <Area type="monotone" dataKey="outstanding" stroke="#f59e0b" strokeWidth={2} fill="#fef3c7" animationDuration={500} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <Skeleton height="100%" />}
              </div>
            </Card>
          </div>

          <div className="grid-2">
            <Card title="Top-selling products" padded={false}>
              <SimpleTable rows={q.data?.topProducts} empty="No sales yet" cols={[['product', 'Product'], ['quantity', 'Qty', quantity], ['sales', 'Sales', money]]} />
            </Card>
            <Card title="Top customers" padded={false}>
              <SimpleTable rows={q.data?.topCustomers} empty="No sales yet" cols={[['customer', 'Customer'], ['invoices', 'Invoices'], ['sales', 'Sales', money]]} onClick={(r) => navigate(`/app/customers/${r.customerId}`)} />
            </Card>
            <Card title="Outstanding customers" padded={false} actions={<Link to="/app/customers?hasOutstanding=true" className="small">View all</Link>}>
              <SimpleTable rows={q.data?.outstandingCustomers} empty="Nothing outstanding" cols={[['customer', 'Customer'], ['outstanding', 'Outstanding', money]]} onClick={(r) => navigate(`/app/customers/${r.customerId}`)} />
            </Card>
            <Card title="Low stock" padded={false} actions={<Link to="/app/stock?status=LOW_STOCK" className="small">View all</Link>}>
              <SimpleTable rows={q.data?.lowStock} empty="All products are well stocked" cols={[['product', 'Product'], ['available', 'Available', quantity], ['minimumStock', 'Minimum', quantity]]} />
            </Card>
          </div>
          <RecentOrders rows={q.data?.recentOrders} />
          <Card title="Recent payments" padded={false}>
            <SimpleTable rows={q.data?.recentPayments} empty="No payments yet" cols={[['paymentNumber', 'Payment'], ['customer', 'Customer'], ['method', 'Method'], ['amount', 'Amount', money]]} onClick={(r) => navigate(`/app/payments/${r.id}`)} />
          </Card>
        </>
      )}
    </div>
  )
}

function AdminDashboard() {
  const q = useQuery({ queryKey: ['dashboard', 'admin'], queryFn: () => api.get<Dashboard>('/api/v1/dashboard/admin'), refetchInterval: 60_000 })
  const k = q.data?.kpis
  const count = (n: number) => String(Math.round(n))
  return (
    <div className="stack">
      <PageHeader
        title="Operations"
        subtitle="Today's work at a glance"
        actions={
          <PageActions
            primary={{ key: 'invoice', label: 'Create invoice', icon: <Receipt size={16} />, to: '/app/invoices/new' }}
            actions={[
              { key: 'customer', label: 'Add customer', icon: <UserPlus size={16} />, to: '/app/customers/new' },
              { key: 'product', label: 'Add product', icon: <Plus size={16} />, to: '/app/products/new' },
              { key: 'purchase', label: 'Add purchase', icon: <Truck size={16} />, to: '/app/purchases/new' },
              { key: 'payment', label: 'Record payment', icon: <Wallet size={16} />, to: '/app/payments?record=1' },
            ]}
          />
        }
      />
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <>
          <div className="kpi-grid">
            {!k ? Array.from({ length: 8 }).map((_, i) => <div key={i} className="card stat-card"><Skeleton height={14} width="50%" /><Skeleton height={28} width="60%" /></div>) : (
              <>
                <StatCard index={0} label="Today's orders" value={k.todayOrders} format={count} icon={<ClipboardList size={18} />} />
                <StatCard index={1} label="New orders" value={k.placedOrders} format={count} tone="warning" icon={<ShoppingCart size={18} />} hint={k.creditApprovals ? `${k.creditApprovals} need credit approval` : undefined} />
                <StatCard index={2} label="Accepted" value={k.acceptedOrders} format={count} icon={<PackageCheck size={18} />} />
                <StatCard index={3} label="Packing" value={k.packingOrders} format={count} tone="accent" icon={<Boxes size={18} />} />
                <StatCard index={4} label="Ready for delivery" value={k.readyForDeliveryOrders} format={count} tone="success" icon={<PackageCheck size={18} />} />
                <StatCard index={5} label="Out for delivery" value={k.outForDeliveryOrders} format={count} tone="purple" icon={<Truck size={18} />} />
                <StatCard index={6} label="Today's sales" value={k.todaySales} tone="success" icon={<IndianRupee size={18} />} />
                <StatCard index={7} label="Pending payments" value={k.pendingPayments} tone="warning" icon={<Wallet size={18} />} />
                <StatCard index={8} label="Low stock" value={k.lowStockProducts} format={count} tone="danger" icon={<AlertTriangle size={18} />} />
                <StatCard index={9} label="Approvals & returns" value={(k.pendingApprovals ?? 0) + (k.pendingReturns ?? 0)} format={count} tone="neutral" icon={<Users size={18} />} hint={`${k.pendingApprovals} customers · ${k.pendingReturns} returns`} />
              </>
            )}
          </div>
          <RecentOrders rows={q.data?.recentOrders} />
          <Card title="Low stock" padded={false}>
            <SimpleTable rows={q.data?.lowStock} empty="All products are well stocked" cols={[['sku', 'SKU'], ['product', 'Product'], ['available', 'Available', quantity], ['minimumStock', 'Minimum', quantity]]} />
          </Card>
        </>
      )}
    </div>
  )
}

function RecentOrders({ rows }: { rows?: Row[] }) {
  const navigate = useNavigate()
  return (
    <Card title="Recent orders" padded={false} actions={<Link to="/app/orders" className="small">All orders</Link>}>
      {!rows ? <div style={{ padding: 16 }}><Skeleton height={120} /></div> : rows.length === 0 ? <EmptyState title="No orders yet" /> : (
        <DataTable
          rows={rows}
          rowKey={(r) => String(r.id)}
          onRowClick={(r) => navigate(`/app/orders/${r.id}`)}
          columns={[
            { key: 'n', header: 'Order', render: (r) => <strong>{r.orderNumber}</strong> },
            { key: 'c', header: 'Customer', render: (r) => r.customer },
            { key: 's', header: 'Status', render: (r) => <StatusBadge status={String(r.status)} /> },
            { key: 'p', header: 'Payment', render: (r) => <StatusBadge status={String(r.paymentStatus)} /> },
            { key: 't', header: 'Total', align: 'right', render: (r) => money(Number(r.grandTotal)) },
            { key: 'd', header: 'Placed', render: (r) => date(String(r.placedAt)) },
          ]}
        />
      )}
    </Card>
  )
}

function SimpleTable({ rows, cols, empty, onClick }: { rows?: Row[]; cols: [string, string, ((v: number) => string)?][]; empty: string; onClick?: (r: Row) => void }) {
  if (!rows) return <div style={{ padding: 16 }}><Skeleton height={120} /></div>
  if (rows.length === 0) return <EmptyState title={empty} />
  return (
    <DataTable
      rows={rows}
      rowKey={(r) => JSON.stringify(r)}
      onRowClick={onClick}
      columns={cols.map(([key, header, fmt]) => ({ key, header, align: fmt ? 'right' as const : undefined, render: (r: Row) => (fmt ? fmt(Number(r[key])) : String(r[key] ?? '—')) }))}
    />
  )
}
