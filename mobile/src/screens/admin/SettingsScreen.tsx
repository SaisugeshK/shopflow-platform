import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as ImagePicker from 'expo-image-picker'
import { useEffect, useState, type ReactNode } from 'react'
import { Image, View } from 'react-native'
import { RequirePermission } from '@/components/admin/RequirePermission'
import { Button } from '@/components/ui/Button'
import { Badge, Card, ListRow } from '@/components/ui/Data'
import { Alert, QueryState } from '@/components/ui/Feedback'
import { ChipGroup, Field, Input, Select, SwitchRow } from '@/components/ui/Form'
import { Sheet } from '@/components/ui/Overlay'
import { Screen } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { toast } from '@/components/ui/Toast'
import { API_BASE, api, ApiError, uploadImage } from '@/services/api'
import type { BusinessProfile } from '@/services/types'
import { colors, radius } from '@/theme/tokens'
import { titleCase } from '@/utils/format'
import { STATE_OPTIONS } from '@/utils/india'

type Tab = 'profile' | 'bank' | 'invoice' | 'tax' | 'rules' | 'whatsapp'
type Values = Record<string, string | number | boolean | null | undefined | number[]>
type FieldDef = [key: string, label: string, kind: 'text' | 'number' | 'textarea' | 'switch' | 'select', hint?: string, options?: string[]]

/** O25–O28 Business settings (§79). Every change is audited on the server. */
export default function SettingsScreen() {
  const [tab, setTab] = useState<Tab>('profile')
  return (
    <RequirePermission anyOf={['SETTINGS_MANAGE']}>
      <Screen>
        <ChipGroup value={tab} onChange={(t) => setTab(t as Tab)} options={[
          { value: 'profile', label: 'Business profile' }, { value: 'bank', label: 'Bank details' }, { value: 'invoice', label: 'Invoice' },
          { value: 'tax', label: 'GST / Tax' }, { value: 'rules', label: 'Credit & orders' }, { value: 'whatsapp', label: 'WhatsApp & alerts' },
        ]} />
        {tab === 'profile' && <ProfileSettings />}
        {tab === 'bank' && <BankSettings />}
        {tab === 'invoice' && <SettingsForm path="/api/v1/business/invoice-settings" fields={[
          ['invoicePrefix', 'Invoice prefix', 'text', 'Applies to the next financial year sequence; issued numbers never change'],
          ['numberPadding', 'Number digits', 'number'], ['startingNumber', 'Starting number', 'number'],
          ['defaultPaymentTerms', 'Default payment terms', 'text'], ['defaultTerms', 'Terms & conditions', 'textarea'],
          ['declaration', 'Declaration', 'textarea'], ['defaultFooter', 'Footer', 'text'], ['showBankDetails', 'Show bank details on invoices', 'switch'],
        ]} />}
        {tab === 'tax' && <TaxSettings />}
        {tab === 'rules' && <SettingsForm path="/api/v1/business/settings" fields={[
          ['creditPolicy', 'When an order exceeds the credit limit', 'select', undefined, ['BLOCK', 'REQUIRE_ADMIN_APPROVAL', 'ALLOW']],
          ['defaultCreditLimit', 'Default credit limit for new customers', 'number'], ['defaultCreditDays', 'Default credit days', 'number'],
          ['customerCancelAllowedUntil', 'Customers may cancel until', 'select', undefined, ['PLACED', 'ACCEPTED', 'NEVER']],
          ['partialDeliveryInvoicePolicy', 'Invoice partial deliveries on', 'select', undefined, ['INVOICE_ACCEPTED_QUANTITY', 'INVOICE_DELIVERED_QUANTITY']],
          ['showStockToCustomers', 'Show available quantity to customers', 'switch'], ['gstinRequiredForCustomers', 'GSTIN required at registration', 'switch'],
          ['panRequiredForCustomers', 'PAN required at registration', 'switch'], ['dataRetentionYears', 'Financial record retention (years)', 'number'],
        ]} />}
        {tab === 'whatsapp' && <SettingsForm path="/api/v1/business/settings" note="Development uses a mock WhatsApp provider — no real messages are sent." fields={[
          ['whatsappEnabled', 'Send invoices on WhatsApp', 'switch'], ['whatsappSender', 'Sender number / ID', 'text'],
          ['whatsappInvoiceTemplate', 'Invoice template name', 'text', 'Must be an approved template in production'],
          ['notifyWhatsapp', 'WhatsApp notifications', 'switch'], ['notifyPush', 'Push notifications', 'switch'], ['notifySms', 'SMS notifications', 'switch'], ['notifyEmail', 'Email notifications', 'switch'],
        ]} />}
      </Screen>
    </RequirePermission>
  )
}

