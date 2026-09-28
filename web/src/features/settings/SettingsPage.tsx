import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { Badge, Card, DataTable, PageHeader, Tabs } from '@/components/ui/Data'
import { Alert, QueryState } from '@/components/ui/Feedback'
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Overlay'
import { useToast } from '@/components/ui/Toast'
import { STATES } from '@/features/auth/RegisterPage'
import { api, ApiError } from '@/services/api'
import type { BusinessProfile } from '@/services/types'
import { titleCase } from '@/utils/format'

type Tab = 'profile' | 'bank' | 'invoice' | 'tax' | 'rules' | 'whatsapp'
type Values = Record<string, string | number | boolean | null | undefined | number[]>

/** O25–O28 Business settings (§79). Every change is audited on the server. */
export function SettingsPage() {
  const [tab, setTab] = useState<Tab>('profile')
  return (
    <div className="stack">
      <PageHeader title="Settings" subtitle="Business profile, invoicing, tax and operating rules" />
      <Tabs label="Settings sections" value={tab} onChange={setTab} tabs={[
        { value: 'profile', label: 'Business profile' }, { value: 'bank', label: 'Bank details' }, { value: 'invoice', label: 'Invoice settings' },
        { value: 'tax', label: 'GST / Tax' }, { value: 'rules', label: 'Credit & orders' }, { value: 'whatsapp', label: 'WhatsApp & notifications' },
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
      {tab === 'whatsapp' && <SettingsForm path="/api/v1/business/settings" fields={[
        ['whatsappEnabled', 'Send invoices on WhatsApp', 'switch'], ['whatsappSender', 'Sender number / ID', 'text'],
        ['whatsappInvoiceTemplate', 'Invoice template name', 'text', 'Must be an approved template in production'],
        ['notifyWhatsapp', 'WhatsApp notifications', 'switch'], ['notifyPush', 'Push notifications', 'switch'], ['notifySms', 'SMS notifications', 'switch'], ['notifyEmail', 'Email notifications', 'switch'],
      ]} note="Development uses a mock WhatsApp provider — no real messages are sent." />}
    </div>
  )
}

type FieldDef = [key: string, label: string, kind: 'text' | 'number' | 'textarea' | 'switch' | 'select', hint?: string, options?: string[]]

function SettingsForm({ path, fields, note }: { path: string; fields: FieldDef[]; note?: string }) {
  const qc = useQueryClient()
  const toast = useToast()
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
          <div className="form-grid">
            {note && <div className="span-2"><Alert tone="info">{note}</Alert></div>}
            {fields.map(([key, label, kind, hint, options]) => {
              const v = values[key]
              let control: ReactNode
              if (kind === 'switch') control = <Switch label={label} checked={!!v} onChange={(c) => setValues({ ...values, [key]: c })} />
              else if (kind === 'select') control = <Select id={key} value={String(v ?? '')} onChange={(e) => setValues({ ...values, [key]: e.target.value })} options={(options ?? []).map((o) => ({ value: o, label: titleCase(o) }))} />
              else if (kind === 'textarea') control = <Textarea id={key} value={String(v ?? '')} onChange={(e) => setValues({ ...values, [key]: e.target.value })} />
              else control = <Input id={key} type={kind === 'number' ? 'number' : 'text'} value={String(v ?? '')} onChange={(e) => setValues({ ...values, [key]: e.target.value })} />
              return kind === 'switch'
                ? <div key={key} className="span-2">{control}</div>
                : <Field key={key} label={label} htmlFor={key} hint={hint} error={err?.fieldError(key)} className={kind === 'textarea' ? 'span-2' : undefined}>{control}</Field>
            })}
            {err && !err.details.length && <div className="span-2"><Alert tone="danger">{err.message}</Alert></div>}
            <div className="span-2 form-actions"><Button loading={save.isPending} onClick={() => save.mutate()}>Save changes</Button></div>
          </div>
        </Card>
      )}
    </QueryState>
  )
}

