import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { SupplierPortalSection } from '@/screens/admin/PurchaseOrderScreens'
import { ListFilters } from '@/components/admin/Filters'
import { RequirePermission } from '@/components/admin/RequirePermission'
import { Button } from '@/components/ui/Button'
import { Card, KeyValue, ListRow, StatusBadge } from '@/components/ui/Data'
import { Alert, EmptyState, QueryState } from '@/components/ui/Feedback'
import { Field, Input, PhoneInput, Select, SwitchRow } from '@/components/ui/Form'
import { Sheet } from '@/components/ui/Overlay'
import { PagedList, Screen } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { toast } from '@/components/ui/Toast'
import { useDebounced } from '@/hooks/useDebounced'
import { api, ApiError } from '@/services/api'
import type { Purchase, Supplier } from '@/services/types'
import { useCan } from '@/store/auth'
import { date, money, titleCase } from '@/utils/format'
import { STATE_OPTIONS } from '@/utils/india'

/** O16 Suppliers. */
export default function SuppliersScreen() {
  const canWrite = useCan('SUPPLIER_WRITE')
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const q = useDebounced(search)
  return (
    <RequirePermission anyOf={['SUPPLIER_READ']}>
      <PagedList<Supplier>
        queryKey={['suppliers', q]}
        fetchPage={(page, pageSize) => api.page<Supplier>('/api/v1/suppliers', { q, page, pageSize })}
        keyOf={(s) => s.id}
        header={<ListFilters search={search} onSearch={setSearch} placeholder="Name, code, GSTIN or mobile" action={canWrite ? <Button icon="plus" onPress={() => setCreating(true)} accessibilityLabel="Add supplier">Add</Button> : undefined} />}
        empty={<EmptyState icon="briefcase" title="No suppliers" />}
        renderItem={(s) => (
          <ListRow onPress={() => router.push(`/admin/supplier/${s.id}`)} title={s.name} subtitle={`${s.supplierCode}${s.contactPerson ? ` · ${s.contactPerson}` : ''}${s.mobileNumber ? ` · ${s.mobileNumber}` : ''}`}
            meta={<View style={{ marginTop: 4 }}><StatusBadge status={s.active ? 'ACTIVE' : 'INACTIVE'} /></View>}
            right={<><Text weight="700" num>{money(s.outstanding)}</Text><Text variant="xs" color="muted">payable</Text></>} />
        )}
      />
      <SupplierSheet open={creating} onClose={() => setCreating(false)} onSaved={(s) => router.push(`/admin/supplier/${s.id}`)} />
    </RequirePermission>
  )
}

const BLANK = { name: '', contactPerson: '', mobileNumber: '', email: '', gstin: '', pan: '', paymentTerms: '', creditDays: '30', active: true, addressLine1: '', city: '', state: 'Tamil Nadu', pincode: '' }