function SettingsForm({ path, fields, note }: { path: string; fields: FieldDef[]; note?: string }) {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['settings', path], queryFn: () => api.get<Values>(path) })
  const [values, setValues] = useState<Values>({})
  useEffect(() => { if (q.data) setValues(q.data) }, [q.data])
  const save = useMutation({
    mutationFn: () => api.patch<Values>(path, Object.fromEntries(fields.map(([k]) => [k, values[k] === '' ? null : values[k]]))),
    onSuccess: (v) => { toast.success('Settings saved'); qc.setQueryData(['settings', path], v) },
  })
  const err = save.error instanceof ApiError ? save.error : null
  return (
    <QueryState query={q}>
      {() => (
        <Card>
          <View style={{ gap: 14 }}>
            {note && <Alert>{note}</Alert>}
            {fields.map(([key, label, kind, hint, options]) => {
              const v = values[key]
              let control: ReactNode
              if (kind === 'switch') return <SwitchRow key={key} label={label} hint={hint} value={!!v} onChange={(c) => setValues({ ...values, [key]: c })} />
              if (kind === 'select') control = <Select label={label} value={String(v ?? '')} onChange={(x) => setValues({ ...values, [key]: x })} options={(options ?? []).map((o) => ({ value: o, label: titleCase(o) }))} />
              else control = <Input value={String(v ?? '')} onChangeText={(x) => setValues({ ...values, [key]: kind === 'number' ? x.replace(/[^\d.]/g, '') : x })} multiline={kind === 'textarea'} keyboardType={kind === 'number' ? 'decimal-pad' : 'default'} accessibilityLabel={label} />
              return <Field key={key} label={label} hint={hint} error={err?.fieldError(key)}>{control}</Field>
            })}
            {err && !err.details.length && <Alert tone="danger">{err.message}</Alert>}
            <Button loading={save.isPending} onPress={() => save.mutate()}>Save changes</Button>
          </View>
        </Card>
      )}
    </QueryState>
  )
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function ProfileSettings() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['business'], queryFn: () => api.get<BusinessProfile>('/api/v1/business') })
  const [v, setV] = useState<Partial<BusinessProfile>>({})
  useEffect(() => { if (q.data) setV(q.data) }, [q.data])
  const save = useMutation({
    mutationFn: () => api.patch<BusinessProfile>('/api/v1/business', {
      name: v.name, legalName: v.legalName, addressLine1: v.addressLine1, addressLine2: v.addressLine2, city: v.city, state: v.state,
      pincode: v.pincode || undefined, phone: v.phone, mobile: v.mobile, email: v.email || undefined, gstin: v.gstin || undefined, pan: v.pan || undefined,
      financialYearStartMonth: v.financialYearStartMonth, termsAndConditions: v.termsAndConditions, authorizedSignatory: v.authorizedSignatory,
    }),
    onSuccess: (b) => { toast.success('Business profile saved'); qc.setQueryData(['business'], b) },
  })
  const logo = useMutation({
    mutationFn: (asset: ImagePicker.ImagePickerAsset) => uploadImage<BusinessProfile>('/api/v1/business/logo', asset),
    onSuccess: (b) => { toast.success('Logo updated'); qc.setQueryData(['business'], b) },
    onError: (e) => toast.error(e),
  })
  const pickLogo = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 })
    if (!r.canceled && r.assets[0]) logo.mutate(r.assets[0])
  }
  const err = save.error instanceof ApiError ? save.error : null
  const text = (k: keyof BusinessProfile, label: string, opts: { upper?: boolean; max?: number; numeric?: boolean } = {}) => (
    <Field key={k} label={label} error={err?.fieldError(k)}>
      <Input value={String(v[k] ?? '')} maxLength={opts.max} autoCapitalize={opts.upper ? 'characters' : 'sentences'} keyboardType={opts.numeric ? 'number-pad' : 'default'} accessibilityLabel={label}
        onChangeText={(t) => setV({ ...v, [k]: opts.upper ? t.toUpperCase() : t })} />
    </Field>
  )
  return (
    <QueryState query={q}>
      {(b) => (
        <Card>
          <View style={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 64, height: 64, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                {b.logoFileId ? <Image source={{ uri: `${API_BASE}/api/v1/files/public/${b.logoFileId}` }} style={{ width: '100%', height: '100%' }} resizeMode="contain" accessibilityLabel="Business logo" /> : <Text variant="xs" color="muted">No logo</Text>}
              </View>
              <Button size="sm" variant="secondary" icon="upload" loading={logo.isPending} onPress={pickLogo}>Upload logo</Button>
            </View>
            {text('name', 'Business name')}
            {text('legalName', 'Legal name (on invoices)')}
            {text('addressLine1', 'Address line 1')}
            {text('addressLine2', 'Address line 2')}
            {text('city', 'City')}
            <Field label="State" hint={`GST state code ${b.stateCode ?? '—'}`}><Select label="State" value={v.state ?? ''} onChange={(s) => setV({ ...v, state: s })} options={STATE_OPTIONS} searchable /></Field>
            {text('pincode', 'Pincode', { max: 6, numeric: true })}
            {text('phone', 'Phone')}
            {text('mobile', 'Mobile')}
            {text('email', 'Email')}
            {text('gstin', 'GSTIN', { upper: true, max: 15 })}
            {text('pan', 'PAN', { upper: true, max: 10 })}
            <Field label="Financial year starts"><Select label="Financial year starts" value={String(v.financialYearStartMonth ?? 4)} onChange={(m) => setV({ ...v, financialYearStartMonth: Number(m) })} options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} /></Field>
            {text('authorizedSignatory', 'Authorised signatory')}
            <Field label="Terms & conditions"><Input value={v.termsAndConditions ?? ''} onChangeText={(t) => setV({ ...v, termsAndConditions: t })} multiline accessibilityLabel="Terms and conditions" /></Field>
            {err && !err.details.length && <Alert tone="danger">{err.message}</Alert>}
            <Button loading={save.isPending} onPress={() => save.mutate()}>Save profile</Button>
          </View>
        </Card>
      )}
    </QueryState>
  )
}

