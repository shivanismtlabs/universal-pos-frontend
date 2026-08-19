"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { appsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { useBootstrap } from "@/lib/bootstrap";

/** Human-readable labels and descriptions for every capability code */
const CAPABILITY_META: Record<
  string,
  { label: string; description: string; group: string }
> = {
  TABLE: {
    label: "Tables",
    description: "Create and manage tables or seating areas.",
    group: "Food & Hospitality",
  },
  KOT: {
    label: "Kitchen order tickets",
    description: "Send kitchen tickets with item and modifier details.",
    group: "Food & Hospitality",
  },
  KDS: {
    label: "Kitchen display",
    description: "Show live order status on a kitchen screen.",
    group: "Food & Hospitality",
  },
  MODIFIER: {
    label: "Item modifiers",
    description:
      "Attach options like size, extras, or preferences to any product/service.",
    group: "Products & Catalog",
  },
  VARIANT: {
    label: "Product variants",
    description: "Size/color or other variants — one product, many SKUs.",
    group: "Products & Catalog",
  },
  SERIAL: {
    label: "Serial number tracking",
    description: "Track individual units by serial number (e.g. electronics).",
    group: "Products & Catalog",
  },
  BATCH: {
    label: "Batch / lot control",
    description: "Track stock by batch, production date, or lot number.",
    group: "Products & Catalog",
  },
  EXPIRY: {
    label: "Expiry dates",
    description: "Record and alert on batch expiry dates.",
    group: "Products & Catalog",
  },
  BUNDLE: {
    label: "Product bundles / combos",
    description: "Sell sets of components as one catalog item.",
    group: "Products & Catalog",
  },
  BOOKING: {
    label: "Appointments & bookings",
    description: "Schedule time-based services or resource slots.",
    group: "Services & Scheduling",
  },
  RESOURCE: {
    label: "Resources",
    description: "Tables, rooms, bays, or equipment bookable per slot.",
    group: "Services & Scheduling",
  },
  SERVICE_JOB: {
    label: "Service jobs",
    description:
      "Open job cards for repair, grooming, cleaning, or any work order.",
    group: "Services & Scheduling",
  },
  CHECK_IN: {
    label: "Check-in / check-out",
    description:
      "Front-desk attendance tracking for gyms, coworking, clubs, and classes.",
    group: "Membership & Access",
  },
  MEMBERSHIP: {
    label: "Membership plans",
    description:
      "Recurring or time-based plans with enrollment, renewal, and status.",
    group: "Membership & Access",
  },
  SUBSCRIPTION: {
    label: "Subscriptions",
    description: "Charge customers on a recurring billing cycle.",
    group: "Membership & Access",
  },
  DEPOSIT: {
    label: "Deposits",
    description: "Collect refundable or partial deposits before final payment.",
    group: "Rental & Equipment",
  },
  RENTAL_RETURN: {
    label: "Rental returns",
    description:
      "Track asset check-out and check-in, damage, and deposit settlement.",
    group: "Rental & Equipment",
  },
};

type CapabilityItem = {
  code: string;
  label: string;
  description: string;
};

