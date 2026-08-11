"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { appsApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useBootstrap } from "@/lib/bootstrap";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FALLBACK_PROFILES = [
  {
    id: "retail",
    label: "Retail",
    description: "Catalog + counter for products you sell",
  },
  {
    id: "grocery",
    label: "Grocery / F&B retail",
    description: "Measured pack goods and stock-heavy selling",
  },
  {
    id: "restaurant",
    label: "Restaurant / café",
    description: "Menu items · table meta on orders (same core Order)",
  },
  {
    id: "salon",
    label: "Salon / spa",
    description: "Services + appointments over shared service mode",
  },
  {
    id: "service",
    label: "Service business",
    description: "Billable services without a vertical app fork",
  },
  {
    id: "other",
    label: "Other / general",
    description: "Universal defaults — add your own item fields",
  },
  {
    id: "general",
    label: "General business",
    description: "Universal POS defaults — any industry",
  },
];

const MODE_COPY: Record<string, { title: string; detail: string }> = {
  sale: {
    title: "Sell products",
    detail: "Stock, counter checkout, and receipts",
  },
  rental: {
    title: "Rent items",
    detail: "Units, deposits, and returns",
  },
  service: {
    title: "Bookable services",
    detail: "Appointments and timed services",
  },
  subscription: {
    title: "Customer memberships",
    detail: "Plans you sell to customers — not SaaS billing for this app",
  },
};

/**
 * Setup gate: business profile (BusinessConfig) then commerce modes.
 * Vertical = config only — no restaurant-only / grocery-only apps.
 */
export function CommerceModeGate({ children }: { children: React.ReactNode }) {
  const {
    data,
    isLoading,
    commerceSetupComplete,
    commerceModes,
    businessType,
    refetch,
  } = useBootstrap();
  const qc = useQueryClient();
  const catalog =
    data?.business?.catalog?.length ? data.business.catalog : FALLBACK_PROFILES;

  const registered =
    data?.commerce?.registeredModes ?? Object.keys(MODE_COPY);

  const [step, setStep] = useState<"profile" | "modes">("profile");
  const [profileId, setProfileId] = useState(
    () => (businessType && businessType !== "general" ? businessType : "retail"),
  );
  const [picked, setPicked] = useState<string[]>(() =>
    commerceModes.length ? [...commerceModes] : ["sale"],
  );

  const schemas = useMemo(() => {
    const list = data?.commerce?.modeCatalog;
    if (list?.length) {
      return Object.fromEntries(
        list.map((c) => [
          c.mode,
          { label: c.label, description: c.description },
        ]),
      );
    }
    return data?.commerce?.schemas ?? {};
  }, [data?.commerce]);

  const saveProfile = useMutation({
    mutationFn: () =>
      appsApi.setBusinessConfig({
        businessType: profileId,
        applyDefaultModes: true,
      }),
    onSuccess: async (res) => {
      if (res.commerceModes?.length) {
        setPicked(res.commerceModes);
      }
      toast.success("Business profile saved");
      await qc.invalidateQueries({ queryKey: ["tenant-bootstrap"] });
      refetch();
      setStep("modes");
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Could not save profile",
      ),
  });

  const saveModes = useMutation({
    mutationFn: () =>
      appsApi.setCommerceModes({
        modes: picked,
      }),
    onSuccess: async () => {
      toast.success("Shop capabilities saved");
      await qc.invalidateQueries({ queryKey: ["tenant-bootstrap"] });
      refetch();
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Could not save",
      ),
  });

  if (isLoading) {
    return (
      <div className="grid h-dvh place-items-center bg-[#f4f6fa] text-sm text-[#5a6b7d]">
        Loading shop…
      </div>
    );
  }

  if (commerceSetupComplete && commerceModes.length > 0) {
    return <>{children}</>;
  }

  function toggle(mode: string) {
    setPicked((prev) =>
      prev.includes(mode)
        ? prev.filter((m) => m !== mode)
        : [...prev, mode],
    );
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-[#f4f6fa] px-4 py-10">
      <div className="w-full max-w-lg rounded-xl border border-[#d9e0ea] bg-white p-6 shadow-[0_12px_32px_-24px_rgba(11,31,51,0.2)]">
        <p className="text-[0.65rem] font-semibold tracking-[0.14em] text-[#1a56db] uppercase">
          Setup · step {step === "profile" ? "1" : "2"} of 2
        </p>

        {step === "profile" ? (
          <>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#0b1f33]">
              What kind of business is this?
            </h1>
            <p className="mt-1.5 text-sm text-[#5a6b7d]">
              Profile is config-only (extra fields & billing style). Core stays
              the same — Item, Order, Payment, Customer, Inventory.
            </p>
            <ul className="mt-6 max-h-[22rem] space-y-2 overflow-y-auto">
              {catalog.map((p) => {
                const on = profileId === p.id;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setProfileId(p.id)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-lg border px-3.5 py-3 text-left transition",
                        on
                          ? "border-[#1a56db] bg-[#e8eefb]"
                          : "border-[#d9e0ea] bg-white hover:border-[#c5d0e0]",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 h-4 w-4 shrink-0 rounded-full border-2",
                          on
                            ? "border-[#1a56db] bg-[#1a56db]"
                            : "border-[#cfd8e6] bg-white",
                        )}
                      />
                      <span>
                        <span className="block text-sm font-semibold text-[#0b1f33]">
                          {p.label}
                        </span>
                        <span className="mt-0.5 block text-[0.8125rem] text-[#5a6b7d]">
                          {p.description}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <Button
              className="mt-6 w-full"
              disabled={!profileId || saveProfile.isPending}
              onClick={() => saveProfile.mutate()}
            >
              {saveProfile.isPending ? "Saving…" : "Continue"}
            </Button>
          </>
        ) : (
          <>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#0b1f33]">
              Which capabilities?
            </h1>
            <p className="mt-1.5 text-sm text-[#5a6b7d]">
              Defaults come from your business profile. Toggle sale / rental /
              service as needed — still one engine.
            </p>
            <ul className="mt-6 space-y-2">
              {registered.map((mode) => {
                const copy = MODE_COPY[mode] ?? {
                  title:
                    (schemas as Record<string, { label?: string }>)[mode]
                      ?.label ?? mode,
                  detail:
                    (schemas as Record<string, { description?: string }>)[mode]
                      ?.description ?? "",
                };
                const on = picked.includes(mode);
                return (
                  <li key={mode}>
                    <button
                      type="button"
                      onClick={() => toggle(mode)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-lg border px-3.5 py-3 text-left transition",
                        on
                          ? "border-[#1a56db] bg-[#e8eefb]"
                          : "border-[#d9e0ea] bg-white hover:border-[#c5d0e0]",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border text-[0.7rem] font-bold",
                          on
                            ? "border-[#1a56db] bg-[#1a56db] text-white"
                            : "border-[#cfd8e6] bg-white text-transparent",
                        )}
                      >
                        ✓
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-[#0b1f33]">
                          {copy.title}
                        </span>
                        <span className="mt-0.5 block text-[0.8125rem] text-[#5a6b7d]">
                          {copy.detail}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-6 flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => setStep("profile")}
              >
                Back
              </Button>
              <Button
                className="flex-[2]"
                disabled={!picked.length || saveModes.isPending}
                onClick={() => saveModes.mutate()}
              >
                {saveModes.isPending ? "Saving…" : "Continue to dashboard"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
