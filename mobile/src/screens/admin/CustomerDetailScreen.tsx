import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { ProductPickerButton } from '@/components/admin/Pickers'
import { RecordPaymentSheet } from '@/components/admin/RecordPaymentSheet'
import { RequirePermission } from '@/components/admin/RequirePermission'
import { Ledger } from '@/components/shared/Ledger'
import { Button, IconButton } from '@/components/ui/Button'
import { Card, KeyValue, ListRow, StatCard, StatusBadge } from '@/components/ui/Data'
import { Alert, EmptyState, ErrorState, ListSkeleton, QueryState } from '@/components/ui/Feedback'
import { ChipGroup, Field, Input, MoneyInput, Select, SwitchRow } from '@/components/ui/Form'
import { ConfirmDialog, Sheet } from '@/components/ui/Overlay'
import { Grid, Screen, useColumns } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { toast } from '@/components/ui/Toast'
import { api, type Paged } from '@/services/api'
import type { CustomerDetail, Invoice, Order, Payment } from '@/services/types'
import { useCan } from '@/store/auth'
import { colors } from '@/theme/tokens'
import { date, dateTime, money, titleCase } from '@/utils/format'

type Tab = 'overview' | 'orders' | 'invoices' | 'payments' | 'ledger' | 'prices'

