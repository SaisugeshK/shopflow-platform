import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Image as ImageIcon, Package, Pencil, Plus, Star, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { Button, IconButton } from '@/components/ui/Button'
import { Badge, Card, DataTable, KeyValue, PageHeader, Pagination, StatusBadge } from '@/components/ui/Data'
import { Alert, EmptyState, QueryState } from '@/components/ui/Feedback'
import { Field, Input, PriceInput, SearchInput, Select, Switch, Textarea } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Overlay'
import { useToast } from '@/components/ui/Toast'
import { useListParams } from '@/hooks/useListParams'
import { api, ApiError } from '@/services/api'
import type { Category, MovementRow, Product } from '@/services/types'
import { useCan, useModule } from '@/stores/auth'
import { dateTime, money, quantity, titleCase } from '@/utils/format'
import {
  BatchesCard, defaultOptions, LabelsButton, optionsBody, optionsFrom, ProductOptionsCard, SerialsCard, UNITS, VariantsCard,
} from './ProductOptions'
import type { ProductOptionsValue } from './ProductOptions'

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: () => api.get<Category[]>('/api/v1/categories'), staleTime: 60_000 })
}

function useTaxRates() {
  return useQuery({ queryKey: ['tax-settings'], queryFn: () => api.get<{ allowedGstRates: number[]; defaultGstRate: number }>('/api/v1/business/tax-settings'), staleTime: 300_000 })
}

/** O04/AD06 Products. */
export function ProductsPage() {
  const list = useListParams({ active: 'true' })
  const navigate = useNavigate()
  const canWrite = useCan('PRODUCT_WRITE')
  const categories = useCategories()
  const q = useQuery({ queryKey: ['products', list.query], queryFn: () => api.page<Product>('/api/v1/products', { ...list.query, pageSize: 20 }) })
  return (
    <div className="stack">
      <PageHeader title="Products" subtitle="Catalogue, prices, GST and stock" actions={canWrite && <Button icon={<Plus size={16} />} onClick={() => navigate('/app/products/new')}>Add product</Button>} />
      <Card padded={false}>
        <div className="toolbar">
          <SearchInput className="search" value={list.search} onChange={list.setSearch} placeholder="Name, SKU or HSN" />
          <Select aria-label="Category" value={list.get('categoryId')} onChange={(e) => list.set('categoryId', e.target.value)} style={{ width: 200 }} placeholder="All categories"
            options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          <Select aria-label="Active" value={list.get('active')} onChange={(e) => list.set('active', e.target.value)} style={{ width: 150 }}
            options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }, { value: '', label: 'All' }]} />
        </div>
        <QueryState query={q} isEmpty={(d) => d.items.length === 0}
          empty={<EmptyState icon={<Package size={26} />} title="No products" description="Add products with price, GST rate and opening stock." action={canWrite && <Button onClick={() => navigate('/app/products/new')}>Add product</Button>} />}>
          {(d) => (
            <>
              <DataTable rows={d.items} rowKey={(p) => p.id} onRowClick={(p) => navigate(`/app/products/${p.id}`)} sort={list.sort} onSortChange={list.setSort} caption="Products"
                columns={[
                  { key: 'img', header: '', render: (p) => (
                    <div style={{ width: 40, height: 40, borderRadius: 8, overflow: 'hidden', background: 'var(--color-surface-2)', display: 'grid', placeItems: 'center' }}>
                      {p.imageUrl ? <img src={p.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" /> : <Package size={16} className="muted" />}
                    </div>
                  ) },
                  { key: 'n', header: 'Product', sortKey: 'name', render: (p) => <div><div style={{ fontWeight: 600 }}>{p.name}{p.variantGroup && <> <Badge tone="purple">Variants</Badge></>}</div><div className="xs muted">{p.sku} · {p.categoryName}</div></div> },
                  { key: 'h', header: 'HSN', render: (p) => p.hsnCode ?? '—' },
                  { key: 'g', header: 'GST', align: 'right', render: (p) => `${p.gstRate}%` },
                  { key: 'c', header: 'Cost', align: 'right', render: (p) => money(p.purchasePrice) },
                  { key: 's', header: 'Price', align: 'right', sortKey: 'sellingPrice', render: (p) => money(p.sellingPrice) },
                  { key: 'st', header: 'Available', align: 'right', render: (p) => `${quantity(p.available)} ${p.unit}` },
                  { key: 'ss', header: 'Stock', render: (p) => <StatusBadge status={p.stockStatus} /> },
                  { key: 'a', header: '', render: (p) => (!p.active ? <Badge>Inactive</Badge> : p.featured ? <Badge tone="primary">Featured</Badge> : null) },
                ]} />
              <Pagination meta={d.pagination} onPage={list.setPage} />
            </>
          )}
        </QueryState>
      </Card>
    </div>
  )
}

