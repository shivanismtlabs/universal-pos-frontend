"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type BranchState = {
  /** Current operating branch (locationId). null = not chosen yet */
  currentLocationId: string | null;
  setCurrentLocationId: (id: string | null) => void;
};

/**
 * Global current branch context.
 * Branch ≡ Location. Persisted per browser so POS/reports stay on the same branch.
 */
export const useBranchStore = create<BranchState>()(
  persist(
    (set) => ({
      currentLocationId: null,
      setCurrentLocationId: (id) => set({ currentLocationId: id }),
    }),
    { name: "upos-current-branch" },
  ),
);