function ProfileSettings() {
  const qc = useQueryClient()
  const toast = useToast()
  const logoRef = useRef<HTMLInputElement>(null)
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
  const logo = useMutation({ mutationFn: (f: File) => api.upload<BusinessProfile>('/api/v1/business/logo', f), onSuccess: (b) => { toast.success('Logo updated'); qc.setQueryData(['business'], b) }, onError: (e) => toast.error(e) })
  const err = save.error instanceof ApiError ? save.error : null
  const text = (k: keyof BusinessProfile, label: string, opts: { span?: boolean; upper?: boolean; max?: number } = {}) => (
    <Field label={label} htmlFor={`b-${k}`} error={err?.fieldError(k)} className={opts.span ? 'span-2' : undefined}>
      <Input id={`b-${k}`} maxLength={opts.max} value={String(v[k] ?? '')} style={opts.upper ? { textTransform: 'uppercase' } : undefined}
        onChange={(e) => setV({ ...v, [k]: opts.upper ? e.target.value.toUpperCase() : e.target.value })} />
    </Field>
  )
  return (
    <QueryState query={q}>
      {(b) => (
        <Card>
          <div className="form-grid">
            <div className="span-2 row">
              <div style={{ width: 64, height: 64, borderRadius: 12, overflow: 'hidden', background: 'var(--color-surface-2)', display: 'grid', placeItems: 'center' }}>
                {b.logoFileId ? <img src={`/api/v1/files/public/${b.logoFileId}`} alt="Business logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span className="xs muted">No logo</span>}
              </div>
              <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) logo.mutate(f); e.target.value = '' }} />
              <Button variant="secondary" size="sm" icon={<Upload size={14} />} loading={logo.isPending} onClick={() => logoRef.current?.click()}>Upload logo</Button>
            </div>
            {text('name', 'Business name')}
            {text('legalName', 'Legal name (on invoices)')}
            {text('addressLine1', 'Address line 1', { span: true })}
            {text('addressLine2', 'Address line 2', { span: true })}
            {text('city', 'City')}
            <Field label="State" htmlFor="b-state" hint={`GST state code ${b.stateCode ?? '—'}`}>
              <Select id="b-state" value={v.state ?? ''} onChange={(e) => setV({ ...v, state: e.target.value })} options={STATES.map((s) => ({ value: s, label: s }))} />
            </Field>
            {text('pincode', 'Pincode', { max: 6 })}
            {text('phone', 'Phone')}
            {text('mobile', 'Mobile')}
            {text('email', 'Email')}
            {text('gstin', 'GSTIN', { upper: true, max: 15 })}
            {text('pan', 'PAN', { upper: true, max: 10 })}
            <Field label="Financial year starts" htmlFor="b-fy">
              <Select id="b-fy" value={String(v.financialYearStartMonth ?? 4)} onChange={(e) => setV({ ...v, financialYearStartMonth: Number(e.target.value) })}
                options={['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, i) => ({ value: String(i + 1), label: m }))} />
            </Field>
            {text('authorizedSignatory', 'Authorised signatory')}
            <Field label="Terms & conditions" htmlFor="b-terms" className="span-2"><Textarea id="b-terms" value={v.termsAndConditions ?? ''} onChange={(e) => setV({ ...v, termsAndConditions: e.target.value })} /></Field>
            {err && !err.details.length && <div className="span-2"><Alert tone="danger">{err.message}</Alert></div>}
            <div className="span-2 form-actions"><Button loading={save.isPending} onClick={() => save.mutate()}>Save profile</Button></div>
          </div>
        </Card>
      )}
    </QueryState>
  )
}

interface Bank { id: string; bankName: string; accountName?: string; accountNumber: string; ifsc: string; branch?: string; isDefault: boolean; active: boolean }

