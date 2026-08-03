import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type AuthSessionUser = {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  storeId?: string | null;
  tenantId: string;
};

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthSessionUser | null;
  tenantSlug: string | null;
  setSession: (payload: {
    accessToken: string;
    refreshToken: string;
    user: AuthSessionUser;
    tenantSlug?: string;
  }) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  clear: () => void;
};

/** sessionStorage = safer on shared POS counters (clears when tab closes) */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      tenantSlug: null,
      setSession: ({ accessToken, refreshToken, user, tenantSlug }) =>
        set((s) => ({
          accessToken,
          refreshToken,
          user,
          tenantSlug: tenantSlug ?? s.tenantSlug,
        })),
      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),
      clear: () =>
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          // keep tenantSlug for faster re-login on same machine
        }),
    }),
    {
      name: "tuxedo-pos-auth",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        user: s.user,
        tenantSlug: s.tenantSlug,
      }),
    },
  ),
);
