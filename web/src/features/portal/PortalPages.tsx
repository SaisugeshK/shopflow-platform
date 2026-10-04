import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { ArrowLeft, CircleCheck, CreditCard, MapPin, Package, RotateCcw, ShoppingBag, ShoppingCart, Trash2, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, IconButton } from '@/components/ui/Button'
import { Badge, Card, StatusBadge, TaxBreakdown } from '@/components/ui/Data'
import { Alert, EmptyState, QueryState, Skeleton } from '@/components/ui/Feedback'
import { Field, QuantityStepper, SearchInput, Textarea } from '@/components/ui/Form'
import { useToast } from '@/components/ui/Toast'
import { useCart } from '@/components/layout/CustomerShell'
import { useDebounced } from '@/hooks/useListParams'
import { api, ApiError, newIdempotencyKey } from '@/services/api'
import type { Address, Cart, CatalogProduct, Category, Order, Outstanding } from '@/services/types'
import { useAuthStore } from '@/stores/auth'
import { date, money, quantity } from '@/utils/format'
import { MockCheckoutDialog } from './MockCheckout'

function useAddToCart() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: ({ productId, qty, unit }: { productId: string; qty: number; unit?: string }) =>
      api.post<Cart>('/api/v1/cart/items', { productId, quantity: String(qty), unit }),
    onSuccess: (cart) => { qc.setQueryData(['cart'], cart); toast.success('Added to cart') },
    onError: (e) => toast.error(e),
  })
}

function ProductCard({ p, index }: { p: CatalogProduct; index: number }) {
  const [qty, setQty] = useState(1)
  const add = useAddToCart()
  const out = p.stockStatus === 'OUT_OF_STOCK'
  return (
    <motion.article className="card product-card card-hover" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: Math.min(index, 12) * 0.03 }}>
      <Link to={`/shop/products/${p.id}`} className="product-image" aria-label={p.name}>
        {p.imageUrl ? <img src={p.imageUrl} alt="" loading="lazy" /> : <Package size={36} />}
      </Link>
      <div className="product-body">
        <div className="row-between" style={{ gap: 6 }}>
          <span className="xs muted">{p.categoryName}</span>
          {p.customPrice && <Badge tone="success">Your price</Badge>}
        </div>
        <Link to={`/shop/products/${p.id}`} className="product-name" style={{ color: 'var(--color-text)' }}>{p.name}</Link>
        <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
          <span className="price">{money(p.price)}</span>
          {p.mrp && p.mrp > p.price && <span className="mrp">{money(p.mrp)}</span>}
        </div>
        <span className="xs muted">per {p.unit} · + {p.gstRate}% GST</span>
        <StatusBadge status={p.stockStatus} />
        <div className="row" style={{ marginTop: 'auto', flexWrap: 'nowrap' }}>
          <QuantityStepper value={qty} onChange={setQty} min={1} max={p.availableQuantity ?? undefined} disabled={out} label={`Quantity of ${p.name}`} />
          <Button size="sm" className="grow" disabled={out} loading={add.isPending} icon={<ShoppingCart size={14} />} onClick={() => add.mutate({ productId: p.id, qty })}>Add</Button>
        </div>
      </div>
    </motion.article>
  )
}

