import clsx from 'clsx'
import { LoaderCircle } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  block?: boolean
  icon?: ReactNode
}

export function Button({ variant = 'primary', size = 'md', loading, block, icon, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx('btn', `btn-${variant}`, size !== 'md' && `btn-${size}`, block && 'btn-block', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <LoaderCircle size={16} className="spin" aria-hidden /> : icon}
      {children}
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  children: ReactNode
}

/** Icon-only button; {@code label} is required for screen readers. */
export function IconButton({ label, children, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button type={type} className={clsx('icon-btn', className)} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  )
}
