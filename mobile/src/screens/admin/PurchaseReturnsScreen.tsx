import { useState } from 'react'
import { View } from 'react-native'
import { RequirePermission } from '@/components/admin/RequirePermission'
import { Button } from '@/components/ui/Button'
import { KeyValue, ListRow, StatusBadge } from '@/components/ui/Data'
import { Alert, EmptyState } from '@/components/ui/Feedback'
import { LineItems } from '@/components/ui/LineItems'
import { Sheet } from '@/components/ui/Overlay'
import { PagedList } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { router } from 'expo-router'
import { api } from '@/services/api'
import type { PurchaseReturn } from '@/services/types'
import { date, money } from '@/utils/format'

/** Purchase returns: goods sent back to suppliers (created from a posted purchase). */
export default function PurchaseReturnsScreen() {
  const [open, setOpen] = useState<PurchaseReturn | null>(null)
  return (
    <RequirePermission anyOf={['PURCHASE_READ']}>
      <PagedList<PurchaseReturn>
        queryKey={['purchase-returns']}
        fetchPage={(page, pageSize) => api.page<PurchaseReturn>('/api/v1/purchase-returns', { page, pageSize })}
        keyOf={(r) => r.id}
        header={<Alert>Create a return from a posted purchase (“Return items”).</Alert>}
        empty={<EmptyState icon="corner-up-left" title="No purchase returns" />}
        renderItem={(r) => (
          <ListRow onPress={() => setOpen(r)} title={r.returnNumber} subtitle={`${r.supplierName} · ${date(r.returnDate)} · ${r.purchaseNumber}`}
            meta={<View style={{ marginTop: 4 }}><StatusBadge status={r.status} /></View>} right={<Text weight="700" num>{money(r.grandTotal)}</Text>} />
        )}
      />
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.returnNumber ?? ''} footer={open ? <Button block variant="secondary" onPress={() => { const p = open.purchaseId; setOpen(null); router.push(`/admin/purchase/${p}`) }}>Open purchase {open.purchaseNumber}</Button> : undefined}>
        {open && (
          <>
            <KeyValue items={[['Supplier', open.supplierName], ['Reason', open.reason], ['Taxable', money(open.taxableTotal)], ['Tax', money(open.taxTotal)], ['Total', money(open.grandTotal)]]} />
            <LineItems lines={open.items.map((i) => ({ id: i.id, name: i.productName, qty: i.quantity, unit: '', rate: i.rate, amount: i.lineTotal, note: `GST ${i.taxRate}%` }))} />
          </>
        )}
      </Sheet>
    </RequirePermission>
  )
}
