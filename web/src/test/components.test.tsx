import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DataTable, StatusBadge, TaxBreakdown } from '@/components/ui/Data'
import { ErrorState, QueryState } from '@/components/ui/Feedback'
import { OTPInput, QuantityStepper } from '@/components/ui/Form'
import { ApiError } from '@/services/api'

describe('StatusBadge', () => {
  it('always shows a text label, not colour alone', () => {
    render(<StatusBadge status="OUT_FOR_DELIVERY" />)
    expect(screen.getByText('Out For Delivery')).toBeInTheDocument()
  })
})

describe('OTPInput', () => {
  function Harness({ onDone }: { onDone: (v: string) => void }) {
    const [v, setV] = useState('')
    return <OTPInput value={v} onChange={(x) => { setV(x); if (x.length === 6) onDone(x) }} />
  }
  it('accepts a pasted code and fills all digits', async () => {
    const onDone = vi.fn()
    render(<Harness onDone={onDone} />)
    await userEvent.click(screen.getByLabelText('Digit 1'))
    await userEvent.paste('482731')
    expect(onDone).toHaveBeenCalledWith('482731')
  })
  it('advances focus as digits are typed', async () => {
    render(<Harness onDone={() => undefined} />)
    await userEvent.type(screen.getByLabelText('Digit 1'), '12')
    expect(screen.getByLabelText('Digit 3')).toHaveFocus()
  })
})

describe('QuantityStepper', () => {
  it('respects min and max', async () => {
    const onChange = vi.fn()
    render(<QuantityStepper value={1} onChange={onChange} min={1} max={2} />)
    expect(screen.getByLabelText('Decrease')).toBeDisabled()
    await userEvent.click(screen.getByLabelText('Increase'))
    expect(onChange).toHaveBeenCalledWith(2)
  })
})

describe('TaxBreakdown', () => {
  it('shows CGST/SGST for intra-state and IGST for inter-state', () => {
    const base = { subtotal: 500, discountTotal: 0, taxableTotal: 500, cgstTotal: 45, sgstTotal: 45, igstTotal: 0, roundOff: 0, grandTotal: 590 }
    const { rerender } = render(<TaxBreakdown t={base} />)
    expect(screen.getByText('CGST')).toBeInTheDocument()
    expect(screen.queryByText('IGST')).not.toBeInTheDocument()
    rerender(<TaxBreakdown t={{ ...base, cgstTotal: 0, sgstTotal: 0, igstTotal: 90, interState: true }} />)
    expect(screen.getByText('IGST')).toBeInTheDocument()
  })
})

describe('DataTable', () => {
  it('makes rows keyboard-activatable', async () => {
    const onClick = vi.fn()
    render(<DataTable rows={[{ id: '1', name: 'Rice' }]} rowKey={(r) => r.id} onRowClick={onClick} columns={[{ key: 'n', header: 'Name', render: (r) => r.name }]} />)
    const row = screen.getByText('Rice').closest('tr')!
    row.focus()
    await userEvent.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalled()
  })
})

describe('Required UI states', () => {
  it('renders loading, error, empty and permission-denied states', () => {
    const base = { data: undefined, isLoading: false, isError: false, error: null, refetch: () => undefined }
    const { rerender } = render(<QueryState query={{ ...base, isLoading: true }}>{() => <p>content</p>}</QueryState>)
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
    rerender(<QueryState query={{ ...base, data: [] as string[] }} isEmpty={(d) => d.length === 0}>{() => <p>content</p>}</QueryState>)
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument()
    rerender(<ErrorState error={new ApiError(403, 'AUTH_FORBIDDEN', 'no')} />)
    expect(screen.getByText('Permission denied')).toBeInTheDocument()
    rerender(<ErrorState error={new ApiError(0, 'NETWORK_ERROR', 'offline')} />)
    expect(screen.getByText('You are offline')).toBeInTheDocument()
  })
})
