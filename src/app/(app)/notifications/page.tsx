"use client";

/**
 * Notification center — clean inbox for shop alerts.
 */
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  Package,
  Settings,
  Wallet,
} from "lucide-react";
import { notifyApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useBranchStore } from "@/lib/branch-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PageSkeleton } from "@/components/page-header";
import { useEffect, useMemo, useState } from "react";
import { TablePager } from "@/components/table-pager";
import { pagerFromMeta } from "@/lib/use-paged-list";
import {
  isFirebaseWebConfigured,
  pushFailureMessage,
  registerWebPush,
  canUseOsNotifications,
} from "@/lib/firebase-messaging";

function notifyIcon(type: string) {
  const t = type.toLowerCase();
  if (t.includes("low_stock") || t.includes("stock")) return Package;
  if (t.includes("due") || t.includes("payment")) return Wallet;
  if (t.includes("critical") || t.includes("alert")) return AlertTriangle;
  return Bell;
}

function severityStyles(severity: string | null | undefined, unread: boolean) {
  if (severity === "critical") {
    return {
      bar: "bg-[#dc2626]",
      icon: "bg-[#fef2f2] text-[#dc2626]",
    };
  }
  if (severity === "low") {
    return {
      bar: "bg-[#f59e0b]",
      icon: "bg-[#fffbeb] text-[#d97706]",
    };
  }
  return {
    bar: unread ? "bg-[#1a56db]" : "bg-transparent",
    icon: unread ? "bg-[#eef2ff] text-[#1a56db]" : "bg-[#f1f5f9] text-[#64748b]",
  };
}

