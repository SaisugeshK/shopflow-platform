import { useQueries } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Card, PageHeader, StatusBadge } from '@/components/ui/Data'
import { EmptyState, Spinner } from '@/components/ui/Feedback'
import { api } from '@/services/api'
import type { CustomerSummary, Invoice, Order, Product } from '@/services/types'
import { useAuthStore } from '@/stores/auth'
import { money } from '@/utils/format'

/** Global search across orders, customers, products and invoices (only sections the user may see). */
export function SearchPage() {
  const [params] = useSearchParams()
  const q = params.get('q') ?? ''
  const perms = useAuthStore((s) => s.user?.permissions ?? [])
  const sections = [
    { key: 'orders', perm: 'ORDER_READ', path: '/api/v1/orders' },
    { key: 'customers', perm: 'CUSTOMER_READ', path: '/api/v1/customers' },
    { key: 'products', perm: 'PRODUCT_READ', path: '/api/v1/products' },
    { key: 'invoices', perm: 'INVOICE_READ', path: '/api/v1/invoices' },
  ].filter((s) => perms.includes(s.perm))
  const results = useQueries({
    queries: sections.map((s) => ({ queryKey: ['search', s.key, q], queryFn: () => api.page<unknown>(s.path, { q, pageSize: 8 }), enabled: q.length > 0 })),
  })
  const byKey = Object.fromEntries(sections.map((s, i) => [s.key, results[i]]))
  const loading = results.some((r) => r.isLoading)
  const total = results.reduce((n, r) => n + (r.data?.items.length ?? 0), 0)

  return (
    <div className="stack">
      <PageHeader title={`Search: “${q}”`} subtitle={loading ? 'Searching…' : `${total} results`} />
      {loading && <Spinner />}
      {!loading && total === 0 && <EmptyState title="No matches" description="Try an order number, customer name, mobile, SKU or invoice number." />}
      <div className="grid-2">
        {(byKey.orders?.data?.items.length ?? 0) > 0 && (
          <Card title="Orders" padded={false}>
            <ul className="list-plain" style={{ padding: '0 16px' }}>
              {(byKey.orders!.data!.items as Order[]).map((o) => (
                <li key={o.id}><Link to={`/app/orders/${o.id}`}>{o.orderNumber} · {o.customerName}</Link><StatusBadge status={o.status} /></li>
              ))}
            </ul>
          </Card>
        )}
        {(byKey.customers?.data?.items.length ?? 0) > 0 && (
          <Card title="Customers" padded={false}>
            <ul className="list-plain" style={{ padding: '0 16px' }}>
              {(byKey.customers!.data!.items as CustomerSummary[]).map((c) => (
                <li key={c.id}><Link to={`/app/customers/${c.id}`}>{c.shopName} · {c.mobileNumber}</Link><span className="num">{money(c.outstanding)}</span></li>
              ))}
            </ul>
          </Card>
        )}
        {(byKey.products?.data?.items.length ?? 0) > 0 && (
          <Card title="Products" padded={false}>
            <ul className="list-plain" style={{ padding: '0 16px' }}>
              {(byKey.products!.data!.items as Product[]).map((p) => (
                <li key={p.id}><Link to={`/app/products/${p.id}`}>{p.name} · {p.sku}</Link><StatusBadge status={p.stockStatus} /></li>
              ))}
            </ul>
          </Card>
        )}
        {(byKey.invoices?.data?.items.length ?? 0) > 0 && (
          <Card title="Invoices" padded={false}>
            <ul className="list-plain" style={{ padding: '0 16px' }}>
              {(byKey.invoices!.data!.items as Invoice[]).map((i) => (
                <li key={i.id}><Link to={`/app/invoices/${i.id}`}>{i.invoiceNumber ?? 'Draft'} · {i.buyer?.name}</Link><span className="num">{money(i.grandTotal)}</span></li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  )
}
