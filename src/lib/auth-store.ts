"use client";

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

export type PortalIdentity = {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
};

export type PortalOrganization = {
  tenantId: string;
  name: string;
  slug: string;
  currencyCode: string;
  role?: string;
};

type AuthState = {
  /** Full email/password (or Google) unlock of this counter browser */
  stationToken: string | null;
  /** Acting cashier — password access or pin_access */
  accessToken: string | null;
  /** Refresh belongs to the station opener only */
  refreshToken: string | null;
  /** Zoho identity session (before/while picking org) */
  identityToken: string | null;
  identityRefreshToken: string | null;
  identity: PortalIdentity | null;
  /** Currently attributed staff (cleared on idle lock) */
  user: AuthSessionUser | null;
  /** Who unlocked the station (kept across idle lock) */
  stationUser: AuthSessionUser | null;
  tenantSlug: string | null;
  /** Idle / switch-user lock — PinPad visible, station still trusted */
  pinLocked: boolean;
  lastPinUserId: string | null;
  setIdentitySession: (payload: {
    identityToken: string;
    identityRefreshToken?: string | null;
    identity: PortalIdentity;
  }) => void;
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
  clearTenantSession: () => void;
};

/** sessionStorage = safer on shared POS counters (clears when tab closes) */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      stationToken: null,
      accessToken: null,
      refreshToken: null,
      identityToken: null,
      identityRefreshToken: null,
      identity: null,
      user: null,
      stationUser: null,
      tenantSlug: null,
      pinLocked: false,
      lastPinUserId: null,
      setIdentitySession: ({
        identityToken,
        identityRefreshToken,
        identity,
      }) =>
        set({
          identityToken,
          identityRefreshToken: identityRefreshToken ?? null,
          identity,
          // Leave org until selected
          accessToken: null,
          stationToken: null,
          refreshToken: null,
          user: null,
          stationUser: null,
          pinLocked: false,
        }),
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
      clearTenantSession: () =>
        set({
          stationToken: null,
          accessToken: null,
          refreshToken: null,
          user: null,
          stationUser: null,
          pinLocked: false,
          lastPinUserId: null,
          tenantSlug: null,
        }),
      clear: () =>
        set({
          stationToken: null,
          accessToken: null,
          refreshToken: null,
          identityToken: null,
          identityRefreshToken: null,
          identity: null,
          user: null,
          stationUser: null,
          pinLocked: false,
          lastPinUserId: null,
        }),
    }),
    {
      name: "universal-pos-auth",
      // Avoid SSR crash: sessionStorage is browser-only (Next still pre-renders client components)
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return sessionStorage;
      }),
      partialize: (s) => ({
        stationToken: s.stationToken,
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        identityToken: s.identityToken,
        identityRefreshToken: s.identityRefreshToken,
        identity: s.identity,
        user: s.user,
        stationUser: s.stationUser,
        tenantSlug: s.tenantSlug,
        pinLocked: s.pinLocked,
        lastPinUserId: s.lastPinUserId,
      }),
    },
  ),
);
