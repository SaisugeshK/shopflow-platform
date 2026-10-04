import { Feather } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { FlatList, Pressable, StyleSheet, View } from 'react-native'
import { StatusBadge } from '@/components/ui/Data'
import { EmptyState, Spinner } from '@/components/ui/Feedback'
import { Input, SearchBar } from '@/components/ui/Form'
import { Sheet } from '@/components/ui/Overlay'
import { Text } from '@/components/ui/Text'
import { useDebounced } from '@/hooks/useDebounced'
import { api } from '@/services/api'
import type { CustomerSummary, Product } from '@/services/types'
import { colors, radius, TOUCH } from '@/theme/tokens'
import { money, quantity, today } from '@/utils/format'

function PickerField({ label, value, placeholder, onPress, icon }: { label: string; value?: string; placeholder: string; onPress: () => void; icon: 'user' | 'package' }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value ?? 'not selected'}`} onPress={onPress} style={styles.field}>
      <Feather name={icon} size={17} color={colors.muted} />
      <Text style={{ flex: 1 }} color={value ? 'text' : 'muted'} numberOfLines={1}>{value ?? placeholder}</Text>
      <Feather name="search" size={17} color={colors.muted} />
    </Pressable>
  )
}

/** Search-and-pick customer (approved customers by default). */
export function CustomerPicker({ value, onChange, status = 'APPROVED' }: { value: CustomerSummary | null; onChange: (c: CustomerSummary) => void; status?: string }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const debounced = useDebounced(q)
  const results = useQuery({
    queryKey: ['customers', 'picker', debounced, status],
    queryFn: () => api.page<CustomerSummary>('/api/v1/customers', { q: debounced, status, pageSize: 25 }),
    enabled: open,
  })
  return (
    <>
      <PickerField label="Customer" icon="user" value={value ? `${value.shopName} (${value.customerCode})` : undefined} placeholder="Select customer" onPress={() => setOpen(true)} />
      <Sheet open={open} onClose={() => setOpen(false)} title="Select customer">
        <SearchBar value={q} onChangeText={setQ} placeholder="Name, code or mobile" autoFocus />
        {results.isLoading ? <Spinner /> : (results.data?.items.length ?? 0) === 0 ? <EmptyState icon="users" title="No customers found" /> : (
          <View>
            {results.data!.items.map((c) => (
              <Pressable key={c.id} accessibilityRole="button" onPress={() => { onChange(c); setOpen(false) }} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface2 }]}>
                <View style={{ flex: 1 }}>
                  <Text weight="600">{c.shopName}</Text>
                  <Text variant="xs" color="muted">{c.customerCode} · {c.mobileNumber}</Text>
                </View>
                <Text variant="small" color={c.outstanding > 0 ? 'warning' : 'muted'} num>Due {money(c.outstanding)}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </Sheet>
    </>
  )
}

/** Search-and-pick active product (used by purchase, invoice and special-price screens). */
export function ProductPickerButton({ onPick, exclude = [], label = 'Add product' }: { onPick: (p: Product) => void; exclude?: string[]; label?: string }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const debounced = useDebounced(q, 250)
  const results = useQuery({
    queryKey: ['products', 'picker', debounced],
    queryFn: () => api.page<Product>('/api/v1/products', { q: debounced, active: true, sellable: true, pageSize: 25 }),
    enabled: open,
  })
  const items = (results.data?.items ?? []).filter((p) => !exclude.includes(p.id))
  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={[styles.field, { borderStyle: 'dashed', borderColor: colors.primary }]}>
        <Feather name="plus-circle" size={18} color={colors.primary} />
        <Text color="primary" weight="600" style={{ flex: 1 }}>{label}</Text>
        <Feather name="search" size={17} color={colors.primary} />
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} title="Find product">
        <SearchBar value={q} onChangeText={setQ} placeholder="Name or SKU" autoFocus />
        {results.isLoading ? <Spinner /> : items.length === 0 ? <EmptyState icon="package" title="No products found" /> : (
          <FlatList
            scrollEnabled={false}
            data={items}
            keyExtractor={(p) => p.id}
            renderItem={({ item: p }) => (
              <Pressable accessibilityRole="button" onPress={() => { onPick(p); setOpen(false); setQ('') }} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface2 }]}>
                <View style={{ flex: 1 }}>
                  <Text weight="600">{p.name}</Text>
                  <Text variant="xs" color="muted">{p.sku} · {quantity(p.available)} {p.unit} available · GST {p.gstRate}%</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text variant="small" num>{money(p.sellingPrice)}</Text>
                  <StatusBadge status={p.stockStatus} />
                </View>
              </Pressable>
            )}
          />
        )}
      </Sheet>
    </>
  )
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** ISO date entry (YYYY-MM-DD) with a Today shortcut; invalid dates show an error. */
export function DateInput({ value, onChange, label, allowEmpty = true }: { value: string; onChange: (v: string) => void; label: string; allowEmpty?: boolean }) {
  const invalid = !!value && (!DATE.test(value) || Number.isNaN(new Date(`${value}T00:00:00`).getTime()))
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Input
            value={value}
            onChangeText={(t) => onChange(t.replace(/[^\d-]/g, '').slice(0, 10))}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
            accessibilityLabel={label}
            invalid={invalid}
            clearable={allowEmpty}
            prefix={<Feather name="calendar" size={16} color={colors.muted} style={{ marginLeft: 12 }} />}
          />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label}: today`} onPress={() => onChange(today())} style={styles.today}>
          <Text variant="small" weight="600" color="primary">Today</Text>
        </Pressable>
      </View>
      {invalid && <Text variant="xs" color="danger">Use the format YYYY-MM-DD</Text>}
    </View>
  )
}

export function isValidDate(v: string) {
  return DATE.test(v) && !Number.isNaN(new Date(`${v}T00:00:00`).getTime())
}

const styles = StyleSheet.create({
  field: { minHeight: TOUCH, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  today: { height: TOUCH, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.primarySoft, justifyContent: 'center' },
})
