import { StyleSheet, View } from 'react-native'
import { IconButton } from '@/components/ui/Button'
import { Field, MoneyInput, QtyInput } from '@/components/ui/Form'
import { Text } from '@/components/ui/Text'
import type { Product } from '@/services/types'
import { colors, radius } from '@/theme/tokens'
import { quantity } from '@/utils/format'

export interface EditLine {
  product: Product
  quantity: string
  rate: string
  discountPercent: string
}

/** Editable document line (purchase / admin invoice). Totals are calculated by the backend, not here. */
export function LineEditor({ line, onChange, onRemove, ratePlaceholder }: { line: EditLine; onChange: (patch: Partial<EditLine>) => void; onRemove: () => void; ratePlaceholder?: string }) {
  const p = line.product
  return (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text weight="600">{p.name}</Text>
          <Text variant="xs" color="muted">{p.sku} · GST {p.gstRate}% · {quantity(p.available)} {p.unit} available</Text>
        </View>
        <IconButton icon="trash-2" label={`Remove ${p.name}`} color={colors.danger} onPress={onRemove} />
      </View>
      <View style={styles.row}>
        <View style={{ flex: 1 }}><Field label={`Qty (${p.unit})`}><QtyInput value={line.quantity} onChangeText={(t) => onChange({ quantity: t })} accessibilityLabel={`Quantity of ${p.name}`} /></Field></View>
        <View style={{ flex: 1.4 }}><Field label="Rate"><MoneyInput value={line.rate} onChangeText={(t) => onChange({ rate: t })} placeholder={ratePlaceholder} accessibilityLabel={`Rate of ${p.name}`} /></Field></View>
        <View style={{ flex: 0.9 }}><Field label="Disc %"><QtyInput value={line.discountPercent} onChangeText={(t) => onChange({ discountPercent: t })} accessibilityLabel={`Discount percent for ${p.name}`} /></Field></View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, gap: 8, backgroundColor: colors.surface },
  row: { flexDirection: 'row', gap: 8 },
})
