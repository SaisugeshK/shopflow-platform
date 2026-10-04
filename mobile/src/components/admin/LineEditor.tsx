import { useQuery } from '@tanstack/react-query'
import { Pressable, StyleSheet, View } from 'react-native'
import { IconButton } from '@/components/ui/Button'
import { Field, Input, MoneyInput, QtyInput, Select } from '@/components/ui/Form'
import { Text } from '@/components/ui/Text'
import { api } from '@/services/api'
import type { Product } from '@/services/types'
import { colors, radius } from '@/theme/tokens'
import { quantity } from '@/utils/format'
import { DateInput } from './Pickers'
import { unitFactor, unitOptions } from './ProductOptions'

export interface EditLine {
  key: string
  product: Product
  quantity: string
  rate: string
  discountPercent: string
  /** Chosen unit (the product's base unit or one of its alternate units, §0B.7). */
  unit: string
  batchNumber: string
  mfgDate: string
  expiryDate: string
  /** Purchases: serial numbers typed in, one per line. Sales: serial numbers chosen from stock. */
  serials: string[]
}

export function newLine(p: Product, rate: string): EditLine {
  return { key: `${p.id}-${Date.now()}`, product: p, quantity: '1', rate, discountPercent: '', unit: p.unit, batchNumber: '', mfgDate: '', expiryDate: '', serials: [] }
}

export function baseQuantity(l: EditLine) {
  return Number(l.quantity) * unitFactor(l.product, l.unit)
}

/** What a line still needs before saving (batch number, serial numbers), or null. */
export function lineProblem(l: EditLine, mode: 'purchase' | 'sale'): string | null {
  if (mode === 'purchase' && l.product.trackBatches && !l.batchNumber.trim()) return 'Enter the batch number'
  if (l.product.trackSerials && l.serials.length !== baseQuantity(l)) {
    return `${mode === 'purchase' ? 'Enter' : 'Choose'} ${baseQuantity(l)} serial number(s) (${l.serials.length} so far)`
  }
  return null
}

/** Editable document line (purchase / admin invoice). Totals are calculated by the backend, not here. */
export function LineEditor({ line, onChange, onRemove, ratePlaceholder, mode = 'purchase' }: {
  line: EditLine; onChange: (patch: Partial<EditLine>) => void; onRemove: () => void; ratePlaceholder?: string; mode?: 'purchase' | 'sale'
}) {
  const p = line.product
  const problem = lineProblem(line, mode)
  return (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text weight="600">{p.name}</Text>
          <Text variant="xs" color="muted">{p.sku} · GST {p.gstRate}% · {quantity(p.available)} {p.unit} available{mode === 'sale' && p.trackBatches ? ' · first-expiry-first-out' : ''}</Text>
        </View>
        <IconButton icon="trash-2" label={`Remove ${p.name}`} color={colors.danger} onPress={onRemove} />
      </View>
      <View style={styles.row}>
        <View style={{ flex: 1 }}><Field label={p.units.length ? 'Qty' : `Qty (${p.unit})`}><QtyInput value={line.quantity} onChangeText={(t) => onChange({ quantity: t, serials: mode === 'sale' ? [] : line.serials })} accessibilityLabel={`Quantity of ${p.name}`} /></Field></View>
        {p.units.length > 0 && (
          <View style={{ flex: 1.2 }}><Field label="Unit"><Select label="Unit" value={line.unit} options={unitOptions(p)}
            onChange={(u) => onChange({ unit: u, serials: mode === 'sale' ? [] : line.serials,
              rate: mode === 'purchase' ? String(Math.round(p.purchasePrice * unitFactor(p, u) * 100) / 100) : line.rate })} /></Field></View>
        )}
        <View style={{ flex: 1.4 }}><Field label="Rate"><MoneyInput value={line.rate} onChangeText={(t) => onChange({ rate: t })} placeholder={ratePlaceholder} accessibilityLabel={`Rate of ${p.name}`} /></Field></View>
        <View style={{ flex: 0.9 }}><Field label="Disc %"><QtyInput value={line.discountPercent} onChangeText={(t) => onChange({ discountPercent: t })} accessibilityLabel={`Discount percent for ${p.name}`} /></Field></View>
      </View>
      {mode === 'purchase' && p.trackBatches && (
        <View style={{ gap: 8 }}>
          <Field label="Batch number" required><Input value={line.batchNumber} onChangeText={(t) => onChange({ batchNumber: t.toUpperCase() })} autoCapitalize="characters" accessibilityLabel={`Batch number of ${p.name}`} /></Field>
          <View style={styles.row}>
            <View style={{ flex: 1 }}><Field label="Mfg date"><DateInput label="Mfg date" value={line.mfgDate} onChange={(v) => onChange({ mfgDate: v })} /></Field></View>
            <View style={{ flex: 1 }}><Field label="Expiry date"><DateInput label="Expiry date" value={line.expiryDate} onChange={(v) => onChange({ expiryDate: v })} /></Field></View>
          </View>
        </View>
      )}
      {mode === 'purchase' && p.trackSerials && (
        <Field label="Serial / IMEI numbers" hint="One per line">
          <Input multiline value={line.serials.join('\n')} accessibilityLabel={`Serial numbers of ${p.name}`}
            onChangeText={(t) => onChange({ serials: t.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean) })} autoCapitalize="characters" />
        </Field>
      )}
      {mode === 'sale' && p.trackSerials && baseQuantity(line) > 0 && (
        <SerialChooser productId={p.id} count={baseQuantity(line)} value={line.serials} onChange={(serials) => onChange({ serials })} />
      )}
      {problem && <Text variant="xs" color="danger">{problem}</Text>}
    </View>
  )
}

/** Picks exactly {@code count} in-stock serial numbers. */
function SerialChooser({ productId, count, value, onChange }: { productId: string; count: number; value: string[]; onChange: (v: string[]) => void }) {
  const q = useQuery({ queryKey: ['serials', 'in-stock', productId], queryFn: () => api.get<string[]>('/api/v1/serials/in-stock', { productId }) })
  return (
    <View style={{ gap: 6 }}>
      <Text variant="xs" color="muted">Choose {count} serial number(s) · {value.length} chosen</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {(q.data ?? []).slice(0, 40).map((s) => {
          const on = value.includes(s)
          return (
            <Pressable key={s} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={s}
              disabled={!on && value.length >= count} onPress={() => onChange(on ? value.filter((x) => x !== s) : [...value, s])}
              style={[styles.chip, on && styles.chipOn]}>
              <Text variant="xs" weight="600" color={on ? 'white' : 'text'}>{s}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, gap: 8, backgroundColor: colors.surface },
  row: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, minHeight: 32, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
})
