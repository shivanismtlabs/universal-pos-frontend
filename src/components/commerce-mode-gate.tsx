"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { appsApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useBootstrap } from "@/lib/bootstrap";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MODE_COPY: Record<
  string,
  { title: string; detail: string }
> = {
  sale: {
    title: "Sell products",
    detail: "Qty stock, counter checkout, receipts",
  },
  rental: {
    title: "Rent items",
    detail: "Barcode units, deposits, returns",
  },
  service: {
    title: "Bookable services",
    detail: "Appointments and timed services",
  },
  subscription: {
    title: "Subscriptions",
    detail: "Recurring plans and memberships",
  },
};

/**
 * Blocks the app until the shop picks at least one commerce mode.
 * Writes tenant.settings.commerceModes via setCommerceModes.
 */
export function CommerceModeGate({ children }: { children: React.ReactNode }) {
  const { data, isLoading, commerceSetupComplete, commerceModes, refetch } =
    useBootstrap();
  const qc = useQueryClient();
  const registered =
    (data?.commerce as { registeredModes?: string[] } | undefined)
      ?.registeredModes ??
    Object.keys(MODE_COPY);

  const [picked, setPicked] = useState<string[]>(() =>
    commerceModes.length ? [...commerceModes] : ["sale"],
  );

  const schemas = useMemo(() => {
    const s = (data?.commerce as { schemas?: Record<string, { label?: string; description?: string }> })
      ?.schemas;
    return s ?? {};
  }, [data?.commerce]);

  const save = useMutation({
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
          Setup
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#0b1f33]">
          What does your business do?
        </h1>
        <p className="mt-1.5 text-sm text-[#5a6b7d]">
          Pick one or more. You can change this later in settings — each mode
          unlocks its counter and catalog.
        </p>

        <ul className="mt-6 space-y-2">
          {registered.map((mode) => {
            const copy = MODE_COPY[mode] ?? {
              title: schemas[mode]?.label ?? mode,
              detail: schemas[mode]?.description ?? "",
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

        <Button
          className="mt-6 w-full"
          disabled={!picked.length || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving…" : "Continue to dashboard"}
        </Button>
      </div>
    </div>
  );
}
