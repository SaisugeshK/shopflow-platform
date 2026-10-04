import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { Button } from '@/components/ui/Button'
import { Card, KeyValue, ListRow, StatusBadge } from '@/components/ui/Data'
import { Alert, EmptyState } from '@/components/ui/Feedback'
import { ChipGroup, Field, Input, MoneyInput, QtyInput, Select } from '@/components/ui/Form'
import { Sheet } from '@/components/ui/Overlay'
import { Text } from '@/components/ui/Text'
import { toast } from '@/components/ui/Toast'
import { api, ApiError } from '@/services/api'
import type { Agent, CustomerDetail, Invoice, Project, ProjectStatement } from '@/services/types'
import { useCan, useModule } from '@/store/auth'
import { date, dateTime, money, titleCase } from '@/utils/format'

export const PAY_OPTIONS = ['CASH', 'CREDIT', 'UPI', 'BANK_TRANSFER', 'OTHER'].map((v) => ({ value: v, label: v === 'CREDIT' ? 'Credit' : titleCase(v) }))

/** Project / site of the chosen customer (PROJECT_ACCOUNTS module); nothing when the module is off. */
export function ProjectSelect({ customerId, value, onChange }: { customerId?: string; value: string; onChange: (id: string) => void }) {
  const on = useModule('PROJECT_ACCOUNTS')
  const projects = useQuery({
    queryKey: ['projects', customerId], enabled: on && !!customerId,
    queryFn: () => api.get<Project[]>('/api/v1/projects', { customerId: customerId!, status: 'ACTIVE' }),
  })
  if (!on || !customerId) return null
  return (
    <Field label="Project / site" hint={projects.data?.length === 0 ? 'No active projects for this customer' : undefined}>
      <Select label="Project" value={value} onChange={onChange} placeholder="No project" options={[{ value: '', label: 'No project' }, ...(projects.data ?? []).map((p) => ({ value: p.id, label: p.name }))]} />
    </Field>
  )
}

/** Payment choice when a quotation is accepted (staff or customer). */
export function AcceptQuotationSheet({ loading, onClose, onAccept }: { loading: boolean; onClose: () => void; onAccept: (body: { paymentMethod: string }) => void }) {
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  return (
    <Sheet open onClose={onClose} title="Accept quotation" footer={<Button block icon="check" loading={loading} onPress={() => onAccept({ paymentMethod })}>Accept & place order</Button>}>
      <Text variant="small" color="muted">An order is placed at the quoted rates.</Text>
      <Field label="Payment"><ChipGroup options={PAY_OPTIONS} value={paymentMethod} onChange={setPaymentMethod} /></Field>
    </Sheet>
  )
}

/** Project, delivery challan, e-way bill and commission on an invoice (§0B.9). */
export function InvoiceTradeSection({ inv, onChanged }: { inv: Invoice; onChanged: () => void }) {
  const ewayOn = useModule('EWAY_BILL')
  const canWrite = useCan('INVOICE_WRITE')
  const [open, setOpen] = useState(false)
  const t = inv.trade
  const canEway = ewayOn && canWrite && !t?.ewayBillNumber && !['DRAFT', 'CANCELLED'].includes(inv.status)
  if (!t && !canEway) return null
  return (
    <Card title="Trade details" actions={canEway ? <Button size="sm" variant="secondary" icon="truck" onPress={() => setOpen(true)}>E-way bill</Button> : undefined}>
      <View style={{ gap: 8 }}>
        {t?.ewayTestOnly && t.ewayBillNumber && <Alert tone="warning" title="TEST ONLY e-way bill">From the mock provider; not government-issued.</Alert>}
        <KeyValue items={[
          ['Project', t?.projectName],
          ['Delivery challan', t?.deliveryChallanId ? <Text key="dc" color="primary" onPress={() => router.push(`/admin/delivery-challan/${t.deliveryChallanId}`)}>{t.challanNumber}</Text> : undefined],
          ['E-way bill', t?.ewayBillNumber],
          ['Valid until', t?.ewayValidUntil ? dateTime(t.ewayValidUntil) : undefined],
          ['Agent', t?.agentName],
          ['Commission', t?.commissionAmount != null ? `${money(t.commissionAmount)} (${t.commissionPercent}%)${t.commissionPaidAt ? ' · paid' : ' · pending'}` : undefined],
        ]} />
      </View>
      {open && <EwaySheet inv={inv} onClose={() => setOpen(false)} onDone={() => { setOpen(false); onChanged() }} />}
    </Card>
  )
}

function EwaySheet({ inv, onClose, onDone }: { inv: Invoice; onClose: () => void; onDone: () => void }) {
  const [distance, setDistance] = useState('')
  const [vehicle, setVehicle] = useState(inv.vehicleNumber ?? '')
  const m = useMutation({
    mutationFn: () => api.post(`/api/v1/invoices/${inv.id}/eway-bill`, { distanceKm: Number(distance), vehicleNumber: vehicle || undefined }),
    onSuccess: () => { toast.success('E-way bill generated'); onDone() },
  })
  const err = m.error instanceof ApiError ? m.error : null
  return (
    <Sheet open onClose={onClose} title="Generate e-way bill" footer={<Button block loading={m.isPending} disabled={!(Number(distance) > 0)} onPress={() => m.mutate()}>Generate</Button>}>
      <Text variant="small" color="muted">Validity is one day per 200 km.</Text>
      <Field label="Distance (km)" required><QtyInput value={distance} onChangeText={setDistance} accessibilityLabel="Distance in km" /></Field>
      <Field label="Vehicle number"><Input value={vehicle} onChangeText={(t) => setVehicle(t.toUpperCase())} autoCapitalize="characters" accessibilityLabel="Vehicle number" /></Field>
      {err && <Alert tone="danger">{err.message}</Alert>}
    </Sheet>
  )
}

