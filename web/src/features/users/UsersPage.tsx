import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Badge, Card, DataTable, PageHeader, Pagination, StatusBadge } from '@/components/ui/Data'
import { Alert, EmptyState, QueryState } from '@/components/ui/Feedback'
import { Checkbox, Field, Input, PhoneInput } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Overlay'
import { useToast } from '@/components/ui/Toast'
import { api, ApiError } from '@/services/api'
import type { StaffUser } from '@/services/types'
import { useAuthStore } from '@/stores/auth'
import { dateTime, titleCase } from '@/utils/format'

interface PermissionInfo { code: string; description: string }

/** O23 Admin users + O24 Permissions (§3.2: permissions separate from roles). */
export function UsersPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const me = useAuthStore((s) => s.user)
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<StaffUser | null>(null)
  const q = useQuery({ queryKey: ['users', page], queryFn: () => api.page<StaffUser>('/api/v1/users', { page, pageSize: 20 }) })
  const toggle = useMutation({
    mutationFn: (u: StaffUser) => api.post(`/api/v1/users/${u.id}/${u.status === 'ACTIVE' ? 'deactivate' : 'activate'}`),
    onSuccess: () => { toast.success('User updated'); qc.invalidateQueries({ queryKey: ['users'] }) },
    onError: (e) => toast.error(e),
  })
  return (
    <div className="stack">
      <PageHeader title="Users" subtitle="Owner and Admin accounts. Deactivating signs the user out everywhere." actions={<Button icon={<UserPlus size={16} />} onClick={() => setCreating(true)}>Add admin</Button>} />
      <Card padded={false}>
        <QueryState query={q} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No users" />}>
          {(d) => (
            <>
              <DataTable rows={d.items} rowKey={(u) => u.id} columns={[
                { key: 'n', header: 'Name', render: (u) => <div><div style={{ fontWeight: 600 }}>{u.fullName}</div><div className="xs muted">{u.mobileNumber}</div></div> },
                { key: 'r', header: 'Role', render: (u) => <Badge tone={u.role === 'OWNER' ? 'purple' : 'primary'}>{titleCase(u.role)}</Badge> },
                { key: 's', header: 'Status', render: (u) => <StatusBadge status={u.status} /> },
                { key: 'p', header: 'Extra permissions', render: (u) => (u.extraPermissions.length ? <span className="small">{u.extraPermissions.map(titleCase).join(', ')}</span> : <span className="muted small">Role default</span>) },
                { key: 'l', header: 'Last sign-in', render: (u) => dateTime(u.lastLoginAt) },
                { key: 'a', header: '', render: (u) => u.role === 'ADMIN' && u.id !== me?.id && (
                  <div className="row" style={{ justifyContent: 'flex-end' }}>
                    <Button size="sm" variant="ghost" icon={<KeyRound size={14} />} onClick={() => setEditing(u)}>Permissions</Button>
                    <Button size="sm" variant="ghost" loading={toggle.isPending && toggle.variables?.id === u.id} onClick={() => toggle.mutate(u)}>{u.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</Button>
                  </div>
                ) },
              ]} />
              <Pagination meta={d.pagination} onPage={setPage} />
            </>
          )}
        </QueryState>
      </Card>
      <CreateAdminDialog open={creating} onClose={() => setCreating(false)} />
      <PermissionsDialog user={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

function CreateAdminDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [mobile, setMobile] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  useEffect(() => { if (open) { setMobile(''); setName(''); setEmail('') } }, [open])
  const save = useMutation({
    mutationFn: () => api.post('/api/v1/users', { mobileNumber: mobile, fullName: name, email: email || undefined }),
    onSuccess: () => { toast.success('Admin created', 'They can sign in with their mobile number'); qc.invalidateQueries({ queryKey: ['users'] }); onClose() },
  })
  const err = save.error instanceof ApiError ? save.error : null
  return (
    <Modal open={open} onClose={onClose} title="Add admin user" footer={
      <><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={!/^[6-9]\d{9}$/.test(mobile) || name.trim().length < 2} onClick={() => save.mutate()}>Create admin</Button></>
    }>
      <div className="stack">
        <Field label="Mobile number" htmlFor="u-m" required error={err?.fieldError('mobileNumber')}><PhoneInput id="u-m" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="Full name" htmlFor="u-n" required><Input id="u-n" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Email" htmlFor="u-e"><Input id="u-e" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        {err && !err.details.length && <Alert tone="danger">{err.message}</Alert>}
      </div>
    </Modal>
  )
}

function PermissionsDialog({ user, onClose }: { user: StaffUser | null; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const all = useQuery({ queryKey: ['permissions'], queryFn: () => api.get<PermissionInfo[]>('/api/v1/permissions'), enabled: !!user })
  const [selected, setSelected] = useState<string[]>([])
  useEffect(() => { if (user) setSelected(user.extraPermissions) }, [user])
  const save = useMutation({
    mutationFn: () => api.put(`/api/v1/users/${user!.id}/permissions`, { permissions: selected }),
    onSuccess: () => { toast.success('Permissions updated', 'Applies on the user’s next token refresh'); qc.invalidateQueries({ queryKey: ['users'] }); onClose() },
    onError: (e) => toast.error(e),
  })
  const roleDefault = (user?.effectivePermissions ?? []).filter((p) => !user?.extraPermissions.includes(p))
  const grantable = (all.data ?? []).filter((p) => !['CUSTOMER_SELF', 'CATALOG_BROWSE'].includes(p.code) && !roleDefault.includes(p.code))
  return (
    <Modal open={!!user} onClose={onClose} title={`Extra permissions · ${user?.fullName ?? ''}`} wide footer={
      <><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} onClick={() => save.mutate()}>Save</Button></>
    }>
      <div className="stack">
        <p className="small muted">The Admin role already includes: {roleDefault.map(titleCase).join(', ') || '—'}. Grant additional permissions below.</p>
        <div className="grid-2">
          {grantable.map((p) => (
            <Checkbox key={p.code} checked={selected.includes(p.code)} onChange={(v) => setSelected(v ? [...selected, p.code] : selected.filter((x) => x !== p.code))}
              label={<span><strong className="small">{titleCase(p.code)}</strong><span className="xs muted" style={{ display: 'block' }}>{p.description}</span></span>} />
          ))}
        </div>
      </div>
    </Modal>
  )
}
