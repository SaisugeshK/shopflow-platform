import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Data'
import { Alert, QueryState } from '@/components/ui/Feedback'
import { Field, Input, SwitchRow } from '@/components/ui/Form'
import { Text } from '@/components/ui/Text'
import { toast } from '@/components/ui/Toast'
import { api, ApiError, type Me } from '@/services/api'
import { useAuthStore } from '@/store/auth'
import { ALL_UNITS, unitLabel } from '@/store/words'

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

/** Settings → Words & units (§0B.15), same rules as the web app. */
export function WordsSettings() {
  const q = useQuery({ queryKey: ['vocabulary'], queryFn: () => api.get<Vocab>('/api/v1/business/vocabulary') })
  return <QueryState query={q}>{(v) => <WordsForm v={v} />}</QueryState>
}

function WordsForm({ v }: { v: Vocab }) {
  const qc = useQueryClient()
  const [terms, setTerms] = useState<Record<string, string>>({ ...v.terms })
  const [variants, setVariants] = useState((v.terms.variantOptions ?? '').split('|').join(', '))
  const [units, setUnits] = useState<string[]>(v.units)
  const save = useMutation({
    mutationFn: async (reset: boolean) => {
      await api.put<Vocab>('/api/v1/business/vocabulary', reset ? {} : {
        terms: { ...terms, variantOptions: variants.split(',').map((s) => s.trim()).filter(Boolean).join('|') },
        units: ALL_UNITS.filter((u) => units.includes(u)),
      })
      useAuthStore.getState().setUser(await api.get<Me>('/api/v1/auth/me'))
    },
    onSuccess: () => {
      toast.success('Words saved')
      qc.clear()
      // Re-open the app's screens so every title and menu uses the new words.
      router.replace('/admin')
    },
  })
  const err = save.error instanceof ApiError ? save.error : null
  return (
    <View style={{ gap: 14 }}>
      <Alert>These words appear in menus, titles, forms and lists. They start from your industry ({v.industry.toLowerCase().replace(/_/g, ' ')}); leave a box empty to use the industry word. Invoices keep their legal wording.</Alert>
      <Card title="Words">
        <View style={{ gap: 12 }}>
          {WORDS.map(([key, label]) => (
            <Field key={key} label={label} hint={`Industry word: ${v.defaultTerms[key] ?? ''}`}>
              <Input value={terms[key] ?? ''} maxLength={40} onChangeText={(t) => setTerms({ ...terms, [key]: t })} accessibilityLabel={label} />
            </Field>
          ))}
          <Field label="Variant options" hint="Offered when creating variants, comma separated">
            <Input value={variants} onChangeText={setVariants} accessibilityLabel="Variant options" />
          </Field>
        </View>
      </Card>
      <Card title={`Units · ${units.length} chosen`}>
        <Text variant="xs" color="muted">Industry units: {v.defaultUnits.join(', ')}</Text>
        {ALL_UNITS.map((u) => (
          <SwitchRow key={u} label={unitLabel(u)} value={units.includes(u)} onChange={(on) => setUnits(on ? [...units, u] : units.filter((x) => x !== u))} />
        ))}
      </Card>
      {err && <Alert tone="danger">{err.message}</Alert>}
      <Button icon="save" disabled={units.length === 0} loading={save.isPending && save.variables === false} onPress={() => save.mutate(false)}>Save</Button>
      <Button variant="secondary" icon="rotate-ccw" loading={save.isPending && save.variables === true} onPress={() => save.mutate(true)}>Use industry defaults</Button>
    </View>
  )
}
