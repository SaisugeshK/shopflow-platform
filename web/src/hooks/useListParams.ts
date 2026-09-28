import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

export function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

/**
 * List state (page, sort, search and filters) kept in the URL so lists are shareable and survive reloads.
 */
export function useListParams(defaults: Record<string, string> = {}) {
  const [params, setParams] = useSearchParams()
  const get = (k: string) => params.get(k) ?? defaults[k] ?? ''
  const [search, setSearch] = useState(get('q'))
  const debounced = useDebounced(search)

  useEffect(() => {
    if (debounced !== (params.get('q') ?? '')) {
      update({ q: debounced, page: '' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  function update(changes: Record<string, string | undefined>) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [k, v] of Object.entries(changes)) {
          if (v === undefined || v === '') next.delete(k)
          else next.set(k, v)
        }
        return next
      },
      { replace: true },
    )
  }

  const query = useMemo(() => {
    const q: Record<string, string> = { ...defaults }
    params.forEach((v, k) => {
      q[k] = v
    })
    return q
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  return {
    query,
    page: Number(get('page') || 1),
    sort: get('sort'),
    search,
    setSearch,
    get,
    set: (k: string, v: string | undefined) => update({ [k]: v, ...(k !== 'page' ? { page: '' } : {}) }),
    setPage: (p: number) => update({ page: p > 1 ? String(p) : '' }),
    setSort: (s: string) => update({ sort: s }),
  }
}
