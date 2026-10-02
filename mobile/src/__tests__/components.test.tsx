import { fireEvent, render, screen } from '@testing-library/react-native'
import { StatusBadge, TaxBreakdown } from '@/components/ui/Data'
import { MoneyInput, OTPInput, QuantityStepper } from '@/components/ui/Form'

jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn(), WHEN_UNLOCKED_THIS_DEVICE_ONLY: 0 }))

const totals = { subtotal: 395, discountTotal: 0, taxableTotal: 395, cgstTotal: 9.88, sgstTotal: 9.88, igstTotal: 0, roundOff: 0.24, grandTotal: 415 }

describe('TaxBreakdown', () => {
  it('shows CGST + SGST for intra-state supply exactly as given by the server', async () => {
    await render(<TaxBreakdown t={totals} />)
    expect(screen.getByText('CGST')).toBeTruthy()
    expect(screen.getByText('SGST/UTGST')).toBeTruthy()
    expect(screen.queryByText('IGST')).toBeNull()
    expect(screen.getByText('₹415.00')).toBeTruthy()
    expect(screen.getByText('₹0.24')).toBeTruthy()
  })
  it('shows IGST for inter-state supply', async () => {
    await render(<TaxBreakdown t={{ ...totals, cgstTotal: 0, sgstTotal: 0, igstTotal: 19.76, interState: true }} />)
    expect(screen.getByText('IGST')).toBeTruthy()
    expect(screen.queryByText('CGST')).toBeNull()
  })
})

describe('StatusBadge', () => {
  it('renders a readable label', async () => {
    await render(<StatusBadge status="OUT_FOR_DELIVERY" />)
    expect(screen.getByText('Out For Delivery')).toBeTruthy()
  })
})

describe('form controls', () => {
  it('OTP input keeps digits only, up to six', async () => {
    const onChange = jest.fn()
    await render(<OTPInput value="" onChange={onChange} />)
    await fireEvent.changeText(screen.getByTestId('otp-input'), '12a34567')
    expect(onChange).toHaveBeenCalledWith('123456')
  })
  it('money input limits to two decimals and strips other characters', async () => {
    const onChange = jest.fn()
    await render(<MoneyInput value="" onChangeText={onChange} accessibilityLabel="Amount" />)
    await fireEvent.changeText(screen.getByLabelText('Amount'), '₹1,234.567')
    expect(onChange).toHaveBeenCalledWith('1234.56')
  })
  it('quantity stepper respects min and max', async () => {
    const onChange = jest.fn()
    await render(<QuantityStepper value={1} onChange={onChange} min={1} max={2} label="Qty" />)
    await fireEvent.press(screen.getByLabelText('Increase Qty'))
    expect(onChange).toHaveBeenCalledWith(2)
    onChange.mockClear()
    await fireEvent.press(screen.getByLabelText('Decrease Qty'))
    expect(onChange).not.toHaveBeenCalled()
  })
})