const productSchema = z.object({
  sku: z.string().trim().regex(/^[A-Za-z0-9._-]{2,60}$/, 'Letters, digits, dot, dash or underscore').or(z.literal('')).optional(),
  name: z.string().trim().min(2, 'Enter the product name').max(200),
  categoryId: z.string().min(1, 'Choose a category'),
  brand: z.string().max(120).optional(),
  description: z.string().max(4000).optional(),
  hsnCode: z.string().regex(/^[0-9]{4,8}$/, 'HSN must be 4–8 digits').or(z.literal('')).optional(),
  unit: z.string().min(1),
  purchasePrice: z.string().refine((v) => Number(v) >= 0 && v !== '', 'Enter the purchase price'),
  sellingPrice: z.string().refine((v) => Number(v) >= 0 && v !== '', 'Enter the selling price'),
  mrp: z.string().optional(),
  gstRate: z.string().min(1, 'Choose a GST rate'),
  minimumStock: z.string().optional(),
  openingStock: z.string().optional(),
  featured: z.boolean(),
}).refine((v) => !v.mrp || Number(v.sellingPrice) <= Number(v.mrp), { message: 'Selling price cannot exceed MRP', path: ['sellingPrice'] })

type ProductForm = z.infer<typeof productSchema>

/** O06 Add/Edit Product. Prices entered here are master data; the backend calculates all invoice/order values. */
export function ProductFormPage() {
  const { id } = useParams()
  const editing = !!id
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const categories = useCategories()
  const rates = useTaxRates()
  const existing = useQuery({ queryKey: ['product', id], queryFn: () => api.get<Product>(`/api/v1/products/${id}`), enabled: editing })
  const uom = useModule('UOM_CONVERSIONS')
  const [options, setOptions] = useState<ProductOptionsValue>(defaultOptions())
  const form = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: { unit: 'PCS', featured: false, gstRate: '', sku: '', minimumStock: '0', openingStock: '0' },
  })
  useEffect(() => {
    if (existing.data) {
      const p = existing.data
      form.reset({
        sku: p.sku, name: p.name, categoryId: p.categoryId, brand: p.brand ?? '', description: p.description ?? '', hsnCode: p.hsnCode ?? '', unit: p.unit,
        purchasePrice: String(p.purchasePrice), sellingPrice: String(p.sellingPrice), mrp: p.mrp != null ? String(p.mrp) : '', gstRate: String(p.gstRate),
        minimumStock: String(p.minimumStock), featured: p.featured,
      })
      setOptions(optionsFrom(p))
    } else if (!editing && rates.data && !form.getValues('gstRate')) {
      form.setValue('gstRate', String(rates.data.defaultGstRate))
    }
  }, [existing.data, rates.data, editing, form])

  const save = useMutation({
    mutationFn: (v: ProductForm) => {
      const body = {
        name: v.name, categoryId: v.categoryId, brand: v.brand || undefined, description: v.description || undefined, hsnCode: v.hsnCode || undefined,
        unit: v.unit, purchasePrice: v.purchasePrice, sellingPrice: v.sellingPrice, mrp: v.mrp || undefined, gstRate: v.gstRate,
        minimumStock: v.minimumStock || '0', featured: v.featured, ...optionsBody(options, uom),
      }
      return editing
        ? api.patch<Product>(`/api/v1/products/${id}`, body)
        : api.post<Product>('/api/v1/products', { ...body, sku: v.sku || undefined, openingStock: v.openingStock || '0' })
    },
    onSuccess: (p) => {
      toast.success(editing ? 'Product updated' : 'Product created', p.name)
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['product', p.id] })
      navigate(`/app/products/${p.id}`)
    },
  })
  const err = save.error instanceof ApiError ? save.error : null
  const e = form.formState.errors
  const fieldErr = (k: keyof ProductForm) => e[k]?.message ?? err?.fieldError(k)

  return (
    <div className="stack">
      <PageHeader breadcrumb={<Link to="/app/products" className="row" style={{ gap: 4 }}><ArrowLeft size={14} /> Products</Link>} title={editing ? 'Edit product' : 'Add product'} />
      <form onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate className="stack">
        <Card title="Details">
          <div className="form-grid">
            <Field label="Product name" htmlFor="name" required error={fieldErr('name')} className="span-2"><Input id="name" {...form.register('name')} invalid={!!fieldErr('name')} /></Field>
            <Field label="SKU / product code" htmlFor="sku" error={fieldErr('sku')} hint={editing ? 'SKU cannot be changed' : 'Leave empty to generate'}>
              <Input id="sku" {...form.register('sku')} disabled={editing} invalid={!!fieldErr('sku')} />
            </Field>
            <Field label="Category" htmlFor="categoryId" required error={fieldErr('categoryId')}>
              <Select id="categoryId" {...form.register('categoryId')} placeholder="Choose category" options={(categories.data ?? []).filter((c) => c.active).map((c) => ({ value: c.id, label: c.name }))} invalid={!!fieldErr('categoryId')} />
            </Field>
            <Field label="Brand" htmlFor="brand"><Input id="brand" {...form.register('brand')} /></Field>
            <Field label="Unit" htmlFor="unit" required><Select id="unit" {...form.register('unit')} options={UNITS.map((u) => ({ value: u, label: u }))} /></Field>
            <Field label="Description" htmlFor="description" className="span-2"><Textarea id="description" {...form.register('description')} /></Field>
          </div>
        </Card>
        <Card title="Pricing & tax">
          <div className="form-grid">
            <Field label="Purchase price (cost)" htmlFor="purchasePrice" required error={fieldErr('purchasePrice')} hint="Internal — never shown to customers"><PriceInput id="purchasePrice" {...form.register('purchasePrice')} invalid={!!fieldErr('purchasePrice')} /></Field>
            <Field label="Selling price" htmlFor="sellingPrice" required error={fieldErr('sellingPrice')} hint="Before GST; customer-specific prices can override"><PriceInput id="sellingPrice" {...form.register('sellingPrice')} invalid={!!fieldErr('sellingPrice')} /></Field>
            <Field label="MRP" htmlFor="mrp" error={fieldErr('mrp')}><PriceInput id="mrp" {...form.register('mrp')} /></Field>
            <Field label="GST rate" htmlFor="gstRate" required error={fieldErr('gstRate')}>
              <Select id="gstRate" {...form.register('gstRate')} placeholder="Choose rate" options={(rates.data?.allowedGstRates ?? []).map((r) => ({ value: String(r), label: `${r}%` }))} />
            </Field>
            <Field label="HSN code" htmlFor="hsnCode" error={fieldErr('hsnCode')}><Input id="hsnCode" inputMode="numeric" {...form.register('hsnCode')} invalid={!!fieldErr('hsnCode')} /></Field>
          </div>
        </Card>
        <ProductOptionsCard value={options} onChange={setOptions} baseUnit={form.watch('unit')} error={err} />
        <Card title="Stock">
          <div className="form-grid">
            <Field label="Minimum stock (low-stock alert)" htmlFor="minimumStock"><Input id="minimumStock" type="number" step="any" min={0} {...form.register('minimumStock')} /></Field>
            {!editing && !options.trackSerials && <Field label="Opening stock" htmlFor="openingStock" hint="Posted as an OPENING stock movement"><Input id="openingStock" type="number" step="any" min={0} {...form.register('openingStock')} /></Field>}
            <div className="span-2"><Switch label="Featured in the customer catalog" checked={form.watch('featured')} onChange={(v) => form.setValue('featured', v)} /></div>
          </div>
        </Card>
        {err && !err.details.length && <Alert tone="danger">{err.message}</Alert>}
        <div className="form-actions">
          <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" loading={save.isPending}>{editing ? 'Save changes' : 'Create product'}</Button>
        </div>
      </form>
    </div>
  )
}

