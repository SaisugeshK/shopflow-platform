import { StyleSheet, View } from 'react-native'
import { colors } from '@/theme/tokens'
import { money, quantity } from '@/utils/format'
import { Text } from './Text'

export interface Line {
  id: string
  name: string
  qty: number
  unit: string
  rate: number
  amount: number
  /** Extra info such as "GST 18% · delivered 4". */
  note?: string
}

/** Mobile replacement for the web item tables: one readable row per line. */
export function LineItems({ lines }: { lines: Line[] }) {
  return (
    <View>
      {lines.map((l, i) => (
        <View key={l.id} style={[styles.row, i > 0 && styles.sep]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text weight="600">{l.name}</Text>
            <Text variant="xs" color="muted">{quantity(l.qty)} {l.unit} × {money(l.rate)}{l.note ? ` · ${l.note}` : ''}</Text>
          </View>
          <Text weight="600" num>{money(l.amount)}</Text>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, paddingVertical: 10, alignItems: 'flex-start' },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
})
