import { useAuthStore } from '@/stores/auth'
import { useBranchStore } from '@/stores/branch'

/** Standard response envelope (APPLICATION-ARCHITECTURE.md §50). */
export interface ApiEnvelope<T> {
  success: boolean
  data: T
  message?: string
  pagination?: Pagination
  error?: { code: string; message: string; details?: { field: string; message: string }[] }
  requestId?: string
}

export interface Pagination {
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

export interface Paged<T> {
  items: T[]
  pagination: Pagination
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: { field: string; message: string }[]
  readonly requestId?: string

  constructor(status: number, code: string, message: string, details: { field: string; message: string }[] = [], requestId?: string) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
    this.requestId = requestId
  }

  fieldError(field: string): string | undefined {
    return this.details.find((d) => d.field === field)?.message
  }
}

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

type Query = Record<string, string | number | boolean | undefined | null | (string | number)[]>

export function toQuery(params?: Query): string {
  if (!params) return ''
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, String(x)))
    else sp.append(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

let refreshing: Promise<boolean> | null = null

/** Rotates the refresh token (HttpOnly cookie) and stores the new access token. Concurrent callers share one refresh. */
export async function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-Client-Type': 'web' },
          body: '{}',
        })
        if (!res.ok) {
          // Drain the error body so the request completes (an unread body keeps the connection open).
          await res.text().catch(() => '')
          useAuthStore.getState().clear()
          return false
        }
        const body = (await res.json()) as ApiEnvelope<AuthResponse>
        useAuthStore.getState().setSession(body.data.accessToken!, body.data.user!)
        return true
      } catch {
        return false
      } finally {
        setTimeout(() => (refreshing = null), 0)
      }
    })()
  }
  return refreshing
}

