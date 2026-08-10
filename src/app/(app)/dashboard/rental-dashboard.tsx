"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ordersApi, paymentsApi, posApi, returnsApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useBootstrap } from "@/lib/bootstrap";
import { cn, formatDate, moneyNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StripeCheckoutModal } from "@/components/stripe-checkout-modal";
import { FloorTabs } from "@/components/getting-started";
import { RentalStockPanel } from "./rental-stock-panel";

type Tab = "rent" | "stock" | "returns" | "exchange" | "recent";
type StripePay = {
  orderId: string;
  orderNumber: string;
  publishableKey: string;
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
  description: string;
  method: "card" | "upi";
};

function errMsg(e: unknown) {
  if (e instanceof ApiError) return e.messages.join(", ");
  if (e instanceof Error) return e.message;
  return "Failed";
}

/**
 * Universal rental floor — same ops for any rentable item.
 * Categories/products are dynamic; return + exchange are first-class.
 */
export function RentalDashboard() {
  const { productName, money } = useBootstrap();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("stock");

  const [returnOrderId, setReturnOrderId] = useState("");
  const [returnUnitId, setReturnUnitId] = useState("");
  const [cleaningRequired, setCleaningRequired] = useState(false);
  const [returnNotes, setReturnNotes] = useState("");
  const [returnScan, setReturnScan] = useState("");

  const [exOrderId, setExOrderId] = useState("");
  const [exFromId, setExFromId] = useState("");
  const [exToId, setExToId] = useState("");
  const [exReason, setExReason] = useState("");
  const [exScanOut, setExScanOut] = useState("");
  const [exScanIn, setExScanIn] = useState("");
  const [stripePay, setStripePay] = useState<StripePay | null>(null);
  const [stripeBusyId, setStripeBusyId] = useState<string | null>(null);

  const floor = useQuery({
    queryKey: ["pos-rental-floor"],
    queryFn: () => posApi.rentalFloor(),
  });

  const stripeConfig = useQuery({
    queryKey: ["stripe-config"],
    queryFn: () => paymentsApi.stripeConfig(),
  });

  const orders = useQuery({
    queryKey: ["orders", "rental-floor"],
    queryFn: () => ordersApi.list({ kind: "rental", limit: 40 }),
  });

  const candidates = useQuery({
    queryKey: ["returns-candidates"],
    queryFn: () => returnsApi.candidates(),
    enabled: tab === "returns" || tab === "exchange",
  });

  const returns = useQuery({
    queryKey: ["returns", "floor"],
    queryFn: () => returnsApi.list({ limit: 30 }),
    enabled: tab === "returns",
  });

  const availableUnits = useQuery({
    queryKey: ["pos-rental-catalog", "exchange"],
    queryFn: () => posApi.rentalCatalog({ limit: 100 }),
    enabled: tab === "exchange",
  });

  const recent = useQuery({
    queryKey: ["pos-rental-recent"],
    queryFn: () => posApi.listRecentRentals(25),
    enabled: tab === "recent",
  });

  const openOrders = useMemo(() => {
    const closed = new Set(["closed", "cancelled"]);
    return (orders.data?.items ?? []).filter((o) => {
      const lc = o.rentalExt?.lifecycle;
      if (lc && (lc === "closed" || lc === "cancelled")) return false;
      return !closed.has(o.status);
    });
  }, [orders.data]);

  const dueBalance = openOrders.reduce(
    (s, o) => s + moneyNumber(o.balanceDue),
    0,
  );

  const selectedCandidate = useMemo(
    () => (candidates.data?.items ?? []).find((o) => o.id === returnOrderId),
    [candidates.data, returnOrderId],
  );

  const exCandidate = useMemo(
    () => (candidates.data?.items ?? []).find((o) => o.id === exOrderId),
    [candidates.data, exOrderId],
  );

  const advance = useMutation({
    mutationFn: ({ id, lifecycle }: { id: string; lifecycle: string }) =>
      ordersApi.changeRentalLifecycle(id, lifecycle),
    onSuccess: () => {
      toast.success("Lifecycle updated");
      void qc.invalidateQueries({ queryKey: ["orders"] });
      void qc.invalidateQueries({ queryKey: ["returns-candidates"] });
      void qc.invalidateQueries({ queryKey: ["pos-rental-floor"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const payCash = useMutation({
    mutationFn: async (order: {
      id: string;
      balanceDue: string | number;
      orderNumber: string;
    }) => {
      const amt = moneyNumber(order.balanceDue);
      if (amt <= 0) throw new Error("Nothing due");
      await paymentsApi.create({
        orderId: order.id,
        method: "cash",
        amount: amt,
        type: "payment",
        idempotencyKey: `rent-cash-${order.id}-${Date.now()}`,
      });
      return order.orderNumber;
    },
    onSuccess: (orderNumber) => {
      toast.success(`Cash recorded · ${orderNumber}`);
      void qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  async function payWithStripe(
    order: {
      id: string;
      orderNumber: string;
      balanceDue: string | number;
    },
    method: "card" | "upi",
  ) {
    const amt = moneyNumber(order.balanceDue);
    if (amt <= 0) {
      toast.error("Nothing due on this ticket");
      return;
    }
    if (amt < 60) {
      toast.error("Stripe minimum is ₹60 — use cash for smaller amounts");
      return;
    }
    if (!stripeConfig.data?.enabled) {
      toast.error("Card / UPI unavailable — use cash or enable Stripe");
      return;
    }
    setStripeBusyId(order.id);
    try {
      const session = await paymentsApi.createStripeIntent({
        orderId: order.id,
        amount: amt,
        method,
        type: "payment",
      });
      if (!session.publishableKey) {
        throw new Error("Stripe publishable key missing");
      }
      setStripePay({
        orderId: order.id,
        orderNumber: order.orderNumber,
        publishableKey: session.publishableKey,
        clientSecret: session.clientSecret,
        paymentIntentId: session.paymentIntentId,
        amount: amt,
        description: session.description,
        method,
      });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setStripeBusyId(null);
    }
  }

  async function finishStripeRental(paymentIntentId: string) {
    if (!stripePay) return;
    await paymentsApi.verifyStripe({
      orderId: stripePay.orderId,
      paymentIntentId,
      amount: stripePay.amount,
      method: stripePay.method,
      type: "payment",
    });
    toast.success(
      `Stripe ${stripePay.method.toUpperCase()} · ${stripePay.orderNumber}`,
    );
    setStripePay(null);
    void qc.invalidateQueries({ queryKey: ["orders"] });
  }

  const doReturn = useMutation({
    mutationFn: () => {
      if (!returnOrderId || !returnUnitId) {
        throw new Error("Pick order and unit");
      }
      return returnsApi.create({
        orderId: returnOrderId,
        stockUnitId: returnUnitId,
        cleaningRequired,
        inspectNotes: returnNotes || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Return recorded");
      setReturnUnitId("");
      setReturnNotes("");
      setCleaningRequired(false);
      void qc.invalidateQueries({ queryKey: ["returns"] });
      void qc.invalidateQueries({ queryKey: ["returns-candidates"] });
      void qc.invalidateQueries({ queryKey: ["orders"] });
      void qc.invalidateQueries({ queryKey: ["pos-rental-floor"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const doExchange = useMutation({
    mutationFn: () => {
      if (!exOrderId || !exFromId || !exToId) {
        throw new Error("Pick order, outgoing unit, and replacement");
      }
      return posApi.rentalExchange({
        orderId: exOrderId,
        fromStockUnitId: exFromId,
        toStockUnitId: exToId,
        reason: exReason.trim() || undefined,
      });
    },
    onSuccess: (res) => {
      toast.success(`Exchanged on ${res.orderNumber}`);
      setExFromId("");
      setExToId("");
      setExReason("");
      void qc.invalidateQueries({ queryKey: ["returns-candidates"] });
      void qc.invalidateQueries({ queryKey: ["orders"] });
      void qc.invalidateQueries({ queryKey: ["pos-rental-catalog"] });
      void qc.invalidateQueries({ queryKey: ["pos-rental-floor"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const inspect = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: "clean_ready" | "needs_cleaning" | "damaged";
    }) => returnsApi.inspect(id, { inspectStatus: status }),
    onSuccess: () => {
      toast.success("Inspection saved");
      void qc.invalidateQueries({ queryKey: ["returns"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const cleaningDone = useMutation({
    mutationFn: (id: string) => returnsApi.completeCleaning(id),
    onSuccess: () => {
      toast.success("Cleaning complete — unit available");
      void qc.invalidateQueries({ queryKey: ["returns"] });
      void qc.invalidateQueries({ queryKey: ["pos-rental-floor"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  async function scanReturnBarcode() {
    const code = returnScan.trim().toUpperCase();
    if (!code) return;
    const items = candidates.data?.items ?? [];
    for (const o of items) {
      const hit = o.unitsOut.find(
        (u) => u.barcode.toUpperCase() === code || u.barcodeSku?.toUpperCase() === code,
      );
      if (hit) {
        setReturnOrderId(o.id);
        setReturnUnitId(hit.stockUnitId);
        setReturnScan("");
        toast.success(`${o.orderNumber} · ${hit.barcode}`);
        return;
      }
    }
    toast.error("Barcode not on any open rental");
  }

  async function scanExchangeOut() {
    const code = exScanOut.trim().toUpperCase();
    if (!code) return;
    const items = candidates.data?.items ?? [];
    for (const o of items) {
      const hit = o.unitsOut.find(
        (u) =>
          u.barcode.toUpperCase() === code ||
          u.barcodeSku?.toUpperCase() === code,
      );
      if (hit) {
        setExOrderId(o.id);
        setExFromId(hit.stockUnitId);
        setExScanOut("");
        toast.success(`Outgoing · ${hit.barcode}`);
        return;
      }
    }
    toast.error("Outgoing barcode not found on open rentals");
  }

  async function scanExchangeIn() {
    const code = exScanIn.trim().toUpperCase();
    if (!code) return;
    try {
      const unit = await posApi.rentalLookup(code);
      setExToId(unit.id);
      setExScanIn("");
      toast.success(`Replacement · ${unit.barcodeSku || unit.barcode}`);
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  const counts = floor.data?.counts;
  const hasUnits = (counts?.units ?? 0) > 0;
  const hasAvailable = (counts?.available ?? 0) > 0;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-2xl sm:text-3xl">{productName}</h1>
          <p className="mt-1 text-sm text-[#5a6b7d]">
            Manage rental stock, rent out, and process returns
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/counter?view=rent&new=1">Start new rental</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/counter?view=rent">Open rent counter</Link>
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        {[
          { label: "Categories", value: counts?.categories ?? 0 },
          { label: "Products", value: counts?.products ?? 0 },
          { label: "Units", value: counts?.units ?? 0 },
          { label: "Available", value: counts?.available ?? 0 },
          { label: "Out on rent", value: counts?.checkedOut ?? 0 },
        ].map((c) => (
          <div
            key={c.label}
            className="rounded-xl border border-[#d9e0ea] bg-white px-3.5 py-3"
          >
            <p className="text-[0.6rem] font-semibold tracking-wide text-[#8b9bb0] uppercase">
              {c.label}
            </p>
            <p className="mt-0.5 text-xl font-bold tabular-nums text-[#0b1f33]">
              {c.value}
            </p>
          </div>
        ))}
      </div>

      {!hasUnits && tab === "rent" ? (
        <p className="rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-sm text-[#92400e]">
          No units yet — open <strong>Inventory</strong> (step 1) and add a
          product with barcodes before renting.
        </p>
      ) : null}

      <FloorTabs
        value={tab}
        onChange={setTab}
        tabs={[
          {
            id: "stock",
            label: "Inventory",
            hint: "Products & barcodes",
          },
          {
            id: "rent",
            label: "Open tickets",
            hint: "Active rentals",
          },
          {
            id: "returns",
            label: "Returns",
            hint: "Items coming back",
          },
          {
            id: "exchange",
            label: "Swap unit",
            hint: "Replace on ticket",
          },
          {
            id: "recent",
            label: "History",
            hint: "Past rentals",
          },
        ]}
      />

      {tab === "rent" ? (
        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-[#0b1f33]">
                Open tickets
              </h2>
              <p className="mt-0.5 text-sm text-[#6b7280]">
                Balance due {money(dueBalance)}
                {stripeConfig.data?.enabled
                  ? ` · Card / UPI live`
                  : " · Cash ready"}
              </p>
            </div>
            <Button asChild>
              <Link href="/counter?new=1">New rental</Link>
            </Button>
          </div>
          <ul className="mt-4 divide-y divide-[#f3f4f6]">
            {openOrders.map((o) => {
              const lc = o.rentalExt?.lifecycle ?? o.status;
              const due = moneyNumber(o.balanceDue);
              const paying = stripeBusyId === o.id;
              return (
                <li
                  key={o.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                >
                  <div>
                    <p className="font-semibold text-[#0b1f33]">
                      {o.orderNumber}{" "}
                      <span className="rounded bg-[#f3f4f6] px-1.5 py-0.5 text-[0.65rem] font-medium tracking-wide text-[#6b7280] uppercase">
                        {lc.replaceAll("_", " ")}
                      </span>
                    </p>
                    <p className="text-xs text-[#6b7280]">
                      {o.customer?.fullName ?? "Walk-in"}
                      {o.rentalExt?.returnDueDate
                        ? ` · due ${formatDate(o.rentalExt.returnDueDate)}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 font-semibold tabular-nums text-[#0b1f33]">
                      {money(due)}
                    </span>
                    {due > 0 ? (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-8"
                          disabled={payCash.isPending || paying}
                          onClick={() => payCash.mutate(o)}
                        >
                          Cash
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-8"
                          disabled={
                            paying ||
                            !stripeConfig.data?.enabled ||
                            due < 60
                          }
                          onClick={() => void payWithStripe(o, "upi")}
                        >
                          {paying ? "…" : "UPI"}
                        </Button>
                        <Button
                          size="sm"
                          className="h-8"
                          disabled={
                            paying ||
                            !stripeConfig.data?.enabled ||
                            due < 60
                          }
                          onClick={() => void payWithStripe(o, "card")}
                        >
                          {paying ? "…" : "Card"}
                        </Button>
                      </>
                    ) : null}
                    {(lc === "quote" ||
                      o.status === "draft" ||
                      o.status === "quoted") && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8"
                        disabled={advance.isPending}
                        onClick={() =>
                          advance.mutate({ id: o.id, lifecycle: "reserved" })
                        }
                      >
                        Reserve
                      </Button>
                    )}
                    {(lc === "reserved" ||
                      lc === "fitted" ||
                      lc === "ready" ||
                      o.status === "confirmed") && (
                      <Button
                        size="sm"
                        className="h-8"
                        disabled={advance.isPending}
                        onClick={() =>
                          advance.mutate({
                            id: o.id,
                            lifecycle: "checked_out",
                          })
                        }
                      >
                        Check out
                      </Button>
                    )}
                    <Button size="sm" variant="secondary" className="h-8" asChild>
                      <Link href={`/counter?order=${o.id}`}>Counter</Link>
                    </Button>
                  </div>
                </li>
              );
            })}
            {!openOrders.length ? (
              <li className="py-10 text-center text-sm text-[#6b7280]">
                No open tickets.{" "}
                <Link
                  href="/counter?new=1"
                  className="font-semibold text-[#0b1f33] hover:underline"
                >
                  Start a rental
                </Link>
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      {tab === "stock" ? <RentalStockPanel /> : null}

      {tab === "returns" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-lg font-semibold text-[#0b1f33]">
              Record return
            </h2>
            <p className="mt-1 text-sm text-[#6b7280]">
              Scan the unit barcode first — order fills in automatically.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <Label>Scan barcode</Label>
                <div className="mt-1 flex gap-2">
                  <Input
                    className="font-mono"
                    placeholder="Scan returning unit"
                    value={returnScan}
                    onChange={(e) => setReturnScan(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void scanReturnBarcode();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void scanReturnBarcode()}
                  >
                    Find
                  </Button>
                </div>
              </div>
              <div>
                <Label>Order</Label>
                <select
                  className="mt-1 w-full rounded-xl border border-[#e5e7eb] px-3 py-2.5 text-sm"
                  value={returnOrderId}
                  onChange={(e) => {
                    setReturnOrderId(e.target.value);
                    setReturnUnitId("");
                  }}
                >
                  <option value="">Select…</option>
                  {(candidates.data?.items ?? []).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.orderNumber} · {o.customerName} (
                      {o.unitsOut.length} out)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Unit</Label>
                <select
                  className="mt-1 w-full rounded-xl border border-[#e5e7eb] px-3 py-2.5 text-sm"
                  value={returnUnitId}
                  onChange={(e) => setReturnUnitId(e.target.value)}
                  disabled={!selectedCandidate}
                >
                  <option value="">Select…</option>
                  {(selectedCandidate?.unitsOut ?? []).map((u) => (
                    <option key={u.stockUnitId} value={u.stockUnitId}>
                      {u.barcode}
                      {u.variant ? ` · ${u.variant}` : ""}
                      {u.title ? ` · ${u.title}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={cleaningRequired}
                  onChange={(e) => setCleaningRequired(e.target.checked)}
                />
                Needs cleaning / service before next rent
              </label>
              <div>
                <Label>Notes</Label>
                <Input
                  className="mt-1"
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                />
              </div>
              <Button
                disabled={doReturn.isPending}
                onClick={() => doReturn.mutate()}
              >
                {doReturn.isPending ? "Saving…" : "Record return"}
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-lg font-semibold text-[#0b1f33]">
              Recent returns
            </h2>
            <ul className="mt-3 max-h-[28rem] divide-y divide-[#f3f4f6] overflow-y-auto">
              {(returns.data?.items ?? []).map((r) => {
                const unit = r.stockUnit ?? r.inventoryUnit;
                return (
                  <li key={r.id} className="py-2.5 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">
                          {r.order?.orderNumber ?? "Return"}
                        </p>
                        <p className="font-mono text-[0.7rem] text-[#6b7280]">
                          {unit?.barcodeSku ?? "—"}
                          {unit?.variant || unit?.size
                            ? ` · ${unit.variant ?? unit.size}`
                            : ""}
                        </p>
                        <p className="text-xs text-[#9ca3af]">
                          {r.inspectStatus ?? "pending inspect"}
                          {r.cleaningRequired ? " · cleaning" : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={inspect.isPending}
                          onClick={() =>
                            inspect.mutate({
                              id: r.id,
                              status: "clean_ready",
                            })
                          }
                        >
                          OK
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={inspect.isPending}
                          onClick={() =>
                            inspect.mutate({
                              id: r.id,
                              status: "needs_cleaning",
                            })
                          }
                        >
                          Clean
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={inspect.isPending}
                          onClick={() =>
                            inspect.mutate({ id: r.id, status: "damaged" })
                          }
                        >
                          Damage
                        </Button>
                        {r.cleaningRequired && !r.cleaningCompletedAt ? (
                          <Button
                            size="sm"
                            disabled={cleaningDone.isPending}
                            onClick={() => cleaningDone.mutate(r.id)}
                          >
                            Cleaning done
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
              {!returns.data?.items?.length && !returns.isLoading ? (
                <li className="py-8 text-center text-sm text-[#6b7280]">
                  No returns yet.
                </li>
              ) : null}
            </ul>
          </section>
        </div>
      ) : null}

      {tab === "exchange" ? (
        <section className="max-w-xl rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-lg font-semibold text-[#0b1f33]">
            Exchange unit
          </h2>
          <p className="mt-1 text-sm text-[#6b7280]">
            Scan outgoing unit, then scan an available replacement.
          </p>
          <div className="mt-4 space-y-3">
            <div>
              <Label>Scan outgoing</Label>
              <div className="mt-1 flex gap-2">
                <Input
                  className="font-mono"
                  placeholder="Unit currently out"
                  value={exScanOut}
                  onChange={(e) => setExScanOut(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void scanExchangeOut();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void scanExchangeOut()}
                >
                  Find
                </Button>
              </div>
            </div>
            <div>
              <Label>Order</Label>
              <select
                className="mt-1 w-full rounded-xl border border-[#e5e7eb] px-3 py-2.5 text-sm"
                value={exOrderId}
                onChange={(e) => {
                  setExOrderId(e.target.value);
                  setExFromId("");
                }}
              >
                <option value="">Select…</option>
                {(candidates.data?.items ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.orderNumber} · {o.customerName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Outgoing unit</Label>
              <select
                className="mt-1 w-full rounded-xl border border-[#e5e7eb] px-3 py-2.5 text-sm"
                value={exFromId}
                onChange={(e) => setExFromId(e.target.value)}
                disabled={!exCandidate}
              >
                <option value="">Select…</option>
                {(exCandidate?.unitsOut ?? []).map((u) => (
                  <option key={u.stockUnitId} value={u.stockUnitId}>
                    {u.barcode}
                    {u.variant ? ` · ${u.variant}` : ""} · {u.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Scan replacement</Label>
              <div className="mt-1 flex gap-2">
                <Input
                  className="font-mono"
                  placeholder="Available unit"
                  value={exScanIn}
                  onChange={(e) => setExScanIn(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void scanExchangeIn();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void scanExchangeIn()}
                >
                  Find
                </Button>
              </div>
            </div>
            <div>
              <Label>Replacement (available)</Label>
              <select
                className="mt-1 w-full rounded-xl border border-[#e5e7eb] px-3 py-2.5 text-sm"
                value={exToId}
                onChange={(e) => setExToId(e.target.value)}
              >
                <option value="">Select…</option>
                {(availableUnits.data?.items ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.barcodeSku}
                    {u.variant ? ` · ${u.variant}` : ""} · {u.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Reason (optional)</Label>
              <Input
                className="mt-1"
                value={exReason}
                onChange={(e) => setExReason(e.target.value)}
                placeholder="Wrong variant, defect, customer request…"
              />
            </div>
            <Button
              disabled={doExchange.isPending}
              onClick={() => doExchange.mutate()}
            >
              {doExchange.isPending ? "Swapping…" : "Exchange now"}
            </Button>
          </div>
        </section>
      ) : null}

      {tab === "recent" ? (
        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-lg font-semibold text-[#0b1f33]">
            Recent rentals
          </h2>
          <ul className="mt-3 divide-y divide-[#f3f4f6]">
            {(recent.data?.items ?? []).map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
              >
                <div>
                  <p className="font-semibold text-[#0b1f33]">
                    {o.orderNumber}{" "}
                    <span className="text-xs font-medium text-[#6b7280]">
                      · {(o.lifecycle ?? o.status).replaceAll("_", " ")}
                    </span>
                  </p>
                  <p className="text-xs text-[#6b7280]">
                    {o.customerName} · {o.itemCount} unit
                    {o.itemCount === 1 ? "" : "s"}
                  </p>
                </div>
                <Button size="sm" variant="secondary" asChild>
                  <Link href={`/counter?order=${o.id}`}>Counter</Link>
                </Button>
              </li>
            ))}
            {!recent.data?.items?.length && !recent.isLoading ? (
              <li className="py-8 text-center text-sm text-[#6b7280]">
                No rental tickets yet.
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      {stripePay ? (
        <StripeCheckoutModal
          publishableKey={stripePay.publishableKey}
          clientSecret={stripePay.clientSecret}
          amount={stripePay.amount}
          description={stripePay.description}
          onSuccess={finishStripeRental}
          onClose={() => setStripePay(null)}
        />
      ) : null}
    </div>
  );
}
