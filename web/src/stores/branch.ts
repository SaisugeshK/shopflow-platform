import { create } from 'zustand'

/**
 * The branch / warehouse staff work at (§0B.14). Sent to the API as the X-Branch-Id header; remembered per business in
 * this browser only (a convenience — the server validates it on every stock movement).
 */
interface BranchState {
  branchId: string | null
  businessId: string | null
  load: (businessId: string | null) => void
  choose: (branchId: string | null) => void
}

const key = (businessId: string) => `shopflow.branch.${businessId}`

function read(businessId: string): string | null {
  try {
    return window.localStorage.getItem(key(businessId))
  } catch {
    return null
  }
}

export const useBranchStore = create<BranchState>((set, get) => ({
  branchId: null,
  businessId: null,
  load: (businessId) => set({ businessId, branchId: businessId ? read(businessId) : null }),
  choose: (branchId) => {
    const businessId = get().businessId
    try {
      if (businessId) {
        if (branchId) window.localStorage.setItem(key(businessId), branchId)
        else window.localStorage.removeItem(key(businessId))
      }
    } catch {
      /* storage unavailable: the choice lasts for this page only */
    }
    set({ branchId })
  },
}))