interface Bank { id: string; bankName: string; accountName?: string; accountNumber: string; ifsc: string; branch?: string; isDefault: boolean; active: boolean }

function BankSettings() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const blank = { bankName: '', accountName: '', accountNumber: '', ifsc: '', branch: '', isDefault: false }
  const [f, setF] = useState(blank)
  const q = useQuery({ queryKey: ['banks'], queryFn: () => api.get<Bank[]>('/api/v1/business/bank-accounts') })
  const add = useMutation({
    mutationFn: () => api.post('/api/v1/business/bank-accounts', { ...f, accountName: f.accountName || undefined, branch: f.branch || undefined }),
    onSuccess: () => { toast.success('Bank account added'); setOpen(false); setF(blank); qc.invalidateQueries({ queryKey: ['banks'] }) },
  })
  const makeDefault = useMutation({ mutationFn: (id: string) => api.patch(`/api/v1/business/bank-accounts/${id}`, { isDefault: true }), onSuccess: () => qc.invalidateQueries({ queryKey: ['banks'] }), onError: (e) => toast.error(e) })
  const err = add.error instanceof ApiError ? add.error : null
  return (
    <>
      <Button icon="plus" onPress={() => setOpen(true)}>Add bank account</Button>
      <QueryState query={q} isEmpty={(d) => d.length === 0}>
        {(d) => (
          <Card padded={false}>
            {d.map((b) => (
              <ListRow key={b.id} title={b.bankName} subtitle={`A/c ${b.accountNumber} · ${b.ifsc}${b.branch ? ` · ${b.branch}` : ''}`}
                right={b.isDefault ? <Badge tone="primary">On invoices</Badge> : <Button size="sm" variant="ghost" onPress={() => makeDefault.mutate(b.id)}>Make default</Button>} />
            ))}
          </Card>
        )}
      </QueryState>
      <Sheet open={open} onClose={() => setOpen(false)} title="Add bank account" footer={<Button block loading={add.isPending} disabled={!f.bankName || !f.accountNumber || f.ifsc.length !== 11} onPress={() => add.mutate()}>Add</Button>}>
        <Field label="Bank name" required><Input value={f.bankName} onChangeText={(t) => setF({ ...f, bankName: t })} accessibilityLabel="Bank name" /></Field>
        <Field label="Account name"><Input value={f.accountName} onChangeText={(t) => setF({ ...f, accountName: t })} accessibilityLabel="Account name" /></Field>
        <Field label="Account number" required error={err?.fieldError('accountNumber')}><Input value={f.accountNumber} onChangeText={(t) => setF({ ...f, accountNumber: t.replace(/\D/g, '') })} keyboardType="number-pad" accessibilityLabel="Account number" /></Field>
        <Field label="IFSC" required error={err?.fieldError('ifsc')}><Input value={f.ifsc} onChangeText={(t) => setF({ ...f, ifsc: t.toUpperCase() })} maxLength={11} autoCapitalize="characters" accessibilityLabel="IFSC" /></Field>
        <Field label="Branch"><Input value={f.branch} onChangeText={(t) => setF({ ...f, branch: t })} accessibilityLabel="Branch" /></Field>
        <SwitchRow label="Print on invoices" value={f.isDefault} onChange={(c) => setF({ ...f, isDefault: c })} />
        {err && !err.details.length && <Alert tone="danger">{err.message}</Alert>}
      </Sheet>
    </>
  )
}

