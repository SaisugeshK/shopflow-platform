import { useMutation } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { ArrowLeft, ShieldCheck, Smartphone, Store } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Feedback'
import { Field, OTPInput, PhoneInput } from '@/components/ui/Form'
import { api, ApiError } from '@/services/api'
import type { AuthResponse } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { homeFor } from './useSession'

interface Challenge {
  requestId: string
  maskedMobile: string
  expiresInSeconds: number
  resendAfterSeconds: number
}

/**
 * A02 Mobile Login + A03 OTP Verification. The role is never chosen by the user; it comes from the account (§4.1).
 * New numbers continue to customer registration with a single-use registration token.
 */
export function LoginPage() {
  const navigate = useNavigate()
  const [mobile, setMobile] = useState('')
  const [otp, setOtp] = useState('')
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [cooldown, setCooldown] = useState(0)

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
    },
  })

  const verify = useMutation({
    mutationFn: () => api.post<AuthResponse>('/api/v1/auth/otp/verify', { mobileNumber: mobile, otp, requestId: challenge!.requestId }),
    onSuccess: (r) => {
      if (r.registrationRequired) {
        useAuthStore.getState().setRegistration({ token: r.registrationToken!, mobile })
        navigate('/register', { replace: true })
        return
      }
      useAuthStore.getState().setSession(r.accessToken!, r.user!)
      navigate(homeFor(r.user!.role, r.user!.customer?.status), { replace: true })
    },
  })

  useEffect(() => {
    if (otp.length === 6 && challenge && !verify.isPending) verify.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp])

  const mobileValid = /^[6-9]\d{9}$/.test(mobile)
  const requestError = request.error instanceof ApiError ? request.error : null
  const verifyError = verify.error instanceof ApiError ? verify.error : null

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
          <span className="brand-mark"><Store size={18} /></span> ShopFlow
        </div>
        <div className="stack" style={{ maxWidth: 480 }}>
          <h1>Run your wholesale business from one place.</h1>
          <p style={{ fontSize: '1.05rem', color: '#cbd5e1' }}>
            Orders, stock, GST invoices, credit and payments — for the shop team and every retailer you supply.
          </p>
        </div>
        <div className="row small" style={{ color: '#94a3b8' }}>
          <ShieldCheck size={16} /> Secure sign-in with a one-time password. No passwords to remember.
        </div>
      </section>
      <section className="auth-panel">
        <motion.div className="auth-card card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <div className="card-body stack" style={{ padding: 32 }}>
            {!challenge ? (
              <form onSubmit={submitMobile} className="stack" noValidate>
                <div className="stack-sm">
                  <span className="stat-icon tone-primary" style={{ position: 'static' }}><Smartphone size={18} /></span>
                  <h2>Sign in</h2>
                  <p className="muted small">Enter your registered mobile number. New retailers can register with the same step.</p>
                </div>
                <Field label="Mobile number" htmlFor="mobile" error={requestError?.fieldError('mobileNumber')}>
                  <PhoneInput id="mobile" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))} autoFocus invalid={!!requestError?.fieldError('mobileNumber')} />
                </Field>
                {requestError && !requestError.fieldError('mobileNumber') && <Alert tone="danger">{requestError.message}</Alert>}
                <Button type="submit" size="lg" block loading={request.isPending} disabled={!mobileValid}>
                  Send OTP
                </Button>
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
                {import.meta.env.DEV && (
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