/** O14/O15 Customer detail (§16): status actions, credit, orders, invoices, payments, ledger, special prices. */
export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const qc = useQueryClient()
  const canWrite = useCan('CUSTOMER_WRITE')
  const canPay = useCan('PAYMENT_WRITE')
  const [tab, setTab] = useState<Tab>('overview')
  const [dialog, setDialog] = useState<'reject' | 'block' | 'credit' | 'payment' | null>(null)
  const columns = Math.max(2, Math.min(4, useColumns(160)))
  const q = useQuery({ queryKey: ['customer', id], queryFn: () => api.get<CustomerDetail>(`/api/v1/customers/${id}`) })
  const refresh = () => { qc.invalidateQueries({ queryKey: ['customer', id] }); qc.invalidateQueries({ queryKey: ['customers'] }); qc.invalidateQueries({ queryKey: ['ledger'] }) }
  const status = useMutation({
    mutationFn: ({ path, reason }: { path: string; reason?: string }) => api.post<CustomerDetail>(`/api/v1/customers/${id}/${path}`, { reason }),
    onSuccess: (c) => { toast.success(`Customer ${titleCase(c.status)}`); setDialog(null); refresh() },
    onError: (e) => toast.error(e),
  })
  const c = q.data
  const footer = c && (canWrite || canPay) ? (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      {canWrite && c.status === 'PENDING_APPROVAL' && <Button variant="danger" icon="x" style={{ flex: 1 }} onPress={() => setDialog('reject')}>Reject</Button>}
      {canWrite && c.status !== 'APPROVED' && c.status !== 'REJECTED' && <Button variant="success" icon="check" style={{ flex: 1 }} loading={status.isPending} onPress={() => status.mutate({ path: 'approve' })}>{c.status === 'BLOCKED' ? 'Unblock' : 'Approve'}</Button>}
      {canWrite && c.status === 'APPROVED' && <Button variant="secondary" icon="slash" style={{ flex: 1 }} onPress={() => setDialog('block')}>Block</Button>}
      {canPay && c.status === 'APPROVED' && <Button icon="credit-card" style={{ flex: 1.4 }} onPress={() => setDialog('payment')}>Record payment</Button>}
    </View>
  ) : undefined

  return (
    <RequirePermission anyOf={['CUSTOMER_READ']}>
      <Stack.Screen options={{ title: c?.shopName ?? 'Customer' }} />
      <Screen onRefresh={refresh} refreshing={q.isRefetching} footer={footer}>
        <QueryState query={q}>
          {(c) => (
            <>
              <View style={{ gap: 6 }}>
                <Text variant="small" color="muted">{c.customerCode} · {c.contactName} · {c.mobileNumber}</Text>
                <StatusBadge status={c.status} />
              </View>
              {c.statusReason && <Alert tone={c.status === 'APPROVED' ? 'primary' : 'warning'} title={`Status note (${date(c.statusChangedAt)})`}>{c.statusReason}</Alert>}
              <Grid columns={columns}>
                {[
                  <StatCard key="o" label="Outstanding" value={c.outstanding.ledgerBalance} tone="warning" compact hint={`${c.outstanding.openInvoiceCount} open invoices`} />,
                  <StatCard key="d" label="Overdue" value={c.outstanding.overdueAmount} tone="danger" compact hint={c.outstanding.oldestDueDate ? `Oldest ${date(c.outstanding.oldestDueDate)}` : 'Nothing overdue'} />,
                  <StatCard key="l" label="Credit limit" value={c.credit.creditLimit} tone="primary" compact hint={c.credit.creditEnabled ? `${c.credit.creditDays} days` : 'Credit disabled'} />,
                  <StatCard key="a" label="Available" value={c.outstanding.availableCredit} tone="success" compact />,
                ]}
              </Grid>
              <ChipGroup value={tab} onChange={(t) => setTab(t as Tab)} options={[
                { value: 'overview', label: 'Overview' }, { value: 'orders', label: 'Orders' }, { value: 'invoices', label: 'Invoices' },
                { value: 'payments', label: 'Payments' }, { value: 'ledger', label: 'Ledger' }, { value: 'prices', label: 'Special prices' },
              ]} />
              {tab === 'overview' && (
                <>
                  <Card title="Profile" actions={canWrite ? <Button size="sm" variant="secondary" onPress={() => setDialog('credit')}>Edit credit</Button> : undefined}>
                    <KeyValue items={[
                      ['Contact', c.contactName], ['Mobile', c.mobileNumber], ['Alternate', c.alternateMobile], ['Email', c.email],
                      ['GSTIN', c.gstin], ['PAN', c.pan], ['Login', c.hasLogin ? 'Can sign in' : 'No login'], ['Credit', c.credit.creditEnabled ? 'Enabled' : 'Disabled'],
                      ['Credit days', String(c.credit.creditDays)], ['Policy', c.credit.creditPolicyOverride ? titleCase(c.credit.creditPolicyOverride) : `Business default (${titleCase(c.outstanding.creditPolicy)})`],
                      ['Notes', c.notes], ['Customer since', date(c.createdAt)],
                    ]} />
                  </Card>
                  <Card title="Addresses">
                    {c.addresses.length === 0 ? <EmptyState icon="map-pin" title="No address" /> : (
                      <View style={{ gap: 10 }}>
                        {c.addresses.map((a) => (
                          <Text key={a.id} variant="small">{a.label ? <Text variant="small" weight="700">{a.label}: </Text> : null}{a.addressLine1}{a.addressLine2 ? `, ${a.addressLine2}` : ''}, {a.city}, {a.state} ({a.stateCode}) – {a.pincode}{a.isDefault ? ' · default' : ''}</Text>
                        ))}
                      </View>
                    )}
                  </Card>
                </>
              )}
              {tab === 'orders' && (
                <SubList<Order> queryKey={['orders', 'customer', c.id]} fetch={(page) => api.page<Order>('/api/v1/orders', { customerId: c.id, page, pageSize: 10 })} empty="No orders"
                  render={(o) => <ListRow key={o.id} onPress={() => router.push(`/admin/order/${o.id}`)} title={o.orderNumber} subtitle={date(o.placedAt)} meta={<View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}><StatusBadge status={o.status} /><StatusBadge status={o.paymentStatus} /></View>} right={<Text weight="600" num>{money(o.grandTotal)}</Text>} />} />
              )}
              {tab === 'invoices' && (
                <SubList<Invoice> queryKey={['invoices', 'customer', c.id]} fetch={(page) => api.page<Invoice>('/api/v1/invoices', { customerId: c.id, page, pageSize: 10 })} empty="No invoices"
                  render={(i) => <ListRow key={i.id} onPress={() => router.push(`/admin/invoice/${i.id}`)} title={i.invoiceNumber ?? 'Draft'} subtitle={`${date(i.invoiceDate)}${i.dueDate ? ` · due ${date(i.dueDate)}` : ''}`} meta={<View style={{ marginTop: 4 }}><StatusBadge status={i.status} /></View>} right={<><Text weight="600" num>{money(i.grandTotal)}</Text>{i.outstanding > 0 && <Text variant="xs" num color={i.overdue ? 'danger' : 'warning'}>Due {money(i.outstanding)}</Text>}</>} />} />
              )}
              {tab === 'payments' && (
                <SubList<Payment> queryKey={['payments', 'customer', c.id]} fetch={(page) => api.page<Payment>('/api/v1/payments', { customerId: c.id, page, pageSize: 10 })} empty="No payments"
                  render={(p) => <ListRow key={p.id} onPress={() => router.push(`/admin/payment/${p.id}`)} title={p.paymentNumber} subtitle={`${dateTime(p.paidAt ?? p.createdAt)} · ${titleCase(p.method)}`} meta={<View style={{ marginTop: 4 }}><StatusBadge status={p.status} /></View>} right={<Text weight="600" num>{money(p.amount)}</Text>} />} />
              )}
              {tab === 'ledger' && <Ledger path={`/api/v1/customers/${c.id}/ledger`} />}
              {tab === 'prices' && <CustomerPrices customerId={c.id} />}

              <ConfirmDialog open={dialog === 'reject'} onClose={() => setDialog(null)} title="Reject registration" tone="danger" requireReason loading={status.isPending} confirmLabel="Reject"
                message="The applicant is signed out and cannot order." onConfirm={(reason) => status.mutate({ path: 'reject', reason })} />
              <ConfirmDialog open={dialog === 'block'} onClose={() => setDialog(null)} title="Block customer" tone="danger" requireReason loading={status.isPending} confirmLabel="Block"
                message="The customer is signed out immediately and cannot order until unblocked." onConfirm={(reason) => status.mutate({ path: 'block', reason })} />
              <CreditSheet open={dialog === 'credit'} customer={c} onClose={() => setDialog(null)} onDone={refresh} />
              <RecordPaymentSheet open={dialog === 'payment'} onClose={() => setDialog(null)} customerId={c.id} onDone={refresh} />
            </>
          )}
        </QueryState>
      </Screen>
    </RequirePermission>
  )
}

