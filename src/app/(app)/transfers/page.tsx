"use client";

import { Suspense, useEffect, useMemo, useState, Fragment } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRightLeft, Package, X } from "lucide-react";
import { inventoryApi, tenantsApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { canWriteCatalog } from "@/lib/roles";
import { useAuthStore } from "@/lib/auth-store";
import { useBranchStore } from "@/lib/branch-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, PageSkeleton } from "@/components/page-header";
import { FieldError } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  stockTransferSchema,
  zodFieldErrors,
  zodMessages,
} from "@/lib/validations";
import { formatQtyWithUnit } from "@/lib/sell-units";

type Line = {
  productId: string;
  name: string;
  sku: string;
  qty: string;
  max: number;
  unit: string;
};

type TransferDoc = Awaited<
  ReturnType<typeof inventoryApi.listTransferDocs>
>[number];

function transferErrorToast(e: unknown) {
  if (!(e instanceof ApiError)) return;
  const msg = e.messages.join(", ");
  if (/approval required/i.test(msg)) {
    toast.error(msg, {
      description: "A manager must approve this before stock leaves the source.",
      duration: 8000,
    });
    return;
  }
  toast.error(msg);
}

function statusLabel(status: string) {
  switch (status) {
    case "draft":
      return "Draft";
    case "approved":
      return "Approved";
    case "in_transit":
      return "In transit";
    case "partially_received":
      return "Partial receive";
    case "received":
      return "Received";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "received"
      ? "bg-emerald-50 text-emerald-800"
      : status === "cancelled"
        ? "bg-slate-100 text-slate-600"
        : status === "in_transit" || status === "partially_received"
          ? "bg-amber-50 text-amber-900"
          : status === "draft" || status === "approved"
            ? "bg-[#e8eefb] text-[#1341a8]"
            : "bg-slate-50 text-slate-700";
  return (
    <span
      className={cn(
        "inline-flex rounded px-1.5 py-0.5 text-[0.7rem] font-semibold",
        tone,
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

/**
 * Zoho-style Inventory → Stock transfer
 * Multi-step: draft → issue (out) → receive (in) · cancel
 */
export default function StockTransferPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={8} />}>
      <StockTransferPageInner />
    </Suspense>
  );
}

function StockTransferPageInner() {
  const qc = useQueryClient();
  const router = useRouter();
  const search = useSearchParams();
  const roles = useAuthStore((s) => s.user?.roles);
  const canWrite = canWriteCatalog(roles);
  const branchId = useBranchStore((s) => s.currentLocationId);
  const [q, setQ] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [receiveDoc, setReceiveDoc] = useState<TransferDoc | null>(null);
  const [deepLink, setDeepLink] = useState<{
    toLocationId?: string;
    fromLocationId?: string;
    productId?: string;
  } | null>(null);

  const docs = useQuery({
    queryKey: ["transfer-docs"],
    queryFn: () => inventoryApi.listTransferDocs(),
    refetchOnMount: "always",
  });

  useEffect(() => {
    const toLocationId = search.get("toLocationId") || undefined;
    const fromLocationId = search.get("fromLocationId") || undefined;
    const productId = search.get("productId") || undefined;
    if (!toLocationId && !productId && !fromLocationId) return;
    if (!canWrite) return;
    setDeepLink({ toLocationId, fromLocationId, productId });
    setComposerOpen(true);
    router.replace("/transfers", { scroll: false });
  }, [search, canWrite, router]);

  const items = useMemo(() => {
    const list = docs.data ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((t) => {
      const hay = [
        t.fromLocationName,
        t.toLocationName,
        t.notes,
        t.actorName,
        t.status,
        ...t.lines.map((l) => `${l.productName} ${l.sku}`),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [docs.data, q]);

  const issue = useMutation({
    mutationFn: (id: string) => inventoryApi.issueTransferDoc(id),
    onSuccess: () => {
      toast.success("Issued — stock left source, now in transit");
      void qc.invalidateQueries({ queryKey: ["transfer-docs"] });
      void qc.invalidateQueries({ queryKey: ["inv-levels"] });
      void qc.invalidateQueries({ queryKey: ["stock-at-location"] });
    },
    onError: transferErrorToast,
  });

  const cancel = useMutation({
    mutationFn: (id: string) => inventoryApi.cancelTransferDoc(id),
    onSuccess: () => {
      toast.success("Transfer cancelled");
      void qc.invalidateQueries({ queryKey: ["transfer-docs"] });
      void qc.invalidateQueries({ queryKey: ["inv-levels"] });
      void qc.invalidateQueries({ queryKey: ["stock-at-location"] });
    },
    onError: transferErrorToast,
  });

  if (docs.isLoading && !docs.data) {
    return <PageSkeleton rows={8} />;
  }

  return (
    <div className="flex min-h-0 flex-col gap-4 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Inventory</p>
          <h1 className="page-title mt-1">Stock transfer</h1>
          <p className="page-subtitle mt-1.5 max-w-xl">
            Draft → issue from source → receive at destination. Needs at least
            two active locations.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="ghost">
            <Link href="/adjustments">Adjustments</Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href="/inventory">Stock levels</Link>
          </Button>
          {canWrite ? (
            <Button
              size="sm"
              onClick={() => {
                setDeepLink(null);
                setComposerOpen(true);
              }}
            >
              + New transfer
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e4e9f0] bg-white px-4 py-2.5">
        <Input
          className="h-9 max-w-sm flex-1 text-[0.8125rem]"
          placeholder="Search location, product, SKU, status, notes…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="text-[0.75rem] text-[#8b9bb0]">
          {items.length} transfer{items.length === 1 ? "" : "s"}
        </span>
      </div>

      {!items.length ? (
        <EmptyState
          title="No stock transfers yet"
          detail="Create a draft, issue from the source shop, then receive at the destination."
          action={
            canWrite ? (
              <Button
                type="button"
                onClick={() => {
                  setDeepLink(null);
                  setComposerOpen(true);
                }}
              >
                + New transfer
              </Button>
            ) : undefined
          }
        />
      ) : (
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#e4e9f0] bg-white shadow-[0_1px_2px_rgba(11,31,51,0.04)]">
          <div className="max-h-[min(60dvh,32rem)] overflow-auto overscroll-contain [scrollbar-gutter:stable]">
            <table className="w-full min-w-[52rem] text-left text-[0.8125rem]">
              <thead className="sticky top-0 z-[1] border-b border-[#eef1f4] bg-[#f8fafc] text-[0.7rem] font-semibold tracking-wide text-[#5a6b7d] uppercase">
                <tr>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">From</th>
                  <th className="px-3 py-2.5">To</th>
                  <th className="px-3 py-2.5 text-right">Lines</th>
                  <th className="px-3 py-2.5 text-right">Qty</th>
                  <th className="px-3 py-2.5">Notes</th>
                  <th className="px-3 py-2.5">By</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eef1f4]">
                {items.map((r) => {
                  const open = expandedId === r.id;
                  const canIssue =
                    canWrite &&
                    (r.status === "draft" || r.status === "approved");
                  const canReceive =
                    canWrite &&
                    (r.status === "in_transit" ||
                      r.status === "issued" ||
                      r.status === "partially_received");
                  const canCancel =
                    canWrite &&
                    r.status !== "received" &&
                    r.status !== "cancelled" &&
                    r.status !== "rejected";
                  return (
                    <Fragment key={r.id}>
                      <tr
                        className="cursor-pointer hover:bg-[#fafbfc]"
                        onClick={() => setExpandedId(open ? null : r.id)}
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-[#5a6b7d]">
                          {new Date(r.createdAt).toLocaleString()}
                        </td>
                        <td className="px-3 py-3">
                          <StatusPill status={r.status} />
                        </td>
                        <td className="px-3 py-3 font-medium text-[#0b1f33]">
                          {r.fromLocationName}
                        </td>
                        <td className="px-3 py-3 font-medium text-[#0b1f33]">
                          {r.toLocationName}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-[#5a6b7d]">
                          {r.lineCount}
                        </td>
                        <td className="px-3 py-3 text-right font-semibold tabular-nums text-[#1341a8]">
                          {r.totalQty}
                        </td>
                        <td className="max-w-[10rem] truncate px-3 py-3 text-[#5a6b7d]">
                          {r.notes || "—"}
                        </td>
                        <td className="px-3 py-3 text-[#5a6b7d]">
                          {r.actorName}
                        </td>
                        <td
                          className="px-4 py-3 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex flex-wrap justify-end gap-1">
                            {canIssue ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={issue.isPending}
                                onClick={() => {
                                  if (
                                    confirm(
                                      `Issue transfer from ${r.fromLocationName}? Stock will leave that location.`,
                                    )
                                  ) {
                                    issue.mutate(r.id);
                                  }
                                }}
                              >
                                Issue
                              </Button>
                            ) : null}
                            {canReceive ? (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => setReceiveDoc(r)}
                              >
                                Receive
                              </Button>
                            ) : null}
                            {canCancel ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={cancel.isPending}
                                onClick={() => {
                                  if (
                                    confirm(
                                      "Cancel this transfer? In-transit qty returns to source.",
                                    )
                                  ) {
                                    cancel.mutate(r.id);
                                  }
                                }}
                              >
                                Cancel
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {open ? (
                        <tr className="bg-[#f8fafc]">
                          <td colSpan={9} className="px-4 py-3">
                            <ul className="space-y-1.5 text-[0.8rem]">
                              {r.lines.map((l) => {
                                const remaining =
                                  Number(l.qty) -
                                  Number(l.qtyReceived) -
                                  Number(l.qtyDamaged);
                                return (
                                  <li
                                    key={l.id}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#eef1f4] bg-white px-3 py-2"
                                  >
                                    <span className="min-w-0">
                                      <span className="font-medium text-[#0b1f33]">
                                        {l.productName}
                                      </span>
                                      <span className="ml-2 font-mono text-[0.72rem] text-[#8b9bb0]">
                                        {l.sku}
                                      </span>
                                    </span>
                                    <span className="tabular-nums text-[#5a6b7d]">
                                      {formatQtyWithUnit(l.qty, l.unit)}
                                      {l.qtyReceived > 0 || l.qtyDamaged > 0
                                        ? ` · recv ${formatQtyWithUnit(l.qtyReceived, l.unit)}${
                                            l.qtyDamaged > 0
                                              ? ` · dmg ${formatQtyWithUnit(l.qtyDamaged, l.unit)}`
                                              : ""
                                          } · left ${formatQtyWithUnit(remaining, l.unit)}`
                                        : ""}
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {composerOpen ? (
        <TransferComposer
          defaultFromId={deepLink?.fromLocationId || branchId || undefined}
          defaultToId={deepLink?.toLocationId}
          defaultProductId={deepLink?.productId}
          onClose={() => {
            setComposerOpen(false);
            setDeepLink(null);
          }}
          onDone={() => {
            setComposerOpen(false);
            setDeepLink(null);
            void qc.invalidateQueries({ queryKey: ["transfer-docs"] });
          }}
        />
      ) : null}

      {receiveDoc ? (
        <ReceiveTransferModal
          doc={receiveDoc}
          onClose={() => setReceiveDoc(null)}
          onDone={() => {
            setReceiveDoc(null);
            void qc.invalidateQueries({ queryKey: ["transfer-docs"] });
            void qc.invalidateQueries({ queryKey: ["inv-levels"] });
            void qc.invalidateQueries({ queryKey: ["stock-at-location"] });
          }}
        />
      ) : null}
    </div>
  );
}

function ReceiveTransferModal({
  doc,
  onClose,
  onDone,
}: {
  doc: TransferDoc;
  onClose: () => void;
  onDone: () => void;
}) {
  const [qtys, setQtys] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const l of doc.lines) {
      const rem =
        Number(l.qty) - Number(l.qtyReceived) - Number(l.qtyDamaged);
      init[l.id] = rem > 0 ? String(rem) : "0";
    }
    return init;
  });
  const [dmg, setDmg] = useState<Record<string, string>>({});

  const receive = useMutation({
    mutationFn: () => {
      const lines = doc.lines
        .map((l) => ({
          lineId: l.id,
          qty: Number(qtys[l.id] || 0),
          damagedQty: Number(dmg[l.id] || 0) || undefined,
        }))
        .filter((l) => l.qty > 0 || (l.damagedQty ?? 0) > 0);
      if (!lines.length) {
        throw new Error("Enter receive qty on at least one line");
      }
      return inventoryApi.receiveTransferDoc(doc.id, lines);
    },
    onSuccess: (res) => {
      toast.success(
        res.status === "received"
          ? "Fully received at destination"
          : "Partial receive saved",
      );
      onDone();
    },
    onError: (e) => {
      if (e instanceof Error && !(e instanceof ApiError)) toast.error(e.message);
      else transferErrorToast(e);
    },
  });

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[#0b1f33]/45"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-[#e4e9f0] bg-white shadow-xl sm:rounded-xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#eef1f4] px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-[#0b1f33]">
              Receive transfer
            </h2>
            <p className="mt-1 text-[0.8rem] text-[#5a6b7d]">
              Into {doc.toLocationName} · from {doc.fromLocationName}
            </p>
          </div>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#5a6b7d] hover:bg-[#f1f5f9]"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
          {doc.lines.map((l) => {
            const rem =
              Number(l.qty) - Number(l.qtyReceived) - Number(l.qtyDamaged);
            if (rem <= 1e-9) return null;
            return (
              <div
                key={l.id}
                className="rounded-lg border border-[#eef1f4] bg-[#fafbfc] px-3 py-3"
              >
                <p className="text-sm font-medium text-[#0b1f33]">
                  {l.productName}
                </p>
                <p className="text-xs text-[#5a6b7d]">
                  {l.sku} · remaining{" "}
                  {formatQtyWithUnit(rem, l.unit)}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[0.7rem]">Receive</Label>
                    <Input
                      className="mt-1 h-9"
                      inputMode="decimal"
                      value={qtys[l.id] ?? ""}
                      onChange={(e) =>
                        setQtys((p) => ({ ...p, [l.id]: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-[0.7rem]">Damaged</Label>
                    <Input
                      className="mt-1 h-9"
                      inputMode="decimal"
                      value={dmg[l.id] ?? ""}
                      onChange={(e) =>
                        setDmg((p) => ({ ...p, [l.id]: e.target.value }))
                      }
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-[#eef1f4] px-5 py-3">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={receive.isPending}
            onClick={() => receive.mutate()}
          >
            {receive.isPending ? "Receiving…" : "Confirm receive"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TransferComposer({
  onClose,
  onDone,
  defaultFromId,
  defaultToId,
  defaultProductId,
}: {
  onClose: () => void;
  onDone: () => void;
  defaultFromId?: string;
  defaultToId?: string;
  defaultProductId?: string;
}) {
  const [fromId, setFromId] = useState(defaultFromId ?? "");
  const [toId, setToId] = useState(defaultToId ?? "");
  const [q, setQ] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [issueAfterSave, setIssueAfterSave] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [seededProduct, setSeededProduct] = useState(false);

  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => tenantsApi.listLocations(),
  });

  const activeLocations = useMemo(
    () => (locations.data ?? []).filter((l) => l.isActive !== false),
    [locations.data],
  );

  useEffect(() => {
    if (!activeLocations.length) return;
    if (!fromId) {
      let prefer =
        defaultFromId &&
        activeLocations.some((l) => l.id === defaultFromId)
          ? defaultFromId
          : activeLocations[0]?.id ?? "";
      // Deep-link to=needy store: source must be a different location
      if (prefer && defaultToId && prefer === defaultToId) {
        prefer =
          activeLocations.find((l) => l.id !== defaultToId)?.id ?? prefer;
      }
      setFromId(prefer);
    }
    if (!toId) {
      const preferTo =
        defaultToId && activeLocations.some((l) => l.id === defaultToId)
          ? defaultToId
          : activeLocations.find((l) => l.id !== (fromId || defaultFromId))
              ?.id ?? "";
      if (preferTo) setToId(preferTo);
    }
  }, [activeLocations, fromId, toId, defaultFromId, defaultToId]);

  const stock = useQuery({
    queryKey: ["stock-at-location", fromId, q],
    queryFn: () => inventoryApi.listStockAtLocation(fromId, q || undefined),
    enabled: Boolean(fromId),
  });

  useEffect(() => {
    if (seededProduct || !defaultProductId || !stock.data?.length) return;
    const row = stock.data.find((r) => r.productId === defaultProductId);
    if (!row) return;
    setLines([
      {
        productId: row.productId,
        name: row.name,
        sku: row.productSku || row.sku,
        qty: "1",
        max: row.qtyOnHand,
        unit: row.sellUnit || "pcs",
      },
    ]);
    setSeededProduct(true);
  }, [defaultProductId, stock.data, seededProduct]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = lines
        .map((l) => ({ productId: l.productId, qty: l.qty }))
        .filter((l) => Number(l.qty) > 0);
      const parsed = stockTransferSchema.safeParse({
        fromLocationId: fromId,
        toLocationId: toId,
        notes,
        lines: payload,
      });
      if (!parsed.success) {
        setFieldErrors(zodFieldErrors(parsed.error));
        toast.error(zodMessages(parsed.error)[0] ?? "Check the form");
        throw new Error(zodMessages(parsed.error)[0] ?? "Invalid transfer");
      }
      for (const line of parsed.data.lines) {
        const cart = lines.find((l) => l.productId === line.productId);
        if (cart && line.qty > cart.max) {
          const msg = `"${cart.name}" qty cannot exceed ${cart.max} on hand`;
          setFieldErrors((f) => ({ ...f, lines: msg }));
          toast.error(msg);
          throw new Error(msg);
        }
      }
      if (activeLocations.length < 2) {
        toast.error("You need at least two active locations to transfer");
        throw new Error("Need two locations");
      }
      setFieldErrors({});
      const created = await inventoryApi.createTransferDoc({
        fromLocationId: parsed.data.fromLocationId,
        toLocationId: parsed.data.toLocationId,
        notes: parsed.data.notes?.trim() || undefined,
        lines: parsed.data.lines,
      });
      if (issueAfterSave && created.id) {
        await inventoryApi.issueTransferDoc(created.id);
      }
      return { created, issued: issueAfterSave };
    },
    onSuccess: ({ issued }) => {
      toast.success(
        issued
          ? "Transfer saved and issued — awaiting receive at destination"
          : "Draft transfer saved",
      );
      onDone();
    },
    onError: transferErrorToast,
  });

  function addProduct(row: {
    productId: string;
    name: string;
    productSku?: string;
    sku: string;
    qtyOnHand: number;
    sellUnit?: string;
  }) {
    if (lines.some((l) => l.productId === row.productId)) {
      toast.message("Already in transfer — update qty below");
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        productId: row.productId,
        name: row.name,
        sku: row.productSku || row.sku,
        qty: "1",
        max: row.qtyOnHand,
        unit: row.sellUnit || "pcs",
      },
    ]);
    setFieldErrors((f) => ({ ...f, lines: "" }));
  }

  const fromName = activeLocations.find((l) => l.id === fromId)?.name ?? "—";
  const toName = activeLocations.find((l) => l.id === toId)?.name ?? "—";
  const needTwoLocs = activeLocations.length < 2;

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[#0b1f33]/45"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-[#e4e9f0] bg-white shadow-xl sm:rounded-xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#eef1f4] px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-[#0b1f33]">
              New transfer
            </h2>
            <p className="mt-1 text-[0.8rem] text-[#5a6b7d]">
              Save a draft, then issue from source and receive at destination.
            </p>
          </div>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#5a6b7d] hover:bg-[#f1f5f9]"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5">
          {needTwoLocs ? (
            <div className="rounded-xl border border-[#f5c2c2] bg-[#fff6f6] px-4 py-3 text-sm text-[#a01818]">
              You need at least two active locations to transfer.{" "}
              <Link
                href="/settings/locations"
                className="font-semibold underline"
              >
                Add a location
              </Link>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr]">
            <div>
              <Label>From location</Label>
              <Select
                className="mt-1.5 h-10 w-full rounded-lg border border-[#e4e9f0] bg-white px-2 text-sm"
                value={fromId}
                onChange={(e) => {
                  setFromId(e.target.value);
                  setLines([]);
                  setQ("");
                  setSeededProduct(true);
                  setFieldErrors((f) => ({
                    ...f,
                    fromLocationId: "",
                    toLocationId: "",
                  }));
                }}
              >
                <option value="">Select…</option>
                {activeLocations.map((l) => (
                  <option key={l.id} value={l.id} disabled={l.id === toId}>
                    {l.name}
                    {l.code ? ` (${l.code})` : ""}
                  </option>
                ))}
              </Select>
              <FieldError message={fieldErrors.fromLocationId} />
            </div>
            <div className="flex items-end justify-center pb-2">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#e8eefb] text-[#1a56db]">
                <ArrowRightLeft className="h-5 w-5" />
              </span>
            </div>
            <div>
              <Label>To location</Label>
              <Select
                className="mt-1.5 h-10 w-full rounded-lg border border-[#e4e9f0] bg-white px-2 text-sm"
                value={toId}
                onChange={(e) => {
                  setToId(e.target.value);
                  setFieldErrors((f) => ({ ...f, toLocationId: "" }));
                }}
              >
                <option value="">Select…</option>
                {activeLocations.map((l) => (
                  <option key={l.id} value={l.id} disabled={l.id === fromId}>
                    {l.name}
                    {l.code ? ` (${l.code})` : ""}
                  </option>
                ))}
              </Select>
              <FieldError message={fieldErrors.toLocationId} />
            </div>
          </div>

          <div>
            <Label>Notes (optional)</Label>
            <Input
              className="mt-1.5"
              placeholder="Optional note (for example: weekend restock)"
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setFieldErrors((f) => ({ ...f, notes: "" }));
              }}
            />
            <FieldError message={fieldErrors.notes} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-[#e4e9f0] bg-[#fafbfc] p-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <h3 className="text-sm font-semibold text-[#0b1f33]">
                  On hand at {fromName}
                </h3>
                <Input
                  className="h-9 w-40"
                  placeholder="Search…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <ul className="mt-2 max-h-52 divide-y divide-[#eef1f4] overflow-y-auto">
                {(stock.data ?? []).map((row) => (
                  <li
                    key={row.stockLevelId}
                    className="flex items-center justify-between gap-2 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#0b1f33]">
                        {row.name}
                      </p>
                      <p className="truncate text-xs text-[#5a6b7d]">
                        {row.productSku || row.sku} ·{" "}
                        {formatQtyWithUnit(row.qtyOnHand, row.sellUnit)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={!toId || fromId === toId || needTwoLocs}
                      onClick={() => addProduct(row)}
                    >
                      Add
                    </Button>
                  </li>
                ))}
                {stock.isLoading ? (
                  <li className="py-6 text-center text-sm text-[#5a6b7d]">
                    Loading…
                  </li>
                ) : null}
                {!stock.isLoading && !(stock.data ?? []).length ? (
                  <li className="py-6 text-center text-sm text-[#5a6b7d]">
                    No quantity on hand here.
                  </li>
                ) : null}
              </ul>
            </section>

            <section className="rounded-xl border border-[#e4e9f0] bg-[#fafbfc] p-3">
              <h3 className="text-sm font-semibold text-[#0b1f33]">
                Transfer cart → {toName}
              </h3>
              <FieldError message={fieldErrors.lines} />
              <ul className="mt-2 max-h-52 space-y-2 overflow-y-auto">
                {lines.map((l) => (
                  <li
                    key={l.productId}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-[#eef1f4] bg-white px-3 py-2"
                  >
                    <Package className="h-4 w-4 shrink-0 text-[#1a56db]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{l.name}</p>
                      <p className="text-xs text-[#5a6b7d]">
                        {l.sku} · max {formatQtyWithUnit(l.max, l.unit)}
                      </p>
                    </div>
                    <Input
                      className="h-9 w-20"
                      inputMode="decimal"
                      value={l.qty}
                      onChange={(e) => {
                        const next = e.target.value;
                        setLines((prev) =>
                          prev.map((x) =>
                            x.productId === l.productId
                              ? { ...x, qty: next }
                              : x,
                          ),
                        );
                        const n = Number(next);
                        if (Number.isFinite(n) && n > l.max) {
                          setFieldErrors((f) => ({
                            ...f,
                            lines: `Max on hand is ${formatQtyWithUnit(l.max, l.unit)}`,
                          }));
                        } else {
                          setFieldErrors((f) => ({ ...f, lines: "" }));
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="text-xs font-medium text-[#c81e1e]"
                      onClick={() =>
                        setLines((prev) =>
                          prev.filter((x) => x.productId !== l.productId),
                        )
                      }
                    >
                      Remove
                    </button>
                  </li>
                ))}
                {!lines.length ? (
                  <li className="rounded-lg bg-white px-4 py-8 text-center text-sm text-[#5a6b7d]">
                    Add products from the left.
                  </li>
                ) : null}
              </ul>
            </section>
          </div>

          <label className="flex items-start gap-2 text-sm text-[#0b1f33]">
            <input
              type="checkbox"
              className="mt-0.5 accent-[#1a56db]"
              checked={issueAfterSave}
              onChange={(e) => setIssueAfterSave(e.target.checked)}
              disabled={needTwoLocs}
            />
            <span>
              Issue immediately after save
              <span className="block text-[0.75rem] text-[#5a6b7d]">
                Stock leaves the source now; destination still must Receive.
              </span>
            </span>
          </label>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-[#eef1f4] px-5 py-3">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={save.isPending || needTwoLocs}
            onClick={() => save.mutate()}
          >
            {save.isPending
              ? "Saving…"
              : issueAfterSave
                ? `Save & issue → ${toName || "destination"}`
                : "Save draft"}
          </Button>
        </div>
      </div>
    </div>
  );
}
