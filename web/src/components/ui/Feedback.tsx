import clsx from 'clsx'
import { CircleCheck, Inbox, Info, Lock, LoaderCircle, RefreshCw, TriangleAlert, WifiOff } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { ApiError } from '@/services/api'
import { Button } from './Button'
import { wordify } from '@/stores/words'

export function Spinner({ size = 20, label = 'Loading' }: { size?: number; label?: string }) {
  return (
    <span role="status" aria-live="polite" className="row" style={{ justifyContent: 'center' }}>
      <LoaderCircle size={size} className="spin" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  )
}

export function Skeleton({ width = '100%', height = 16, style, className }: { width?: number | string; height?: number | string; style?: CSSProperties; className?: string }) {
  return <span className={clsx('skeleton', className)} style={{ display: 'block', width, height, ...style }} aria-hidden />
}

export function SkeletonRows({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="stack-sm" style={{ padding: 16 }} role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="row" style={{ flexWrap: 'nowrap' }}>
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} height={14} width={`${100 / cols}%`} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="icon-wrap tone-primary">{icon ?? <Inbox size={26} />}</div>
      <h3>{wordify(title)}</h3>
      {description && <p className="muted small" style={{ maxWidth: 420 }}>{wordify(description)}</p>}
      {action}
    </div>
  )
}

/** Error, offline and permission-denied states (§66). */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const e = error instanceof ApiError ? error : null
  if (e?.status === 403) return <PermissionDenied />
  const offline = e?.code === 'NETWORK_ERROR'
  return (
    <div className="error-state" role="alert">
      <div className={clsx('icon-wrap', offline ? 'tone-warning' : 'tone-danger')}>{offline ? <WifiOff size={26} /> : <TriangleAlert size={26} />}</div>
      <h3>{offline ? 'You are offline' : e?.status === 404 ? 'Not found' : 'Something went wrong'}</h3>
      <p className="muted small" style={{ maxWidth: 440 }}>
        {e?.message ?? 'An unexpected error occurred.'}
        {e?.requestId && <span className="xs mono" style={{ display: 'block', marginTop: 6 }}>Reference: {e.requestId}</span>}
      </p>
      {onRetry && (
        <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function PermissionDenied() {
  return (
    <div className="error-state">
      <div className="icon-wrap tone-neutral"><Lock size={26} /></div>
      <h3>Permission denied</h3>
      <p className="muted small">Your account does not have access to this page. Ask the Owner to grant the permission.</p>
    </div>
  )
}

export function Alert({ tone = 'info', title, children }: { tone?: 'info' | 'warning' | 'danger' | 'success'; title?: string; children?: ReactNode }) {
  const Icon = tone === 'success' ? CircleCheck : tone === 'info' ? Info : TriangleAlert
  return (
    <div className={`alert alert-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon size={18} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
      <div className="stack-sm" style={{ gap: 2 }}>
        {title && <strong>{title}</strong>}
        {children && <div>{children}</div>}
      </div>
    </div>
  )
}

/** Renders loading / error / empty / content for a query in one place so every screen has all states. */
export function QueryState<T>({
  query,
  empty,
  isEmpty,
  skeleton,
  children,
}: {
  query: { data?: T; isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown }
  empty?: ReactNode
  isEmpty?: (data: T) => boolean
  skeleton?: ReactNode
  children: (data: T) => ReactNode
}) {
  if (query.isLoading) return <>{skeleton ?? <SkeletonRows />}</>
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  if (query.data === undefined) return null
  if (isEmpty && isEmpty(query.data)) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>
  return <>{children(query.data)}</>
}
