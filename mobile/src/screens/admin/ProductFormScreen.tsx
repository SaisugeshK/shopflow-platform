import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { z } from 'zod'
import { defaultOptions, optionsBody, optionsFrom, ProductOptionsSection, type ProductOptionsValue } from '@/components/admin/ProductOptions'
import { RequirePermission } from '@/components/admin/RequirePermission'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Data'
import { Alert, Loading } from '@/components/ui/Feedback'
import { Field, Input, MoneyInput, QtyInput, Select, SwitchRow } from '@/components/ui/Form'
import { Screen } from '@/components/ui/Screen'
import { toast } from '@/components/ui/Toast'
import { useCategories, useTaxRates } from '@/features/catalog'
import { useForm } from '@/hooks/useForm'
import { api, ApiError } from '@/services/api'
import type { Product } from '@/services/types'
import { useModule } from '@/store/auth'
import { unitSelectOptions } from '@/store/words'

const schema = z.object({
  sku: z.string().trim().refine((v) => !v || /^[A-Za-z0-9._-]{2,60}$/.test(v), 'Letters, digits, dot, dash or underscore'),
  name: z.string().trim().min(2, 'Enter the product name').max(200),
  categoryId: z.string().min(1, 'Choose a category'),
  brand: z.string().max(120),
  description: z.string().max(4000),
  hsnCode: z.string().refine((v) => !v || /^[0-9]{4,8}$/.test(v), 'HSN must be 4–8 digits'),
  unit: z.string().min(1),
  purchasePrice: z.string().refine((v) => v !== '' && Number(v) >= 0, 'Enter the purchase price'),
  sellingPrice: z.string().refine((v) => v !== '' && Number(v) >= 0, 'Enter the selling price'),
  mrp: z.string(),
  gstRate: z.string().min(1, 'Choose a GST rate'),
  minimumStock: z.string(),
  openingStock: z.string(),
  featured: z.boolean(),
}).refine((v) => !v.mrp || Number(v.sellingPrice) <= Number(v.mrp), { message: 'Selling price cannot exceed MRP', path: ['sellingPrice'] })

const EMPTY = { sku: '', name: '', categoryId: '', brand: '', description: '', hsnCode: '', unit: 'PCS', purchasePrice: '', sellingPrice: '', mrp: '', gstRate: '', minimumStock: '0', openingStock: '0', featured: false }

