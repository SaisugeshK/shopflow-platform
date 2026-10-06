import { useQuery } from '@tanstack/react-query'
import { Package, Search } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { ClearButton } from '@/components/ui/Form'
import { useDebounced } from '@/hooks/useListParams'
import { api } from '@/services/api'
import type { Product } from '@/services/types'
import { money, quantity } from '@/utils/format'
import { wordify } from '@/stores/words'

/** Type-ahead product search used by purchase and invoice entry forms. Keyboard: ↑/↓ to move, Enter to pick. */
export function ProductPicker({ onPick, placeholder = 'Search product by name or SKU…', exclude = [] }: { onPick: (p: Product) => void; placeholder?: string; exclude?: string[] }) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const q = useDebounced(text, 250)
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const results = useQuery({
    queryKey: ['products', 'picker', q],
    // Variant groups are templates, never bought or sold themselves.
    queryFn: () => api.page<Product>('/api/v1/products', { q, active: true, sellable: true, pageSize: 10 }),
    enabled: open,
  })
  const items = (results.data?.items ?? []).filter((p) => !exclude.includes(p.id))
  const pick = (p: Product) => {
    onPick(p)
    setText('')
    setOpen(false)
  }
  return (
    <div style={{ position: 'relative' }}>
      <div className="input-group has-clear">
        <Search size={16} className="prefix" aria-hidden />
        <input
          ref={inputRef}
          className="input"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="Add product"
          placeholder={wordify(placeholder)}
          value={text}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            setText(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, items.length - 1))
            if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0))
            if (e.key === 'Enter' && items[active]) {
              e.preventDefault()
              pick(items[active])
            }
            if (e.key === 'Escape') setOpen(false)
          }}
        />
        {text && <ClearButton onClear={() => { setText(''); setActive(0); inputRef.current?.focus() }} />}
      </div>
      {open && (
        <ul id={listId} role="listbox" className="menu" style={{ left: 0, right: 0, maxHeight: 320, overflowY: 'auto', listStyle: 'none', margin: 0 }}>
          {results.isLoading && <li className="menu-item muted">Searching…</li>}
          {!results.isLoading && items.length === 0 && <li className="menu-item muted">No matching products</li>}
          {items.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}>
              <button type="button" className="menu-item" style={{ background: i === active ? 'var(--color-surface-2)' : undefined }} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)}>
                <Package size={16} className="muted" />
                <span className="grow">
                  <span style={{ display: 'block', fontWeight: 600 }}>{p.name}</span>
                  <span className="xs muted">{p.sku} · {p.gstRate}% GST · {quantity(p.available)} {p.unit} available</span>
                </span>
                <span className="small num">{money(p.sellingPrice)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