/** C01 Customer home (§35). */
export function CustomerHomePage() {
  const user = useAuthStore((s) => s.user)!
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const home = useQuery({ queryKey: ['customer-home'], queryFn: () => api.get<{ outstanding: number; openOrders: number; openInvoices: number; recentOrders: Order[]; recentlyOrderedProducts: { productId: string; product: string }[] }>('/api/v1/dashboard/customer') })
  const categories = useQuery({ queryKey: ['catalog-categories'], queryFn: () => api.get<Category[]>('/api/v1/catalog/categories') })
  const featured = useQuery({ queryKey: ['catalog', 'featured'], queryFn: () => api.page<CatalogProduct>('/api/v1/catalog/products', { featured: true, pageSize: 8 }) })
  const cart = useCart()
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <h1>{greeting}, {user.fullName.split(' ')[0]}</h1>
        <p className="muted">{user.customer?.shopName}</p>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); navigate(`/shop/products?q=${encodeURIComponent(q)}`) }}>
        <SearchInput value={q} onChange={setQ} placeholder="Search products" label="Search products" />
      </form>
      <div className="grid-3">
        <Link to="/shop/outstanding" className="card card-hover stat-card" style={{ color: 'inherit', textDecoration: 'none' }}>
          <span className="stat-label"><Wallet size={16} /> Outstanding balance</span>
          <span className="stat-value">{home.data ? money(home.data.outstanding) : <Skeleton width={120} height={26} />}</span>
          <span className="stat-hint">{home.data?.openInvoices ?? 0} open invoices</span>
        </Link>
        <Link to="/shop/orders" className="card card-hover stat-card" style={{ color: 'inherit', textDecoration: 'none' }}>
          <span className="stat-label"><ShoppingBag size={16} /> Current orders</span>
          <span className="stat-value">{home.data?.openOrders ?? '—'}</span>
          <span className="stat-hint">Track delivery status</span>
        </Link>
        <Link to="/shop/cart" className="card card-hover stat-card" style={{ color: 'inherit', textDecoration: 'none' }}>
          <span className="stat-label"><ShoppingCart size={16} /> Cart</span>
          <span className="stat-value">{cart.data ? money(cart.data.grandTotal) : '—'}</span>
          <span className="stat-hint">{cart.data?.itemCount ?? 0} items</span>
        </Link>
      </div>
      {categories.data && categories.data.length > 0 && (
        <section className="stack-sm">
          <h3>Categories</h3>
          <div className="chips">{categories.data.map((c) => <Link key={c.id} className="chip" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none', color: 'inherit' }} to={`/shop/products?categoryId=${c.id}`}>{c.name}</Link>)}</div>
        </section>
      )}
      {(home.data?.recentlyOrderedProducts.length ?? 0) > 0 && (
        <section className="stack-sm">
          <h3>Quick reorder</h3>
          <div className="chips">{home.data!.recentlyOrderedProducts.map((p) => <Link key={p.productId} to={`/shop/products/${p.productId}`} className="chip" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}><RotateCcw size={12} style={{ marginRight: 6 }} />{p.product}</Link>)}</div>
        </section>
      )}
      <section className="stack-sm">
        <div className="row-between"><h3>Featured products</h3><Link to="/shop/products" className="small">See all</Link></div>
        <QueryState query={featured} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No featured products" action={<Link to="/shop/products" className="btn btn-primary">Browse catalogue</Link>} />}>
          {(d) => <div className="product-grid">{d.items.map((p, i) => <ProductCard key={p.id} p={p} index={i} />)}</div>}
        </QueryState>
      </section>
    </div>
  )
}

