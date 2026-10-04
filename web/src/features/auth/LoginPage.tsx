import { useMutation } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { ArrowLeft, Building2, ShieldCheck, Smartphone, Store } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Feedback'
import { useToast } from '@/components/ui/Toast'
import { Field, OTPInput, PhoneInput } from '@/components/ui/Form'
import { api, ApiError } from '@/services/api'
import type { AuthResponse, TenantChoice } from '@/services/api'
import { choiceKey, TenantPicker, useCompleteSignIn } from './TenantPicker'
import { Link } from 'react-router-dom'

interface Challenge {
  requestId: string
  maskedMobile: string
  expiresInSeconds: number
  resendAfterSeconds: number
  /** Present only when the server runs in demo mode (mock OTP provider, no SMS sent). */
  demoOtp?: string
}

/** The business a join link (/join/{code}) belongs to: the sign-in signs into, or registers with, that business. */
export interface JoinTenant {
  tenantCode: string
  name: string
  logoUrl?: string
  city?: string
}

/**
 * A02 Mobile Login + A03 OTP Verification. The role is never chosen by the user; it comes from the account (§4.1).
 * A number in several businesses picks one (§0B.4); new numbers continue to customer registration with a single-use
 * registration token — for the join link's business, or the default one.
 */
export function LoginPage({ join }: { join?: JoinTenant } = {}) {
  const complete = useCompleteSignIn()
  const [selection, setSelection] = useState<{ token: string; tenants: TenantChoice[] } | null>(null)
  const [mobile, setMobile] = useState('')
  const [otp, setOtp] = useState('')
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const toast = useToast()

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown((c) => c - 1), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  const request = useMutation({
    mutationFn: () => api.post<Challenge>('/api/v1/auth/otp/request', { mobileNumber: mobile }),
    onSuccess: (c) => {
      setChallenge(c)
      setOtp('')
      setCooldown(c.resendAfterSeconds)
      if (c.demoOtp) {
        const code = c.demoOtp
        toast.show('info', `Demo OTP: ${code}`, 'Demo mode: no SMS is sent. Use this code to sign in.', { duration: 20_000 })
      }
    },
  })

  const verify = useMutation({
    mutationFn: () => api.post<AuthResponse>('/api/v1/auth/otp/verify', {
      mobileNumber: mobile, otp, requestId: challenge!.requestId, tenantCode: join?.tenantCode,
    }),
    onSuccess: (r) => {
      if (complete(r, mobile) === 'selection') setSelection({ token: r.selectionToken!, tenants: r.tenants ?? [] })
    },
  })

  const select = useMutation({
    mutationFn: (c: TenantChoice) => api.post<AuthResponse>('/api/v1/auth/select-tenant',
      c.platform ? { platform: true } : { businessId: c.businessId }, { Authorization: `Bearer ${selection!.token}` }),
    onSuccess: (r) => complete(r, mobile),
  })

  useEffect(() => {
    if (otp.length === 6 && challenge && !verify.isPending) verify.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp])

  const mobileValid = /^[6-9]\d{9}$/.test(mobile)
  const requestError = request.error instanceof ApiError ? request.error : null
  const verifyError = verify.error instanceof ApiError ? verify.error : null
  const selectError = select.error instanceof ApiError ? select.error : null

  const submitMobile = (e: FormEvent) => {
    e.preventDefault()
    if (mobileValid) request.mutate()
  }
  const submitOtp = (e: FormEvent) => {
    e.preventDefault()
    if (otp.length === 6) verify.mutate()
  }

  return (
    <div className="auth-page">
      <section className="auth-hero" aria-hidden>
        <div className="row" style={{ color: '#fff', fontWeight: 700 }}>
          <span className="brand-mark"><Store size={18} /></span> {join ? join.name : 'ShopFlow'}
        </div>
        {join ? (
          <div className="stack" style={{ maxWidth: 480 }}>
            <h1>Order from {join.name}{join.city ? `, ${join.city}` : ''}.</h1>
            <p style={{ fontSize: '1.05rem', color: '#cbd5e1' }}>
              Sign in with your mobile number. New retailers register in one step and start ordering once the shop approves.
            </p>
          </div>
        ) : (
          <div className="stack" style={{ maxWidth: 480 }}>
            <h1>Run your wholesale business from one place.</h1>
            <p style={{ fontSize: '1.05rem', color: '#cbd5e1' }}>
              Orders, stock, GST invoices, credit and payments — for the shop team and every retailer you supply.
            </p>
          </div>
        )}
        <div className="row small" style={{ color: '#94a3b8' }}>
          <ShieldCheck size={16} /> Secure sign-in with a one-time password. No passwords to remember.
        </div>
      </section>
      <section className="auth-panel">
        <motion.div className="auth-card card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <div className="card-body stack" style={{ padding: 32 }}>
            {selection ? (
              <div className="stack">
                <div className="stack-sm">
                  <span className="stat-icon tone-primary" style={{ position: 'static' }}><Building2 size={18} /></span>
                  <h2>Choose a business</h2>
                  <p className="muted small">Your number is registered with more than one business. You can switch later from the menu.</p>
                </div>
                <TenantPicker choices={selection.tenants} busyKey={select.isPending ? choiceKey(select.variables!) : null} onPick={(c) => select.mutate(c)} />
                {selectError && <Alert tone="danger">{selectError.message}</Alert>}
                <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => { setSelection(null); setChallenge(null) }}>
                  <ArrowLeft size={14} /> Use another number
                </button>
              </div>
            ) : !challenge ? (
              <form onSubmit={submitMobile} className="stack" noValidate>
                <div className="stack-sm">
                  <span className="stat-icon tone-primary" style={{ position: 'static' }}><Smartphone size={18} /></span>
                  <h2>{join ? `Sign in to ${join.name}` : 'Sign in'}</h2>
                  <p className="muted small">
                    {join ? 'Enter your mobile number. If you are new to this shop, you can register with the same step.'
                      : 'Enter your registered mobile number. New retailers can register with the same step.'}
                  </p>
                </div>
                <Field label="Mobile number" htmlFor="mobile" error={requestError?.fieldError('mobileNumber')}>
                  <PhoneInput id="mobile" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))} autoFocus invalid={!!requestError?.fieldError('mobileNumber')} />
                </Field>
                {requestError && !requestError.fieldError('mobileNumber') && <Alert tone="danger">{requestError.message}</Alert>}
                <Button type="submit" size="lg" block loading={request.isPending} disabled={!mobileValid}>
                  Send OTP
                </Button>
                {!join && <p className="small muted" style={{ textAlign: 'center' }}>Run a business? <Link to="/signup">Get ShopFlow for your business</Link></p>}
              </form>
            ) : (
              <form onSubmit={submitOtp} className="stack" noValidate>
                <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setChallenge(null)}>
                  <ArrowLeft size={14} /> Change number
                </button>
                <div className="stack-sm">
                  <h2>Verify OTP</h2>
                  <p className="muted small">Enter the 6-digit code sent to <strong>{challenge.maskedMobile}</strong>. It expires in {Math.round(challenge.expiresInSeconds / 60)} minutes.</p>
                </div>
                <OTPInput value={otp} onChange={setOtp} autoFocus disabled={verify.isPending} />
                {verifyError && <Alert tone="danger">{verifyError.message}</Alert>}
                <Button type="submit" size="lg" block loading={verify.isPending} disabled={otp.length !== 6}>
                  Verify & continue
                </Button>
                <div className="row" style={{ justifyContent: 'center' }}>
                  <Button variant="ghost" size="sm" disabled={cooldown > 0 || request.isPending} onClick={() => request.mutate()}>
                    {cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}
                  </Button>
                </div>
                {challenge.demoOtp ? (
                  <p className="xs muted" style={{ textAlign: 'center' }}>
                    <span className="badge tone-warning">Demo mode</span> No SMS is sent. Your code is <strong>{challenge.demoOtp}</strong>.
                  </p>
                ) : import.meta.env.DEV && (
                  <p className="xs muted" style={{ textAlign: 'center' }}>Development: the mock OTP is printed in the backend log.</p>
                )}
              </form>
            )}
          </div>
        </motion.div>
      </section>
    </div>
  )
}
