import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type AuthSessionUser = {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  storeId?: string | null;
  tenantId: string;
  pinSet?: boolean;
};

type AuthState = {
  /** Full email/password (or Google) unlock of this counter browser */
  stationToken: string | null;
  /** Acting cashier — password access or pin_access */
  accessToken: string | null;
  /** Refresh belongs to the station opener only */
  refreshToken: string | null;
  /** Currently attributed staff (cleared on idle lock) */
  user: AuthSessionUser | null;
  /** Who unlocked the station (kept across idle lock) */
  stationUser: AuthSessionUser | null;
  tenantSlug: string | null;
  /** Idle / switch-user lock — PinPad visible, station still trusted */
  pinLocked: boolean;
  lastPinUserId: string | null;
  setSession: (payload: {
    accessToken: string;
    stationToken?: string | null;
    refreshToken: string;
    user: AuthSessionUser;
    tenantSlug?: string;
  }) => void;
  setActingSession: (payload: {
    accessToken: string;
    user: AuthSessionUser;
  }) => void;
  setTokens: (
    accessToken: string,
    refreshToken: string,
    stationToken?: string | null,
  ) => void;
  /** Clear acting user only — keep stationToken / refresh / stationUser */
  lockStation: () => void;
  clear: () => void;
};

/** sessionStorage = safer on shared POS counters (clears when tab closes) */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      stationToken: null,
      accessToken: null,
      refreshToken: null,
      user: null,
      stationUser: null,
      tenantSlug: null,
      pinLocked: false,
      lastPinUserId: null,
      setSession: ({
        accessToken,
        stationToken,
        refreshToken,
        user,
        tenantSlug,
      }) =>
        set((s) => ({
          accessToken,
          stationToken: stationToken ?? accessToken,
          refreshToken,
          user,
          stationUser: user,
          pinLocked: false,
          lastPinUserId: user.id,
          tenantSlug: tenantSlug ?? s.tenantSlug,
        })),
      setActingSession: ({ accessToken, user }) =>
        set({
          accessToken,
          user,
          pinLocked: false,
          lastPinUserId: user.id,
        }),
      setTokens: (accessToken, refreshToken, stationToken) =>
        set((s) => ({
          accessToken,
          refreshToken,
          ...(stationToken !== undefined
            ? { stationToken: stationToken ?? s.stationToken }
            : {}),
        })),
      lockStation: () =>
        set({
          accessToken: null,
          user: null,
          pinLocked: true,
        }),
      clear: () =>
        set({
          stationToken: null,
          accessToken: null,
          refreshToken: null,
          user: null,
          stationUser: null,
          pinLocked: false,
          lastPinUserId: null,
          // keep tenantSlug for faster re-login on same machine
        }),
    }),
    {
      name: "universal-pos-auth",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({
        stationToken: s.stationToken,
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        user: s.user,
        stationUser: s.stationUser,
        tenantSlug: s.tenantSlug,
        pinLocked: s.pinLocked,
        lastPinUserId: s.lastPinUserId,
      }),
    },
  ),
);