/** C02 Product list. */
export function CatalogPage() {
  const params = new URLSearchParams(window.location.search)
  const [q, setQ] = useState(params.get('q') ?? '')
  const [categoryId, setCategoryId] = useState(params.get('categoryId') ?? '')
  const [page, setPage] = useState(1)
  const debounced = useDebounced(q)
  const categories = useQuery({ queryKey: ['catalog-categories'], queryFn: () => api.get<Category[]>('/api/v1/catalog/categories') })
  const products = useQuery({ queryKey: ['catalog', debounced, categoryId, page], queryFn: () => api.page<CatalogProduct>('/api/v1/catalog/products', { q: debounced, categoryId, page, pageSize: 24 }) })
  return (
    <div className="stack">
      <h1>Products</h1>
      <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search by name or SKU" label="Search products" />
      <div className="chips" role="group" aria-label="Category">
        <button className="chip" aria-pressed={categoryId === ''} onClick={() => { setCategoryId(''); setPage(1) }}>All</button>
        {(categories.data ?? []).map((c) => <button key={c.id} className="chip" aria-pressed={categoryId === c.id} onClick={() => { setCategoryId(c.id); setPage(1) }}>{c.name}</button>)}
      </div>
      <QueryState query={products} isEmpty={(d) => d.items.length === 0} skeleton={<div className="product-grid">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="card"><Skeleton height={160} /><div style={{ padding: 16 }} className="stack-sm"><Skeleton height={14} /><Skeleton height={20} width="50%" /></div></div>)}</div>}
        empty={<EmptyState title="No products found" description="Try another search or category." />}>
        {(d) => (
          <>
            <div className="product-grid">{d.items.map((p, i) => <ProductCard key={p.id} p={p} index={i} />)}</div>
            {d.pagination.totalPages > 1 && (
              <div className="row" style={{ justifyContent: 'center' }}>
                <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                <span className="small">Page {page} of {d.pagination.totalPages}</span>
                <Button variant="secondary" disabled={page >= d.pagination.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            )}
          </>
        )}
      </QueryState>
    </div>
  )
}

