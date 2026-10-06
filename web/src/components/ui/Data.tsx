import clsx from 'clsx'
import { animate, motion, useReducedMotion } from 'motion/react'
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, Circle, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Pagination as PaginationMeta } from '@/services/api'
import { money, titleCase } from '@/utils/format'
import { Button } from './Button'
import { wordify, wordifyNode } from '@/stores/words'

export function Card({ title, actions, children, className, bodyClassName, padded = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; padded?: boolean }) {
  return (
    <section className={clsx('card', className)}>
      {(title || actions) && (
        <header className="card-header">
          {typeof title === 'string' ? <h3>{wordify(title)}</h3> : title}
          {actions && <div className="row">{actions}</div>}
        </header>
      )}
      <div className={clsx(padded && 'card-body', bodyClassName)}>{children}</div>
    </section>
  )
}

/** Number that counts up on first render (disabled for reduced motion). */
export function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const reduce = useReducedMotion()
  const [display, setDisplay] = useState(reduce ? value : 0)
  const prev = useRef(0)
  useEffect(() => {
    if (reduce) {
      setDisplay(value)
      return
    }
    const controls = animate(prev.current, value, { duration: 0.6, ease: 'easeOut', onUpdate: setDisplay })
    prev.current = value
    return () => controls.stop()
  }, [value, reduce])
  return <>{format(display)}</>
}

export function StatCard({ label, value, format = money, hint, icon, tone = 'primary', index = 0 }: { label: string; value: number; format?: (n: number) => string; hint?: ReactNode; icon?: ReactNode; tone?: string; index?: number }) {
  return (
    <motion.div
      className="card stat-card card-hover"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
    >
      <span className="stat-label">{wordify(label)}</span>
      <span className="stat-value"><AnimatedNumber value={value} format={format} /></span>
      {hint && <span className="stat-hint">{hint}</span>}
      {icon && <span className={`stat-icon tone-${tone}`} aria-hidden>{icon}</span>}
    </motion.div>
  )
}

export interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  align?: 'left' | 'right' | 'center'
  sortKey?: string
  className?: string
  footer?: ReactNode
  /** Hidden on tablet widths to keep the table readable (§0B.11). */
  priority?: 'low'
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  sort?: string
  onSortChange?: (sort: string) => void
  caption?: string
  showFooter?: boolean
}

