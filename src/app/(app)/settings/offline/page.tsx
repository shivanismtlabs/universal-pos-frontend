"use client";

/**
 * Offline diagnostics — local DB size, sync cursors, force re-seed.
 */
import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Database, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useAuthStore } from "@/lib/auth-store";
import { useBranchStore } from "@/lib/branch-store";
import {
  formatBytes,
  getDeviceId,
  getOfflineDiagnostics,
  getConnectivityState,
  probeServerReachability,
  pullOfflineSnapshot,
  subscribeConnectivity,
  unlockOfflineCrypto,
  type SeedProgress,
} from "@/lib/offline";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/page-header";
import { cn } from "@/lib/utils";

export default function OfflineSettingsPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const tenantId = user?.tenantId ?? "";
  const locationId = useBranchStore((s) => s.currentLocationId);
  const [conn, setConn] = useState(getConnectivityState());
  const [progress, setProgress] = useState<SeedProgress | null>(null);

  useEffect(() => {
    return subscribeConnectivity(setConn);
  }, []);

  useEffect(() => {
    if (!user?.id || !tenantId) return;
    void unlockOfflineCrypto({
      tenantId,
      deviceId: getDeviceId(),
      userId: user.id,
    });
  }, [user?.id, tenantId]);

  const diag = useQuery({
    queryKey: ["offline-diag", tenantId, locationId],
    enabled: Boolean(tenantId && locationId),
    queryFn: () => getOfflineDiagnostics(tenantId, locationId!),
    refetchInterval: 20_000,
  });

  const seed = useMutation({
    mutationFn: async (full: boolean) => {
      if (!locationId) throw new Error("Select a branch first");
      return pullOfflineSnapshot({
        tenantId,
        locationId,
        full,
        onProgress: setProgress,
      });
    },
    onSuccess: (snap) => {
      if (!snap) return;
      toast.success(
        `Synced — ${snap.counts.products} products, ${snap.counts.stockLevels} stock rows`,
      );
      setProgress(null);
      void qc.invalidateQueries({ queryKey: ["offline-diag"] });
    },
    onError: (e: Error) => {
      setProgress(null);
      toast.error(e.message || "Sync failed");
    },
  });

  const ping = useCallback(() => {
    void probeServerReachability().then((ok) =>
      toast.message(ok ? "Server reachable" : "Server unreachable"),
    );
  }, []);

  if (!tenantId) return <PageSkeleton />;

  const d = diag.data;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
      <header className="border-b border-[#eef1f4] pb-4">
        <p className="eyebrow">Settings · Offline</p>
        <h1 className="page-title mt-1">Local data &amp; sync</h1>
        <p className="page-subtitle mt-1.5">
          Local-first catalog and outbox for this device. Seed while online so
          checkout keeps working with zero connectivity.
        </p>
      </header>

      <section
        className={cn(
          "flex items-center gap-3 rounded-xl border px-4 py-3",
          conn === "online"
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : "border-amber-200 bg-amber-50 text-amber-950",
        )}
      >
        {conn === "online" ? (
          <Wifi className="size-5 shrink-0" />
        ) : (
          <WifiOff className="size-5 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {conn === "online"
              ? "Server reachable"
              : conn === "checking"
                ? "Checking…"
                : "OFFLINE — using local database"}
          </p>
          <p className="text-xs opacity-80">Device {getDeviceId()}</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={ping}>
          Ping
        </Button>
      </section>

      {!locationId ? (
        <p className="rounded-lg border border-dashed border-[#d9e0ea] bg-white px-4 py-6 text-center text-sm text-[#8a9bb0]">
          Select a branch in the header to seed offline data for that location.
        </p>
      ) : (
        <>
          <section className="rounded-xl border border-[#e5e7eb] bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <Database className="size-4 text-[#1a56db]" />
              <h2 className="text-sm font-semibold text-[#0b1f33]">
                Local database
              </h2>
            </div>
            {diag.isLoading ? (
              <p className="text-sm text-[#8a9bb0]">Loading…</p>
            ) : (
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <Stat label="Products" value={String(d?.counts.products ?? 0)} />
                <Stat label="Stock rows" value={String(d?.counts.stock ?? 0)} />
                <Stat
                  label="Customers"
                  value={String(d?.counts.customers ?? 0)}
                />
                <Stat label="Coupons" value={String(d?.counts.coupons ?? 0)} />
                <Stat
                  label="Local sales"
                  value={String(d?.counts.sales ?? 0)}
                />
                <Stat
                  label="Pending outbox"
                  value={String(d?.counts.outboxPending ?? 0)}
                />
                <Stat
                  label="Storage (est.)"
                  value={formatBytes(d?.storageUsageBytes ?? 0)}
                />
                <Stat
                  label="Integrity"
                  value={d?.integrity.ok ? "OK" : "Needs repair"}
                />
                <Stat
                  label="Last incremental"
                  value={
                    d?.lastIncrementalSyncAt
                      ? new Date(d.lastIncrementalSyncAt).toLocaleString()
                      : "Never"
                  }
                />
                <Stat
                  label="Last full seed"
                  value={
                    d?.lastFullSyncAt
                      ? new Date(d.lastFullSyncAt).toLocaleString()
                      : "Never"
                  }
                />
              </dl>
            )}
          </section>

          {progress ? (
            <div className="rounded-xl border border-[#c7d7f5] bg-[#f4f7fd] px-4 py-3">
              <p className="text-sm font-medium text-[#0b1f33]">
                {progress.message}
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                <div
                  className="h-full bg-[#1a56db] transition-all"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={seed.isPending || !locationId}
              onClick={() => seed.mutate(false)}
            >
              <RefreshCw className="mr-1.5 size-4" />
              {seed.isPending ? "Syncing…" : "Sync now (incremental)"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={seed.isPending || !locationId}
              onClick={() => {
                if (
                  confirm(
                    "Force full re-download of catalog, stock, and customers for this branch?",
                  )
                ) {
                  seed.mutate(true);
                }
              }}
            >
              Force full re-sync
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[#f8fafc] px-3 py-2">
      <dt className="text-[0.65rem] font-medium tracking-wide text-[#8a9bb0] uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm font-semibold text-[#0b1f33]">
        {value}
      </dd>
    </div>
  );
}