/** C03 Product detail (§36): never shows internal purchase cost. */
export function CatalogProductPage() {
  const { id } = useParams()
  const [qty, setQty] = useState(1)
  const [unit, setUnit] = useState('')
  const [image, setImage] = useState(0)
  const add = useAddToCart()
  const navigate = useNavigate()
  const q = useQuery({ queryKey: ['catalog-product', id], queryFn: () => api.get<CatalogProduct>(`/api/v1/catalog/products/${id}`) })
  return (
    <QueryState query={q}>
      {(p) => (
        <div className="stack">
          <Link to="/shop/products" className="row small" style={{ gap: 4 }}><ArrowLeft size={14} /> Products</Link>
          <div className="grid-2" style={{ alignItems: 'start' }}>
            <div className="stack-sm">
              <div className="card product-image" style={{ aspectRatio: '1', borderRadius: 'var(--radius-lg)' }}>
                {p.images.length ? <img src={p.images[image]} alt={p.name} /> : <Package size={64} />}
              </div>
              {p.images.length > 1 && (
                <div className="row">{p.images.map((src, i) => (
                  <button key={src} onClick={() => setImage(i)} aria-label={`Image ${i + 1}`} style={{ width: 64, height: 64, padding: 0, border: i === image ? '2px solid var(--color-primary)' : '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden', cursor: 'pointer' }}>
                    <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </button>
                ))}</div>
              )}
            </div>
            <div className="stack">
              <div className="stack-sm">
                <span className="small muted">{p.categoryName}{p.brand ? ` · ${p.brand}` : ''}</span>
                <h1>{p.name}</h1>
                <span className="xs muted">SKU {p.sku}{p.hsnCode ? ` · HSN ${p.hsnCode}` : ''}</span>
              </div>
              {(() => {
                const chosen = p.units.find((u) => u.unit === unit)
                return (
                  <>
                    <div className="row" style={{ alignItems: 'baseline' }}>
                      <span className="price" style={{ fontSize: '1.75rem' }}>{money(chosen ? chosen.price : p.price)}</span>
                      {!chosen && p.mrp && p.mrp > p.price && <span className="mrp">MRP {money(p.mrp)}</span>}
                      {p.customPrice && <Badge tone="success">Your special price</Badge>}
                    </div>
                    <span className="small muted">Per {chosen ? `${chosen.unit} (${Number(chosen.factor)} ${p.unit})` : p.unit}, excluding {p.gstRate}% GST. Final prices and tax are confirmed at checkout.</span>
                  </>
                )
              })()}
              {p.units.length > 0 && (
                <div className="row" role="radiogroup" aria-label="Buy in" style={{ flexWrap: 'wrap', gap: 6 }}>
                  {[{ unit: p.unit, label: p.unit }, ...p.units.map((u) => ({ unit: u.unit, label: `${u.unit} of ${Number(u.factor)}` }))].map((u) => (
                    <button key={u.unit} type="button" role="radio" aria-checked={(unit || p.unit) === u.unit}
                      className={`btn btn-sm ${(unit || p.unit) === u.unit ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setUnit(u.unit === p.unit ? '' : u.unit)}>
                      {u.label}
                    </button>
                  ))}
                </div>
              )}
              {p.variantAttributes && <span className="small">{p.variantAttributes}</span>}
              <div className="row"><StatusBadge status={p.stockStatus} />{p.availableQuantity != null && <span className="small muted">{quantity(p.availableQuantity)} {p.unit} available</span>}</div>
              {p.description && <p>{p.description}</p>}
              <div className="sticky-cta row" style={{ flexWrap: 'nowrap' }}>
                <QuantityStepper value={qty} onChange={setQty} min={1} max={unit ? undefined : p.availableQuantity ?? undefined} disabled={p.stockStatus === 'OUT_OF_STOCK'} />
                <Button className="grow" size="lg" icon={<ShoppingCart size={18} />} loading={add.isPending} disabled={p.stockStatus === 'OUT_OF_STOCK'}
                  onClick={() => add.mutate({ productId: p.id, qty, unit: unit || undefined }, { onSuccess: () => navigate('/shop/cart') })}>Add to cart</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </QueryState>
  )
}

/** C04 Cart (§37). Every figure comes from the backend. */
export function CartPage() {
  const cart = useCart()
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const update = useMutation({
    mutationFn: ({ id, qty }: { id: string; qty: number }) => api.patch<Cart>(`/api/v1/cart/items/${id}`, { quantity: String(qty) }),
    onSuccess: (c) => qc.setQueryData(['cart'], c),
    onError: (e) => toast.error(e),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.del<Cart>(`/api/v1/cart/items/${id}`),
    onSuccess: (c) => qc.setQueryData(['cart'], c),
    onError: (e) => toast.error(e),
  })
  return (
    <div className="stack">
      <h1>Cart</h1>
      <QueryState query={cart} isEmpty={(c) => c.items.length === 0}
        empty={<EmptyState icon={<ShoppingCart size={26} />} title="Your cart is empty" action={<Link to="/shop/products" className="btn btn-primary">Browse products</Link>} />}>
        {(c) => (
          <div className="detail-grid">
            <div className="stack-sm">
              {c.items.map((i) => (
                <motion.div key={i.id} layout className="card" style={{ padding: 16 }}>
                  <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                    <div className="product-image" style={{ width: 72, height: 72, borderRadius: 10, flexShrink: 0 }}>{i.imageUrl ? <img src={i.imageUrl} alt="" /> : <Package size={24} />}</div>
                    <div className="grow stack-sm" style={{ gap: 4 }}>
                      <Link to={`/shop/products/${i.productId}`} style={{ fontWeight: 600, color: 'var(--color-text)' }}>{i.productName}</Link>
                      <span className="xs muted">{money(i.unitPrice)} / {i.unit}{i.unitFactor !== 1 ? ` (${Number(i.unitFactor)} units)` : ''} · {i.taxRate}% GST</span>
                      {i.schemeName && <span className="xs success-text">{i.freeQuantity ? `${quantity(i.freeQuantity)} free · ` : ''}{i.schemeName}</span>}
                      {i.issue && <span className="xs danger-text">{i.issue}</span>}
                      <div className="row-between">
                        <QuantityStepper value={Number(i.quantity)} min={1} onChange={(v) => update.mutate({ id: i.id, qty: v })} label={`Quantity of ${i.productName}`} />
                        <span style={{ fontWeight: 700 }} className="num">{money(i.lineTotal)}</span>
                      </div>
                    </div>
                    <IconButton label={`Remove ${i.productName}`} onClick={() => remove.mutate(i.id)}><Trash2 size={16} /></IconButton>
                  </div>
                </motion.div>
              ))}
            </div>
            <Card title="Summary">
              <div className="stack">
                <TaxBreakdown t={c} />
                {!c.checkoutReady && <Alert tone="warning">Some items are unavailable in the requested quantity. Adjust them to continue.</Alert>}
                <Button size="lg" block disabled={!c.checkoutReady} onClick={() => navigate('/shop/checkout')}>Proceed to checkout</Button>
              </div>
            </Card>
          </div>
        )}
      </QueryState>
    </div>
  )
}

const METHODS: { value: string; label: string; hint: string; icon: typeof Wallet }[] = [
  { value: 'ONLINE', label: 'Pay online now', hint: 'UPI, cards and net banking via the payment gateway', icon: CreditCard },
  { value: 'CREDIT', label: 'Buy on credit', hint: 'Added to your account balance', icon: Wallet },
  { value: 'CASH', label: 'Cash on delivery', hint: 'Pay the delivery person', icon: Wallet },
  { value: 'UPI', label: 'UPI on delivery', hint: 'Pay by UPI when goods arrive', icon: Wallet },
]

/** C05 Checkout (§38) and C06 Order success. */
export function CheckoutPage() {
  const cart = useCart()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const addresses = useQuery({ queryKey: ['my-addresses'], queryFn: () => api.get<Address[]>('/api/v1/my/addresses') })
  const outstanding = useQuery({ queryKey: ['my-outstanding'], queryFn: () => api.get<Outstanding>('/api/v1/my/outstanding') })
  const [addressId, setAddressId] = useState('')
  const [method, setMethod] = useState('ONLINE')
  const [note, setNote] = useState('')
  const [placed, setPlaced] = useState<Order | null>(null)
  const [paying, setPaying] = useState(false)
  const key = useMemo(() => newIdempotencyKey(), [])
  const place = useMutation({
    mutationFn: () => api.post<Order>('/api/v1/orders', { addressId: addressId || undefined, paymentMethod: method, orderNote: note || undefined }, { 'Idempotency-Key': key }),
    onSuccess: (o) => {
      setPlaced(o)
      qc.invalidateQueries({ queryKey: ['cart'] })
      qc.invalidateQueries({ queryKey: ['customer-home'] })
      if (o.paymentMethod === 'ONLINE' && o.paymentIntent) setPaying(true)
    },
  })
  const err = place.error instanceof ApiError ? place.error : null
  const credit = outstanding.data
  const methods = METHODS.filter((m) => m.value !== 'CREDIT' || credit?.creditEnabled)
  const selectedAddress = addressId || addresses.data?.[0]?.id

  if (placed) {
    return (
      <div className="card" style={{ maxWidth: 560, margin: '0 auto' }}>
        <div className="card-body empty-state" style={{ padding: 36 }}>
          <motion.div className="icon-wrap tone-success" initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}><CircleCheck size={30} /></motion.div>
          <h2>Order placed</h2>
          <p className="muted">Order <strong>{placed.orderNumber}</strong> for {money(placed.grandTotal)} has been sent to the shop.</p>
          {placed.creditApprovalStatus === 'PENDING' && <Alert tone="warning">This credit order is above your available limit and needs the shop's approval.</Alert>}
          {placed.paymentMethod === 'ONLINE' && !placed.paymentIntent && <Alert tone="warning">The payment service is busy. You can pay from the order page.</Alert>}
          <div className="row">
            <Button variant="secondary" onClick={() => navigate('/shop/products')}>Continue shopping</Button>
            <Button onClick={() => navigate(`/shop/orders/${placed.id}`)}>Track order</Button>
          </div>
        </div>
        {placed.paymentIntent && <MockCheckoutDialog open={paying} intent={placed.paymentIntent} onClose={() => { setPaying(false); navigate(`/shop/orders/${placed.id}`) }} />}
      </div>
    )
  }

  return (
    <div className="stack">
      <Link to="/shop/cart" className="row small" style={{ gap: 4 }}><ArrowLeft size={14} /> Cart</Link>
      <h1>Checkout</h1>
      <QueryState query={cart} isEmpty={(c) => c.items.length === 0} empty={<EmptyState title="Your cart is empty" action={<Link to="/shop/products" className="btn btn-primary">Browse products</Link>} />}>
        {(c) => (
          <div className="detail-grid">
            <div className="stack">
              <Card title="Delivery address" actions={<Link to="/shop/profile" className="small">Manage addresses</Link>}>
                <QueryState query={addresses} isEmpty={(a) => a.length === 0} empty={<EmptyState icon={<MapPin size={24} />} title="No address" action={<Link to="/shop/profile" className="btn btn-primary btn-sm">Add address</Link>} />}>
                  {(list) => (
                    <div className="stack-sm" role="radiogroup" aria-label="Delivery address">
                      {list.map((a) => (
                        <label key={a.id} className="card" style={{ padding: 12, display: 'flex', gap: 10, cursor: 'pointer', borderColor: selectedAddress === a.id ? 'var(--color-primary)' : undefined }}>
                          <input type="radio" name="address" checked={selectedAddress === a.id} onChange={() => setAddressId(a.id)} />
                          <span className="small">{a.label && <strong>{a.label}: </strong>}{a.addressLine1}{a.addressLine2 ? `, ${a.addressLine2}` : ''}, {a.city}, {a.state} – {a.pincode}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </QueryState>
              </Card>
              <Card title="Payment method">
                <div className="stack-sm" role="radiogroup" aria-label="Payment method">
                  {methods.map((m) => (
                    <label key={m.value} className="card" style={{ padding: 12, display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer', borderColor: method === m.value ? 'var(--color-primary)' : undefined }}>
                      <input type="radio" name="method" checked={method === m.value} onChange={() => setMethod(m.value)} />
                      <m.icon size={18} className="muted" />
                      <span className="grow"><strong className="small">{m.label}</strong><span className="xs muted" style={{ display: 'block' }}>{m.hint}</span></span>
                    </label>
                  ))}
                </div>
                {method === 'CREDIT' && credit && (
                  <div style={{ marginTop: 12 }}>
                    <Alert tone={credit.availableCredit >= c.grandTotal ? 'info' : 'warning'}>
                      Available credit {money(credit.availableCredit)} of {money(credit.creditLimit)} · {credit.creditDays} days to pay.
                      {credit.availableCredit < c.grandTotal && ' This order exceeds your available credit and may need approval.'}
                    </Alert>
                  </div>
                )}
              </Card>
              <Card title="Order note"><Field label="Note for the shop (optional)" htmlFor="note"><Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} /></Field></Card>
            </div>
            <Card title={`Order summary · ${c.itemCount} items`}>
              <div className="stack">
                <ul className="list-plain">
                  {c.items.map((i) => <li key={i.id}><span className="small">{i.productName} × {quantity(i.quantity)}</span><span className="num small">{money(i.lineTotal)}</span></li>)}
                </ul>
                <TaxBreakdown t={c} />
                {err && <Alert tone="danger">{err.message}</Alert>}
                <Button size="lg" block loading={place.isPending} disabled={!selectedAddress || !c.checkoutReady} onClick={() => place.mutate()}>
                  {method === 'ONLINE' ? `Place order & pay ${money(c.grandTotal)}` : 'Place order'}
                </Button>
                <p className="xs muted" style={{ textAlign: 'center' }}>Placed {date(new Date().toISOString())}. Final amounts are confirmed by the shop's system.</p>
              </div>
            </Card>
          </div>
        )}
      </QueryState>
    </div>
  )
}
