import { create } from 'zustand'

/**
 * The branch / warehouse staff work at (§0B.14), sent to the API as the X-Branch-Id header. Kept for the session only;
 * the server validates it on every stock movement.
 */
interface BranchState {
  branchId: string | null
  choose: (branchId: string | null) => void
}

export const useBranchStore = create<BranchState>((set) => ({
  branchId: null,
  choose: (branchId) => set({ branchId }),
}))
