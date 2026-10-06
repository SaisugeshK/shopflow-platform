import * as Crypto from 'expo-crypto'
import { useAuthStore } from '@/store/auth'
import { useBranchStore } from '@/store/branch'
import { API_BASE } from './config'
import { tokenStorage } from './tokenStorage'

export { API_BASE }

/** Standard response envelope (APPLICATION-ARCHITECTURE.md §50). Same contract as the web client. */
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

export type Query = Record<string, string | number | boolean | undefined | null | (string | number)[]>

export function toQuery(params?: Query): string {
  if (!params) return ''
  const parts: string[] = []
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    const values = Array.isArray(v) ? v : [v]
    values.forEach((x) => parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(x))}`))
  }
  return parts.length ? `?${parts.join('&')}` : ''
}

/** Mobile clients do not send X-Client-Type: web, so the API returns the refresh token in the body (never a cookie). */
const BASE_HEADERS: Record<string, string> = { 'X-Client-Type': 'mobile', Accept: 'application/json' }

let refreshing: Promise<boolean> | null = null

/** Persists the tokens of a successful sign-in / refresh / registration. */
export async function applySession(r: AuthResponse) {
  if (r.refreshToken) await tokenStorage.set(r.refreshToken)
  if (r.accessToken && r.user) useAuthStore.getState().setSession(r.accessToken, r.user)
}

/** Rotates the refresh token from secure storage. Concurrent callers share one refresh. */
export async function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const refreshToken = await tokenStorage.get()
        if (!refreshToken) return false
        const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { ...BASE_HEADERS, 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        })
        if (!res.ok) {
          // Drain the error body so the request completes (an unread body keeps the connection open).
          await res.text().catch(() => '')
          // Only a rejected token ends the session; network errors keep it for the next attempt.
          if (res.status === 401 || res.status === 400) {
            await tokenStorage.clear()
            useAuthStore.getState().clear()
          }
          return false
        }
        const body = (await res.json()) as ApiEnvelope<AuthResponse>
        await applySession(body.data)
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
  retry?: boolean
  token?: string
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<ApiEnvelope<T>> {
  const token = opts.token ?? useAuthStore.getState().accessToken
  const headers: Record<string, string> = { ...BASE_HEADERS, ...(opts.headers ?? {}) }
  const branchId = useBranchStore.getState().branchId
  if (branchId && !headers['X-Branch-Id']) headers['X-Branch-Id'] = branchId
  let body: string | undefined
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }
  if (token) headers.Authorization = `Bearer ${token}`
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}${toQuery(opts.query)}`, { method: opts.method ?? 'GET', headers, body })
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.')
  }
  if (res.status === 401 && opts.retry !== false && !opts.token && token && !path.startsWith('/api/v1/auth/')) {
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
  /** POST with an explicit bearer token (customer registration uses the single-use registration token). */
  async postWithToken<T>(path: string, token: string, body: unknown): Promise<T> {
    return (await request<T>(path, { method: 'POST', body, token })).data
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
}

/** Fetches a binary document (PDF/CSV/XLSX) with auth, retrying once after a token refresh. */
export async function fetchDocument(path: string, query?: Query): Promise<{ bytes: ArrayBuffer; contentType: string; fileName?: string }> {
  const doFetch = () =>
    fetch(`${API_BASE}${path}${toQuery(query)}`, {
      headers: { ...BASE_HEADERS, Accept: '*/*', Authorization: `Bearer ${useAuthStore.getState().accessToken ?? ''}` },
    })
  let res: Response
  try {
    res = await doFetch()
    if (res.status === 401 && (await refreshSession())) res = await doFetch()
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.')
  }
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
  return { bytes: await res.arrayBuffer(), contentType: res.headers.get('Content-Type') ?? 'application/octet-stream', fileName: match?.[1] }
}

/** Idempotency key for money-moving requests (orders, payments). */
export function newIdempotencyKey(): string {
  return Crypto.randomUUID()
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
  /** The business's words and product units (§0B.15); absent for the Super Admin console. */
  vocabulary?: { terms: Record<string, string>; units: string[] }
  /** A Super Admin's read-only support view (web only). */
  support?: boolean
  /** The supplier behind a SUPPLIER login (supplier portal). */
  supplier?: { id: string; supplierCode: string; name: string }
}

export interface AuthResponse {
  registrationRequired: boolean
  accessToken?: string
  accessTokenExpiresAt?: string
  refreshToken?: string
  registrationToken?: string
  /** The business a new number registers into (join link or default). */
  registrationBusiness?: BusinessInfo
  user?: Me
  /** The number belongs to several businesses: pick one with the selection token. */
  selectionRequired?: boolean
  selectionToken?: string
  tenants?: TenantChoice[]
}

export async function logout() {
  const refreshToken = await tokenStorage.get()
  try {
    await request('/api/v1/auth/logout', { method: 'POST', body: refreshToken ? { refreshToken } : {}, retry: false })
  } catch {
    /* sign out locally even if the server is unreachable */
  }
  await tokenStorage.clear()
  useAuthStore.getState().clear()
}

/** Uploads an image picked with expo-image-picker as multipart/form-data (field "file"). */
export async function uploadImage<T>(path: string, asset: { uri: string; mimeType?: string | null; fileName?: string | null; file?: Blob }): Promise<T> {
  const form = new FormData()
  if (asset.file) {
    form.append('file', asset.file, asset.fileName ?? 'image.jpg')
  } else {
    // React Native's FormData accepts { uri, name, type } file parts.
    form.append('file', { uri: asset.uri, name: asset.fileName ?? 'image.jpg', type: asset.mimeType ?? 'image/jpeg' } as unknown as Blob)
  }
  const send = () =>
    fetch(`${API_BASE}${path}`, { method: 'POST', headers: { ...BASE_HEADERS, Authorization: `Bearer ${useAuthStore.getState().accessToken ?? ''}` }, body: form })
  let res: Response
  try {
    res = await send()
    if (res.status === 401 && (await refreshSession())) res = await send()
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.')
  }
  const body = (await res.json().catch(() => undefined)) as ApiEnvelope<T> | undefined
  if (!res.ok || body?.success === false) {
    throw new ApiError(res.status, body?.error?.code ?? 'UPLOAD_FAILED', body?.error?.message ?? `Upload failed (${res.status})`, body?.error?.details ?? [])
  }
  return body!.data
}