function SupplierSheet({ open, supplier, onClose, onSaved }: { open: boolean; supplier?: Supplier; onClose: () => void; onSaved: (s: Supplier) => void }) {
  const qc = useQueryClient()
  const [f, setF] = useState(BLANK)
  useEffect(() => {
    if (!open) return
    setF(supplier ? {
      name: supplier.name, contactPerson: supplier.contactPerson ?? '', mobileNumber: supplier.mobileNumber?.replace('+91', '') ?? '', email: supplier.email ?? '',
      gstin: supplier.gstin ?? '', pan: supplier.pan ?? '', paymentTerms: supplier.paymentTerms ?? '', creditDays: String(supplier.creditDays), active: supplier.active,
      addressLine1: supplier.address?.addressLine1 ?? '', city: supplier.address?.city ?? '', state: supplier.address?.state ?? 'Tamil Nadu', pincode: supplier.address?.pincode ?? '',
    } : BLANK)
  }, [open, supplier])
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v })
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: f.name, contactPerson: f.contactPerson, mobileNumber: f.mobileNumber || undefined, email: f.email || undefined,
        gstin: f.gstin ? f.gstin.toUpperCase() : undefined, pan: f.pan ? f.pan.toUpperCase() : undefined, paymentTerms: f.paymentTerms, creditDays: Number(f.creditDays || 0), active: f.active,
        address: f.addressLine1 ? { addressLine1: f.addressLine1, city: f.city, state: f.state, pincode: f.pincode } : undefined,
      }
      return supplier ? api.patch<Supplier>(`/api/v1/suppliers/${supplier.id}`, body) : api.post<Supplier>('/api/v1/suppliers', body)
    },
    onSuccess: (s) => { toast.success('Supplier saved'); qc.invalidateQueries({ queryKey: ['suppliers'] }); qc.invalidateQueries({ queryKey: ['supplier', s.id] }); onClose(); onSaved(s) },
  })
  const err = save.error instanceof ApiError ? save.error : null
  return (
    <Sheet open={open} onClose={onClose} title={supplier ? 'Edit supplier' : 'Add supplier'} footer={
      <Button block loading={save.isPending} disabled={f.name.trim().length < 2} onPress={() => save.mutate()}>Save</Button>
    }>
      <Field label="Name" required><Input value={f.name} onChangeText={set('name')} accessibilityLabel="Supplier name" /></Field>
      <Field label="Contact person"><Input value={f.contactPerson} onChangeText={set('contactPerson')} accessibilityLabel="Contact person" /></Field>
      <Field label="Mobile" error={err?.fieldError('mobileNumber')}><PhoneInput value={f.mobileNumber} onChangeText={(t) => set('mobileNumber')(t.replace(/\D/g, ''))} accessibilityLabel="Mobile" /></Field>
      <Field label="Email"><Input value={f.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" accessibilityLabel="Email" /></Field>
      <Field label="GSTIN" error={err?.fieldError('gstin')}><Input value={f.gstin} onChangeText={(t) => set('gstin')(t.toUpperCase())} maxLength={15} autoCapitalize="characters" accessibilityLabel="GSTIN" /></Field>
      <Field label="PAN" error={err?.fieldError('pan')}><Input value={f.pan} onChangeText={(t) => set('pan')(t.toUpperCase())} maxLength={10} autoCapitalize="characters" accessibilityLabel="PAN" /></Field>
      <Field label="Payment terms"><Input value={f.paymentTerms} onChangeText={set('paymentTerms')} placeholder="e.g. Net 30" accessibilityLabel="Payment terms" /></Field>
      <Field label="Credit days"><Input value={f.creditDays} onChangeText={(t) => set('creditDays')(t.replace(/\D/g, ''))} keyboardType="number-pad" accessibilityLabel="Credit days" /></Field>
      <Field label="Address"><Input value={f.addressLine1} onChangeText={set('addressLine1')} accessibilityLabel="Address" /></Field>
      <Field label="City"><Input value={f.city} onChangeText={set('city')} accessibilityLabel="City" /></Field>
      <Field label="State"><Select label="State" value={f.state} onChange={set('state')} options={STATE_OPTIONS} searchable /></Field>
      <Field label="Pincode"><Input value={f.pincode} onChangeText={(t) => set('pincode')(t.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={6} accessibilityLabel="Pincode" /></Field>
      <SwitchRow label="Active" value={f.active} onChange={(v) => setF({ ...f, active: v })} />
      {err && <Alert tone="danger">{err.message}</Alert>}
    </Sheet>
  )
}

interface SupplierLedgerRow { id: string; date: string; entryType: string; referenceNumber: string; debit: number; credit: number; balance: number; narration?: string }

export function SupplierDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const canWrite = useCan('SUPPLIER_WRITE')
  const [editing, setEditing] = useState(false)
  const q = useQuery({ queryKey: ['supplier', id], queryFn: () => api.get<Supplier>(`/api/v1/suppliers/${id}`) })
  const ledger = useQuery({ queryKey: ['supplier', id, 'ledger'], queryFn: () => api.page<SupplierLedgerRow>(`/api/v1/suppliers/${id}/ledger`, { pageSize: 50 }) })
  const purchases = useQuery({ queryKey: ['purchases', 'supplier', id], queryFn: () => api.page<Purchase>('/api/v1/purchases', { supplierId: id, pageSize: 10 }) })
  const s = q.data
  return (
    <RequirePermission anyOf={['SUPPLIER_READ']}>
      <Stack.Screen options={{ title: s?.name ?? 'Supplier' }} />
      <Screen onRefresh={() => { q.refetch(); ledger.refetch(); purchases.refetch() }} refreshing={q.isRefetching}
        footer={canWrite && s ? <Button variant="secondary" icon="edit-2" block onPress={() => setEditing(true)}>Edit supplier</Button> : undefined}>
        <QueryState query={q}>
          {(s) => (
            <>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Text color="muted">{s.supplierCode}</Text>
                <StatusBadge status={s.active ? 'ACTIVE' : 'INACTIVE'} />
              </View>
              <Card title="Details">
                <KeyValue items={[
                  ['Payable', <Text key="o" weight="700" num>{money(s.outstanding)}</Text>], ['Contact', s.contactPerson], ['Mobile', s.mobileNumber], ['Email', s.email],
                  ['GSTIN', s.gstin], ['PAN', s.pan], ['Terms', s.paymentTerms], ['Credit days', String(s.creditDays)],
                  ['Address', s.address ? `${s.address.addressLine1}, ${s.address.city}, ${s.address.state} – ${s.address.pincode}` : undefined],
                ]} />
              </Card>
              <SupplierPortalSection supplierId={s.id} defaultMobile={s.mobileNumber} />
              <Card title="Recent purchases" padded={false}>
                <QueryState query={purchases} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No purchases" />}>
                  {(d) => <>{d.items.map((p) => <ListRow key={p.id} onPress={() => router.push(`/admin/purchase/${p.id}`)} title={p.purchaseNumber} subtitle={date(p.purchaseDate)} meta={<View style={{ marginTop: 4 }}><StatusBadge status={p.status} /></View>} right={<Text weight="600" num>{money(p.grandTotal)}</Text>} />)}</>}
                </QueryState>
              </Card>
              <Card title="Ledger" padded={false}>
                <QueryState query={ledger} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No transactions" />}>
                  {(d) => <>{d.items.map((e) => (
                    <ListRow key={e.id} title={e.referenceNumber} subtitle={`${date(e.date)} · ${titleCase(e.entryType)}`}
                      right={<>
                        {e.credit > 0 && <Text variant="small" num color="danger">+{money(e.credit)}</Text>}
                        {e.debit > 0 && <Text variant="small" num color="success">−{money(e.debit)}</Text>}
                        <Text variant="xs" color="muted" num>Payable {money(e.balance)}</Text>
                      </>} />
                  ))}</>}
                </QueryState>
              </Card>
              <SupplierSheet open={editing} supplier={s} onClose={() => setEditing(false)} onSaved={() => undefined} />
            </>
          )}
        </QueryState>
      </Screen>
    </RequirePermission>
  )
}
