import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, KeyValue, StatusBadge } from '@/components/ui/Data'
import { Alert } from '@/components/ui/Feedback'
import { Field, Input } from '@/components/ui/Form'
import { useToast } from '@/components/ui/Toast'
import { api, ApiError } from '@/services/api'
import type { PortalAccess } from '@/services/types'
import { useCan, useModule } from '@/stores/auth'
import { dateTime } from '@/utils/format'

/** Supplier portal login of a supplier (SUPPLIER_PORTAL module): invite with a mobile number, or turn it off. */
export function PortalAccessCard({ supplierId, defaultMobile }: { supplierId: string; defaultMobile?: string }) {
  const enabled = useModule('SUPPLIER_PORTAL')
  const canWrite = useCan('SUPPLIER_WRITE')
  const qc = useQueryClient()
  const toast = useToast()
  const [mobile, setMobile] = useState((defaultMobile ?? '').replace('+91', ''))
  const q = useQuery({ queryKey: ['portal-access', supplierId], queryFn: () => api.get<PortalAccess>(`/api/v1/suppliers/${supplierId}/portal-access`), enabled })
  const invite = useMutation({
    mutationFn: () => api.post<PortalAccess>(`/api/v1/suppliers/${supplierId}/portal-access`, { mobileNumber: mobile }),
    onSuccess: (a) => { toast.success('Supplier can now sign in', a.mobileNumber); qc.setQueryData(['portal-access', supplierId], a) },
  })
  const revoke = useMutation({
    mutationFn: () => api.del<PortalAccess>(`/api/v1/suppliers/${supplierId}/portal-access`),
    onSuccess: (a) => { toast.success('Portal login turned off'); qc.setQueryData(['portal-access', supplierId], a) },
    onError: (e) => toast.error(e),
  })
  if (!enabled) return null
  const a = q.data
  const err = invite.error instanceof ApiError ? invite.error : null
  return (
    <Card title="Supplier portal">
      {a?.enabled ? (
        <div className="stack-sm">
          <KeyValue items={[['Login', a.mobileNumber], ['Status', <StatusBadge key="s" status={a.userStatus ?? 'ACTIVE'} />], ['Last sign-in', a.lastLoginAt ? dateTime(a.lastLoginAt) : 'Never']]} />
          <p className="xs muted">The supplier signs in with this number, sees only purchase orders you send them and replies with quotations.</p>
          {canWrite && <div><Button size="sm" variant="ghost" loading={revoke.isPending} onClick={() => revoke.mutate()}>Turn off login</Button></div>}
        </div>
      ) : (
        <div className="stack-sm">
          <p className="small muted">Let this supplier sign in to quote prices on your purchase orders.</p>
          {canWrite && (
            <>
              <Field label="Supplier's mobile" htmlFor="pa-mobile" error={err?.fieldError('mobileNumber')}>
                <Input id="pa-mobile" inputMode="numeric" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))} />
              </Field>
              {err && !err.details.length && <Alert tone="danger">{err.message}</Alert>}
              <div><Button size="sm" loading={invite.isPending} disabled={!/^[6-9]\d{9}$/.test(mobile)} onClick={() => invite.mutate()}>Invite to portal</Button></div>
            </>
          )}
        </div>
      )}
    </Card>
  )
}