/** Paged list inside a scrolling screen ("Load more" instead of infinite scroll). */
function SubList<T>({ queryKey, fetch, render, empty }: { queryKey: unknown[]; fetch: (page: number) => Promise<Paged<T>>; render: (t: T) => React.ReactElement; empty: string }) {
  const q = useInfiniteQuery({
    queryKey,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => fetch(pageParam),
    getNextPageParam: (last) => (last.pagination.page < last.pagination.totalPages ? last.pagination.page + 1 : undefined),
  })
  if (q.isLoading) return <ListSkeleton rows={3} />
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const rows = q.data?.pages.flatMap((p) => p.items) ?? []
  if (!rows.length) return <EmptyState title={empty} />
  return (
    <Card padded={false}>
      {rows.map(render)}
      {q.hasNextPage && <View style={{ padding: 12 }}><Button variant="secondary" loading={q.isFetchingNextPage} onPress={() => q.fetchNextPage()}>Load more</Button></View>}
    </Card>
  )
}

function CreditSheet({ open, customer, onClose, onDone }: { open: boolean; customer: CustomerDetail; onClose: () => void; onDone: () => void }) {
  const canOverride = useCan('CREDIT_OVERRIDE')
  const [enabled, setEnabled] = useState(customer.credit.creditEnabled)
  const [limit, setLimit] = useState(String(customer.credit.creditLimit))
  const [days, setDays] = useState(String(customer.credit.creditDays))
  const [policy, setPolicy] = useState<string>(customer.credit.creditPolicyOverride ?? '')
  useEffect(() => {
    if (!open) return
    setEnabled(customer.credit.creditEnabled)
    setLimit(String(customer.credit.creditLimit))
    setDays(String(customer.credit.creditDays))
    setPolicy(customer.credit.creditPolicyOverride ?? '')
  }, [open, customer])
  const save = useMutation({
    mutationFn: () => api.patch(`/api/v1/customers/${customer.id}/credit`, {
      creditEnabled: enabled, creditLimit: limit || '0', creditDays: Number(days || 0),
      ...(canOverride ? (policy ? { creditPolicy: policy } : { clearCreditPolicy: true }) : {}),
    }),
    onSuccess: () => { toast.success('Credit updated'); onClose(); onDone() },
    onError: (e) => toast.error(e),
  })
  return (
    <Sheet open={open} onClose={onClose} title="Credit profile" footer={<Button block loading={save.isPending} onPress={() => save.mutate()}>Save</Button>}>
      <SwitchRow label="Credit enabled" value={enabled} onChange={setEnabled} />
      <Field label="Credit limit"><MoneyInput value={limit} onChangeText={setLimit} accessibilityLabel="Credit limit" /></Field>
      <Field label="Credit days"><Input value={days} onChangeText={(t) => setDays(t.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={3} accessibilityLabel="Credit days" /></Field>
      <Field label="Over-limit policy" hint={canOverride ? undefined : 'Changing the policy requires the Credit override permission'}>
        {canOverride ? (
          <Select label="Over-limit policy" value={policy} onChange={setPolicy} options={[
            { value: '', label: 'Use business default' }, { value: 'BLOCK', label: 'Block' }, { value: 'REQUIRE_ADMIN_APPROVAL', label: 'Require admin approval' }, { value: 'ALLOW', label: 'Allow' },
          ]} />
        ) : <Input value={policy ? titleCase(policy) : 'Business default'} editable={false} accessibilityLabel="Over-limit policy" />}
      </Field>
    </Sheet>
  )
}

interface CustomerPrice { productId: string; sku: string; productName: string; defaultPrice: number; customerPrice: number }

function CustomerPrices({ customerId }: { customerId: string }) {
  const qc = useQueryClient()
  const canCustomerWrite = useCan('CUSTOMER_WRITE')
  const canProductWrite = useCan('PRODUCT_WRITE')
  const canWrite = canCustomerWrite && canProductWrite
  const [editing, setEditing] = useState<{ id: string; name: string; price: string } | null>(null)
  const q = useQuery({ queryKey: ['prices', customerId], queryFn: () => api.get<CustomerPrice[]>(`/api/v1/customers/${customerId}/prices`) })
  const save = useMutation({
    mutationFn: ({ productId, price }: { productId: string; price: string }) => api.put(`/api/v1/customers/${customerId}/prices/${productId}`, { price }),
    onSuccess: () => { toast.success('Price saved'); setEditing(null); qc.invalidateQueries({ queryKey: ['prices', customerId] }) },
    onError: (e) => toast.error(e),
  })
  const remove = useMutation({
    mutationFn: (productId: string) => api.del(`/api/v1/customers/${customerId}/prices/${productId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prices', customerId] }),
    onError: (e) => toast.error(e),
  })
  return (
    <View style={{ gap: 12 }}>
      {canWrite && <ProductPickerButton label="Add a special price" onPick={(p) => setEditing({ id: p.id, name: p.name, price: String(p.sellingPrice) })} />}
      <QueryState query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState icon="tag" title="No special prices" description="This customer pays the default selling price." />}>
        {(d) => (
          <Card padded={false}>
            {d.map((p) => (
              <ListRow key={p.productId} title={p.productName} subtitle={`${p.sku} · default ${money(p.defaultPrice)}`}
                right={<View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text weight="700" num>{money(p.customerPrice)}</Text>
                  {canWrite && <IconButton icon="edit-2" label={`Edit special price for ${p.productName}`} onPress={() => setEditing({ id: p.productId, name: p.productName, price: String(p.customerPrice) })} />}
                  {canWrite && <IconButton icon="trash-2" label={`Remove special price for ${p.productName}`} color={colors.danger} onPress={() => remove.mutate(p.productId)} />}
                </View>} />
            ))}
          </Card>
        )}
      </QueryState>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={`Price for ${editing?.name ?? ''}`} footer={
        <Button block icon="check" loading={save.isPending} disabled={!(Number(editing?.price) >= 0) || !editing?.price} onPress={() => editing && save.mutate({ productId: editing.id, price: editing.price })}>Save price</Button>
      }>
        <Field label="Price (before GST)" hint="Applies to new orders and invoices only">
          <MoneyInput value={editing?.price ?? ''} onChangeText={(t) => editing && setEditing({ ...editing, price: t })} accessibilityLabel="Customer price" />
        </Field>
      </Sheet>
    </View>
  )
}
