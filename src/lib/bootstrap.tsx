"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { appsApi } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import type { TenantBootstrap } from "@/lib/bootstrap-types";
import { formatMoney } from "@/lib/utils";

type BootstrapContextValue = {
  data: TenantBootstrap | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  hasModule: (code: string) => boolean;
  /** True if tenant enabled this commerce mode (sale|rental|service|…) */
  hasMode: (code: string) => boolean;
  flag: (key: string) => boolean;
  productName: string;
  tagline: string;
  currencyCode: string;
  locale: string;
  money: (amount: string | number | null | undefined) => string;
  commerceModes: string[];
  /** @deprecated prefer hasMode('sale') */
  hasSale: boolean;
  /** @deprecated prefer hasMode('rental') */
  hasRentalMode: boolean;
  commerceSetupComplete: boolean;
};

const BootstrapContext = createContext<BootstrapContextValue | null>(null);

export function BootstrapProvider({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.accessToken);

  const query = useQuery({
    queryKey: ["tenant-bootstrap"],
    queryFn: () => appsApi.bootstrap(),
    enabled: Boolean(token),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const data = query.data;

  const hasModule = useCallback(
    (code: string) =>
      Boolean(
        data?.modules?.some((m) => m.code === code && m.status === "enabled"),
      ),
    [data?.modules],
  );

  const flag = useCallback(
    (key: string) =>
      Boolean(data?.featureFlags?.find((f) => f.key === key)?.enabled),
    [data?.featureFlags],
  );

  const productName =
    data?.tenant?.branding?.productName?.trim() ||
    data?.tenant?.name?.trim() ||
    "Business OS";
  const tagline =
    data?.tenant?.branding?.tagline?.trim() || "Point of sale";
  const currencyCode = data?.tenant?.currencyCode || "INR";
  const locale = data?.tenant?.locale || "en-IN";

  const money = useCallback(
    (amount: string | number | null | undefined) =>
      formatMoney(amount, currencyCode, locale),
    [currencyCode, locale],
  );

  const commerceSetupComplete = Boolean(data?.commerce?.setupComplete);
  const commerceModes = (
    commerceSetupComplete && data?.commerce?.modes?.length
      ? data.commerce.modes
      : []
  ) as string[];

  const hasMode = useCallback(
    (code: string) => commerceModes.includes(code),
    [commerceModes],
  );

  const hasSale = hasMode("sale");
  const hasRentalMode = hasMode("rental");

  const value = useMemo<BootstrapContextValue>(
    () => ({
      data,
      isLoading: query.isLoading && !data,
      isError: query.isError,
      refetch: () => {
        void query.refetch();
      },
      hasModule,
      hasMode,
      flag,
      productName,
      tagline,
      currencyCode,
      locale,
      money,
      commerceModes,
      hasSale,
      hasRentalMode,
      commerceSetupComplete,
    }),
    [
      data,
      query.isLoading,
      query.isError,
      query.refetch,
      hasModule,
      hasMode,
      flag,
      productName,
      tagline,
      currencyCode,
      locale,
      money,
      commerceModes,
      hasSale,
      hasRentalMode,
      commerceSetupComplete,
    ],
  );

  return (
    <BootstrapContext.Provider value={value}>
      {children}
    </BootstrapContext.Provider>
  );
}

export function useBootstrap() {
  const ctx = useContext(BootstrapContext);
  if (!ctx) {
    throw new Error("useBootstrap must be used within BootstrapProvider");
  }
  return ctx;
}

/** Safe for components that may render outside the provider (e.g. login). */
export function useBootstrapOptional() {
  return useContext(BootstrapContext);
}
