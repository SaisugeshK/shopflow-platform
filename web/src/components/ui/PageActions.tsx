import { MoreHorizontal } from 'lucide-react'
import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDismiss } from '@/hooks/useDismiss'
import { PHONE_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'
import { Button } from './Button'

export interface PageAction {
  key: string
  label: string
  icon?: ReactNode
  onClick?: () => void
  /** Navigate instead of running onClick. */
  to?: string
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
  loading?: boolean
  disabled?: boolean
  /** Not rendered at all when false (e.g. missing permission or wrong status). */
  show?: boolean
}

/**
 * Page-header actions that follow the responsive standard (§0B.11): every action is a button on tablets and
 * desktops; on phones only the primary action stays a button and the rest move into a "More" menu.
 */
export function PageActions({ primary, actions }: { primary?: PageAction; actions: PageAction[] }) {
  const navigate = useNavigate()
  const phone = useMediaQuery(PHONE_QUERY)
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const ref = useDismiss<HTMLDivElement>(open, close)
  const visible = actions.filter((a) => a.show !== false)
  const main = primary && primary.show !== false ? primary : undefined
  const run = (a: PageAction) => (a.to ? navigate(a.to) : a.onClick?.())

  const button = (a: PageAction, variant = a.variant ?? 'secondary') => (
    <Button key={a.key} variant={variant} icon={a.icon} loading={a.loading} disabled={a.disabled} onClick={() => run(a)}>{a.label}</Button>
  )

  if (!phone || visible.length <= 1) {
    return (
      <>
        {visible.map((a) => button(a))}
        {main && button(main, main.variant ?? 'primary')}
      </>
    )
  }
  return (
    <>
      {main && button(main, main.variant ?? 'primary')}
      <div ref={ref} style={{ position: 'relative' }}>
        <Button variant="secondary" icon={<MoreHorizontal size={16} />} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>More</Button>
        {open && (
          <div className="menu" role="menu" style={{ left: 0, right: 'auto' }}>
            {visible.map((a) => (
              <button key={a.key} className="menu-item" role="menuitem" disabled={a.disabled || a.loading}
                onClick={() => { setOpen(false); run(a) }}>
                {a.icon}{a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
