import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, Store } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Feedback'
import { Field, Input, OTPInput, PhoneInput, Select, Textarea } from '@/components/ui/Form'
import { api, ApiError } from '@/services/api'
import { GST_STATES, stateCodeOf } from '@/utils/india'
import { PoweredBy } from '@/components/layout/BusinessBrand'

interface Challenge { requestId: string; maskedMobile: string; expiresInSeconds: number; demoOtp?: string }

/**
 * Business self-signup (§0B.14): the owner proves the mobile number with an OTP and tells us about the business. The
 * ShopFlow team approves the request; the owner then signs in with the same number.
 */
export function SignupPage() {
  const [mobile, setMobile] = useState('')
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [otp, setOtp] = useState('')
  const [f, setF] = useState({ businessName: '', ownerName: '', state: 'Tamil Nadu', city: '', gstin: '', email: '', industry: 'GROCERY', message: '' })
  const [done, setDone] = useState(false)
  const industries = useQuery({ queryKey: ['public-industries'], queryFn: () => api.get<{ code: string; label: string; description: string }[]>('/api/v1/public/industries') })
  const sendOtp = useMutation({
    mutationFn: () => api.post<Challenge>('/api/v1/public/signup/otp', { mobileNumber: mobile }),
    onSuccess: setChallenge,
  })
  const submit = useMutation({
    mutationFn: () => api.post('/api/v1/public/signup', {
      requestId: challenge!.requestId, otp, mobileNumber: mobile, businessName: f.businessName, ownerName: f.ownerName, state: f.state,
      stateCode: stateCodeOf(f.state), city: f.city || undefined, gstin: f.gstin || undefined, email: f.email || undefined,
      industry: f.industry, message: f.message || undefined,
    }),
    onSuccess: () => setDone(true),
  })
  const err = (sendOtp.error ?? submit.error) instanceof ApiError ? (sendOtp.error ?? submit.error) as ApiError : null
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const valid = !!challenge && otp.length === 6 && f.businessName.trim().length >= 2 && f.ownerName.trim().length >= 2
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!challenge) { if (/^[6-9]\d{9}$/.test(mobile)) sendOtp.mutate() } else if (valid) submit.mutate()
  }
  return (
    <div className="auth-panel" style={{ minHeight: '100vh', padding: 16 }}>
      <div className="card" style={{ width: 'min(640px, 100%)' }}>
        <div className="card-body stack">
          <Link to="/login" className="row small" style={{ gap: 4 }}><ArrowLeft size={14} /> Back to sign in</Link>
          <div className="row" style={{ gap: 10 }}><span className="brand-mark"><Store size={18} /></span><h1 style={{ margin: 0 }}>Get ShopFlow for your business</h1></div>
          {done ? (
            <div className="stack" role="status">
              <Alert tone="success" title="Request received">
                We will check your details and switch your business on. You will then sign in with {challenge?.maskedMobile ?? 'your mobile number'}.
              </Alert>
              <Link to="/login" className="btn btn-primary">Go to sign in</Link>
            </div>
          ) : (
            <form className="stack" onSubmit={onSubmit} noValidate>
              <Field label="Your mobile number" htmlFor="su-mobile" required hint="You will sign in with this number">
                <PhoneInput id="su-mobile" value={mobile} disabled={!!challenge} onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))} />
              </Field>
              {!challenge ? (
                <Button type="submit" loading={sendOtp.isPending} disabled={!/^[6-9]\d{9}$/.test(mobile)}>Send OTP</Button>
              ) : (
                <Field label="OTP" htmlFor="su-otp" required hint={challenge.demoOtp ? `Demo mode: your code is ${challenge.demoOtp}` : `Sent to ${challenge.maskedMobile}`}>
                  <div style={{ display: 'flex' }}><OTPInput value={otp} onChange={setOtp} /></div>
                </Field>
              )}
              {challenge && (
                <>
                  <div className="form-grid">
                    <Field label="Business name" htmlFor="su-name" required className="span-2"><Input id="su-name" value={f.businessName} onChange={set('businessName')} maxLength={200} /></Field>
                    <Field label="Your name" htmlFor="su-owner" required><Input id="su-owner" value={f.ownerName} onChange={set('ownerName')} maxLength={200} /></Field>
                    <Field label="Email" htmlFor="su-email"><Input id="su-email" type="email" value={f.email} onChange={set('email')} /></Field>
                    <Field label="State" htmlFor="su-state" required><Select id="su-state" value={f.state} onChange={set('state')} options={GST_STATES.map((s) => ({ value: s.name, label: s.name }))} /></Field>
                    <Field label="City" htmlFor="su-city"><Input id="su-city" value={f.city} onChange={set('city')} /></Field>
                    <Field label="GSTIN" htmlFor="su-gstin" error={err?.fieldError('gstin')}><Input id="su-gstin" value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value.toUpperCase() })} maxLength={15} /></Field>
                    <Field label="Trade" htmlFor="su-ind" required><Select id="su-ind" value={f.industry} onChange={set('industry')} options={(industries.data ?? []).map((i) => ({ value: i.code, label: i.label }))} /></Field>
                    <Field label="Anything we should know?" htmlFor="su-msg" className="span-2"><Textarea id="su-msg" value={f.message} onChange={set('message')} maxLength={1000} /></Field>
                  </div>
                  <Button type="submit" size="lg" icon={<CheckCircle2 size={18} />} loading={submit.isPending} disabled={!valid}>Send request</Button>
                </>
              )}
              {err && !err.fieldError('gstin') && <Alert tone="danger">{err.message}</Alert>}
            </form>
          )}
        </div>
        <PoweredBy className="auth-credit" />
      </div>
    </div>
  )
}