interface RequestOptions {
  method?: string
  body?: unknown
  query?: Query
  headers?: Record<string, string>
  raw?: boolean
  retry?: boolean
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<ApiEnvelope<T>> {
  const token = useAuthStore.getState().accessToken
  const headers: Record<string, string> = { 'X-Client-Type': 'web', ...(opts.headers ?? {}) }
  const branchId = useBranchStore.getState().branchId
  if (branchId && !headers['X-Branch-Id']) headers['X-Branch-Id'] = branchId
  let body: BodyInit | undefined
  if (opts.body instanceof FormData) {
    body = opts.body
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }
  if (token) headers.Authorization = `Bearer ${token}`
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}${toQuery(opts.query)}`, { method: opts.method ?? 'GET', headers, body, credentials: 'include' })
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.')
  }
  if (res.status === 401 && opts.retry !== false && token && !path.startsWith('/api/v1/auth/')) {
    if (await refreshSession()) return request<T>(path, { ...opts, retry: false })
  }
  if (res.status === 204) return { success: true, data: undefined as T }
  const text = await res.text()
  let parsed: ApiEnvelope<T> | undefined
  try {
    parsed = text ? (JSON.parse(text) as ApiEnvelope<T>) : undefined
  } catch {
    parsed = undefined
  }
  if (!res.ok || (parsed && parsed.success === false)) {
    const err = parsed?.error
    throw new ApiError(res.status, err?.code ?? 'INTERNAL_ERROR', err?.message ?? `Request failed (${res.status})`, err?.details ?? [], parsed?.requestId)
  }
  return parsed as ApiEnvelope<T>
}

export const api = {
  async get<T>(path: string, query?: Query): Promise<T> {
    return (await request<T>(path, { query })).data
  },
  async page<T>(path: string, query?: Query): Promise<Paged<T>> {
    const r = await request<T[]>(path, { query })
    return { items: r.data ?? [], pagination: r.pagination ?? { page: 1, pageSize: r.data?.length ?? 0, totalItems: r.data?.length ?? 0, totalPages: 1 } }
  },
  async post<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    return (await request<T>(path, { method: 'POST', body: body ?? {}, headers })).data
  },
  async patch<T>(path: string, body: unknown): Promise<T> {
    return (await request<T>(path, { method: 'PATCH', body })).data
  },
  async put<T>(path: string, body: unknown): Promise<T> {
    return (await request<T>(path, { method: 'PUT', body })).data
  },
  async del<T>(path: string): Promise<T> {
    return (await request<T>(path, { method: 'DELETE' })).data
  },
  async upload<T>(path: string, file: File): Promise<T> {
    const form = new FormData()
    form.append('file', file)
    return (await request<T>(path, { method: 'POST', body: form })).data
  },
  /** Fetches a binary document (PDF/CSV/XLSX) with auth and returns an object URL. */
  async blobUrl(path: string, query?: Query): Promise<{ url: string; fileName?: string }> {
    const doFetch = () =>
      fetch(`${API_BASE}${path}${toQuery(query)}`, {
        headers: { Authorization: `Bearer ${useAuthStore.getState().accessToken ?? ''}`, 'X-Client-Type': 'web' },
        credentials: 'include',
      })
    let res = await doFetch()
    if (res.status === 401 && (await refreshSession())) res = await doFetch()
    if (!res.ok) {
      let msg = `Download failed (${res.status})`
      try {
        msg = ((await res.json()) as ApiEnvelope<unknown>).error?.message ?? msg
      } catch {
        /* binary error */
      }
      throw new ApiError(res.status, 'DOWNLOAD_FAILED', msg)
    }
    const cd = res.headers.get('Content-Disposition') ?? ''
    const match = /filename="?([^";]+)"?/.exec(cd)
    return { url: URL.createObjectURL(await res.blob()), fileName: match?.[1] }
  },
}

export async function download(path: string, query?: Query, fallbackName = 'download') {
  const { url, fileName } = await api.blobUrl(path, query)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName ?? fallbackName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/** RFC 4122 v4 id. `crypto.randomUUID` needs a secure context (HTTPS/localhost); getRandomValues works everywhere. */
export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6]! & 0x0f) | 0x40
  b[8] = (b[8]! & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

// ---------------------------------------------------------------- auth types

export interface CustomerInfo {
  id: string
  customerCode: string
  shopName: string
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'BLOCKED'
}

/** A business (tenant) the signed-in mobile number belongs to, or the Super Admin console (platform). */
export interface TenantChoice {
  businessId?: string
  name: string
  logoUrl?: string
  tenantCode?: string
  role: string
  platform: boolean
}

export interface BusinessInfo {
  id: string
  name: string
  logoUrl?: string
}

export interface Me {
  id: string
  fullName: string
  mobileNumber: string
  email?: string
  role: 'OWNER' | 'ADMIN' | 'CUSTOMER' | 'SUPPLIER' | 'SUPER_ADMIN'
  permissions: string[]
  customer?: CustomerInfo
  /** The business this session belongs to (tenant branding); absent for the Super Admin console. */
  business?: BusinessInfo
  /** Everywhere this number can switch to: its businesses, plus the console for a platform admin. */
  memberships?: TenantChoice[]
  /** Module codes enabled for the business (§0B.6); menus of other modules are hidden. */
  modules?: string[]
  /** A Super Admin's read-only support view of the business. */
  support?: boolean
  /** The business's words and product units (§0B.15); absent for the Super Admin console. */
  vocabulary?: { terms: Record<string, string>; units: string[] }
  /** The supplier behind a SUPPLIER login (supplier portal). */
  supplier?: { id: string; supplierCode: string; name: string }
}

export interface AuthResponse {
  registrationRequired: boolean
  accessToken?: string
  accessTokenExpiresAt?: string
  registrationToken?: string
  /** The business a new number registers into (join link or default). */
  registrationBusiness?: BusinessInfo
  user?: Me
  /** The number belongs to several businesses: pick one with the selection token. */
  selectionRequired?: boolean
  selectionToken?: string
  tenants?: TenantChoice[]
}
