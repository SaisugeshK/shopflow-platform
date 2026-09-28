import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Card, DataTable, KeyValue, PageHeader, Pagination } from '@/components/ui/Data'
import { EmptyState, QueryState } from '@/components/ui/Feedback'
import { Input, Select } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Overlay'
import { useListParams } from '@/hooks/useListParams'
import { api } from '@/services/api'
import type { AuditRecord } from '@/services/types'
import { dateTime, titleCase } from '@/utils/format'

const ACTIONS = ['LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'CUSTOMER_REGISTERED', 'CUSTOMER_CREATED', 'CUSTOMER_APPROVED', 'CUSTOMER_BLOCKED', 'CUSTOMER_CREDIT_CHANGED',
  'PRODUCT_CREATED', 'PRODUCT_UPDATED', 'PURCHASE_CREATED', 'PURCHASE_POSTED', 'STOCK_ADJUSTED', 'ORDER_CREATED', 'ORDER_ACCEPTED', 'ORDER_CANCELLED',
  'INVOICE_CREATED', 'INVOICE_GENERATED', 'INVOICE_CANCELLED', 'INVOICE_SENT', 'CREDIT_NOTE_CREATED', 'PAYMENT_CREATED', 'PAYMENT_CAPTURED',
  'PAYMENT_CANCELLED', 'PAYMENT_REFUNDED', 'RETURN_CREATED', 'RETURN_APPROVED', 'SETTINGS_CHANGED', 'ADMIN_CREATED', 'ADMIN_DEACTIVATED', 'PERMISSIONS_CHANGED']

function pretty(json?: string) {
  if (!json) return '—'
  try {
    return JSON.stringify(JSON.parse(json), null, 2)
  } catch {
    return json
  }
}

/** O29 Audit logs (§80): immutable, sensitive values redacted server-side. */
export function AuditPage() {
  const list = useListParams()
  const [open, setOpen] = useState<AuditRecord | null>(null)
  const q = useQuery({ queryKey: ['audit', list.query], queryFn: () => api.page<AuditRecord>('/api/v1/audit-logs', { ...list.query, pageSize: 30 }) })
  return (
    <div className="stack">
      <PageHeader title="Audit logs" subtitle="Who changed what and when. Records cannot be edited or deleted." />
      <Card padded={false}>
        <div className="toolbar">
          <Select aria-label="Action" value={list.get('action')} onChange={(e) => list.set('action', e.target.value)} style={{ width: 240 }} placeholder="All actions" options={ACTIONS.map((a) => ({ value: a, label: titleCase(a) }))} />
          <Input aria-label="Entity type" placeholder="Entity type (e.g. INVOICE)" value={list.get('entityType')} onChange={(e) => list.set('entityType', e.target.value)} style={{ width: 200 }} />
          <Input type="date" aria-label="From date" value={list.get('from')} onChange={(e) => list.set('from', e.target.value)} style={{ width: 160 }} />
          <Input type="date" aria-label="To date" value={list.get('to')} onChange={(e) => list.set('to', e.target.value)} style={{ width: 160 }} />
        </div>
        <QueryState query={q} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No audit records" />}>
          {(d) => (
            <>
              <DataTable rows={d.items} rowKey={(a) => a.id} onRowClick={setOpen} columns={[
                { key: 't', header: 'When', render: (a) => dateTime(a.createdAt) },
                { key: 'a', header: 'Action', render: (a) => <strong>{titleCase(a.action)}</strong> },
                { key: 'e', header: 'Entity', render: (a) => <span className="small">{titleCase(a.entityType)}</span> },
                { key: 'u', header: 'By', render: (a) => (a.actorName ? `${a.actorName} (${titleCase(a.actorRole ?? '')})` : titleCase(a.actorRole ?? 'System')) },
                { key: 'i', header: 'IP', render: (a) => <span className="mono xs">{a.ipAddress ?? '—'}</span> },
              ]} />
              <Pagination meta={d.pagination} onPage={list.setPage} />
            </>
          )}
        </QueryState>
      </Card>
      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? titleCase(open.action) : ''} wide>
        {open && (
          <div className="stack">
            <KeyValue items={[['When', dateTime(open.createdAt)], ['By', open.actorName ?? open.actorRole], ['Entity', `${open.entityType} ${open.entityId ?? ''}`], ['Request', open.requestId], ['IP', open.ipAddress], ['Client', open.userAgent]]} />
            <div className="grid-2">
              <div><div className="label">Before</div><pre className="mono xs card" style={{ padding: 12, overflow: 'auto', maxHeight: 300 }}>{pretty(open.oldValue)}</pre></div>
              <div><div className="label">After</div><pre className="mono xs card" style={{ padding: 12, overflow: 'auto', maxHeight: 300 }}>{pretty(open.newValue)}</pre></div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
