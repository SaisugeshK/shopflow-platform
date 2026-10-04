import { useEffect, useState } from 'react'
import { API_BASE } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { initials } from '@/utils/format'

/** The signed-in session's business (tenant branding, §0B.10). Falls back to the product name before it loads. */
export function useBusiness() {
  const business = useAuthStore((s) => s.user?.business)
  return { name: business?.name || 'ShopFlow', logoUrl: business?.logoUrl ? `${API_BASE}${business.logoUrl}` : undefined }
}

/** Sets the browser tab title to the business name (and an optional page name). */
export function useBusinessTitle(page?: string) {
  const { name } = useBusiness()
  useEffect(() => {
    document.title = page ? `${page} · ${name}` : name
  }, [name, page])
}

/** Logo (or initials when no logo is uploaded) + business name. */
export function BusinessBrand({ nameClassName, size = 34 }: { nameClassName?: string; size?: number }) {
  const { name, logoUrl } = useBusiness()
  const [broken, setBroken] = useState(false)
  return (
    <>
      {logoUrl && !broken ? (
        <img className="brand-logo" src={logoUrl} alt="" width={size} height={size} onError={() => setBroken(true)} />
      ) : (
        <span className="brand-mark" style={{ width: size, height: size }} aria-hidden>{initials(name)}</span>
      )}
      <span className={nameClassName} title={name}>{name}</span>
    </>
  )
}

/** Small product credit shown under the tenant's own branding. */
export function PoweredBy({ className }: { className?: string }) {
  return <span className={className ?? 'powered-by'}>Powered by <strong>ShopFlow</strong></span>
}