function BankSettings() {
  const qc = useQueryClient()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ bankName: '', accountName: '', accountNumber: '', ifsc: '', branch: '', isDefault: false })
  const q = useQuery({ queryKey: ['banks'], queryFn: () => api.get<Bank[]>('/api/v1/business/bank-accounts') })
  const add = useMutation({
    mutationFn: () => api.post('/api/v1/business/bank-accounts', { ...f, accountName: f.accountName || undefined, branch: f.branch || undefined }),
    onSuccess: () => { toast.success('Bank account added'); setOpen(false); qc.invalidateQueries({ queryKey: ['banks'] }) },
  })
  const makeDefault = useMutation({ mutationFn: (id: string) => api.patch(`/api/v1/business/bank-accounts/${id}`, { isDefault: true }), onSuccess: () => qc.invalidateQueries({ queryKey: ['banks'] }), onError: (e) => toast.error(e) })
  const err = add.error instanceof ApiError ? add.error : null
  return (
    <Card title="Bank accounts" padded={false} actions={<Button size="sm" icon={<Plus size={14} />} onClick={() => setOpen(true)}>Add account</Button>}>
      <QueryState query={q}>
        {(d) => (
          <DataTable rows={d} rowKey={(b) => b.id} columns={[
            { key: 'b', header: 'Bank', render: (b) => <div><strong>{b.bankName}</strong><div className="xs muted">{b.branch}</div></div> },
            { key: 'a', header: 'Account', render: (b) => <span className="mono">{b.accountNumber}</span> },
            { key: 'i', header: 'IFSC', render: (b) => <span className="mono">{b.ifsc}</span> },
            { key: 'd', header: '', render: (b) => (b.isDefault ? <Badge tone="primary">Printed on invoices</Badge> : <Button size="sm" variant="ghost" onClick={() => makeDefault.mutate(b.id)}>Make default</Button>) },
          ]} />
        )}
      </QueryState>
      <Modal open={open} onClose={() => setOpen(false)} title="Add bank account" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={add.isPending} onClick={() => add.mutate()}>Add</Button></>}>
        <div className="form-grid">
          <Field label="Bank name" htmlFor="bk-n" required><Input id="bk-n" value={f.bankName} onChange={(e) => setF({ ...f, bankName: e.target.value })} /></Field>
          <Field label="Account name" htmlFor="bk-an"><Input id="bk-an" value={f.accountName} onChange={(e) => setF({ ...f, accountName: e.target.value })} /></Field>
          <Field label="Account number" htmlFor="bk-a" required error={err?.fieldError('accountNumber')}><Input id="bk-a" inputMode="numeric" value={f.accountNumber} onChange={(e) => setF({ ...f, accountNumber: e.target.value.replace(/\D/g, '') })} /></Field>
          <Field label="IFSC" htmlFor="bk-i" required error={err?.fieldError('ifsc')}><Input id="bk-i" maxLength={11} value={f.ifsc} onChange={(e) => setF({ ...f, ifsc: e.target.value.toUpperCase() })} /></Field>
          <Field label="Branch" htmlFor="bk-b"><Input id="bk-b" value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })} /></Field>
          <div><Switch label="Print on invoices" checked={f.isDefault} onChange={(c) => setF({ ...f, isDefault: c })} /></div>
        </div>
      </Modal>
    </Card>
  )
}

function TaxSettings() {
  const qc = useQueryClient()
  const toast = useToast()
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
          <div className="form-grid">
            <div className="span-2"><Alert tone="warning" title="Validate with your tax advisor">GST treatment must be confirmed against current Indian GST rules before production use. Intra-state sales use CGST + SGST; inter-state sales use IGST, decided by seller and buyer state codes.</Alert></div>
            <Field label="Allowed GST rates (%)" htmlFor="tx-r" hint="Comma separated, e.g. 0, 5, 12, 18, 28"><Input id="tx-r" value={rates} onChange={(e) => setRates(e.target.value)} /></Field>
            <Field label="Default GST rate (%)" htmlFor="tx-d"><Input id="tx-d" type="number" value={def} onChange={(e) => setDef(e.target.value)} /></Field>
            <Field label="Calculation mode" htmlFor="tx-m" hint="Tax is added on top of the taxable value"><Input id="tx-m" value={titleCase(t.calculationMode)} disabled /></Field>
            <div><Switch label="Round invoice totals to the nearest rupee" checked={round} onChange={setRound} /></div>
            <div className="span-2 form-actions"><Button loading={save.isPending} onClick={() => save.mutate()}>Save tax settings</Button></div>
          </div>
        </Card>
      )}
    </QueryState>
  )
}
