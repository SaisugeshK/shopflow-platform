import { ArrowLeftRight } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useDismiss } from '@/hooks/useDismiss'
import { useAuthStore } from '@/stores/auth'
import { BusinessSwitcherList } from './TenantPicker'

/** Header button for numbers that belong to several businesses (e.g. a retailer buying from two shops). */
export function BusinessSwitchButton() {
  const count = useAuthStore((s) => s.user?.memberships?.length ?? 0)
  const [open, setOpen] = useState(false)
  const ref = useDismiss<HTMLDivElement>(open, useCallback(() => setOpen(false), []))
  if (count < 2) return null
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="icon-btn" aria-label="Switch business" title="Switch business" aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}>
        <ArrowLeftRight size={18} />
      </button>
      {open && (
        <div className="menu" role="menu" style={{ minWidth: 280 }}>
          <BusinessSwitcherList onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}
