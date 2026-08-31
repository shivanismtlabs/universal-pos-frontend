"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { tenantsApi } from "@/lib/api";
import { useBranchStore } from "@/lib/branch-store";
import { useAuthStore } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";

/**
 * Shell current-branch selector. All ops should use this locationId.
 */
export function BranchSelector({ className }: { className?: string }) {
  const currentLocationId = useBranchStore((s) => s.currentLocationId);
  const setCurrentLocationId = useBranchStore((s) => s.setCurrentLocationId);
  const bindTenant = useBranchStore((s) => s.bindTenant);
  const authStoreId = useAuthStore((s) => s.user?.storeId);
  const tenantId = useAuthStore((s) => s.user?.tenantId);

  useEffect(() => {
    bindTenant(tenantId ?? null);
  }, [tenantId, bindTenant]);

  const locations = useQuery({
    queryKey: ["locations", tenantId],
    queryFn: () => tenantsApi.listLocations(),
    enabled: Boolean(tenantId),
  });

  const active = useMemo(
    () => (locations.data ?? []).filter((l) => l.isActive !== false),
    [locations.data],
  );

  useEffect(() => {
    if (!active.length) return;
    const stillValid =
      currentLocationId && active.some((l) => l.id === currentLocationId);
    if (stillValid) return;
    const prefer =
      active.find((l) => l.id === authStoreId)?.id ??
      active.find((l) => l.code === "MAIN")?.id ??
      active[0]?.id ??
      null;
    if (prefer) setCurrentLocationId(prefer);
  }, [active, authStoreId, currentLocationId, setCurrentLocationId]);

  if (!active.length) return null;

  if (active.length === 1) {
    const only = active[0];
    return (
      <div
        className={cn(
          "inline-flex h-8 max-w-[16rem] items-center gap-1.5 rounded-md border border-[#e2e8f0] bg-white px-2.5 text-[0.8125rem]",
          className,
        )}
        title={`${only.name} — sales, stock, and expenses use this location`}
      >
        <MapPin className="size-3.5 shrink-0 text-[#64748b]" />
        <span className="truncate font-medium text-[#0b1f33]">{only.name}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex h-8 max-w-[18rem] items-center gap-1 rounded-md border border-[#e2e8f0] bg-white pl-2 pr-0.5 hover:border-[#c5d0e0]",
        className,
      )}
      title="Sales, stock, and expenses use this location"
    >
      <MapPin className="size-3.5 shrink-0 text-[#64748b]" aria-hidden />
      <Select
        searchable={active.length > 8}
        wrapperClassName="min-w-[7.5rem] max-w-[15rem] flex-1"
        className="h-7 max-w-[15rem] border-0 bg-transparent px-1 pr-6 text-[0.8125rem] font-medium text-[#0b1f33] shadow-none outline-none hover:border-transparent focus:border-transparent focus:shadow-none"
        value={currentLocationId ?? ""}
        onChange={(e) => setCurrentLocationId(e.target.value || null)}
        aria-label="Current shop / branch"
      >
        {active.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
            {l.code ? ` (${l.code})` : ""}
          </option>
        ))}
      </Select>
    </div>
  );
}
