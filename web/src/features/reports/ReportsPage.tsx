import { useQuery } from '@tanstack/react-query'
import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, PageHeader, Tabs } from '@/components/ui/Data'
import { EmptyState, QueryState } from '@/components/ui/Feedback'
import { Field, Input } from '@/components/ui/Form'
import { useToast } from '@/components/ui/Toast'
import { api, download } from '@/services/api'
import type { ReportColumn, ReportResult } from '@/services/types'
import { useAuthStore } from '@/stores/auth'
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

const NUMERIC = ['MONEY', 'QUANTITY', 'NUMBER']

function cell(v: string | number | null | undefined, c: ReportColumn): string {
  if (v === null || v === undefined || v === '') return '—'
  switch (c.type) {
    case 'MONEY': return money(v)
    case 'QUANTITY': return quantity(v)
    case 'DATE': return date(String(v))
    default: return String(v)
  }
}

/** O22/AD13 Reports (§40) with CSV / Excel / PDF export of exactly the filtered data (§42). */
export function ReportsPage() {
  const perms = useAuthStore((s) => s.user?.permissions ?? [])
  const toast = useToast()
  const available = REPORTS.filter((r) => !r.financial || perms.includes('REPORT_FINANCIAL'))
  const [name, setName] = useState(available[0]!.value)
  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(today())
  const [exporting, setExporting] = useState<string | null>(null)
  const q = useQuery({ queryKey: ['report', name, from, to], queryFn: () => api.get<ReportResult>(`/api/v1/reports/${name}`, { from, to }) })
  const exportAs = async (format: 'csv' | 'xlsx' | 'pdf') => {
    setExporting(format)
    try {
      await download(`/api/v1/reports/${name}`, { from, to, format }, `${name}-report.${format}`)
    } catch (e) {
      toast.error(e)
    } finally {
      setExporting(null)
    }
  }
  return (
    <div className="stack">
      <PageHeader title="Reports" subtitle="Figures come from posted documents; cancelled documents are excluded"
        actions={
          <>
            <Button variant="secondary" size="sm" icon={<Download size={14} />} loading={exporting === 'csv'} onClick={() => exportAs('csv')}>CSV</Button>
            <Button variant="secondary" size="sm" icon={<FileSpreadsheet size={14} />} loading={exporting === 'xlsx'} onClick={() => exportAs('xlsx')}>Excel</Button>
            <Button variant="secondary" size="sm" icon={<FileText size={14} />} loading={exporting === 'pdf'} onClick={() => exportAs('pdf')}>PDF</Button>
          </>
        } />
      <Tabs label="Report" value={name} onChange={setName} tabs={available.map((r) => ({ value: r.value, label: r.label }))} />
      <Card padded={false}>
        <div className="toolbar">
          <Field label="From" htmlFor="r-from"><Input id="r-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} style={{ width: 170 }} /></Field>
          <Field label="To" htmlFor="r-to"><Input id="r-to" type="date" value={to} min={from} max={today()} onChange={(e) => setTo(e.target.value)} style={{ width: 170 }} /></Field>
          {name === 'profit' && <p className="xs muted grow">Gross profit = net sales (after discounts) − cost of goods sold − sales returns (net of cost). Expenses are not included.</p>}
          {name === 'outstanding' && <p className="xs muted grow">Open invoices as of the “To” date.</p>}
        </div>
        <QueryState query={q} isEmpty={(d) => d.rows.length === 0} empty={<EmptyState title="No data for this period" />}>
          {(d) => (
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">{d.title}</caption>
                <thead><tr>{d.columns.map((c) => <th key={c.key} scope="col" className={NUMERIC.includes(c.type) ? 'right' : ''}>{c.label}</th>)}</tr></thead>
                <tbody>
                  {d.rows.map((row, i) => (
                    <tr key={i}>{d.columns.map((c) => <td key={c.key} className={NUMERIC.includes(c.type) ? 'right num' : ''}>{cell(row[c.key], c)}</td>)}</tr>
                  ))}
                </tbody>
                {Object.keys(d.totals).length > 0 && (
                  <tfoot><tr>{d.columns.map((c, i) => <td key={c.key} className={NUMERIC.includes(c.type) ? 'right num' : ''}>{i === 0 ? 'Total' : c.key in d.totals ? cell(d.totals[c.key], c) : ''}</td>)}</tr></tfoot>
                )}
              </table>
            </div>
          )}
        </QueryState>
      </Card>
    </div>
  )
}
