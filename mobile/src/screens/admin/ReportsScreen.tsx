import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { DateInput, isValidDate } from '@/components/admin/Pickers'
import { RequirePermission } from '@/components/admin/RequirePermission'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Data'
import { Alert, EmptyState, QueryState } from '@/components/ui/Feedback'
import { ChipGroup, Field } from '@/components/ui/Form'
import { Screen } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { toast } from '@/components/ui/Toast'
import { api } from '@/services/api'
import { openDocument } from '@/services/documents'
import type { ReportColumn, ReportResult } from '@/services/types'
import { useAuthStore } from '@/store/auth'
import { colors } from '@/theme/tokens'
import { date, firstOfMonth, money, quantity, today } from '@/utils/format'

const REPORTS: { value: string; label: string; financial?: boolean }[] = [
  { value: 'sales', label: 'Sales' },
  { value: 'purchases', label: 'Purchases' },
  { value: 'stock', label: 'Stock' },
  { value: 'profit', label: 'Profit', financial: true },
  { value: 'tax', label: 'GST / Tax', financial: true },
  { value: 'customers', label: 'Customers' },
  { value: 'outstanding', label: 'Outstanding' },
  { value: 'payments', label: 'Payments' },
]
const NUMERIC = ['MONEY', 'QUANTITY', 'NUMBER', 'PERCENT']

function cell(v: string | number | null | undefined, c: ReportColumn): string {
  if (v === null || v === undefined || v === '') return '—'
  switch (c.type) {
    case 'MONEY': return money(v)
    case 'QUANTITY': return quantity(v)
    case 'DATE': return date(String(v))
    case 'PERCENT': return `${v}%`
    default: return String(v)
  }
}

/** O22/AD13 Reports (§40) with CSV / Excel / PDF export of exactly the filtered data (§42). Rows render as cards on phones. */
export default function ReportsScreen() {
  const perms = useAuthStore((s) => s.user?.permissions ?? [])
  const available = REPORTS.filter((r) => !r.financial || perms.includes('REPORT_FINANCIAL'))
  const [name, setName] = useState(available[0]!.value)
  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(today())
  const [exporting, setExporting] = useState<string | null>(null)
  const valid = isValidDate(from) && isValidDate(to)
  const q = useQuery({ queryKey: ['report', name, from, to], queryFn: () => api.get<ReportResult>(`/api/v1/reports/${name}`, { from, to }), enabled: valid })
  const exportAs = async (format: 'csv' | 'xlsx' | 'pdf') => {
    setExporting(format)
    try {
      await openDocument(`/api/v1/reports/${name}`, `${name}-report.${format}`, { from, to, format })
    } catch (e) {
      toast.error(e)
    } finally {
      setExporting(null)
    }
  }
  return (
    <RequirePermission anyOf={['REPORT_READ']}>
      <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
        <ChipGroup value={name} onChange={setName} options={available} />
        <View style={styles.dates}>
          <View style={{ flex: 1, minWidth: 200 }}><Field label="From"><DateInput label="From" value={from} onChange={setFrom} allowEmpty={false} /></Field></View>
          <View style={{ flex: 1, minWidth: 200 }}><Field label="To"><DateInput label="To" value={to} onChange={setTo} allowEmpty={false} /></Field></View>
        </View>
        {name === 'profit' && <Alert>Gross profit = net sales (after discounts) − cost of goods sold − sales returns (net of cost). Expenses are not included.</Alert>}
        {name === 'outstanding' && <Alert>Open invoices as of the “To” date.</Alert>}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button size="sm" variant="secondary" icon="download" style={{ flex: 1 }} disabled={!valid} loading={exporting === 'csv'} onPress={() => exportAs('csv')}>CSV</Button>
          <Button size="sm" variant="secondary" icon="grid" style={{ flex: 1 }} disabled={!valid} loading={exporting === 'xlsx'} onPress={() => exportAs('xlsx')}>Excel</Button>
          <Button size="sm" variant="secondary" icon="file-text" style={{ flex: 1 }} disabled={!valid} loading={exporting === 'pdf'} onPress={() => exportAs('pdf')}>PDF</Button>
        </View>
        {!valid ? <Alert tone="warning">Enter both dates as YYYY-MM-DD.</Alert> : (
          <QueryState query={q} isEmpty={(d) => d.rows.length === 0} empty={<EmptyState icon="bar-chart-2" title="No data for this period" />}>
            {(d) => {
              const [first, ...rest] = d.columns
              return (
                <View style={{ gap: 10 }}>
                  <Text variant="small" color="muted">{d.title} · {d.rows.length} rows · {date(d.from)} – {date(d.to)}</Text>
                  {Object.keys(d.totals).length > 0 && (
                    <Card title="Totals">
                      <View style={{ gap: 6 }}>
                        {d.columns.filter((c) => c.key in d.totals).map((c) => (
                          <View key={c.key} style={styles.kv}><Text variant="small" color="muted">{c.label}</Text><Text weight="700" num>{cell(d.totals[c.key], c)}</Text></View>
                        ))}
                      </View>
                    </Card>
                  )}
                  {d.rows.map((row, i) => (
                    <Card key={i}>
                      <View style={{ gap: 4 }}>
                        {first && <Text weight="700">{cell(row[first.key], first)}</Text>}
                        {rest.map((c) => (
                          <View key={c.key} style={styles.kv}>
                            <Text variant="small" color="muted" style={{ flexShrink: 1 }}>{c.label}</Text>
                            <Text variant="small" weight={NUMERIC.includes(c.type) ? '600' : '400'} num={NUMERIC.includes(c.type)} align="right" style={{ flexShrink: 1 }}>{cell(row[c.key], c)}</Text>
                          </View>
                        ))}
                      </View>
                    </Card>
                  ))}
                </View>
              )
            }}
          </QueryState>
        )}
      </Screen>
    </RequirePermission>
  )
}

const styles = StyleSheet.create({
  dates: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingVertical: 3 },
})
