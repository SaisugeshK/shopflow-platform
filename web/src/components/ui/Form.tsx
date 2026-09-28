import clsx from 'clsx'
import { Minus, Plus, Search, X } from 'lucide-react'
import { forwardRef, useId, useRef } from 'react'
import type { ChangeEvent, InputHTMLAttributes, KeyboardEvent, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

interface FieldProps {
  label: string
  htmlFor?: string
  error?: string
  hint?: string
  required?: boolean
  className?: string
  children: ReactNode
}

/** Label + control + hint/error, with the error associated to the control via aria-describedby by the caller's id. */
export function Field({ label, htmlFor, error, hint, required, className, children }: FieldProps) {
  return (
    <div className={clsx('field', className)}>
      <label htmlFor={htmlFor}>
        {label}
        {required && <span className="danger-text" aria-hidden> *</span>}
      </label>
      {children}
      {error ? (
        <span className="error" id={htmlFor ? `${htmlFor}-error` : undefined} role="alert">{error}</span>
      ) : hint ? (
        <span className="hint" id={htmlFor ? `${htmlFor}-hint` : undefined}>{hint}</span>
      ) : null}
    </div>
  )
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, invalid, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={clsx('input', className)}
      aria-invalid={invalid || undefined}
      aria-describedby={rest.id ? `${rest.id}-${invalid ? 'error' : 'hint'}` : undefined}
      {...rest}
    />
  )
})

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean; options?: { value: string; label: string }[]; placeholder?: string }

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, invalid, options, placeholder, children, ...rest }, ref) {
  return (
    <select ref={ref} className={clsx('select', className)} aria-invalid={invalid || undefined} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options?.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
      {children}
    </select>
  )
})

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ className, invalid, ...rest }, ref) {
  return <textarea ref={ref} className={clsx('textarea', className)} aria-invalid={invalid || undefined} {...rest} />
})

/** Small × button shown inside an input-group while the field has text. Keeps focus in the input. */
export function ClearButton({ onClear, label = 'Clear search' }: { onClear: () => void; label?: string }) {
  return (
    <button type="button" className="input-clear" aria-label={label} title={label} onMouseDown={(e) => e.preventDefault()} onClick={onClear}>
      <X size={14} aria-hidden />
    </button>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className, label = 'Search' }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; label?: string }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className={clsx('input-group has-clear', className)}>
      <Search size={16} className="prefix" aria-hidden />
      <input ref={ref} className="input" type="search" aria-label={label} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape' && value) onChange('') }} />
      {value && <ClearButton onClear={() => { onChange(''); ref.current?.focus() }} />}
    </div>
  )
}

export const PhoneInput = forwardRef<HTMLInputElement, InputProps>(function PhoneInput({ className, invalid, ...rest }, ref) {
  return (
    <div className={clsx('input-group phone-input', className)}>
      <span className="prefix" style={{ fontWeight: 600, color: 'var(--color-text)' }}>+91</span>
      <input
        ref={ref}
        className="input"
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        maxLength={10}
        placeholder="98765 43210"
        aria-invalid={invalid || undefined}
        {...rest}
      />
    </div>
  )
})

/** Segmented OTP input with paste support and auto-advance. */
export function OTPInput({ value, onChange, length = 6, disabled, autoFocus }: { value: string; onChange: (v: string) => void; length?: number; disabled?: boolean; autoFocus?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const id = useId()
  const digits = Array.from({ length }, (_, i) => value[i] ?? '')

  const setAt = (i: number, d: string) => {
    const next = digits.slice()
    next[i] = d
    onChange(next.join('').slice(0, length))
  }
  const handleChange = (i: number, e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '')
    if (raw.length > 1) {
      onChange(raw.slice(0, length))
      refs.current[Math.min(raw.length, length) - 1]?.focus()
      return
    }
    setAt(i, raw)
    if (raw && i < length - 1) refs.current[i + 1]?.focus()
  }
  const handleKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus()
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
    if (e.key === 'ArrowRight' && i < length - 1) refs.current[i + 1]?.focus()
  }
  return (
    <div className="otp-input" role="group" aria-label="One-time password">
      {digits.map((d, i) => (
        <input
          key={`${id}-${i}`}
          ref={(el) => {
            refs.current[i] = el
          }}
          value={d}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKey(i, e)}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={length}
          aria-label={`Digit ${i + 1}`}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
        />
      ))}
    </div>
  )
}

export function Checkbox({ label, checked, onChange, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      {label}
    </label>
  )
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className="row" style={{ gap: 10, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      <span className="switch">
        <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} aria-label={label} />
        <span />
      </span>
      <span className="small">{label}</span>
    </label>
  )
}

/** Quantity stepper; values are sent to the backend, which validates stock and prices. */
export function QuantityStepper({ value, onChange, min = 1, max, step = 1, disabled, label = 'Quantity' }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; disabled?: boolean; label?: string }) {
  const clamp = (v: number) => Math.max(min, max !== undefined ? Math.min(max, v) : v)
  return (
    <div className="qty-stepper" role="group" aria-label={label}>
      <button type="button" aria-label="Decrease" disabled={disabled || value <= min} onClick={() => onChange(clamp(value - step))}>
        <Minus size={14} />
      </button>
      <input
        type="number"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step="any"
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (!Number.isNaN(n)) onChange(clamp(n))
        }}
      />
      <button type="button" aria-label="Increase" disabled={disabled || (max !== undefined && value >= max)} onClick={() => onChange(clamp(value + step))}>
        <Plus size={14} />
      </button>
    </div>
  )
}

/** Money input showing a ₹ prefix; value stays a string so the backend receives exactly what was typed. */
export const PriceInput = forwardRef<HTMLInputElement, InputProps>(function PriceInput({ className, invalid, ...rest }, ref) {
  return (
    <div className={clsx('input-group', className)}>
      <span className="prefix">₹</span>
      <input ref={ref} className="input" type="number" inputMode="decimal" step="0.01" min="0" aria-invalid={invalid || undefined} {...rest} />
    </div>
  )
})
