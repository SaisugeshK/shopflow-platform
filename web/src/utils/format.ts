/** Display formatting only. All money values are calculated by the backend; the client never computes totals. */

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const inrCompact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 })
const qty = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 })
const dateFmt = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export function money(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  return inr.format(Number(value))
}

export function moneyCompact(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return inrCompact.format(Number(value))
}

export function quantity(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return qty.format(Number(value))
}

/** Dates from the API are ISO strings; LocalDate values ("2026-04-01") are shown as-is in the user's locale. */
export function date(value: string | null | undefined): string {
  if (!value) return '—'
  const d = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value)
  return Number.isNaN(d.getTime()) ? value : dateFmt.format(d)
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : dateTimeFmt.format(d)
}

export function relativeTime(value: string): string {
  const diff = (Date.now() - new Date(value).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`
  return date(value)
}

export function titleCase(value: string | null | undefined): string {
  if (!value) return ''
  return value.toLowerCase().split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?'
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('')
}

export function maskMobile(mobile: string): string {
  return mobile.length > 6 ? `${mobile.slice(0, 3)} ••••• ${mobile.slice(-4)}` : mobile
}

export function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function firstOfMonth(): string {
  return `${today().slice(0, 8)}01`
}
