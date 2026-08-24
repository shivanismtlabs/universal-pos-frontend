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
          "inline-flex max-w-[14rem] items-center gap-1.5 truncate rounded-md border border-[#d9e0ea] bg-white px-2 py-1 text-[0.75rem] text-[#5a6b7d]",
          className,
        )}
        title={only.name}
      >
        <MapPin className="size-3.5 shrink-0 text-[#1a56db]" />
        <span className="truncate font-medium text-[#0b1f33]">{only.name}</span>
      </div>
    );
  }

  return (
    <label
      className={cn(
        "inline-flex max-w-[16rem] items-center gap-1.5 rounded-md border border-[#d9e0ea] bg-white px-2 py-1 text-[0.75rem]",
        className,
      )}
    >
      <MapPin className="size-3.5 shrink-0 text-[#1a56db]" />
      <Select
        wrapperClassName="w-auto min-w-[8rem] max-w-[13rem] flex-1"
        className="h-7 max-w-[13rem] truncate border-0 bg-transparent px-1 pr-6 text-[0.75rem] font-medium text-[#0b1f33] shadow-none outline-none focus:shadow-none"
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
    </label>
  );
}
