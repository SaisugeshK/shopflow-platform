import { useQuery } from '@tanstack/react-query'
import { Card } from '@/components/ui/Data'
import { QueryState } from '@/components/ui/Feedback'
import { api } from '@/services/api'
import type { Subscription } from '@/services/types'
import { money } from '@/utils/format'

function Meter({ label, used, max }: { label: string; used: number; max?: number }) {
  const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0
  return (
    <div className="stack-sm" style={{ gap: 4 }}>
      <div className="row-between small"><span>{label}</span><span className={max && used >= max ? 'danger-text' : 'muted'}>{used}{max != null ? ` of ${max}` : ' · no limit'}</span></div>
      {max != null && (
        <div role="progressbar" aria-label={label} aria-valuenow={used} aria-valuemax={max} style={{ height: 6, borderRadius: 3, background: 'var(--color-surface-2)' }}>
          <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: pct >= 90 ? 'var(--color-danger)' : 'var(--color-primary)' }} />
        </div>
      )}
    </div>
  )
}

/** The business's ShopFlow plan and how much of it is used (§0B.14). Plan changes are made by ShopFlow. */
export function SubscriptionCard() {
  const q = useQuery({ queryKey: ['subscription'], queryFn: () => api.get<Subscription>('/api/v1/subscription') })
  return (
    <Card title="Plan & usage">
      <QueryState query={q}>
        {(s) => (
          <div className="stack">
            <div className="row-between">
              <strong>{s.plan.name} plan</strong>
              <span className="small muted">{s.plan.priceMonthly != null ? `${money(s.plan.priceMonthly)} / month` : 'Custom pricing'}</span>
            </div>
            <Meter label="Staff users" used={s.usage.staff} max={s.plan.maxStaff} />
            <Meter label="Products" used={s.usage.products} max={s.plan.maxProducts} />
            <Meter label="Customers" used={s.usage.customers} max={s.plan.maxCustomers} />
            <Meter label="Invoices this month" used={s.usage.invoicesThisMonth} max={s.plan.maxInvoicesPerMonth} />
            <Meter label="Branches" used={s.usage.branches} max={s.plan.maxBranches} />
            <Meter label="File storage (MB)" used={s.usage.storageMb} max={s.plan.maxStorageMb} />
            <p className="xs muted">To change your plan, contact ShopFlow support.</p>
          </div>
        )}
      </QueryState>
    </Card>
  )
}
