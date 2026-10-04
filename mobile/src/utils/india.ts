/** Indian states / union territories (same list as the web registration form). */
export const STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
]

export const STATE_OPTIONS = STATES.map((s) => ({ value: s, label: s }))

export const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
export const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/
export const PINCODE = /^[1-9][0-9]{5}$/
export const MOBILE = /^[6-9]\d{9}$/
export const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** GST state codes (same as the web app). */
export const GST_STATES: { name: string; code: string }[] = [
  { name: 'Jammu and Kashmir', code: '01' }, { name: 'Himachal Pradesh', code: '02' }, { name: 'Punjab', code: '03' },
  { name: 'Chandigarh', code: '04' }, { name: 'Uttarakhand', code: '05' }, { name: 'Haryana', code: '06' },
  { name: 'Delhi', code: '07' }, { name: 'Rajasthan', code: '08' }, { name: 'Uttar Pradesh', code: '09' },
  { name: 'Bihar', code: '10' }, { name: 'Sikkim', code: '11' }, { name: 'Arunachal Pradesh', code: '12' },
  { name: 'Nagaland', code: '13' }, { name: 'Manipur', code: '14' }, { name: 'Mizoram', code: '15' },
  { name: 'Tripura', code: '16' }, { name: 'Meghalaya', code: '17' }, { name: 'Assam', code: '18' },
  { name: 'West Bengal', code: '19' }, { name: 'Jharkhand', code: '20' }, { name: 'Odisha', code: '21' },
  { name: 'Chhattisgarh', code: '22' }, { name: 'Madhya Pradesh', code: '23' }, { name: 'Gujarat', code: '24' },
  { name: 'Dadra and Nagar Haveli and Daman and Diu', code: '26' }, { name: 'Maharashtra', code: '27' },
  { name: 'Karnataka', code: '29' }, { name: 'Goa', code: '30' }, { name: 'Lakshadweep', code: '31' },
  { name: 'Kerala', code: '32' }, { name: 'Tamil Nadu', code: '33' }, { name: 'Puducherry', code: '34' },
  { name: 'Andaman and Nicobar Islands', code: '35' }, { name: 'Telangana', code: '36' }, { name: 'Andhra Pradesh', code: '37' },
  { name: 'Ladakh', code: '38' },
]

export function stateCodeOf(name: string): string | undefined {
  return GST_STATES.find((s) => s.name === name)?.code
}