export default function CapabilitiesSettingsPage() {
  const qc = useQueryClient();
  const { data: boot } = useBootstrap();

  // Enabled commerce modes from bootstrap
  const enabledModes: string[] = useMemo(() => {
    const modes = (boot as { commerceModes?: string[] } | undefined)
      ?.commerceModes;
    return Array.isArray(modes) ? modes : [];
  }, [boot]);

    const capsQ = useQuery({
    queryKey: ["capabilities-list"],
    queryFn: () => appsApi.listCapabilities(),
  });

  const allCaps: CapabilityItem[] = useMemo(
    () => capsQ.data?.capabilities ?? [],
    [capsQ.data],
  );

  // Derive current enabled capabilities from bootstrap tenant settings
  const enabledCaps: Set<string> = useMemo(() => {
    const settings = (
      boot?.tenant as { settings?: { capabilities?: string[] } } | undefined
    )?.settings;
    const arr = settings?.capabilities;
    return new Set(Array.isArray(arr) ? arr : []);
  }, [boot?.tenant]);

  const [selected, setSelected] = useState<Set<string>>(enabledCaps);

  // Sync when bootstrap loads
  useMemo(() => {
    if (enabledCaps.size > 0) setSelected(new Set(enabledCaps));
  }, [enabledCaps]);

  const MODE_LABELS: Record<string, string> = {
    sale: "Sell products",
    rental: "Rent items",
    service: "Provide services",
    subscription: "Memberships / subscriptions",
  };

  const ALL_MODES = ["sale", "rental", "service", "subscription"];
  const [selectedModes, setSelectedModes] = useState<Set<string>>(
    new Set(enabledModes),
  );
  useMemo(() => {
    if (enabledModes.length > 0) setSelectedModes(new Set(enabledModes));
  }, [enabledModes]);

  const saveModes = useMutation({
    mutationFn: () =>
      appsApi.setCommerceModes({
        modes: [...selectedModes],
      }),
    onSuccess: () => {
      toast.success("Commerce modes saved");
      void qc.invalidateQueries({ queryKey: ["tenant-bootstrap"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not save modes"),
  });

  const saveCaps = useMutation({
    mutationFn: () =>
      appsApi.setCapabilities({ capabilities: [...selected] }),
    onSuccess: () => {
      toast.success("Capabilities saved");
      void qc.invalidateQueries({ queryKey: ["tenant-bootstrap"] });
    },
    onError: (e) =>
      toast.error(
        e instanceof Error ? e.message : "Could not save capabilities",
      ),
  });

  function toggleMode(mode: string) {
    setSelectedModes((prev) => {
      const next = new Set(prev);
      if (next.has(mode)) next.delete(mode);
      else next.add(mode);
      return next;
    });
  }

  function toggleCap(code: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  // Group capabilities
  const groups = useMemo(() => {
    const map = new Map<string, CapabilityItem[]>();
    for (const cap of allCaps) {
      const meta = CAPABILITY_META[cap.code];
      const group = meta?.group ?? "Other";
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push(cap);
    }
    return [...map.entries()];
  }, [allCaps]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title="Commerce Modes & Features"
        subtitle="What your business does — change anytime. Settings persist; existing data is never deleted."
      />

      {/* Commerce Modes */}
      <section className="space-y-4 rounded-2xl border border-[#e5e7eb] bg-white p-5">
        <div>
          <h2 className="text-base font-semibold text-[#0b1f33]">
            What does your business do?
          </h2>
          <p className="mt-0.5 text-xs text-[#6b7280]">
            Select all that apply. You can enable multiple modes for a mixed
            business (e.g. sell products and provide services).
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {ALL_MODES.map((mode) => {
            const on = selectedModes.has(mode);
            return (
              <label
                key={mode}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                  on
                    ? "border-[#1a56db] bg-[#eff6ff] text-[#1e3a8a]"
                    : "border-[#e5e7eb] bg-white text-[#374151]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggleMode(mode)}
                  className="accent-[#1a56db]"
                />
                {MODE_LABELS[mode] ?? mode}
              </label>
            );
          })}
        </div>
        <Button
          type="button"
          onClick={() => saveModes.mutate()}
          disabled={saveModes.isPending || selectedModes.size === 0}
        >
          {saveModes.isPending ? "Saving…" : "Save commerce modes"}
        </Button>
        <p className="text-[0.7rem] text-[#8b9bb0]">
          Disabling a mode hides its counter tab but does not delete existing
          transactions.
        </p>
      </section>

      {/* Capabilities */}
      <section className="space-y-5 rounded-2xl border border-[#e5e7eb] bg-white p-5">
        <div>
          <h2 className="text-base font-semibold text-[#0b1f33]">
            Additional features
          </h2>
          <p className="mt-0.5 text-xs text-[#6b7280]">
            Enable only what your business needs. Features are universal — any
            business type can use any combination.
          </p>
        </div>
        {capsQ.isLoading ? (
          <p className="text-sm text-[#6b7280]">Loading features…</p>
        ) : (
          <div className="space-y-6">
            {groups.map(([group, caps]) => (
              <div key={group}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#5a6b7d]">
                  {group}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {caps.map((cap) => {
                    const meta = CAPABILITY_META[cap.code];
                    const on = selected.has(cap.code);
                    return (
                      <label
                        key={cap.code}
                        className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm transition ${
                          on
                            ? "border-[#1a56db] bg-[#eff6ff]"
                            : "border-[#e5e7eb] bg-white"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggleCap(cap.code)}
                          className="mt-0.5 accent-[#1a56db]"
                        />
                        <span>
                          <span className="block font-semibold text-[#0b1f33]">
                            {meta?.label ?? cap.label ?? cap.code}
                          </span>
                          <span className="block text-[0.75rem] text-[#5a6b7d]">
                            {meta?.description ?? cap.description ?? ""}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        <Button
          type="button"
          onClick={() => saveCaps.mutate()}
          disabled={saveCaps.isPending}
        >
          {saveCaps.isPending ? "Saving…" : "Save features"}
        </Button>
      </section>
    </div>
  );
}
