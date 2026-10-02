import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { ListFilters } from '@/components/admin/Filters'
import { DateInput, isValidDate } from '@/components/admin/Pickers'
import { RequirePermission } from '@/components/admin/RequirePermission'
import { Card, KeyValue, ListRow } from '@/components/ui/Data'
import { EmptyState } from '@/components/ui/Feedback'
import { Field, Input, Select } from '@/components/ui/Form'
import { Sheet } from '@/components/ui/Overlay'
import { PagedList } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { useDebounced } from '@/hooks/useDebounced'
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

/** O29 Audit logs (§80): immutable; sensitive values are redacted server-side. */
export default function AuditScreen() {
  const [action, setAction] = useState('')
  const [entityTypeText, setEntityType] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [open, setOpen] = useState<AuditRecord | null>(null)
  const entityType = useDebounced(entityTypeText.trim().toUpperCase())
  const f = isValidDate(from) ? from : ''
  const t = isValidDate(to) ? to : ''
  return (
    <RequirePermission anyOf={['AUDIT_READ']}>
      <PagedList<AuditRecord>
        queryKey={['audit', action, entityType, f, t]}
        fetchPage={(page, pageSize) => api.page<AuditRecord>('/api/v1/audit-logs', { action, entityType, from: f, to: t, page, pageSize })}
        keyOf={(a) => a.id}
        pageSize={30}
        header={
          <ListFilters activeCount={[action, entityType, f, t].filter(Boolean).length} onClear={() => { setAction(''); setEntityType(''); setFrom(''); setTo('') }}
            sheet={
              <>
                <Field label="Action"><Select label="Action" value={action} onChange={setAction} searchable options={[{ value: '', label: 'All actions' }, ...ACTIONS.map((a) => ({ value: a, label: titleCase(a) }))]} /></Field>
                <Field label="Entity type"><Input value={entityTypeText} onChangeText={setEntityType} placeholder="e.g. INVOICE" autoCapitalize="characters" accessibilityLabel="Entity type" /></Field>
                <Field label="From"><DateInput label="From date" value={from} onChange={setFrom} /></Field>
                <Field label="To"><DateInput label="To date" value={to} onChange={setTo} /></Field>
              </>
            } />
        }
        empty={<EmptyState icon="file" title="No audit records" />}
        renderItem={(a) => (
          <ListRow onPress={() => setOpen(a)} title={titleCase(a.action)}
            subtitle={`${titleCase(a.entityType)} · ${a.actorName ? `${a.actorName} (${titleCase(a.actorRole ?? '')})` : titleCase(a.actorRole ?? 'System')}`}
            right={<Text variant="xs" color="muted">{dateTime(a.createdAt)}</Text>} />
        )}
      />
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? titleCase(open.action) : ''}>
        {open && (
          <>
            <KeyValue items={[['When', dateTime(open.createdAt)], ['By', open.actorName ?? open.actorRole], ['Entity', `${open.entityType} ${open.entityId ?? ''}`], ['Request', open.requestId], ['IP', open.ipAddress], ['Client', open.userAgent]]} />
            {(['Before', 'After'] as const).map((label) => (
              <View key={label} style={{ gap: 6 }}>
                <Text variant="small" weight="700">{label}</Text>
                <Card>
                  <ScrollView horizontal>
                    <Text variant="xs" style={{ fontFamily: 'monospace' }}>{pretty(label === 'Before' ? open.oldValue : open.newValue)}</Text>
                  </ScrollView>
                </Card>
              </View>
            ))}
          </>
        )}
      </Sheet>
    </RequirePermission>
  )
}
