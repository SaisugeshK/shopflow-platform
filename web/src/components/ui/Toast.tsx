import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ApiError } from '@/services/api'

type Tone = 'success' | 'error' | 'warning' | 'info'
interface Toast {
  id: number
  tone: Tone
  title: string
  message?: string
}

interface ToastApi {
  show: (tone: Tone, title: string, message?: string) => void
  success: (title: string, message?: string) => void
  error: (error: unknown, fallback?: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)
let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const show = useCallback(
    (tone: Tone, title: string, message?: string) => {
      const id = nextId++
      setToasts((t) => [...t.slice(-3), { id, tone, title, message }])
      setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4000)
    },
    [dismiss],
  )
  const value = useMemo<ToastApi>(
    () => ({
      show,
      success: (title, message) => show('success', title, message),
      error: (error, fallback = 'Something went wrong') => {
        const e = error instanceof ApiError ? error : null
        show('error', e ? e.message : fallback, e?.details?.map((d) => d.message).join(' · ') || undefined)
      },
    }),
    [show],
  )
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" aria-live="polite" aria-atomic="false">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              className={`toast ${t.tone}`}
              role={t.tone === 'error' ? 'alert' : 'status'}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.2 }}
            >
              <div className="grow">
                <strong>{t.title}</strong>
                {t.message && <div className="small muted">{t.message}</div>}
              </div>
              <button className="icon-btn" style={{ width: 24, height: 24 }} aria-label="Dismiss" onClick={() => dismiss(t.id)}>
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
