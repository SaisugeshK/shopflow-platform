import { useState, type ReactNode } from 'react'
import { View } from 'react-native'
import { Button } from '@/components/ui/Button'
import { ChipGroup, SearchBar, type Option } from '@/components/ui/Form'
import { Sheet } from '@/components/ui/Overlay'

/**
 * Standard list header: search, quick chips, and a "Filters" sheet for the less common filters (dates, method…).
 * `activeCount` shows how many sheet filters are set.
 */
export function ListFilters({ search, onSearch, placeholder, chips, chip, onChip, activeCount = 0, sheet, onClear, action }: {
  search?: string
  onSearch?: (v: string) => void
  placeholder?: string
  chips?: Option[]
  chip?: string
  onChip?: (v: string) => void
  activeCount?: number
  sheet?: ReactNode
  onClear?: () => void
  action?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <View style={{ gap: 10 }}>
      {(onSearch || sheet || action) && (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          {onSearch && <View style={{ flex: 1 }}><SearchBar value={search ?? ''} onChangeText={onSearch} placeholder={placeholder} /></View>}
          {sheet && (
            <Button variant={activeCount ? 'primary' : 'secondary'} icon="sliders" onPress={() => setOpen(true)} accessibilityLabel={`Filters${activeCount ? `, ${activeCount} active` : ''}`}>
              {activeCount ? String(activeCount) : 'Filter'}
            </Button>
          )}
          {action}
        </View>
      )}
      {chips && onChip && <ChipGroup options={chips} value={chip ?? ''} onChange={onChip} />}
      {sheet && (
        <Sheet open={open} onClose={() => setOpen(false)} title="Filters" footer={
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {onClear && <Button variant="secondary" style={{ flex: 1 }} onPress={() => { onClear(); setOpen(false) }}>Clear</Button>}
            <Button style={{ flex: 1 }} onPress={() => setOpen(false)}>Show results</Button>
          </View>
        }>
          {sheet}
        </Sheet>
      )}
    </View>
  )
}
