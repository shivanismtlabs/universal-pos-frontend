"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type BranchState = {
  /** Tenant that currentLocationId belongs to — avoids stale UUID after org switch */
  tenantId: string | null;
  /** Current operating branch (locationId). null = not chosen yet */
  currentLocationId: string | null;
  bindTenant: (tenantId: string | null) => void;
  setCurrentLocationId: (id: string | null) => void;
};

/**
 * Global current branch context.
 * Branch ≡ Location. Persisted per tenant so POS/reports stay on the same branch.
 */
export const useBranchStore = create<BranchState>()(
  persist(
    (set, get) => ({
      tenantId: null,
      currentLocationId: null,
      bindTenant: (tenantId) => {
        const cur = get();
        if (!tenantId) {
          set({ tenantId: null, currentLocationId: null });
          return;
        }
        if (cur.tenantId === tenantId) return;
        // Old persist had no tenantId — keep location; selector validates it
        if (cur.tenantId == null && cur.currentLocationId) {
          set({ tenantId });
          return;
        }
        set({ tenantId, currentLocationId: null });
      },
      setCurrentLocationId: (id) => set({ currentLocationId: id }),
    }),
    { name: "upos-current-branch" },
  ),
);