/** Agent link and projects on the customer screen (COMMISSION / PROJECT_ACCOUNTS modules). */
export function CustomerTradeSection({ customer, onChanged }: { customer: CustomerDetail; onChanged: () => void }) {
  const commissionOn = useModule('COMMISSION')
  const projectsOn = useModule('PROJECT_ACCOUNTS')
  return (
    <>
      {commissionOn && <AgentCard customer={customer} onChanged={onChanged} />}
      {projectsOn && <ProjectsCard customerId={customer.id} />}
    </>
  )
}

function AgentCard({ customer, onChanged }: { customer: CustomerDetail; onChanged: () => void }) {
  const canWrite = useCan('CUSTOMER_WRITE')
  const agents = useQuery({ queryKey: ['agents'], queryFn: () => api.get<Agent[]>('/api/v1/commissions/agents') })
  const m = useMutation({
    mutationFn: (agentId: string) => api.put(`/api/v1/commissions/customers/${customer.id}/agent`, { agentId: agentId || null }),
    onSuccess: () => { toast.success('Agent updated'); onChanged() },
    onError: (e) => toast.error(e),
  })
  const current = agents.data?.find((a) => a.id === customer.agentId)
  return (
    <Card title="Agent / broker">
      {canWrite ? (
        <Field label="Commission goes to" hint={current ? `${current.commissionPercent}% of each invoice's taxable value` : 'No commission on this customer'}>
          <Select label="Agent" value={customer.agentId ?? ''} onChange={(v) => m.mutate(v)} placeholder="No agent"
            options={[{ value: '', label: 'No agent' }, ...(agents.data ?? []).filter((a) => a.active || a.id === customer.agentId).map((a) => ({ value: a.id, label: `${a.name} (${a.commissionPercent}%)` }))]} />
        </Field>
      ) : <Text variant="small">{current ? `${current.name} · ${current.commissionPercent}%` : 'No agent'}</Text>}
    </Card>
  )
}

function ProjectsCard({ customerId }: { customerId: string }) {
  const qc = useQueryClient()
  const canWrite = useCan('CUSTOMER_WRITE')
  const [adding, setAdding] = useState(false)
  const [statement, setStatement] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', siteAddress: '', budget: '' })
  const projects = useQuery({ queryKey: ['projects', 'customer', customerId], queryFn: () => api.get<Project[]>('/api/v1/projects', { customerId }) })
  const create = useMutation({
    mutationFn: () => api.post('/api/v1/projects', { customerId, name: form.name, siteAddress: form.siteAddress || undefined, budget: form.budget || undefined }),
    onSuccess: () => { toast.success('Project added'); setAdding(false); setForm({ name: '', siteAddress: '', budget: '' }); qc.invalidateQueries({ queryKey: ['projects'] }) },
  })
  const err = create.error instanceof ApiError ? create.error : null
  return (
    <Card title="Projects / sites" padded={false} actions={canWrite ? <Button size="sm" variant="secondary" onPress={() => setAdding(true)}>Add</Button> : undefined}>
      {(projects.data ?? []).length === 0 ? <EmptyState icon="map-pin" title="No projects" /> : projects.data!.map((p) => (
        <ListRow key={p.id} title={p.name} subtitle={`Billed ${money(p.billed)} · due ${money(p.outstanding)}`} right={<StatusBadge status={p.status} />} onPress={() => setStatement(p.id)} />
      ))}
      <Sheet open={adding} onClose={() => setAdding(false)} title="Add project / site" footer={<Button block loading={create.isPending} disabled={!form.name.trim()} onPress={() => create.mutate()}>Add project</Button>}>
        <Field label="Project name" required><Input value={form.name} onChangeText={(t) => setForm({ ...form, name: t })} accessibilityLabel="Project name" /></Field>
        <Field label="Site address"><Input value={form.siteAddress} onChangeText={(t) => setForm({ ...form, siteAddress: t })} accessibilityLabel="Site address" /></Field>
        <Field label="Budget"><MoneyInput value={form.budget} onChangeText={(t) => setForm({ ...form, budget: t })} accessibilityLabel="Budget" /></Field>
        {err && <Alert tone="danger">{err.message}</Alert>}
      </Sheet>
      {statement && <ProjectStatementSheet path={`/api/v1/projects/${statement}/statement`} onClose={() => setStatement(null)} />}
    </Card>
  )
}

/** Everything recorded against a project, with what is billed and still due. */
export function ProjectStatementSheet({ path, onClose }: { path: string; onClose: () => void }) {
  const s = useQuery({ queryKey: ['project-statement', path], queryFn: () => api.get<ProjectStatement>(path) })
  const p = s.data?.project
  return (
    <Sheet open onClose={onClose} title={p ? p.name : 'Project statement'}>
      {p && (
        <>
          <KeyValue items={[['Site', p.siteAddress], ['Budget', p.budget != null ? money(p.budget) : undefined], ['Billed', money(p.billed)],
            ['Received', money(p.received)], ['Due', <Text key="d" weight="700" num>{money(p.outstanding)}</Text>]]} />
          {s.data!.lines.length === 0 ? <EmptyState icon="file" title="Nothing yet" /> : s.data!.lines.map((l) => (
            <ListRow key={`${l.type}-${l.id}`} title={l.number} subtitle={`${titleCase(l.type)} · ${date(l.date)}`}
              meta={<View style={{ marginTop: 4, flexDirection: 'row' }}><StatusBadge status={l.status} /></View>}
              right={<Text num weight="600">{money(l.amount)}</Text>} />
          ))}
        </>
      )}
    </Sheet>
  )
}
