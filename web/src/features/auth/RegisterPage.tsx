import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Navigate, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Feedback'
import { Field, Input, Select } from '@/components/ui/Form'
import { API_BASE, ApiError } from '@/services/api'
import type { ApiEnvelope, AuthResponse } from '@/services/api'
import { useAuthStore } from '@/stores/auth'

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/

export const registrationSchema = z.object({
  shopName: z.string().trim().min(2, 'Enter the shop or business name').max(200),
  contactName: z.string().trim().min(2, 'Enter the owner or contact name').max(200),
  addressLine1: z.string().trim().min(3, 'Enter the address').max(200),
  addressLine2: z.string().max(200).optional(),
  city: z.string().trim().min(2, 'Enter the city').max(100),
  state: z.string().min(2, 'Select the state'),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit pincode'),
  gstin: z.string().toUpperCase().refine((v) => !v || GSTIN.test(v), 'Enter a valid GSTIN').optional(),
  pan: z.string().toUpperCase().refine((v) => !v || PAN.test(v), 'Enter a valid PAN').optional(),
  email: z.string().refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Enter a valid email').optional(),
})

type FormValues = z.infer<typeof registrationSchema>

/** A04 Customer Registration: submitted with the single-use registration token from OTP verification (§4.2). */
export function RegisterPage() {
  const navigate = useNavigate()
  const reg = useAuthStore((s) => s.registration)
  const form = useForm<FormValues>({ resolver: zodResolver(registrationSchema), defaultValues: { state: 'Tamil Nadu' } })
  const submit = useMutation({
    mutationFn: async (v: FormValues) => {
      const res = await fetch(`${API_BASE}/api/v1/customer-registration`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${reg!.token}`, 'X-Client-Type': 'web' },
        body: JSON.stringify({
          shopName: v.shopName, contactName: v.contactName, gstin: v.gstin || undefined, pan: v.pan || undefined, email: v.email || undefined,
          address: { addressLine1: v.addressLine1, addressLine2: v.addressLine2 || undefined, city: v.city, state: v.state, pincode: v.pincode },
        }),
      })
      const body = (await res.json()) as ApiEnvelope<AuthResponse>
      if (!res.ok) throw new ApiError(res.status, body.error?.code ?? 'ERROR', body.error?.message ?? 'Registration failed', body.error?.details ?? [])
      return body.data
    },
    onSuccess: (r) => {
      useAuthStore.getState().setRegistration(null)
      useAuthStore.getState().setSession(r.accessToken!, r.user!)
      navigate('/registration-status', { replace: true })
    },
  })

  if (!reg) return <Navigate to="/login" replace />
  const err = submit.error instanceof ApiError ? submit.error : null
  const e = form.formState.errors

  return (
    <div className="auth-panel" style={{ minHeight: '100vh' }}>
      <div className="card" style={{ width: 'min(720px, 100%)' }}>
        <div className="card-body stack" style={{ padding: 28 }}>
          <div>
            <h2>Register your shop</h2>
            <p className="muted small">
              Mobile {reg.mobile} is verified.{reg.business ? <> You are registering with <strong>{reg.business.name}</strong>.</> : null} Your account
              will be reviewed by the shop before you can order.
            </p>
          </div>
          <form className="form-grid" onSubmit={form.handleSubmit((v) => submit.mutate(v))} noValidate>
            <Field label="Shop / business name" htmlFor="shopName" error={e.shopName?.message} required>
              <Input id="shopName" {...form.register('shopName')} invalid={!!e.shopName} />
            </Field>
            <Field label="Owner / contact person" htmlFor="contactName" error={e.contactName?.message} required>
              <Input id="contactName" {...form.register('contactName')} invalid={!!e.contactName} />
            </Field>
            <Field label="Address line 1" htmlFor="addressLine1" error={e.addressLine1?.message} required className="span-2">
              <Input id="addressLine1" {...form.register('addressLine1')} invalid={!!e.addressLine1} />
            </Field>
            <Field label="Address line 2" htmlFor="addressLine2" className="span-2">
              <Input id="addressLine2" {...form.register('addressLine2')} />
            </Field>
            <Field label="City" htmlFor="city" error={e.city?.message} required>
              <Input id="city" {...form.register('city')} invalid={!!e.city} />
            </Field>
            <Field label="State" htmlFor="state" error={e.state?.message} required>
              <Select id="state" {...form.register('state')} options={STATES.map((s) => ({ value: s, label: s }))} />
            </Field>
            <Field label="Pincode" htmlFor="pincode" error={e.pincode?.message} required>
              <Input id="pincode" inputMode="numeric" maxLength={6} {...form.register('pincode')} invalid={!!e.pincode} />
            </Field>
            <Field label="Email" htmlFor="email" error={e.email?.message}>
              <Input id="email" type="email" {...form.register('email')} invalid={!!e.email} />
            </Field>
            <Field label="GSTIN" htmlFor="gstin" error={e.gstin?.message ?? err?.fieldError('gstin')} hint="Required if you want GST input credit">
              <Input id="gstin" maxLength={15} style={{ textTransform: 'uppercase' }} {...form.register('gstin')} invalid={!!e.gstin} />
            </Field>
            <Field label="PAN" htmlFor="pan" error={e.pan?.message ?? err?.fieldError('pan')}>
              <Input id="pan" maxLength={10} style={{ textTransform: 'uppercase' }} {...form.register('pan')} invalid={!!e.pan} />
            </Field>
            {err && <div className="span-2"><Alert tone="danger">{err.message}</Alert></div>}
            <div className="span-2 form-actions">
              <Button variant="secondary" onClick={() => navigate('/login')}>Cancel</Button>
              <Button type="submit" loading={submit.isPending}>Submit registration</Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export const STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
]