/** Keyboard-accessible table: clickable rows are focusable and respond to Enter. */
export function DataTable<T>({ columns, rows, rowKey, onRowClick, sort, onSortChange, caption, showFooter }: DataTableProps<T>) {
  const [sortField, sortDir] = (sort ?? '').split(',')
  return (
    <div className="table-wrap">
      <table className="table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => {
              const active = c.sortKey && sortField === c.sortKey
              return (
                <th
                  key={c.key}
                  scope="col"
                  className={clsx(c.align === 'right' && 'right', c.sortKey && onSortChange && 'sortable', c.priority === 'low' && 'col-low')}
                  aria-sort={active ? (sortDir === 'desc' ? 'descending' : 'ascending') : undefined}
                  onClick={() => c.sortKey && onSortChange?.(`${c.sortKey},${active && sortDir !== 'desc' ? 'desc' : 'asc'}`)}
                >
                  <span className="row" style={{ gap: 4, display: 'inline-flex', flexWrap: 'nowrap' }}>
                    {wordify(c.header)}
                    {active && (sortDir === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={clsx(onRowClick && 'clickable')}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(row) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} data-label={wordify(c.header) || undefined} className={clsx(c.align === 'right' && 'right num', c.className, c.priority === 'low' && 'col-low', !c.header && 'cell-actions')}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {showFooter && (
          <tfoot>
            <tr>
              {columns.map((c) => (
                <td key={c.key} className={clsx(c.align === 'right' && 'right num')}>{c.footer}</td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

export function Pagination({ meta, onPage }: { meta: PaginationMeta; onPage: (p: number) => void }) {
  if (meta.totalItems === 0) return null
  const start = (meta.page - 1) * meta.pageSize + 1
  const end = Math.min(meta.page * meta.pageSize, meta.totalItems)
  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="small muted">
        Showing <strong>{start}</strong>–<strong>{end}</strong> of <strong>{meta.totalItems}</strong>
      </span>
      <div className="row">
        <Button variant="secondary" size="sm" icon={<ChevronLeft size={14} />} disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>
          Previous
        </Button>
        <span className="small">Page {meta.page} of {Math.max(1, meta.totalPages)}</span>
        <Button variant="secondary" size="sm" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)}>
          Next <ChevronRight size={14} />
        </Button>
      </div>
    </nav>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.value} role="tab" className="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}>
          {wordify(t.label)}
          {t.count !== undefined && <span className="badge badge-neutral" style={{ marginLeft: 6, height: 20 }}>{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Badge({ tone = 'neutral', children, dot }: { tone?: string; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot && <span className="dot" aria-hidden />}
      {children}
    </span>
  )
}

/** Semantic status colours (§62). Colour is never the only cue: the text label is always shown. */
const STATUS_TONES: Record<string, string> = {
  PLACED: 'warning', PENDING: 'warning', PENDING_APPROVAL: 'warning', REQUESTED: 'warning', DRAFT: 'neutral', UNPAID: 'warning', QUEUED: 'neutral', SENDING: 'accent',
  ACCEPTED: 'primary', APPROVED: 'success', AUTHORIZED: 'primary', GENERATED: 'primary', SENT: 'accent', POSTED: 'success',
  PACKING: 'accent', READY_FOR_DELIVERY: 'teal', OUT_FOR_DELIVERY: 'purple', DELIVERED: 'success', READ: 'success',
  COMPLETED: 'success', PAID: 'success', CAPTURED: 'success', ACTIVE: 'success', IN_STOCK: 'success',
  CANCELLED: 'danger', REJECTED: 'danger', FAILED: 'danger', DELIVERY_FAILED: 'danger', BLOCKED: 'danger', OUT_OF_STOCK: 'danger',
  CREDIT: 'warning', PARTIALLY_PAID: 'warning', LOW_STOCK: 'warning', REFUNDED: 'neutral', INACTIVE: 'neutral', NOT_REQUIRED: 'neutral',
  QUOTED: 'warning', COUNTERED: 'purple', PARTIALLY_RECEIVED: 'teal', RECEIVED: 'success', CLOSED: 'neutral', EXPIRED: 'neutral', OPEN: 'neutral',
  ISSUED: 'accent', INVOICED: 'success', CONVERTED: 'success', PARTIAL: 'teal',
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONES[status] ?? 'neutral'} dot>{titleCase(status)}</Badge>
}

export interface TimelineStep {
  label: string
  state: 'done' | 'current' | 'upcoming' | 'failed'
  detail?: ReactNode
}

export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="timeline">
      {steps.map((s, i) => (
        <motion.li
          key={s.label + i}
          className={s.state}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25, delay: i * 0.05 }}
        >
          <span className="marker" aria-hidden>
            {s.state === 'done' ? <Check size={14} /> : s.state === 'failed' ? <X size={14} /> : <Circle size={10} />}
          </span>
          <div>
            <div style={{ fontWeight: s.state === 'upcoming' ? 500 : 600, color: s.state === 'upcoming' ? 'var(--color-muted)' : undefined }}>
              {s.label}
              <span className="sr-only"> ({s.state})</span>
            </div>
            {s.detail && <div className="xs muted">{s.detail}</div>}
          </div>
        </motion.li>
      ))}
    </ol>
  )
}

export function PageHeader({ title, subtitle, actions, breadcrumb }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; breadcrumb?: ReactNode }) {
  return (
    <div className="page-header">
      <div className="page-header-title">
        {breadcrumb && <div className="breadcrumb">{wordifyNode(breadcrumb)}</div>}
        <h1>{wordify(title)}</h1>
        {subtitle && <div className="subtitle">{wordify(subtitle)}</div>}
      </div>
      {actions && <div className="row page-header-actions">{actions}</div>}
    </div>
  )
}

export function KeyValue({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="kv">
      {items.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{wordify(k)}</dt>
          <dd>{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Displays backend-calculated totals; the client never calculates tax (§92.3). */
export function TaxBreakdown({ t }: { t: { subtotal: number; discountTotal: number; taxableTotal: number; cgstTotal: number; sgstTotal: number; igstTotal: number; roundOff: number; grandTotal: number; interState?: boolean } }) {
  return (
    <div className="totals num">
      <span className="muted">Subtotal</span><span className="right">{money(t.subtotal)}</span>
      {t.discountTotal > 0 && (<><span className="muted">Discount</span><span className="right">−{money(t.discountTotal)}</span></>)}
      <span className="muted">Taxable value</span><span className="right">{money(t.taxableTotal)}</span>
      {t.interState || t.igstTotal > 0 ? (
        <><span className="muted">IGST</span><span className="right">{money(t.igstTotal)}</span></>
      ) : (
        <>
          <span className="muted">CGST</span><span className="right">{money(t.cgstTotal)}</span>
          <span className="muted">SGST/UTGST</span><span className="right">{money(t.sgstTotal)}</span>
        </>
      )}
      {t.roundOff !== 0 && (<><span className="muted">Round off</span><span className="right">{money(t.roundOff)}</span></>)}
      <span className="grand">Total</span><span className="grand right">{money(t.grandTotal)}</span>
    </div>
  )
}
