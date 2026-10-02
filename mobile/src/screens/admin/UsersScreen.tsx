import { Feather } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import { RequirePermission } from '@/components/admin/RequirePermission'
import { Button } from '@/components/ui/Button'
import { Badge, ListRow, StatusBadge } from '@/components/ui/Data'
import { Alert, EmptyState, Spinner } from '@/components/ui/Feedback'
import { Field, Input, PhoneInput } from '@/components/ui/Form'
import { Sheet } from '@/components/ui/Overlay'
import { PagedList } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { toast } from '@/components/ui/Toast'
import { api, ApiError } from '@/services/api'
import type { StaffUser } from '@/services/types'
import { useAuthStore } from '@/store/auth'
import { colors } from '@/theme/tokens'
import { dateTime, titleCase } from '@/utils/format'
import { MOBILE } from '@/utils/india'

interface PermissionInfo { code: string; description: string }

/** O23 Admin users + O24 Permissions (§3.2: permissions are separate from roles). */
export default function UsersScreen() {
  const me = useAuthStore((s) => s.user)
  const [creating, setCreating] = useState(false)
  const [open, setOpen] = useState<StaffUser | null>(null)
  return (
    <RequirePermission anyOf={['USER_MANAGE']}>
      <PagedList<StaffUser>
        queryKey={['users']}
        fetchPage={(page, pageSize) => api.page<StaffUser>('/api/v1/users', { page, pageSize })}
        keyOf={(u) => u.id}
        header={
          <View style={{ gap: 10 }}>
            <Alert>Owner and Admin accounts. Deactivating signs the user out everywhere.</Alert>
            <Button icon="user-plus" onPress={() => setCreating(true)}>Add admin</Button>
          </View>
        }
        empty={<EmptyState icon="users" title="No users" />}
        renderItem={(u) => (
          <ListRow onPress={u.role === 'ADMIN' && u.id !== me?.id ? () => setOpen(u) : undefined} title={u.fullName}
            subtitle={`${u.mobileNumber} · last sign-in ${dateTime(u.lastLoginAt)}`}
            meta={<View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}><Badge tone={u.role === 'OWNER' ? 'purple' : 'primary'}>{titleCase(u.role)}</Badge><StatusBadge status={u.status} />{u.extraPermissions.length > 0 && <Badge tone="accent">{`+${u.extraPermissions.length} permissions`}</Badge>}</View>} />
        )}
      />
      <CreateAdminSheet open={creating} onClose={() => setCreating(false)} />
      <UserSheet user={open} onClose={() => setOpen(null)} />
    </RequirePermission>
  )
}

function CreateAdminSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
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
    <Sheet open={open} onClose={onClose} title="Add admin user" footer={
      <Button block loading={save.isPending} disabled={!MOBILE.test(mobile) || name.trim().length < 2} onPress={() => save.mutate()}>Create admin</Button>
    }>
      <Field label="Mobile number" required error={err?.fieldError('mobileNumber')}><PhoneInput value={mobile} onChangeText={(t) => setMobile(t.replace(/\D/g, ''))} accessibilityLabel="Mobile number" /></Field>
      <Field label="Full name" required><Input value={name} onChangeText={setName} accessibilityLabel="Full name" /></Field>
      <Field label="Email"><Input value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" accessibilityLabel="Email" /></Field>
      {err && !err.details.length && <Alert tone="danger">{err.message}</Alert>}
    </Sheet>
  )
}

/** Extra permissions + activate/deactivate for an Admin. */
function UserSheet({ user, onClose }: { user: StaffUser | null; onClose: () => void }) {
  const qc = useQueryClient()
  const all = useQuery({ queryKey: ['permissions'], queryFn: () => api.get<PermissionInfo[]>('/api/v1/permissions'), enabled: !!user })
  const [selected, setSelected] = useState<string[]>([])
  useEffect(() => { if (user) setSelected(user.extraPermissions) }, [user])
  const save = useMutation({
    mutationFn: () => api.put(`/api/v1/users/${user!.id}/permissions`, { permissions: selected }),
    onSuccess: () => { toast.success('Permissions updated', 'Applies on the user’s next token refresh'); qc.invalidateQueries({ queryKey: ['users'] }); onClose() },
    onError: (e) => toast.error(e),
  })
  const toggle = useMutation({
    mutationFn: () => api.post(`/api/v1/users/${user!.id}/${user!.status === 'ACTIVE' ? 'deactivate' : 'activate'}`),
    onSuccess: () => { toast.success('User updated'); qc.invalidateQueries({ queryKey: ['users'] }); onClose() },
    onError: (e) => toast.error(e),
  })
  const roleDefault = (user?.effectivePermissions ?? []).filter((p) => !user?.extraPermissions.includes(p))
  const grantable = (all.data ?? []).filter((p) => !['CUSTOMER_SELF', 'CATALOG_BROWSE'].includes(p.code) && !roleDefault.includes(p.code))
  return (
    <Sheet open={!!user} onClose={onClose} title={user?.fullName ?? ''} footer={
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button variant={user?.status === 'ACTIVE' ? 'danger' : 'success'} style={{ flex: 1 }} loading={toggle.isPending} onPress={() => toggle.mutate()}>{user?.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</Button>
        <Button style={{ flex: 1 }} loading={save.isPending} onPress={() => save.mutate()}>Save permissions</Button>
      </View>
    }>
      <Text variant="small" color="muted">The Admin role already includes: {roleDefault.map(titleCase).join(', ') || '—'}. Grant additional permissions below.</Text>
      {all.isLoading ? <Spinner /> : grantable.map((p) => {
        const on = selected.includes(p.code)
        return (
          <Pressable key={p.code} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => setSelected(on ? selected.filter((x) => x !== p.code) : [...selected, p.code])}
            style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 6 }}>
            <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: on ? colors.primary : colors.borderStrong, backgroundColor: on ? colors.primary : colors.surface, alignItems: 'center', justifyContent: 'center' }}>
              {on && <Feather name="check" size={14} color={colors.white} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="small" weight="700">{titleCase(p.code)}</Text>
              <Text variant="xs" color="muted">{p.description}</Text>
            </View>
          </Pressable>
        )
      })}
    </Sheet>
  )
}