/** O05 Product detail: images, stock and movements. */
export function ProductDetailPage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const canWrite = useCan('PRODUCT_WRITE')
  const canStock = useCan('STOCK_READ')
  const fileRef = useRef<HTMLInputElement>(null)
  const q = useQuery({ queryKey: ['product', id], queryFn: () => api.get<Product>(`/api/v1/products/${id}`) })
  const movements = useQuery({ queryKey: ['movements', id], queryFn: () => api.page<MovementRow>('/api/v1/stock/movements', { productId: id, pageSize: 10 }), enabled: canStock })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['product', id] })
  const toggle = useMutation({
    mutationFn: (active: boolean) => api.post<Product>(`/api/v1/products/${id}/${active ? 'activate' : 'deactivate'}`),
    onSuccess: (p) => { toast.success(p.active ? 'Product activated' : 'Product deactivated'); invalidate(); qc.invalidateQueries({ queryKey: ['products'] }) },
    onError: (e) => toast.error(e),
  })
  const upload = useMutation({
    mutationFn: (f: File) => api.upload(`/api/v1/products/${id}/images`, f),
    onSuccess: () => { toast.success('Image uploaded'); invalidate() },
    onError: (e) => toast.error(e),
  })
  const imageAction = useMutation({
    mutationFn: ({ imageId, action }: { imageId: string; action: 'primary' | 'remove' }) =>
      action === 'primary' ? api.post(`/api/v1/products/${id}/images/${imageId}/primary`) : api.del(`/api/v1/products/${id}/images/${imageId}`),
    onSuccess: invalidate,
    onError: (e) => toast.error(e),
  })
  return (
    <QueryState query={q}>
      {(p) => (
        <div className="stack">
          <PageHeader
            breadcrumb={<Link to="/app/products" className="row" style={{ gap: 4 }}><ArrowLeft size={14} /> Products</Link>}
            title={<span className="row">{p.name} {!p.active && <Badge>Inactive</Badge>}</span>}
            subtitle={`${p.sku} · ${p.categoryName}${p.variantAttributes ? ` · ${p.variantAttributes}` : ''}`}
            actions={(
              <>
                {!p.variantGroup && <LabelsButton productIds={[p.id]} />}
                {canWrite && <Button variant="secondary" loading={toggle.isPending} onClick={() => toggle.mutate(!p.active)}>{p.active ? 'Deactivate' : 'Activate'}</Button>}
                {canWrite && <Button icon={<Pencil size={16} />} onClick={() => navigate(`/app/products/${p.id}/edit`)}>Edit</Button>}
              </>
            )}
          />
          {p.parentId && <Alert tone="info">This is a variant. <Link to={`/app/products/${p.parentId}`}>Open the variant group</Link></Alert>}
          {p.variantGroup && <Alert tone="info">This is a variant group: it is not sold itself. Sell, buy and stock its variants below.</Alert>}
          <div className="detail-grid">
            <div className="stack">
              <Card title="Details">
                <KeyValue items={[
                  ['Brand', p.brand], ['HSN', p.hsnCode], ['Unit', p.unit],
                  ['Other units', p.units.length ? p.units.map((u) => `1 ${u.unit} = ${Number(u.factor)} ${p.unit}`).join(', ') : undefined],
                  ['Barcode', p.barcode], ['GST rate', `${p.gstRate}%`],
                  ['Purchase price', money(p.purchasePrice)], ['Selling price', money(p.sellingPrice)], ['MRP', p.mrp != null ? money(p.mrp) : undefined],
                  ['Pricing', p.pricingMode === 'FIXED' ? undefined : p.pricingMode === 'MRP' ? `MRP less ${p.mrpDiscountPercent ?? 0}%` : 'Daily rate list'],
                  ['Tracking', p.trackBatches ? 'Batch + expiry' : p.trackSerials ? `Serial numbers${p.warrantyMonths ? ` · ${p.warrantyMonths} months warranty` : ''}` : undefined],
                  ['Quantities', p.decimalQuantity ? 'Decimals allowed' : 'Whole numbers'],
                  ['Description', p.description], ['Updated', dateTime(p.updatedAt)],
                ]} />
              </Card>
              <VariantsCard product={p} />
              <BatchesCard product={p} />
              <SerialsCard product={p} />
              {canStock && (
                <Card title="Recent stock movements" padded={false} actions={<Link to={`/app/stock/movements?productId=${p.id}`} className="small">All movements</Link>}>
                  <QueryState query={movements} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No movements yet" />}>
                    {(d) => (
                      <DataTable rows={d.items} rowKey={(m) => m.id} columns={[
                        { key: 'd', header: 'Date', render: (m) => dateTime(m.createdAt) },
                        { key: 't', header: 'Type', render: (m) => titleCase(m.movementType) },
                        { key: 'r', header: 'Reference', render: (m) => m.referenceNumber ?? '—' },
                        { key: 'q', header: 'Qty', align: 'right', render: (m) => <span className={m.direction === 'IN' ? 'success-text' : 'danger-text'}>{m.direction === 'IN' ? '+' : '−'}{quantity(m.quantity)}</span> },
                        { key: 'b', header: 'Balance', align: 'right', render: (m) => quantity(m.balanceAfter) },
                      ]} />
                    )}
                  </QueryState>
                </Card>
              )}
            </div>
            <div className="stack">
              <Card title="Stock">
                <KeyValue items={[
                  ['Status', <StatusBadge key="s" status={p.stockStatus} />], ['On hand', `${quantity(p.onHand)} ${p.unit}`], ['Reserved', quantity(p.reserved)],
                  ['Available', <strong key="a">{quantity(p.available)}</strong>], ['Minimum', quantity(p.minimumStock)],
                ]} />
              </Card>
              <Card title="Images" actions={canWrite && (
                <>
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = '' }} />
                  <Button size="sm" variant="secondary" icon={<Upload size={14} />} loading={upload.isPending} onClick={() => fileRef.current?.click()}>Upload</Button>
                </>
              )}>
                {p.images.length === 0 ? <EmptyState icon={<ImageIcon size={24} />} title="No images" description="PNG, JPEG or WebP up to 5 MB." /> : (
                  <div className="grid-2">
                    {p.images.map((img) => (
                      <div key={img.id} className="card" style={{ overflow: 'hidden' }}>
                        <img src={img.url} alt={p.name} style={{ aspectRatio: '1', objectFit: 'cover', width: '100%' }} loading="lazy" />
                        {canWrite && (
                          <div className="row-between" style={{ padding: 6 }}>
                            {img.primary ? <Badge tone="primary">Primary</Badge> : <IconButton label="Make primary" onClick={() => imageAction.mutate({ imageId: img.id, action: 'primary' })}><Star size={16} /></IconButton>}
                            <IconButton label="Remove image" onClick={() => imageAction.mutate({ imageId: img.id, action: 'remove' })}><Trash2 size={16} /></IconButton>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </div>
      )}
    </QueryState>
  )
}

/** O07 Categories. */
export function CategoriesPage() {
  const q = useCategories()
  const qc = useQueryClient()
  const toast = useToast()
  const canWrite = useCan('PRODUCT_WRITE')
  const [editing, setEditing] = useState<Category | 'new' | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  useEffect(() => {
    if (editing && editing !== 'new') {
      setName(editing.name)
      setDescription(editing.description ?? '')
      setSortOrder(String(editing.sortOrder))
    } else if (editing === 'new') {
      setName('')
      setDescription('')
      setSortOrder('0')
    }
  }, [editing])
  const save = useMutation({
    mutationFn: () => {
      const body = { name, description: description || undefined, sortOrder: Number(sortOrder) || 0 }
      return editing === 'new' ? api.post('/api/v1/categories', body) : api.patch(`/api/v1/categories/${(editing as Category).id}`, body)
    },
    onSuccess: () => { toast.success('Category saved'); setEditing(null); qc.invalidateQueries({ queryKey: ['categories'] }) },
    onError: (e) => toast.error(e),
  })
  const toggle = useMutation({
    mutationFn: (c: Category) => api.post(`/api/v1/categories/${c.id}/${c.active ? 'deactivate' : 'activate'}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
    onError: (e) => toast.error(e),
  })
  return (
    <div className="stack">
      <PageHeader title="Categories" subtitle="Group products for browsing and reports" actions={canWrite && <Button icon={<Plus size={16} />} onClick={() => setEditing('new')}>Add category</Button>} />
      <Card padded={false}>
        <QueryState query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No categories" />}>
          {(d) => (
            <DataTable rows={d} rowKey={(c) => c.id} onRowClick={canWrite ? (c) => setEditing(c) : undefined} columns={[
              { key: 'n', header: 'Name', render: (c) => <strong>{c.name}</strong> },
              { key: 'd', header: 'Description', render: (c) => <span className="muted">{c.description ?? '—'}</span> },
              { key: 'o', header: 'Order', align: 'right', render: (c) => c.sortOrder },
              { key: 'p', header: 'Products', align: 'right', render: (c) => c.productCount },
              { key: 's', header: 'Status', render: (c) => <StatusBadge status={c.active ? 'ACTIVE' : 'INACTIVE'} /> },
              { key: 'a', header: '', render: (c) => canWrite && (
                <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); toggle.mutate(c) }}>{c.active ? 'Deactivate' : 'Activate'}</Button>
              ) },
            ]} />
          )}
        </QueryState>
      </Card>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add category' : 'Edit category'} footer={
        <>
          <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
          <Button loading={save.isPending} disabled={name.trim().length < 2} onClick={() => save.mutate()}>Save</Button>
        </>
      }>
        <div className="stack">
          <Field label="Name" htmlFor="cat-name" required><Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></Field>
          <Field label="Description" htmlFor="cat-desc"><Textarea id="cat-desc" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <Field label="Display order" htmlFor="cat-order"><Input id="cat-order" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} /></Field>
        </div>
      </Modal>
    </div>
  )
}