/** O06 Add/Edit Product. Prices here are master data; the backend calculates all order and invoice values. */
export default function ProductFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const editing = !!id
  const qc = useQueryClient()
  const categories = useCategories()
  const rates = useTaxRates()
  const existing = useQuery({ queryKey: ['product', id], queryFn: () => api.get<Product>(`/api/v1/products/${id}`), enabled: editing })
  const form = useForm(schema, EMPTY)
  const uom = useModule('UOM_CONVERSIONS')
  const [options, setOptions] = useState<ProductOptionsValue>(defaultOptions())
  const loaded = useRef(false)
  useEffect(() => {
    if (loaded.current) return
    if (existing.data) {
      const p = existing.data
      form.reset({
        sku: p.sku, name: p.name, categoryId: p.categoryId, brand: p.brand ?? '', description: p.description ?? '', hsnCode: p.hsnCode ?? '', unit: p.unit,
        purchasePrice: String(p.purchasePrice), sellingPrice: String(p.sellingPrice), mrp: p.mrp != null ? String(p.mrp) : '', gstRate: String(p.gstRate),
        minimumStock: String(p.minimumStock), openingStock: '0', featured: p.featured,
      })
      setOptions(optionsFrom(p))
      loaded.current = true
    } else if (!editing && rates.data) {
      form.set('gstRate', String(rates.data.defaultGstRate))
      loaded.current = true
    }
  }, [existing.data, rates.data, editing, form])

  const save = useMutation({
    mutationFn: (v: z.output<typeof schema>) => {
      const body = {
        name: v.name, categoryId: v.categoryId, brand: v.brand || undefined, description: v.description || undefined, hsnCode: v.hsnCode || undefined,
        unit: v.unit, purchasePrice: v.purchasePrice, sellingPrice: v.sellingPrice, mrp: v.mrp || undefined, gstRate: v.gstRate,
        minimumStock: v.minimumStock || '0', featured: v.featured, ...optionsBody(options, uom),
      }
      return editing ? api.patch<Product>(`/api/v1/products/${id}`, body) : api.post<Product>('/api/v1/products', { ...body, sku: v.sku || undefined, openingStock: v.openingStock || '0' })
    },
    onSuccess: (p) => {
      toast.success(editing ? 'Product updated' : 'Product created', p.name)
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['product', p.id] })
      router.replace(`/admin/product/${p.id}`)
    },
  })
  const err = save.error instanceof ApiError ? save.error : null
  const fe = (k: string) => form.error(k, err?.fieldError(k))
  const v = form.values

  if (editing && existing.isLoading) return <Loading />
  return (
    <RequirePermission anyOf={['PRODUCT_WRITE']}>
      <Stack.Screen options={{ title: editing ? 'Edit product' : 'Add product' }} />
      <Screen footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button variant="secondary" style={{ flex: 1 }} onPress={() => router.back()}>Cancel</Button>
          <Button style={{ flex: 2 }} loading={save.isPending} onPress={() => form.submit((x) => save.mutate(x))}>{editing ? 'Save changes' : 'Create product'}</Button>
        </View>
      }>
        <Card title="Details">
          <View style={{ gap: 14 }}>
            <Field label="Product name" required error={fe('name')}><Input value={v.name} onChangeText={(t) => form.set('name', t)} accessibilityLabel="Product name" invalid={!!fe('name')} /></Field>
            <Field label="SKU / product code" error={fe('sku')} hint={editing ? 'SKU cannot be changed' : 'Leave empty to generate'}>
              <Input value={v.sku} onChangeText={(t) => form.set('sku', t)} editable={!editing} autoCapitalize="characters" accessibilityLabel="SKU" />
            </Field>
            <Field label="Category" required error={fe('categoryId')}>
              <Select label="Category" value={v.categoryId} onChange={(c) => form.set('categoryId', c)} placeholder="Choose category" invalid={!!fe('categoryId')}
                options={(categories.data ?? []).filter((c) => c.active).map((c) => ({ value: c.id, label: c.name }))} />
            </Field>
            <Field label="Brand"><Input value={v.brand} onChangeText={(t) => form.set('brand', t)} accessibilityLabel="Brand" /></Field>
            <Field label="Unit" required><Select label="Unit" value={v.unit} onChange={(u) => form.set('unit', u)} options={unitSelectOptions(v.unit)} /></Field>
            <Field label="Description"><Input value={v.description} onChangeText={(t) => form.set('description', t)} multiline accessibilityLabel="Description" /></Field>
          </View>
        </Card>
        <Card title="Pricing & tax">
          <View style={{ gap: 14 }}>
            <Field label="Purchase price (cost)" required error={fe('purchasePrice')} hint="Internal — never shown to customers">
              <MoneyInput value={v.purchasePrice} onChangeText={(t) => form.set('purchasePrice', t)} accessibilityLabel="Purchase price" invalid={!!fe('purchasePrice')} />
            </Field>
            <Field label="Selling price" required error={fe('sellingPrice')} hint="Before GST; customer-specific prices can override">
              <MoneyInput value={v.sellingPrice} onChangeText={(t) => form.set('sellingPrice', t)} accessibilityLabel="Selling price" invalid={!!fe('sellingPrice')} />
            </Field>
            <Field label="MRP" error={fe('mrp')}><MoneyInput value={v.mrp} onChangeText={(t) => form.set('mrp', t)} accessibilityLabel="MRP" /></Field>
            <Field label="GST rate" required error={fe('gstRate')}>
              <Select label="GST rate" value={v.gstRate} onChange={(r) => form.set('gstRate', r)} placeholder="Choose rate" options={(rates.data?.allowedGstRates ?? []).map((r) => ({ value: String(r), label: `${r}%` }))} />
            </Field>
            <Field label="HSN code" error={fe('hsnCode')}><Input value={v.hsnCode} onChangeText={(t) => form.set('hsnCode', t.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={8} accessibilityLabel="HSN code" /></Field>
          </View>
        </Card>
        <ProductOptionsSection value={options} onChange={setOptions} baseUnit={v.unit} error={err} />
        <Card title="Stock">
          <View style={{ gap: 14 }}>
            <Field label="Minimum stock (low-stock alert)"><QtyInput value={v.minimumStock} onChangeText={(t) => form.set('minimumStock', t)} accessibilityLabel="Minimum stock" style={{ textAlign: 'left' }} /></Field>
            {!editing && !options.trackSerials && <Field label="Opening stock" hint="Posted as an OPENING stock movement"><QtyInput value={v.openingStock} onChangeText={(t) => form.set('openingStock', t)} accessibilityLabel="Opening stock" style={{ textAlign: 'left' }} /></Field>}
            <SwitchRow label="Featured in the customer catalogue" value={v.featured} onChange={(b) => form.set('featured', b)} />
          </View>
        </Card>
        {err && !err.details.length && <Alert tone="danger">{err.message}</Alert>}
      </Screen>
    </RequirePermission>
  )
}
