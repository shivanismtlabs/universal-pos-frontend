"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { customersApi, paymentsApi, posApi, tenantsApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useBootstrap } from "@/lib/bootstrap";
import { moneyNumber, newIdempotencyKey, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ReceiptModal, type ReceiptData } from "@/components/receipt-modal";
import { StripeCheckoutModal } from "@/components/stripe-checkout-modal";
import { ProductThumb } from "@/components/product-thumb";
import {
  flushOfflineQueue,
  isOnline,
  pendingOfflineCount,
} from "@/lib/offline-queue";
import {
  allowsDecimalQty,
  formatQtyWithUnit,
  normalizeQty,
  normalizeSellUnit,
  priceUnitLabel,
  qtyStep,
  type SellUnit,
} from "@/lib/sell-units";

type CartLine = {
  stockLevelId: string;
  sku: string;
  name: string;
  unitPrice: number;
  qty: number;
  maxQty: number;
  sellUnit: SellUnit;
  category?: string | null;
  image?: string | null;
};

type PayMethod = "cash" | "upi" | "card";

/**
 * Excellent retail Sale POS — scan/search, cart, cash change, atomic checkout.
 */
export default function RetailPosWorkstation({
  compact = false,
}: {
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const { money, productName, currencyCode, data: boot } = useBootstrap();
  const currencySymbol =
    currencyCode === "USD"
      ? "$"
      : currencyCode === "EUR"
        ? "€"
        : currencyCode === "GBP"
          ? "£"
          : "₹";
  const maxCashierDiscountPercent = (() => {
    const settings = boot?.tenant?.settings as
      | { pos?: { maxCashierDiscountPercent?: number } }
      | undefined;
    const n = settings?.pos?.maxCashierDiscountPercent;
    return typeof n === "number" && n >= 0 ? n : 15;
  })();
  const taxSettings = useMemo(() => {
    const settings = boot?.tenant?.settings as
      | { tax?: { ratePercent?: number; inclusive?: boolean } }
      | undefined;
    const mode = boot?.tenant?.taxMode ?? "in_gst";
    if (mode === "none") return { rate: 0, inclusive: false };
    const ratePercent =
      typeof settings?.tax?.ratePercent === "number"
        ? settings.tax.ratePercent
        : 5;
    return {
      rate: Math.min(40, Math.max(0, ratePercent)) / 100,
      inclusive: settings?.tax?.inclusive === true,
    };
  }, [boot?.tenant]);

  const scanRef = useRef<HTMLInputElement>(null);

  const [scan, setScan] = useState("");
  const [filter, setFilter] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [category, setCategory] = useState<string>("all");
  const [customerId, setCustomerId] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discountAmount, setDiscountAmount] = useState("");
  const [parkLabel, setParkLabel] = useState("");
  const [showParked, setShowParked] = useState(false);
  const [openingFloat, setOpeningFloat] = useState("0");
  const [closingCash, setClosingCash] = useState("");
  const [showCloseRegister, setShowCloseRegister] = useState(false);
  const [payMethod, setPayMethod] = useState<PayMethod>("cash");
  const [splitPay, setSplitPay] = useState(false);
  const [splitCashAmount, setSplitCashAmount] = useState("");
  const [cashTendered, setCashTendered] = useState("");
  const [busy, setBusy] = useState(false);
  const [offlinePending, setOfflinePending] = useState(0);
  const [online, setOnline] = useState(true);
  const chargeLock = useRef(false);
  const [stripeBusy, setStripeBusy] = useState(false);
  const [stripeCheckout, setStripeCheckout] = useState<{
    orderId: string;
    orderNumber: string;
    publishableKey: string;
    clientSecret: string;
    paymentIntentId: string;
    amount: number;
    description: string;
    method: "card" | "upi";
  } | null>(null);
  const [receipt, setReceipt] = useState<{
    data: ReceiptData;
    change: string | number;
    cashTendered: string | number | null;
  } | null>(null);

  const stripeConfig = useQuery({
    queryKey: ["stripe-config"],
    queryFn: () => paymentsApi.stripeConfig(),
  });

  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => tenantsApi.listLocations(),
  });
  const locationId =
    locations.data?.find((l) => l.code === "MAIN")?.id ??
    locations.data?.[0]?.id;

  const catalog = useQuery({
    queryKey: ["pos-sale-catalog", locationId, filter, lowStockOnly],
    queryFn: () =>
      posApi.saleCatalog({
        locationId,
        q: filter.trim() || undefined,
        limit: 120,
        lowStock: lowStockOnly || undefined,
        maxQty: lowStockOnly ? 5 : undefined,
      }),
    enabled: Boolean(locationId),
    refetchInterval: 30_000,
  });

  const customers = useQuery({
    queryKey: ["customers", "pos"],
    queryFn: () => customersApi.list({ limit: 80 }),
  });

  const categories = useMemo(() => {
    const set = new Map<string, string>();
    for (const row of catalog.data?.items ?? []) {
      if (row.category?.id) set.set(row.category.id, row.category.name);
    }
    return Array.from(set.entries()).map(([id, name]) => ({ id, name }));
  }, [catalog.data]);

  const items = useMemo(() => {
    const list = catalog.data?.items ?? [];
    if (category === "all") return list;
    return list.filter((s) => s.category?.id === category);
  }, [catalog.data, category]);

  const parked = useQuery({
    queryKey: ["pos-sale-parked", locationId],
    queryFn: () => posApi.listParkedSales(locationId),
    enabled: Boolean(locationId) && showParked,
  });

  const register = useQuery({
    queryKey: ["pos-sale-register", locationId],
    queryFn: () => posApi.currentRegister(locationId),
    enabled: Boolean(locationId),
    refetchInterval: 60_000,
  });
  const registerSession = register.data?.session ?? null;

  const openRegister = useMutation({
    mutationFn: () => {
      if (!locationId) throw new Error("No location");
      return posApi.openRegister({
        locationId,
        openingFloat: moneyNumber(openingFloat || 0),
      });
    },
    onSuccess: () => {
      toast.success("Register open");
      void qc.invalidateQueries({ queryKey: ["pos-sale-register"] });
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Could not open register",
      ),
  });

  const closeRegister = useMutation({
    mutationFn: () => {
      if (!registerSession?.id) throw new Error("No open register");
      return posApi.closeRegister(registerSession.id, {
        closingCash: moneyNumber(closingCash || 0),
      });
    },
    onSuccess: (r) => {
      const z = (r as { zReport?: { variance?: number; expectedCash?: number } })
        ?.zReport;
      toast.success(
        z
          ? `Register closed · expected ${money(z.expectedCash)} · variance ${money(z.variance)}`
          : "Register closed",
      );
      setShowCloseRegister(false);
      setClosingCash("");
      void qc.invalidateQueries({ queryKey: ["pos-sale-register"] });
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Could not close register",
      ),
  });

  const subtotal = cart.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const maxDiscountAmount =
    Math.round(((subtotal * maxCashierDiscountPercent) / 100) * 100) / 100;
  const discountNum = Math.min(
    Math.max(0, moneyNumber(discountAmount || 0)),
    subtotal,
    maxDiscountAmount,
  );
  const taxAmount = (() => {
    if (taxSettings.rate <= 0) return 0;
    if (taxSettings.inclusive) {
      const net = subtotal / (1 + taxSettings.rate);
      return Math.round((subtotal - net) * 100) / 100;
    }
    return Math.round(subtotal * taxSettings.rate * 100) / 100;
  })();
  const totalDue = Math.max(
    0,
    taxSettings.inclusive
      ? subtotal - discountNum
      : subtotal + taxAmount - discountNum,
  );
  const tenderedNum = moneyNumber(cashTendered || 0);
  const changeDue =
    payMethod === "cash" && tenderedNum > 0
      ? Math.max(0, tenderedNum - totalDue)
      : 0;

  useEffect(() => {
    scanRef.current?.focus();
  }, []);

  useEffect(() => {
    const sync = () => {
      setOnline(isOnline());
      setOfflinePending(pendingOfflineCount());
    };
    sync();
    const onOnline = () => {
      sync();
      void flushOfflineQueue().then(() => sync());
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", sync);
    const t = window.setInterval(sync, 5000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", sync);
      window.clearInterval(t);
    };
  }, []);

  function upsertLine(row: {
    id: string;
    sku: string;
    name: string;
    sellPrice: string | number;
    qtyOnHand: number;
    sellUnit?: string;
    category?: { name: string } | null;
    image?: string | null;
    photoUrl?: string | null;
  }) {
    const price = moneyNumber(row.sellPrice);
    const image = row.image ?? row.photoUrl ?? null;
    const unit = normalizeSellUnit(row.sellUnit);
    const step = qtyStep(unit);
    const onHand = Number(row.qtyOnHand);
    setCart((prev) => {
      const existing = prev.find((l) => l.stockLevelId === row.id);
      if (existing) {
        const next = normalizeQty(existing.qty + step, unit);
        if (next > onHand + 1e-9) {
          toast.error("Not enough stock");
          return prev;
        }
        return prev.map((l) =>
          l.stockLevelId === row.id
            ? { ...l, qty: next, maxQty: onHand, sellUnit: unit }
            : l,
        );
      }
      if (onHand <= 0) {
        toast.error("Out of stock");
        return prev;
      }
      const startQty = Math.min(step, onHand);
      return [
        ...prev,
        {
          stockLevelId: row.id,
          sku: row.sku,
          name: row.name,
          unitPrice: price,
          qty: normalizeQty(startQty, unit),
          maxQty: onHand,
          sellUnit: unit,
          category: row.category?.name ?? null,
          image,
        },
      ];
    });
  }

  const lookup = useMutation({
    mutationFn: (sku: string) => posApi.saleLookup(sku, locationId),
    onSuccess: (row) => {
      upsertLine(row);
      setScan("");
      toast.success(`Added ${row.name}`);
      scanRef.current?.focus();
    },
    onError: (e) => {
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "SKU not found",
      );
      scanRef.current?.select();
    },
  });

  function onScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = scan.trim();
    if (!code) return;
    // Prefer local catalog hit for speed, else server lookup
    const local = (catalog.data?.items ?? []).find(
      (s) => s.sku.toLowerCase() === code.toLowerCase(),
    );
    if (local) {
      upsertLine(local);
      setScan("");
      scanRef.current?.focus();
      return;
    }
    lookup.mutate(code);
  }

  async function checkout() {
    if (chargeLock.current || busy || stripeBusy) return;
    if (!locationId) {
      toast.error("No location configured");
      return;
    }
    if (!isOnline()) {
      toast.error("Counter needs internet to charge — reconnect and try again");
      return;
    }
    if (!registerSession) {
      toast.error("Open the register before charging");
      return;
    }
    if (!cart.length) {
      toast.error("Cart is empty");
      return;
    }
    if (payMethod === "cash" && tenderedNum > 0 && tenderedNum < totalDue) {
      toast.error("Cash tendered is less than total");
      return;
    }
    if (
      moneyNumber(discountAmount || 0) > maxDiscountAmount + 0.001 &&
      maxDiscountAmount >= 0
    ) {
      toast.error(
        `Cashier discount max is ${maxCashierDiscountPercent}% (${money(maxDiscountAmount)})`,
      );
      return;
    }
    if (totalDue < 60 && (payMethod === "card" || payMethod === "upi")) {
      toast.error(
        `Card/UPI minimum is ${money(60)} — use cash for smaller sales`,
      );
      return;
    }

    chargeLock.current = true;
    setBusy(true);
    try {
      const cartPayload = {
        locationId,
        ...(customerId ? { customerId } : {}),
        items: cart.map((l) => ({
          stockLevelId: l.stockLevelId,
          quantity: l.qty,
          unitPrice: l.unitPrice,
        })),
        ...(discountNum > 0 ? { discountAmount: discountNum } : {}),
      };

      // Split cash + card/UPI: cash recorded, remainder collected via Stripe
      if (splitPay && payMethod === "cash") {
        const cashPart = Math.min(
          totalDue,
          Math.max(0, moneyNumber(splitCashAmount || 0)),
        );
        const rest = Math.round((totalDue - cashPart) * 100) / 100;
        if (rest > 0) {
          if (!stripeConfig.data?.enabled) {
            toast.error(
              "Split needs Stripe for the card/UPI remainder — or take full cash",
            );
            return;
          }
          if (rest < 60) {
            toast.error(
              `Card/UPI remainder must be at least ${money(60)} — adjust cash portion`,
            );
            return;
          }
          const prepared = await posApi.prepareSale(cartPayload);
          if (cashPart > 0) {
            await paymentsApi.create({
              orderId: prepared.orderId,
              amount: cashPart,
              method: "cash",
              type: "payment",
              idempotencyKey: newIdempotencyKey("sale-split-cash"),
            });
          }
          try {
            const session = await paymentsApi.createStripeIntent({
              orderId: prepared.orderId,
              amount: rest,
              method: "upi",
              type: "payment",
            });
            setStripeCheckout({
              orderId: prepared.orderId,
              orderNumber: prepared.orderNumber,
              publishableKey: session.publishableKey,
              clientSecret: session.clientSecret,
              paymentIntentId: session.paymentIntentId,
              amount: rest,
              description: session.description,
              method: "upi",
            });
            setStripeBusy(true);
          } catch (e) {
            await posApi.cancelPreparedSale(prepared.orderId).catch(() => null);
            throw e;
          }
          return;
        }
        // cashPart covers full total — fall through to cash checkout
      }

      // Card / UPI → Stripe (same gateway as rental)
      if (payMethod === "card" || payMethod === "upi") {
        if (!stripeConfig.data?.enabled) {
          toast.error(
            "Stripe is not configured. Set STRIPE keys or take cash.",
          );
          return;
        }

        const prepared = await posApi.prepareSale(cartPayload);
        const amount = moneyNumber(prepared.balanceDue);
        try {
          const session = await paymentsApi.createStripeIntent({
            orderId: prepared.orderId,
            amount,
            method: payMethod,
            type: "payment",
          });
          setStripeCheckout({
            orderId: prepared.orderId,
            orderNumber: prepared.orderNumber,
            publishableKey: session.publishableKey,
            clientSecret: session.clientSecret,
            paymentIntentId: session.paymentIntentId,
            amount,
            description: session.description,
            method: payMethod,
          });
          setStripeBusy(true);
        } catch (e) {
          await posApi.cancelPreparedSale(prepared.orderId).catch(() => null);
          throw e;
        }
        return;
      }

      const result = await posApi.saleCheckout({
        ...cartPayload,
        payments: [
          {
            method: "cash",
            amount: totalDue,
            idempotencyKey: newIdempotencyKey("sale"),
          },
        ],
        cashTendered: tenderedNum > 0 ? tenderedNum : totalDue,
      });

      setCart([]);
      setDiscountAmount("");
      setCashTendered("");
      setSplitPay(false);
      setSplitCashAmount("");
      setReceipt({
        data: result.receipt as ReceiptData,
        change: result.change,
        cashTendered: result.cashTendered,
      });
      void qc.invalidateQueries({ queryKey: ["pos-sale-catalog"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-catalog"] });
      void qc.invalidateQueries({ queryKey: ["retail-skus"] });
      void qc.invalidateQueries({ queryKey: ["pos-sale-parked"] });
      void qc.invalidateQueries({ queryKey: ["pos-sale-recent"] });
      toast.success(`Sale ${result.order.orderNumber} complete`);
      scanRef.current?.focus();
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Checkout failed",
      );
    } finally {
      chargeLock.current = false;
      setBusy(false);
    }
  }

  async function parkCart() {
    if (!locationId || !cart.length) {
      toast.error("Cart is empty");
      return;
    }
    setBusy(true);
    try {
      const parkedSale = await posApi.parkSale({
        locationId,
        ...(customerId ? { customerId } : {}),
        items: cart.map((l) => ({
          stockLevelId: l.stockLevelId,
          quantity: l.qty,
          unitPrice: l.unitPrice,
        })),
        ...(discountNum > 0 ? { discountAmount: discountNum } : {}),
        label: parkLabel.trim() || undefined,
      });
      setCart([]);
      setDiscountAmount("");
      setParkLabel("");
      toast.success(`Parked ${parkedSale.orderNumber}`);
      void qc.invalidateQueries({ queryKey: ["pos-sale-parked"] });
      setShowParked(true);
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Park failed",
      );
    } finally {
      setBusy(false);
    }
  }

  async function resumeParked(id: string) {
    try {
      const resumed = await posApi.resumeParkedSale(id);
      setCart(
        resumed.cart.map((l) => ({
          stockLevelId: l.stockLevelId,
          sku: l.sku,
          name: l.name,
          unitPrice: l.unitPrice,
          qty: l.qty,
          maxQty: l.maxQty,
          sellUnit: normalizeSellUnit(l.sellUnit),
          image: (l as { image?: string | null }).image ?? null,
        })),
      );
      setCustomerId(resumed.customerId ?? "");
      setDiscountAmount(
        resumed.discountAmount > 0 ? String(resumed.discountAmount) : "",
      );
      await posApi.discardParkedSale(id);
      toast.success(`Resumed ${resumed.orderNumber}`);
      void qc.invalidateQueries({ queryKey: ["pos-sale-parked"] });
      setShowParked(false);
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Resume failed",
      );
    }
  }

  async function finishStripeSale(paymentIntentId: string) {
    if (!stripeCheckout) return;
    const { orderId, orderNumber, amount, method } = stripeCheckout;
    await paymentsApi.verifyStripe({
      orderId,
      paymentIntentId,
      amount,
      method,
      type: "payment",
    });
    const receiptData = await posApi.finalizeStripeSale(orderId);
    setCart([]);
    setCashTendered("");
    setStripeCheckout(null);
    setStripeBusy(false);
    setReceipt({
      data: receiptData as ReceiptData,
      change: 0,
      cashTendered: null,
    });
    void qc.invalidateQueries({ queryKey: ["pos-sale-catalog"] });
    void qc.invalidateQueries({ queryKey: ["dashboard-catalog"] });
    void qc.invalidateQueries({ queryKey: ["retail-skus"] });
    toast.success(`Sale ${orderNumber} paid via Stripe`);
    scanRef.current?.focus();
  }

  async function closeStripeModal() {
    const pending = stripeCheckout;
    setStripeCheckout(null);
    setStripeBusy(false);
    if (pending?.orderId) {
      await posApi.cancelPreparedSale(pending.orderId).catch(() => null);
      toast.message("Stripe checkout cancelled");
    }
  }

  function clearCart() {
    setCart([]);
    setCashTendered("");
    scanRef.current?.focus();
  }

  return (
    <div
      className={cn(
        "relative",
        compact ? "" : "min-h-[calc(100vh-7rem)]",
      )}
    >
      {!compact ? (
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[0.75rem] font-medium text-[#5a6b7d]">
                Counter
              </p>
              {registerSession ? (
                <span className="rounded-md bg-[#ecfdf5] px-2 py-0.5 text-[0.62rem] font-bold text-[#166534] uppercase">
                  Register open
                </span>
              ) : (
                <span className="rounded-md bg-[#fff7ed] px-2 py-0.5 text-[0.62rem] font-bold text-[#9a3412] uppercase">
                  Register closed
                </span>
              )}
            </div>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-[#0b1f33] sm:text-2xl">
              {productName}
            </h1>
            <p className="mt-1 text-sm text-[#5a6b7d]">
              Tap a product, then charge.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!registerSession ? (
              <>
                <Input
                  className="h-9 w-24"
                  inputMode="decimal"
                  value={openingFloat}
                  onChange={(e) => setOpeningFloat(e.target.value)}
                  placeholder="Float"
                  title="Opening float"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={!locationId || openRegister.isPending}
                  onClick={() => openRegister.mutate()}
                >
                  Open register
                </Button>
              </>
            ) : showCloseRegister ? (
              <>
                <Input
                  className="h-9 w-28"
                  inputMode="decimal"
                  value={closingCash}
                  onChange={(e) => setClosingCash(e.target.value)}
                  placeholder="Cash count"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={closeRegister.isPending}
                  onClick={() => closeRegister.mutate()}
                >
                  Confirm close
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setShowCloseRegister(false)}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setShowCloseRegister(true)}
              >
                Close register
              </Button>
            )}
          </div>
        </header>
      ) : null}

      {!online ? (
        <div className="mb-3 rounded-xl border border-[#f5c2c2] bg-[#fff6f6] px-3 py-2 text-sm text-[#a01818]">
          Offline — Sale counter needs internet to charge. Reconnect, then try
          again.
        </div>
      ) : offlinePending > 0 ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#c9d7f5] bg-[#e8eefb] px-3 py-2 text-sm text-[#1341a8]">
          <span>
            Online — {offlinePending} queued offline event(s) waiting to sync
          </span>
          <Button
            type="button"
            size="sm"
            variant="soft"
            onClick={() =>
              void flushOfflineQueue().then(() =>
                setOfflinePending(pendingOfflineCount()),
              )
            }
          >
            Sync now
          </Button>
        </div>
      ) : null}

      {!compact && !registerSession ? (
        <div className="mb-3 rounded-xl border border-[#fdba74] bg-[#fff7ed] px-3 py-2 text-sm text-[#9a3412]">
          Open the cash register (float) before charging customers.
        </div>
      ) : null}

      <div
        className={cn(
          "grid gap-4",
          compact
            ? "xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.85fr)]"
            : "lg:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.72fr)]",
        )}
      >
        <section className="flex min-h-0 flex-col overflow-hidden rounded-[16px] border border-[#d9e0ea] bg-white shadow-[0_1px_2px_rgba(11,31,51,0.04)]">
          <div className="space-y-3 border-b border-[#e8edf4] bg-[#f8fafc] p-3.5 sm:p-4">
            <form onSubmit={onScanSubmit} className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <span
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[#8b9bb0]"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M2 4h2M2 8h3M2 12h2M7 4h7M10 8h4M7 12h7"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <Input
                  ref={scanRef}
                  value={scan}
                  onChange={(e) => setScan(e.target.value)}
                  placeholder="Scan or type SKU"
                  className="h-12 pl-10 font-mono text-[0.95rem]"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <Button
                type="submit"
                className="h-12 min-w-[5.75rem] px-5"
                disabled={lookup.isPending || !scan.trim()}
              >
                Add
              </Button>
            </form>

            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <div className="relative w-full sm:max-w-[14rem]">
                <span
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#8b9bb0]"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <circle
                      cx="7"
                      cy="7"
                      r="4.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    <path
                      d="M10.5 10.5L14 14"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <Input
                  placeholder="Search products"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="h-10 border-[#d9e0ea] bg-white pl-9 shadow-none"
                />
              </div>

              <button
                type="button"
                onClick={() => setLowStockOnly((v) => !v)}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition",
                  lowStockOnly
                    ? "bg-[#fff7ed] text-[#9a3412] ring-1 ring-[#fdba74]"
                    : "bg-white text-[#5a6b7d] ring-1 ring-[#d9e0ea] hover:text-[#0b1f33]",
                )}
              >
                Low stock
              </button>

              {categories.length ? (
                <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <button
                    type="button"
                    onClick={() => setCategory("all")}
                    className={cn(
                      "shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition",
                      category === "all"
                        ? "bg-[#1a56db] text-white shadow-sm"
                        : "bg-white text-[#5a6b7d] ring-1 ring-[#d9e0ea] hover:text-[#0b1f33]",
                    )}
                  >
                    All
                  </button>
                  {categories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCategory(c.id)}
                      className={cn(
                        "max-w-[10rem] shrink-0 truncate rounded-lg px-3 py-2 text-xs font-semibold transition",
                        category === c.id
                          ? "bg-[#1a56db] text-white shadow-sm"
                          : "bg-white text-[#5a6b7d] ring-1 ring-[#d9e0ea] hover:text-[#0b1f33]",
                      )}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div
            className={cn(
              "flex-1 overflow-y-auto border-t border-[#eef2f8]",
              compact
                ? "max-h-[24rem]"
                : "max-h-[min(38rem,calc(100vh-15rem))]",
            )}
          >
            <ul className="divide-y divide-[#eef2f8]">
              {items.map((row) => {
                const src = row.image ?? row.photoUrl;
                const low = row.qtyOnHand < 5;
                const inCart = cart.find((l) => l.stockLevelId === row.id);
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => upsertLine(row)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-[#f8fafc] sm:px-3.5"
                    >
                      <ProductThumb src={src} label={row.name} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[#0b1f33]">
                          {row.name}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[0.65rem] text-[#8b9bb0]">
                          <span>{row.sku}</span>
                          {row.category?.name ? (
                            <span className="font-sans text-[#a0aec0]">
                              · {row.category.name}
                            </span>
                          ) : null}
                          <span
                            className={cn(
                              "rounded px-1 py-px font-sans text-[0.6rem] font-semibold",
                              low
                                ? "bg-[#fff7ed] text-[#9a3412]"
                                : "bg-[#f1f5f9] text-[#64748b]",
                            )}
                          >
                            {formatQtyWithUnit(Number(row.qtyOnHand), row.sellUnit)}{" "}
                            left
                          </span>
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                        <p className="text-sm font-bold tabular-nums text-[#0b1f33]">
                          {money(row.sellPrice)}
                        </p>
                        <span className="inline-flex h-8 min-w-[3.5rem] items-center justify-center rounded-lg bg-[#1a56db] px-2.5 text-xs font-semibold text-white">
                          {inCart ? `+${inCart.qty}` : "ADD"}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
              {!items.length ? (
                <li className="px-4 py-14 text-center">
                  {catalog.isLoading ? (
                    <p className="text-sm text-[#5a6b7d]">Loading catalog…</p>
                  ) : (
                    <div className="mx-auto max-w-sm space-y-2">
                      <p className="text-sm font-semibold text-[#0b1f33]">
                        No products match this filter
                      </p>
                      <p className="text-sm text-[#5a6b7d]">
                        Clear search/category, or add products in Products
                        (title, category, sku, price, qty, image).
                      </p>
                      <Link
                        href="/products"
                        className="inline-flex text-sm font-semibold text-[#1a56db] hover:underline"
                      >
                        Open Products →
                      </Link>
                    </div>
                  )}
                </li>
              ) : null}
            </ul>
          </div>
        </section>

        <aside className="flex min-h-0 flex-col overflow-hidden rounded-[16px] border border-[#d9e0ea] bg-white shadow-[0_1px_2px_rgba(11,31,51,0.04)]">
          {compact ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-[#e8edf4] bg-[#f8fafc] px-3 py-2">
              {registerSession ? (
                <>
                  <span className="text-[0.65rem] font-bold text-[#166534] uppercase">
                    Register open
                  </span>
                  {!showCloseRegister ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-7"
                      onClick={() => setShowCloseRegister(true)}
                    >
                      Close
                    </Button>
                  ) : (
                    <>
                      <Input
                        className="h-7 w-24"
                        value={closingCash}
                        onChange={(e) => setClosingCash(e.target.value)}
                        placeholder="Cash"
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="h-7"
                        onClick={() => closeRegister.mutate()}
                      >
                        OK
                      </Button>
                    </>
                  )}
                </>
              ) : (
                <>
                  <Input
                    className="h-7 w-20"
                    value={openingFloat}
                    onChange={(e) => setOpeningFloat(e.target.value)}
                    placeholder="Float"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-7"
                    onClick={() => openRegister.mutate()}
                  >
                    Open register
                  </Button>
                </>
              )}
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-2 border-b border-[#e8edf4] px-4 py-3.5">
            <div>
              <p className="eyebrow">Ticket</p>
              <p className="mt-0.5 text-sm font-semibold text-[#0b1f33]">
                {cart.length
                  ? `${cart.reduce((n, l) => n + l.qty, 0)} item${
                      cart.reduce((n, l) => n + l.qty, 0) === 1 ? "" : "s"
                    }`
                  : "Empty — tap a product"}
              </p>
            </div>
            {cart.length ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-[#c81e1e] hover:bg-[#fff6f6] hover:text-[#a01818]"
                onClick={clearCart}
              >
                Clear
              </Button>
            ) : null}
          </div>

          <div className="space-y-1.5 border-b border-[#e8edf4] px-4 py-3">
            <Label className="text-[0.65rem] font-semibold tracking-[0.12em] text-[#8b9bb0] uppercase">
              Customer
            </Label>
            <Select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">Walk-in customer</option>
              {(customers.data?.items ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName} · {c.phone}
                </option>
              ))}
            </Select>
          </div>

          <ul className="max-h-48 flex-1 space-y-1.5 overflow-y-auto px-3 py-3">
            {cart.map((l) => (
              <li
                key={l.stockLevelId}
                className="flex items-center gap-2.5 rounded-[10px] border border-[#e8edf4] bg-[#f8fafc] px-2 py-1.5"
              >
                <ProductThumb src={l.image} label={l.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#0b1f33]">
                    {l.name}
                  </p>
                  <p className="font-mono text-[0.65rem] text-[#8b9bb0]">
                    {money(l.unitPrice)} {priceUnitLabel(l.sellUnit)}
                  </p>
                </div>
                <div className="flex items-center rounded-lg bg-white p-0.5 ring-1 ring-[#d9e0ea]">
                  <button
                    type="button"
                    className="grid h-8 w-8 place-items-center rounded-md text-sm font-bold text-[#0b1f33] transition hover:bg-[#e8eefb]"
                    onClick={() =>
                      setCart((prev) =>
                        prev
                          .map((x) => {
                            if (x.stockLevelId !== l.stockLevelId) return x;
                            const step = qtyStep(x.sellUnit);
                            const next = normalizeQty(x.qty - step, x.sellUnit);
                            return { ...x, qty: Math.max(0, next) };
                          })
                          .filter((x) => x.qty > 0),
                      )
                    }
                  >
                    −
                  </button>
                  {allowsDecimalQty(l.sellUnit) ? (
                    <input
                      type="number"
                      className="w-14 border-0 bg-transparent text-center text-sm font-bold tabular-nums text-[#0b1f33] outline-none"
                      min={0}
                      max={l.maxQty}
                      step={0.001}
                      value={l.qty}
                      onChange={(e) => {
                        const raw = Number(e.target.value);
                        if (!Number.isFinite(raw)) return;
                        setCart((prev) =>
                          prev.map((x) => {
                            if (x.stockLevelId !== l.stockLevelId) return x;
                            const next = normalizeQty(raw, x.sellUnit);
                            if (next < 0 || next > x.maxQty) return x;
                            return { ...x, qty: next };
                          }),
                        );
                      }}
                    />
                  ) : (
                    <span className="w-7 text-center text-sm font-bold tabular-nums text-[#0b1f33]">
                      {l.qty}
                    </span>
                  )}
                  <button
                    type="button"
                    className="grid h-8 w-8 place-items-center rounded-md text-sm font-bold text-[#0b1f33] transition hover:bg-[#e8eefb]"
                    onClick={() =>
                      setCart((prev) =>
                        prev.map((x) => {
                          if (x.stockLevelId !== l.stockLevelId) return x;
                          const step = qtyStep(x.sellUnit);
                          const next = normalizeQty(x.qty + step, x.sellUnit);
                          if (next > x.maxQty + 1e-9) return x;
                          return { ...x, qty: next };
                        }),
                      )
                    }
                  >
                    +
                  </button>
                </div>
                <p className="w-16 text-right text-sm font-bold tabular-nums text-[#0b1f33]">
                  {money(l.unitPrice * l.qty)}
                </p>
              </li>
            ))}
            {!cart.length ? (
              <li className="flex flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-[#d9e0ea] bg-[#f8fafc] px-4 py-10 text-center">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-[#e8eefb] text-[#1a56db]">
                  <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M2 4h12M4 4l1 9h6l1-9M6 4V3a2 2 0 014 0v1"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <p className="text-sm font-medium text-[#0b1f33]">
                  Ticket is empty
                </p>
                <p className="text-xs text-[#8b9bb0]">
                  Scan a SKU or tap a product to add
                </p>
              </li>
            ) : null}
          </ul>

          <div className="mt-auto space-y-3 border-t border-[#e8edf4] bg-[#f8fafc] p-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="field-shell">
                <Label className="text-[0.65rem] font-semibold tracking-[0.12em] text-[#8b9bb0] uppercase">
                  Discount {currencySymbol} (max {maxCashierDiscountPercent}%)
                </Label>
                <Input
                  className="h-10"
                  placeholder="0"
                  inputMode="decimal"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(e.target.value)}
                />
                <p className="text-[0.65rem] text-[#8b9bb0]">
                  Cap {money(maxDiscountAmount)}
                </p>
              </div>
              <div className="field-shell">
                <Label className="text-[0.65rem] font-semibold tracking-[0.12em] text-[#8b9bb0] uppercase">
                  Park label
                </Label>
                <Input
                  className="h-10"
                  placeholder="Optional"
                  value={parkLabel}
                  onChange={(e) => setParkLabel(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-10"
                disabled={busy || !cart.length}
                onClick={() => void parkCart()}
              >
                Park sale
              </Button>
              <Button
                type="button"
                variant="soft"
                size="sm"
                className="h-10"
                onClick={() => setShowParked((v) => !v)}
              >
                {showParked ? "Hide holds" : "View holds"}
              </Button>
            </div>

            {showParked ? (
              <ul className="max-h-28 space-y-1 overflow-y-auto rounded-[12px] border border-[#d9e0ea] bg-white p-2 text-xs">
                {(parked.data?.items ?? []).map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-[#f8fafc]"
                  >
                    <span className="truncate text-[#5a6b7d]">
                      {p.orderNumber}
                      {p.label ? ` · ${p.label}` : ""} · {p.customerName}
                    </span>
                    <button
                      type="button"
                      className="shrink-0 font-semibold text-[#1a56db] hover:underline"
                      onClick={() => void resumeParked(p.id)}
                    >
                      Resume
                    </button>
                  </li>
                ))}
                {!parked.data?.items?.length ? (
                  <li className="py-3 text-center text-[#8b9bb0]">
                    No parked sales
                  </li>
                ) : null}
              </ul>
            ) : null}

            <div className="rounded-[12px] border border-[#e2e8f0] bg-white px-3.5 py-3">
              <div className="flex items-baseline justify-between text-sm text-[#5a6b7d]">
                <span>Subtotal</span>
                <span className="tabular-nums text-[#0b1f33]">
                  {money(subtotal)}
                </span>
              </div>
              {taxAmount > 0 ? (
                <div className="mt-1 flex items-baseline justify-between text-sm text-[#5a6b7d]">
                  <span>
                    Tax
                    {taxSettings.inclusive ? " (incl.)" : " (added)"}
                    {` · ${(taxSettings.rate * 100).toFixed(
                      (taxSettings.rate * 100) % 1 ? 2 : 0,
                    )}%`}
                  </span>
                  <span className="tabular-nums text-[#0b1f33]">
                    {money(taxAmount)}
                  </span>
                </div>
              ) : (
                <div className="mt-1 flex items-baseline justify-between text-xs text-[#8b9bb0]">
                  <span>Tax</span>
                  <span>None</span>
                </div>
              )}
              {discountNum > 0 ? (
                <div className="mt-1 flex items-baseline justify-between text-sm text-[#0b1f33]">
                  <span>Discount</span>
                  <span className="tabular-nums">−{money(discountNum)}</span>
                </div>
              ) : null}
              <div className="mt-2 flex items-baseline justify-between border-t border-[#eef2f8] pt-2.5">
                <span className="text-sm font-semibold text-[#0b1f33]">
                  Due (pay this)
                </span>
                <span className="display text-[1.75rem] leading-none tabular-nums text-[#0b1f33]">
                  {money(totalDue)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1 rounded-[12px] bg-[#eef2f8] p-1">
              {(["cash", "upi", "card"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  data-active={payMethod === m ? "true" : "false"}
                  onClick={() => setPayMethod(m)}
                  className={cn(
                    "rounded-[9px] py-2.5 text-[0.7rem] font-bold tracking-[0.06em] uppercase transition",
                    payMethod === m
                      ? "bg-[#1a56db] text-white shadow-[0_1px_3px_rgba(26,86,219,0.35)]"
                      : "text-[#5a6b7d] hover:bg-white/80 hover:text-[#0b1f33]",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>

            {payMethod === "cash" ? (
              <div className="space-y-2.5">
                <label className="flex items-center gap-2.5 text-xs font-medium text-[#0b1f33]">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-[#cfd8e6] accent-[#1a56db]"
                    checked={splitPay}
                    onChange={(e) => setSplitPay(e.target.checked)}
                  />
                  Split cash + card/UPI (Stripe collects rest)
                </label>
                {splitPay ? (
                  <div className="field-shell">
                    <Label className="text-[0.65rem] font-semibold tracking-[0.12em] text-[#8b9bb0] uppercase">
                      Cash portion
                    </Label>
                    <Input
                      className="text-base tabular-nums"
                      inputMode="decimal"
                      value={splitCashAmount}
                      onChange={(e) => setSplitCashAmount(e.target.value)}
                      placeholder="0"
                    />
                    <p className="text-xs text-[#5a6b7d]">
                      Stripe collects{" "}
                      {money(
                        Math.max(
                          0,
                          totalDue - moneyNumber(splitCashAmount || 0),
                        ),
                      )}
                    </p>
                  </div>
                ) : (
                  <div className="field-shell">
                    <Label className="text-[0.65rem] font-semibold tracking-[0.12em] text-[#8b9bb0] uppercase">
                      Cash tendered
                    </Label>
                    <Input
                      className="text-base tabular-nums"
                      inputMode="decimal"
                      placeholder={String(totalDue || "")}
                      value={cashTendered}
                      onChange={(e) => setCashTendered(e.target.value)}
                    />
                    {tenderedNum > 0 ? (
                      <p className="text-sm font-semibold text-[#1a56db]">
                        Change: {money(changeDue)}
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {(currencyCode === "INR"
                          ? [totalDue, 500, 1000, 2000]
                          : currencyCode === "USD"
                            ? [totalDue, 20, 50, 100]
                            : [totalDue]
                        )
                          .filter((n, i, a) => n > 0 && a.indexOf(n) === i)
                          .map((n) => (
                            <button
                              key={n}
                              type="button"
                              className="rounded-lg border border-[#cfd8e6] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#5a6b7d] transition hover:border-[#1a56db]/45 hover:bg-[#e8eefb] hover:text-[#0b1f33]"
                              onClick={() => setCashTendered(String(n))}
                            >
                              {n === totalDue ? "Exact" : money(n)}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="rounded-[10px] border border-[#d9e0ea] bg-white px-3 py-2 text-xs text-[#5a6b7d]">
                {stripeConfig.data?.enabled
                  ? `Stripe ${stripeConfig.data.mode} · ${payMethod.toUpperCase()}`
                  : "Stripe keys not set — card/UPI unavailable"}
              </p>
            )}

            <Button
              size="lg"
              className="h-12 w-full text-[0.95rem]"
              disabled={
                busy ||
                stripeBusy ||
                !cart.length ||
                !registerSession ||
                !online ||
                ((payMethod === "card" || payMethod === "upi") &&
                  !stripeConfig.data?.enabled)
              }
              onClick={() => void checkout()}
            >
              {busy || stripeBusy
                ? payMethod === "cash"
                  ? "Processing…"
                  : "Opening Stripe…"
                : !registerSession
                  ? "Open register to charge"
                  : `Charge ${money(totalDue)}`}
            </Button>
          </div>
        </aside>
      </div>

      {stripeCheckout ? (
        <StripeCheckoutModal
          publishableKey={stripeCheckout.publishableKey}
          clientSecret={stripeCheckout.clientSecret}
          amount={stripeCheckout.amount}
          description={stripeCheckout.description}
          onSuccess={finishStripeSale}
          onClose={() => void closeStripeModal()}
        />
      ) : null}

      {receipt ? (
        <ReceiptModal
          data={receipt.data}
          change={receipt.change}
          cashTendered={receipt.cashTendered}
          onClose={() => setReceipt(null)}
        />
      ) : null}
    </div>
  );
}
