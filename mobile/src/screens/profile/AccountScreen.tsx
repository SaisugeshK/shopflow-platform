import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { Button, IconButton } from '@/components/ui/Button'
import { Card, KeyValue, ListRow } from '@/components/ui/Data'
import { EmptyState, QueryState } from '@/components/ui/Feedback'
import { Field, Input, Select } from '@/components/ui/Form'
import { ConfirmDialog, Sheet } from '@/components/ui/Overlay'
import { Screen } from '@/components/ui/Screen'
import { PoweredBy } from '@/components/ui/BusinessBrand'
import { BusinessSwitcher } from '@/components/ui/TenantPicker'
import { Text } from '@/components/ui/Text'
import { toast } from '@/components/ui/Toast'
import { useSignOut } from '@/features/session'
import { api } from '@/services/api'
import type { Address, CustomerDetail } from '@/services/types'
import { useModule } from '@/store/auth'
import { colors } from '@/theme/tokens'
import { STATE_OPTIONS } from '@/utils/india'

const EMPTY_ADDRESS = { label: '', addressLine1: '', addressLine2: '', city: '', state: 'Tamil Nadu', pincode: '' }

/** C14 Profile, C15 Business details, C16 Addresses, plus links to account records. */
export default function AccountScreen() {
  const qc = useQueryClient()
  const signOut = useSignOut()
  const quotationsOn = useModule('QUOTATIONS')
  const projectsOn = useModule('PROJECT_ACCOUNTS')
  const [adding, setAdding] = useState(false)
  const [a, setA] = useState(EMPTY_ADDRESS)
  const [edit, setEdit] = useState<{ email: string; alternateMobile: string; gstin: string } | null>(null)
  const [removing, setRemoving] = useState<Address | null>(null)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const q = useQuery({ queryKey: ['my-profile'], queryFn: () => api.get<CustomerDetail>('/api/v1/my/profile') })
  const refreshAddresses = () => {
    qc.invalidateQueries({ queryKey: ['my-profile'] })
    qc.invalidateQueries({ queryKey: ['my-addresses'] })
  }
  const saveProfile = useMutation({
    mutationFn: () => api.patch('/api/v1/my/profile', { email: edit!.email || undefined, alternateMobile: edit!.alternateMobile || undefined, gstin: edit!.gstin || undefined }),
    onSuccess: () => { toast.success('Profile updated'); setEdit(null); qc.invalidateQueries({ queryKey: ['my-profile'] }) },
    onError: (e) => toast.error(e),
  })
  const addAddress = useMutation({
    mutationFn: () => api.post('/api/v1/my/addresses', { ...a, label: a.label || undefined, addressLine2: a.addressLine2 || undefined }),
    onSuccess: () => { toast.success('Address added'); setAdding(false); setA(EMPTY_ADDRESS); refreshAddresses() },
    onError: (e) => toast.error(e),
  })
  const removeAddress = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/my/addresses/${id}`),
    onSuccess: () => { toast.success('Address removed'); setRemoving(null); refreshAddresses() },
    onError: (e) => toast.error(e),
  })
  const addressValid = a.addressLine1.trim().length >= 3 && a.city.trim().length >= 2 && /^[1-9]\d{5}$/.test(a.pincode)

  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <QueryState query={q}>
        {(c) => (
          <>
            <Card title="Business details" actions={<Button size="sm" variant="secondary" icon="edit-2" onPress={() => setEdit({ email: c.email ?? '', alternateMobile: c.alternateMobile?.replace('+91', '') ?? '', gstin: c.gstin ?? '' })}>Edit</Button>}>
              <KeyValue items={[['Shop', c.shopName], ['Customer code', c.customerCode], ['Contact', c.contactName], ['Mobile', c.mobileNumber], ['Alternate', c.alternateMobile], ['Email', c.email], ['GSTIN', c.gstin], ['PAN', c.pan]]} />
            </Card>
            <Card title="Addresses" actions={<Button size="sm" icon="plus" onPress={() => setAdding(true)}>Add</Button>}>
              {c.addresses.length === 0 ? <EmptyState icon="map-pin" title="No addresses" /> : (
                <View style={{ gap: 10 }}>
                  {c.addresses.map((ad) => (
                    <View key={ad.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text variant="small">{ad.label ? <Text variant="small" weight="700">{ad.label}: </Text> : null}{ad.addressLine1}, {ad.city}, {ad.state} – {ad.pincode}</Text>
                        {ad.isDefault && <Text variant="xs" color="primary" weight="600">Default</Text>}
                      </View>
                      <IconButton icon="trash-2" label="Remove address" color={colors.danger} onPress={() => setRemoving(ad)} />
                    </View>
                  ))}
                </View>
              )}
            </Card>
          </>
        )}
      </QueryState>
      <Card padded={false}>
        <ListRow icon="file-text" title="Invoices" onPress={() => router.push('/shop/invoices')} />
        <ListRow icon="credit-card" title="Payment history" onPress={() => router.push('/shop/payments')} />
        <ListRow icon="book-open" title="Credit & statement" onPress={() => router.push('/shop/outstanding')} />
        <ListRow icon="rotate-ccw" title="Returns" onPress={() => router.push('/shop/returns')} />
        {quotationsOn && <ListRow icon="file-text" title="Quotations" onPress={() => router.push('/shop/quotations')} />}
        {projectsOn && <ListRow icon="map-pin" title="Projects" onPress={() => router.push('/shop/projects')} />}
        <ListRow icon="bell" title="Notifications" onPress={() => router.push('/shop/notifications')} />
      </Card>
      <BusinessSwitcher />
      <Text variant="xs" color="muted" align="center">To change the shop name or registered mobile, contact the shop.</Text>
      <Button variant="secondary" icon="log-out" onPress={() => setConfirmSignOut(true)}>Sign out</Button>
      <PoweredBy />

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add address" footer={<Button block loading={addAddress.isPending} disabled={!addressValid} onPress={() => addAddress.mutate()}>Save address</Button>}>
        <Field label="Label"><Input value={a.label} onChangeText={(t) => setA({ ...a, label: t })} placeholder="e.g. Godown" accessibilityLabel="Label" /></Field>
        <Field label="Address line 1" required><Input value={a.addressLine1} onChangeText={(t) => setA({ ...a, addressLine1: t })} accessibilityLabel="Address line 1" /></Field>
        <Field label="Address line 2"><Input value={a.addressLine2} onChangeText={(t) => setA({ ...a, addressLine2: t })} accessibilityLabel="Address line 2" /></Field>
        <Field label="City" required><Input value={a.city} onChangeText={(t) => setA({ ...a, city: t })} accessibilityLabel="City" /></Field>
        <Field label="State" required><Select label="State" value={a.state} onChange={(s) => setA({ ...a, state: s })} options={STATE_OPTIONS} searchable /></Field>
        <Field label="Pincode" required><Input value={a.pincode} onChangeText={(t) => setA({ ...a, pincode: t.replace(/\D/g, '') })} keyboardType="number-pad" maxLength={6} accessibilityLabel="Pincode" /></Field>
      </Sheet>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title="Edit business details" footer={<Button block loading={saveProfile.isPending} onPress={() => saveProfile.mutate()}>Save</Button>}>
        {edit && (
          <>
            <Field label="Email"><Input value={edit.email} onChangeText={(t) => setEdit({ ...edit, email: t.trim() })} keyboardType="email-address" autoCapitalize="none" accessibilityLabel="Email" /></Field>
            <Field label="Alternate mobile"><Input value={edit.alternateMobile} onChangeText={(t) => setEdit({ ...edit, alternateMobile: t.replace(/\D/g, '') })} keyboardType="phone-pad" maxLength={10} accessibilityLabel="Alternate mobile" /></Field>
            <Field label="GSTIN"><Input value={edit.gstin} onChangeText={(t) => setEdit({ ...edit, gstin: t.toUpperCase() })} autoCapitalize="characters" maxLength={15} accessibilityLabel="GSTIN" /></Field>
          </>
        )}
      </Sheet>

      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} title="Remove this address?" tone="danger" confirmLabel="Remove" loading={removeAddress.isPending}
        message={removing ? `${removing.addressLine1}, ${removing.city}` : undefined} onConfirm={() => removing && removeAddress.mutate(removing.id)} />
      <ConfirmDialog open={confirmSignOut} onClose={() => setConfirmSignOut(false)} title="Sign out?" confirmLabel="Sign out" onConfirm={() => { setConfirmSignOut(false); signOut() }} />
    </Screen>
  )
}
