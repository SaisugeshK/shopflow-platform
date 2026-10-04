import { useEffect, useState } from 'react'

/** True while the CSS media query matches (e.g. `(max-width: 767px)`); updates on resize/rotation. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}

/** Phone-width layout (below the 768px breakpoint of the responsive standard, §0B.11). */
export const PHONE_QUERY = '(max-width: 767px)'
