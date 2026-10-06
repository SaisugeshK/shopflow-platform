import { useMutation, useQuery } from '@tanstack/react-query'
import { RotateCcw, Save } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Data'
import { Alert, QueryState } from '@/components/ui/Feedback'
import { Checkbox, Field, Input } from '@/components/ui/Form'
import { useToast } from '@/components/ui/Toast'
import { api, ApiError } from '@/services/api'
import { ALL_UNITS, unitLabel } from '@/stores/words'

interface Vocab {
  terms: Record<string, string>
  units: string[]
  defaultTerms: Record<string, string>
  defaultUnits: string[]
  industry: string
}

const WORDS: [string, string][] = [
  ['product', 'One product'], ['products', 'Many products'], ['customer', 'One customer'], ['customers', 'Many customers'],
  ['supplier', 'One supplier'], ['suppliers', 'Many suppliers'],
]

/**
 * Settings → Words & units (§0B.15): the words the screens use and the units offered in unit lists. Starts from the
 * business's industry; empty fields go back to the industry word. Invoices keep their legal wording.
 */
export function WordsSettings() {
  const q = useQuery({ queryKey: ['vocabulary'], queryFn: () => api.get<Vocab>('/api/v1/business/vocabulary') })
  return <QueryState query={q}>{(v) => <WordsForm v={v} />}</QueryState>
}

function WordsForm({ v }: { v: Vocab }) {
  const toast = useToast()
  const [terms, setTerms] = useState<Record<string, string>>({ ...v.terms })
  const [variants, setVariants] = useState((v.terms.variantOptions ?? '').split('|').join(', '))
  const [units, setUnits] = useState<string[]>(v.units)
  const save = useMutation({
    mutationFn: (reset: boolean) => api.put<Vocab>('/api/v1/business/vocabulary', reset ? {} : {
      terms: { ...terms, variantOptions: variants.split(',').map((s) => s.trim()).filter(Boolean).join('|') },
      units: ALL_UNITS.filter((u) => units.includes(u)),
    }),
    onSuccess: () => {
      toast.success('Words saved', 'Refreshing the screens…')
      // Every screen reads the words when it draws; a reload makes them all use the new ones at once.
      setTimeout(() => window.location.reload(), 600)
    },
  })
  const err = save.error instanceof ApiError ? save.error : null
  return (
    <div className="stack">
      <Alert tone="info">These words appear in menus, page titles, forms and lists. They start from your industry ({v.industry.toLowerCase().replace(/_/g, ' ')}); leave a box empty to use the industry word. Invoices keep their legal wording.</Alert>
      <Card title="Words">
        <div className="form-grid">
          {WORDS.map(([key, label]) => (
            <Field key={key} label={label} htmlFor={`w-${key}`} hint={`Industry word: ${v.defaultTerms[key]}`}>
              <Input id={`w-${key}`} value={terms[key] ?? ''} maxLength={40} onChange={(e) => setTerms({ ...terms, [key]: e.target.value })} />
            </Field>
          ))}
          <Field label="Variant options" htmlFor="w-variants" className="span-2" hint={`Offered when creating variants, comma separated. Industry: ${(v.defaultTerms.variantOptions ?? '').split('|').join(', ')}`}>
            <Input id="w-variants" value={variants} onChange={(e) => setVariants(e.target.value)} />
          </Field>
        </div>
      </Card>
      <Card title="Units" actions={<span className="xs muted">{units.length} chosen</span>}>
        <p className="small muted" style={{ marginBottom: 12 }}>Units shown when adding a product, a pack size or a purchase. Industry units: {v.defaultUnits.join(', ')}.</p>
        <div className="units-grid">
          {ALL_UNITS.map((u) => (
            <Checkbox key={u} label={unitLabel(u)} checked={units.includes(u)} onChange={(on) => setUnits(on ? [...units, u] : units.filter((x) => x !== u))} />
          ))}
        </div>
      </Card>
      {err && <Alert tone="danger">{err.message}</Alert>}
      <div className="form-actions">
        <Button variant="secondary" icon={<RotateCcw size={16} />} loading={save.isPending && save.variables === true} onClick={() => save.mutate(true)}>Use industry defaults</Button>
        <Button icon={<Save size={16} />} disabled={units.length === 0} loading={save.isPending && save.variables === false} onClick={() => save.mutate(false)}>Save</Button>
      </div>
    </div>
  )
}
