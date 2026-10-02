import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Ledger } from '@/components/shared/Ledger'
import { StatCard } from '@/components/ui/Data'
import { QueryState } from '@/components/ui/Feedback'
import { Grid, Screen, SectionTitle, useColumns } from '@/components/ui/Screen'
import { api } from '@/services/api'
import type { Outstanding } from '@/services/types'
import { date } from '@/utils/format'

/** C12 Credit / outstanding with statement. */
export default function MyOutstandingScreen() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['my-outstanding'], queryFn: () => api.get<Outstanding>('/api/v1/my/outstanding') })
  const columns = Math.min(4, Math.max(2, useColumns(160)))
  return (
    <Screen onRefresh={() => { q.refetch(); qc.invalidateQueries({ queryKey: ['ledger'] }) }} refreshing={q.isRefetching}>
      <QueryState query={q}>
        {(o) => (
          <Grid columns={columns}>
            {[
              <StatCard key="b" label="Outstanding" value={o.ledgerBalance} tone="warning" icon="credit-card" compact hint={o.ledgerBalance < 0 ? 'You have credit with the shop' : `${o.openInvoiceCount} open invoices`} />,
              <StatCard key="o" label="Overdue" value={o.overdueAmount} tone="danger" icon="alert-triangle" compact hint={o.oldestDueDate ? `Oldest due ${date(o.oldestDueDate)}` : 'Nothing overdue'} />,
              <StatCard key="l" label="Credit limit" value={o.creditLimit} tone="primary" icon="shield" compact hint={o.creditEnabled ? `${o.creditDays} days to pay` : 'Credit not enabled'} />,
              <StatCard key="a" label="Available" value={o.availableCredit} tone="success" icon="check-circle" compact />,
            ]}
          </Grid>
        )}
      </QueryState>
      <SectionTitle>Statement</SectionTitle>
      <Ledger path="/api/v1/my/ledger" />
    </Screen>
  )
}