export default function NotificationsPage() {
  const qc = useQueryClient();
  const branchId = useBranchStore((s) => s.currentLocationId);
  const [filterBranch, setFilterBranch] = useState(false);
  const [status, setStatus] = useState<"unread" | "all">("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [pushBusy, setPushBusy] = useState(false);

  const inbox = useQuery({
    queryKey: [
      "notify-inbox",
      status,
      filterBranch ? branchId : null,
      page,
    ],
    queryFn: () =>
      notifyApi.inbox({
        status: status === "unread" ? "unread" : undefined,
        locationId: filterBranch && branchId ? branchId : undefined,
        page,
        limit: pageSize,
      }),
    placeholderData: (prev) => prev,
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
      toast.success("All notifications marked as read");
      void qc.invalidateQueries({ queryKey: ["notify-inbox"] });
      void qc.invalidateQueries({ queryKey: ["notify-unread"] });
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Could not mark all read"),
  });

  const unreadCount = inbox.data?.unreadCount ?? 0;
  const items = inbox.data?.items ?? [];
  const meta = inbox.data?.meta;

  useEffect(() => {
    setPage(1);
  }, [status, filterBranch, branchId]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof items>();
    for (const n of items) {
      const day = new Date(n.createdAt).toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      });
      const list = map.get(day) ?? [];
      list.push(n);
      map.set(day, list);
    }
    return [...map.entries()];
  }, [items]);

  if (inbox.isLoading) return <PageSkeleton />;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#0b1f33]">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-[#64748b]">
            Stock alerts, due payments, and other shop messages in one place.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent("upos:notify-test", {
                  detail: {
                    title: "Test alert",
                    body: "If you see this popup, alerts are working.",
                    href: "/notifications",
                  },
                }),
              );
            }}
          >
            Test alert
          </Button>
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
                    if (r.ok) toast.success("Browser notifications turned on");
                    else toast.error(pushFailureMessage(r.reason));
                  })
                  .finally(() => setPushBusy(false));
              }}
            >
              Browser push
            </Button>
          ) : null}
          <Button asChild variant="secondary" size="sm">
            <Link href="/settings/notifications">
              <Settings className="mr-1.5 size-4" />
              Settings
            </Link>
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={markAll.isPending || unreadCount === 0}
            onClick={() => markAll.mutate()}
          >
            <CheckCheck className="mr-1.5 size-4" />
            Mark all read
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[#e2e8f0] bg-white px-4 py-3">
          <p className="text-[0.7rem] font-semibold tracking-wide text-[#94a3b8] uppercase">
            Unread
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-[#0b1f33]">
            {unreadCount}
          </p>
        </div>
        <div className="rounded-xl border border-[#e2e8f0] bg-white px-4 py-3">
          <p className="text-[0.7rem] font-semibold tracking-wide text-[#94a3b8] uppercase">
            Showing
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-[#0b1f33]">
            {items.length}
          </p>
        </div>
        <div className="rounded-xl border border-[#e2e8f0] bg-white px-4 py-3">
          <p className="text-[0.7rem] font-semibold tracking-wide text-[#94a3b8] uppercase">
            Push
          </p>
          <p className="mt-1 text-sm font-medium text-[#475569]">
            {canUseOsNotifications()
              ? "Browser push available"
              : "Use HTTPS for OS popups"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e2e8f0] bg-white p-2">
        {(
          [
            ["all", "All"],
            ["unread", "Unread only"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition",
              status === id
                ? "bg-[#1a56db] text-white shadow-sm"
                : "text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0b1f33]",
            )}
            onClick={() => setStatus(id)}
          >
            {label}
          </button>
        ))}
        <label className="ml-auto flex cursor-pointer items-center gap-2 px-2 text-sm text-[#64748b]">
          <input
            type="checkbox"
            className="accent-[#1a56db]"
            checked={filterBranch}
            onChange={(e) => setFilterBranch(e.target.checked)}
          />
          This branch only
        </label>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#d9e0ea] bg-white px-6 py-16 text-center">
          <Bell className="mx-auto mb-3 size-10 text-[#cbd5e1]" />
          <p className="text-base font-semibold text-[#0b1f33]">
            No notifications
          </p>
          <p className="mt-1 text-sm text-[#64748b]">
            When stock runs low or a payment is due, alerts will show here.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([day, dayItems]) => (
            <section key={day}>
              <p className="mb-2 px-1 text-[0.7rem] font-semibold tracking-wide text-[#94a3b8] uppercase">
                {day}
              </p>
              <ul className="space-y-2">
                {dayItems.map((n) => {
                  const Icon = notifyIcon(n.type ?? "");
                  const styles = severityStyles(
                    n.severity,
                    n.status === "unread",
                  );
                  return (
                    <li
                      key={n.id}
                      className={cn(
                        "relative overflow-hidden rounded-xl border bg-white transition hover:shadow-sm",
                        n.status === "unread"
                          ? "border-[#c7d7f8]"
                          : "border-[#e8ecf1]",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0 bottom-0 left-0 w-1",
                          styles.bar,
                        )}
                      />
                      <div className="flex gap-3 px-4 py-3.5 pl-5">
                        <div
                          className={cn(
                            "grid h-10 w-10 shrink-0 place-items-center rounded-lg",
                            styles.icon,
                          )}
                        >
                          <Icon className="size-4" strokeWidth={1.75} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="text-sm font-semibold text-[#0b1f33]">
                              {n.title}
                            </p>
                            <time className="shrink-0 text-[0.72rem] tabular-nums text-[#94a3b8]">
                              {new Date(n.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </time>
                          </div>
                          <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-[#64748b]">
                            {n.body}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {n.location?.name ? (
                              <span className="rounded-md bg-[#f1f5f9] px-2 py-0.5 text-[0.65rem] font-medium text-[#64748b]">
                                {n.location.name}
                              </span>
                            ) : null}
                            {n.type ? (
                              <span className="rounded-md bg-[#f8fafc] px-2 py-0.5 text-[0.65rem] font-medium text-[#94a3b8]">
                                {n.type.replace(/_/g, " ")}
                              </span>
                            ) : null}
                            {n.status === "unread" ? (
                              <span className="rounded-md bg-[#eef2ff] px-2 py-0.5 text-[0.65rem] font-semibold text-[#1a56db]">
                                New
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col gap-1.5">
                          {n.href ? (
                            <Button asChild size="sm">
                              <Link
                                href={n.href}
                                onClick={() => {
                                  if (n.status === "unread")
                                    markRead.mutate(n.id);
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
                              variant="ghost"
                              className="text-[#64748b]"
                              onClick={() => markRead.mutate(n.id)}
                            >
                              Mark read
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
      {items.length > 0 ? (
        <TablePager
          {...pagerFromMeta(meta, page, pageSize, setPage, items.length)}
        />
      ) : null}
    </div>
  );
}
