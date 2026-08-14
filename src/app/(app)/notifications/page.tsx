"use client";

/**
 * Notification center — in-app inbox (shared engine).
 */
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, CheckCheck } from "lucide-react";
import { notifyApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useBranchStore } from "@/lib/branch-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PageSkeleton } from "@/components/page-header";
import { useState } from "react";
import {
  isFirebaseWebConfigured,
  pushFailureMessage,
  registerWebPush,
  canUseOsNotifications,
} from "@/lib/firebase-messaging";

export default function NotificationsPage() {
  const qc = useQueryClient();
  const branchId = useBranchStore((s) => s.currentLocationId);
  const [filterBranch, setFilterBranch] = useState(false);
  const [status, setStatus] = useState<"unread" | "all">("all");
  const [pushBusy, setPushBusy] = useState(false);

  const inbox = useQuery({
    queryKey: ["notify-inbox", status, filterBranch ? branchId : null],
    queryFn: () =>
      notifyApi.inbox({
        status: status === "unread" ? "unread" : undefined,
        locationId: filterBranch && branchId ? branchId : undefined,
        limit: 80,
      }),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => notifyApi.markRead(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notify-inbox"] });
      void qc.invalidateQueries({ queryKey: ["notify-unread"] });
    },
  });

  const markAll = useMutation({
    mutationFn: () => notifyApi.markAllRead(),
    onSuccess: () => {
      toast.success("All marked read");
      void qc.invalidateQueries({ queryKey: ["notify-inbox"] });
      void qc.invalidateQueries({ queryKey: ["notify-unread"] });
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Failed"),
  });

  if (inbox.isLoading) return <PageSkeleton />;

  const items = inbox.data?.items ?? [];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[#eef1f4] pb-3">
        <div>
          <p className="text-[0.65rem] font-bold tracking-[0.12em] text-[#1a56db] uppercase">
            Notifications
          </p>
          <h1 className="mt-0.5 text-[1.4rem] font-semibold text-[#0b1f33]">
            Notification center
          </h1>
          <p className="mt-0.5 text-[0.8rem] text-[#5a6b7d]">
            {inbox.data?.unreadCount ?? 0} unread · in-app popups
            {canUseOsNotifications() ? " + browser push" : " (browser OS push needs HTTPS)"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isFirebaseWebConfigured() ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pushBusy}
              onClick={() => {
                setPushBusy(true);
                void registerWebPush()
                  .then((r) => {
                    if (r.ok) toast.success("Browser push enabled");
                    else toast.error(pushFailureMessage(r.reason));
                  })
                  .finally(() => setPushBusy(false));
              }}
            >
              Enable browser push
            </Button>
          ) : null}
          <Button asChild variant="secondary" size="sm">
            <Link href="/settings?tab=notifications">Settings</Link>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            <CheckCheck className="mr-1 size-4" />
            Mark all read
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={cn(
            "rounded-md px-3 py-1.5 text-sm",
            status === "all"
              ? "bg-[#1a56db] text-white"
              : "border border-[#d9e0ea] bg-white text-[#5a6b7d]",
          )}
          onClick={() => setStatus("all")}
        >
          All
        </button>
        <button
          type="button"
          className={cn(
            "rounded-md px-3 py-1.5 text-sm",
            status === "unread"
              ? "bg-[#1a56db] text-white"
              : "border border-[#d9e0ea] bg-white text-[#5a6b7d]",
          )}
          onClick={() => setStatus("unread")}
        >
          Unread
        </button>
        <label className="ml-2 flex items-center gap-2 text-sm text-[#5a6b7d]">
          <input
            type="checkbox"
            checked={filterBranch}
            onChange={(e) => setFilterBranch(e.target.checked)}
          />
          Current branch only
        </label>
      </div>

      <ul className="space-y-2">
        {items.length === 0 ? (
          <li className="rounded-xl border border-dashed border-[#d9e0ea] bg-white px-4 py-12 text-center text-sm text-[#8a9bb0]">
            <Bell className="mx-auto mb-2 size-8 opacity-40" />
            No notifications yet
          </li>
        ) : (
          items.map((n) => (
            <li
              key={n.id}
              className={cn(
                "rounded-xl border bg-white px-4 py-3",
                n.status === "unread"
                  ? "border-[#bfd0f5] bg-[#f8fbff]"
                  : "border-[#eef2f8]",
                n.severity === "critical" && "border-l-4 border-l-[#dc2626]",
                n.severity === "low" && "border-l-4 border-l-[#f59e0b]",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#0b1f33]">
                    {n.title}
                  </p>
                  <p className="mt-0.5 text-[0.8rem] text-[#5a6b7d]">{n.body}</p>
                  <p className="mt-1 text-[0.7rem] text-[#8a9bb0]">
                    {n.location?.name ? `${n.location.name} · ` : ""}
                    {new Date(n.createdAt).toLocaleString()}
                    {n.type ? ` · ${n.type}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  {n.href ? (
                    <Button asChild size="sm">
                      <Link
                        href={n.href}
                        onClick={() => {
                          if (n.status === "unread") markRead.mutate(n.id);
                        }}
                      >
                        Open
                      </Link>
                    </Button>
                  ) : null}
                  {n.status === "unread" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => markRead.mutate(n.id)}
                    >
                      Read
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