function TaxSettings() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['tax-settings'], queryFn: () => api.get<{ roundOffEnabled: boolean; defaultGstRate: number; allowedGstRates: number[]; calculationMode: string }>('/api/v1/business/tax-settings') })
  const [rates, setRates] = useState('')
  const [def, setDef] = useState('')
  const [round, setRound] = useState(true)
  useEffect(() => { if (q.data) { setRates(q.data.allowedGstRates.join(', ')); setDef(String(q.data.defaultGstRate)); setRound(q.data.roundOffEnabled) } }, [q.data])
  const save = useMutation({
    mutationFn: () => api.patch('/api/v1/business/tax-settings', { roundOffEnabled: round, defaultGstRate: def, allowedGstRates: rates.split(',').map((r) => r.trim()).filter(Boolean) }),
    onSuccess: () => { toast.success('Tax settings saved'); qc.invalidateQueries({ queryKey: ['tax-settings'] }) },
    onError: (e) => toast.error(e),
  })
  return (
    <QueryState query={q}>
      {(t) => (
        <Card>
          <View style={{ gap: 14 }}>
            <Alert tone="warning" title="Validate with your tax advisor">GST treatment must be confirmed against current Indian GST rules before production use. Intra-state sales use CGST + SGST; inter-state sales use IGST.</Alert>
            <Field label="Allowed GST rates (%)" hint="Comma separated, e.g. 0, 5, 12, 18, 28"><Input value={rates} onChangeText={setRates} keyboardType="numbers-and-punctuation" accessibilityLabel="Allowed GST rates" /></Field>
            <Field label="Default GST rate (%)"><Input value={def} onChangeText={(x) => setDef(x.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" accessibilityLabel="Default GST rate" /></Field>
            <Field label="Calculation mode" hint="Tax is added on top of the taxable value"><Input value={titleCase(t.calculationMode)} editable={false} accessibilityLabel="Calculation mode" /></Field>
            <SwitchRow label="Round invoice totals to the nearest rupee" value={round} onChange={setRound} />
            <Button loading={save.isPending} onPress={() => save.mutate()}>Save tax settings</Button>
          </View>
        </Card>
      )}
    </QueryState>
  )
}
