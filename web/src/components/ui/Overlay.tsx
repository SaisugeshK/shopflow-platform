import clsx from 'clsx'
import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'
import { Field, Textarea } from './Form'
import { wordify } from '@/stores/words'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
  /** Renders as a bottom sheet on small screens. */
  sheet?: boolean
}

/** Accessible dialog: focus moves in, Escape closes, focus returns to the opener. */
export function Modal({ open, onClose, title, children, footer, wide, sheet = true }: ModalProps) {
  const titleId = useId()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab' && ref.current) {
        const focusables = ref.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
        if (focusables.length === 0) return
        const first = focusables[0]!
        const last = focusables[focusables.length - 1]!
        if (e.shiftKey && document.activeElement === first) {
          last.focus()
          e.preventDefault()
        } else if (!e.shiftKey && document.activeElement === last) {
          first.focus()
          e.preventDefault()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    const t = setTimeout(() => ref.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus(), 30)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      clearTimeout(t)
      document.body.style.overflow = ''
      opener?.focus?.()
    }
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className={clsx('overlay', sheet && 'sheet')}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            ref={ref}
            className={clsx('modal', wide && 'wide')}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <div className="modal-header">
              <h3 id={titleId}>{title}</h3>
              <button className="icon-btn" onClick={onClose} aria-label="Close dialog">
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">{children}</div>
            {footer && <div className="modal-footer">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

interface ConfirmProps {
  open: boolean
  onClose: () => void
  onConfirm: (reason: string) => void | Promise<void>
  title: string
  message: ReactNode
  confirmLabel?: string
  tone?: 'danger' | 'primary'
  requireReason?: boolean
  reasonLabel?: string
  loading?: boolean
}

/** Confirmation for irreversible or financial actions; optionally collects a mandatory reason. */
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', tone = 'primary', requireReason, reasonLabel = 'Reason', loading }: ConfirmProps) {
  const [reason, setReason] = useState('')
  useEffect(() => {
    if (open) setReason('')
  }, [open])
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={wordify(title)}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={loading} disabled={requireReason && reason.trim().length < 3} onClick={() => onConfirm(reason.trim())}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="stack">
        <div className="small">{wordify(message)}</div>
        {requireReason && (
          <Field label={reasonLabel} htmlFor="confirm-reason" required>
            <Textarea id="confirm-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </Field>
        )}
      </div>
    </Modal>
  )
}
