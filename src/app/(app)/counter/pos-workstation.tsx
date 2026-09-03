"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  catalogApi,
  customersApi,
  ordersApi,
  paymentsApi,
  posApi,
  tenantsApi,
} from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import {
  RENTAL_LIFECYCLE_TRANSITIONS,
  canMutateRentalItems,
  lifecycleLabel,
  rentalLifecycleOf,
} from "@/lib/order-status";
import { StripeCheckoutModal } from "@/components/stripe-checkout-modal";
import { ReceiptModal } from "@/components/receipt-modal";
import {
  formatDate,
  moneyNumber,
  stablePaymentAttemptKey,
  todayYmd,
  toYmd,
  cn,
} from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ProductThumb } from "@/components/product-thumb";
import { BarcodeScanInput } from "@/components/barcode-scan-input";
import {
  enqueueOfflineEvent,
  flushOfflineQueue,
  isOnline,
  pendingOfflineCount,
} from "@/lib/offline-queue";
import { useAuthStore } from "@/lib/auth-store";
import { useBootstrap } from "@/lib/bootstrap";

type QueueTab = "ready" | "pickup" | "out" | "balance" | "all";
type PayMethod = "cash" | "upi" | "card";
type PayType = "payment" | "deposit";

type ScannedUnit = {
  id: string;
  barcodeSku: string;
  variant: string;
  rentalPrice: string | number;
  deposit: string | number;
  status: string;
  title: string;
  image?: string | null;
  photoUrl?: string | null;
};

function errMsg(e: unknown) {
  if (e instanceof ApiError) return e.messages.join(", ");
  if (e instanceof Error) return e.message;
  return "Failed";
}

function addDays(ymd: string, days: number) {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toYmd(d.toISOString()) ?? ymd;
}

export default function PosWorkstation() {
  const qc = useQueryClient();
  const { money } = useBootstrap();
  const searchParams = useSearchParams();
  const barcodeRef = useRef<HTMLInputElement>(null);

  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get("order"),
  );
  const [findQuery, setFindQuery] = useState("");
  const [barcode, setBarcode] = useState("");
  const [tab, setTab] = useState<QueueTab>("ready");
  const [method, setMethod] = useState<PayMethod>("upi");
  const [payType, setPayType] = useState<PayType>("payment");
  const [amount, setAmount] = useState("");
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [stripeBusy, setStripeBusy] = useState(false);
  const [stripeCheckout, setStripeCheckout] = useState<{
    publishableKey: string;
    clientSecret: string;
    paymentIntentId: string;
    amount: number;
    description: string;
    markReady?: boolean;
  } | null>(null);
  const [scannedUnit, setScannedUnit] = useState<ScannedUnit | null>(null);
  const [unitFilter, setUnitFilter] = useState("");
  const [unitCategory, setUnitCategory] = useState("all");
  const [extendDate, setExtendDate] = useState("");
  const [extendBusy, setExtendBusy] = useState(false);
  const [swapFrom, setSwapFrom] = useState("");
  const [swapTo, setSwapTo] = useState("");
  const [swapBusy, setSwapBusy] = useState(false);
  const [queuedPayHint, setQueuedPayHint] = useState(false);

  const [showNew, setShowNew] = useState(searchParams.get("new") === "1");
  const [walkInName, setWalkInName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [pickupDate, setPickupDate] = useState(todayYmd());
  const [returnDueDate, setReturnDueDate] = useState(addDays(todayYmd(), 2));
  const [locationId, setLocationId] = useState("");

  const today = todayYmd();
  const storeId = useAuthStore((s) => s.user?.storeId);
  const [offlinePending, setOfflinePending] = useState(0);

  const queue = useQuery({
    queryKey: ["orders", "terminal"],
    queryFn: () => ordersApi.list({ kind: "rental", limit: 100 }),
  });

  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => tenantsApi.listLocations(),
  });

  const floor = useQuery({
    queryKey: ["pos-rental-floor", locationId],
    queryFn: () => posApi.rentalFloor(locationId || undefined),
  });

  /** Catalog items & services (no stock units) — also fetched when floor API omits services */
  const serviceCatalog = useQuery({
    queryKey: ["catalog-services-for-rental"],
    queryFn: () =>
      catalogApi.listProducts({
        status: "active",
        availableInPos: true,
        limit: 80,
      }),
  });

  const ticket = useQuery({
    queryKey: ["order", selectedId],
    queryFn: () => ordersApi.get(selectedId!),
    enabled: Boolean(selectedId),
  });

  const receipt = useQuery({
    queryKey: ["receipt", selectedId],
    queryFn: () => posApi.receipt(selectedId!),
    enabled: receiptOpen && Boolean(selectedId),
  });

  const stripeConfig = useQuery({
    queryKey: ["stripe-config"],
    queryFn: () => paymentsApi.stripeConfig(),
    staleTime: 60_000,
  });

  useEffect(() => {
    const sync = () => setOfflinePending(pendingOfflineCount());
    sync();
    const onOnline = () => {
      void flushOfflineQueue().then((r) => {
        if (r.synced) toast.success(`Synced ${r.synced} offline event(s)`);
        sync();
      });
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", sync);
    };
  }, []);

  useEffect(() => {
    const fromUrl = searchParams.get("order");
    if (fromUrl) setSelectedId(fromUrl);
    if (searchParams.get("new") === "1") setShowNew(true);
  }, [searchParams]);

  useEffect(() => {
    if (!locationId && locations.data?.length) {
      setLocationId(locations.data[0].id);
    }
  }, [locations.data, locationId]);

  useEffect(() => {
    if (!ticket.data) return;
    const balanceDue = moneyNumber(ticket.data.balanceDue);
    const required = moneyNumber(
      ticket.data.depositRequired ??
        (ticket.data.items ?? []).reduce(
          (sum, i) => sum + moneyNumber(i.stockUnit?.depositAmount),
          0,
        ),
    );
    const collected = moneyNumber(
      ticket.data.depositCollected ?? ticket.data.depositTotal,
    );
    const depositDue = moneyNumber(
      ticket.data.depositDue ?? Math.max(0, required - collected),
    );
    // After partial pay, refresh the amount box to remaining deposit or balance
    if (payType === "deposit") {
      setAmount(
        depositDue > 0
          ? String(depositDue)
          : balanceDue > 0
            ? String(balanceDue)
            : "",
      );
    } else {
      setAmount(balanceDue > 0 ? String(balanceDue) : "");
    }
  }, [
    ticket.data?.id,
    ticket.data?.balanceDue,
    ticket.data?.depositTotal,
    ticket.data?.depositDue,
    ticket.data?.depositCollected,
    ticket.data?.depositRequired,
    payType,
  ]);

  const filteredQueue = useMemo(() => {
    let rows = queue.data?.items ?? [];
    rows = rows.filter((o) => {
      const lc = rentalLifecycleOf(o);
      return lc !== "closed" && lc !== "cancelled";
    });
    if (tab === "ready") {
      rows = rows.filter((o) =>
        ["ready", "fitted", "reserved"].includes(rentalLifecycleOf(o)),
      );
    }
    if (tab === "pickup") {
      rows = rows.filter((o) => {
        const lc = rentalLifecycleOf(o);
        const pickup =
          toYmd(o.rentalExt?.pickupDate ?? o.pickupDate) === today;
        return (
          pickup &&
          ["quote", "reserved", "fitted", "ready"].includes(lc)
        );
      });
    }
    if (tab === "out") {
      rows = rows.filter((o) =>
        ["checked_out", "returned", "inspected"].includes(
          rentalLifecycleOf(o),
        ),
      );
    }
    if (tab === "balance") {
      rows = rows.filter((o) => moneyNumber(o.balanceDue) > 0);
    }
    return rows;
  }, [queue.data, tab, today]);

  const floorUnits = useMemo(() => {
    const units = floor.data?.units ?? [];
    const q = unitFilter.trim().toLowerCase();
    return units.filter((u) => {
      if (String(u.status).toLowerCase() !== "available") return false;
      if (unitCategory !== "all" && u.category?.id !== unitCategory) {
        return false;
      }
      if (!q) return true;
      return (
        u.title.toLowerCase().includes(q) ||
        u.sku.toLowerCase().includes(q) ||
        (u.barcodeSku || u.barcode || "").toLowerCase().includes(q) ||
        (u.variant || u.size || "").toLowerCase().includes(q)
      );
    });
  }, [floor.data?.units, unitFilter, unitCategory]);

  const floorServices = useMemo(() => {
    type Svc = {
      id: string;
      productId: string;
      title: string;
      sku: string;
      rentalPrice: string | number;
      kind?: string;
      category?: { id: string; name: string } | null;
      image?: string | null;
      photoUrl?: string | null;
    };
    const fromFloor: Svc[] = (floor.data?.services ?? []).map((s) => ({
      id: s.id,
      productId: s.productId || s.id,
      title: s.title,
      sku: s.sku,
      rentalPrice: s.rentalPrice,
      kind: s.kind,
      category: s.category,
      image: s.image,
      photoUrl: s.photoUrl,
    }));
    const fromCatalog: Svc[] = (serviceCatalog.data?.items ?? []).map((p) => ({
      id: p.id,
      productId: p.id,
      title: p.name,
      sku: p.skuCode,
      rentalPrice: p.basePrice,
      kind: p.kind,
      category: p.category
        ? { id: p.category.id, name: p.category.name }
        : null,
      image: p.photoUrl,
      photoUrl: p.photoUrl,
    }));
    const byId = new Map<string, Svc>();
    for (const s of [...fromFloor, ...fromCatalog]) {
      byId.set(s.productId, s);
    }
    const q = unitFilter.trim().toLowerCase();
    return [...byId.values()].filter((s) => {
      if (unitCategory !== "all" && s.category?.id !== unitCategory) {
        return false;
      }
      if (!q) return true;
      return (
        s.title.toLowerCase().includes(q) ||
        s.sku.toLowerCase().includes(q)
      );
    });
  }, [
    floor.data?.services,
    serviceCatalog.data?.items,
    unitFilter,
    unitCategory,
  ]);

  const floorCategories = useMemo(() => {
    const base = floor.data?.categories ?? [];
    const map = new Map(base.map((c) => [c.id, c]));
    for (const s of floorServices) {
      if (s.category?.id && !map.has(s.category.id)) {
        map.set(s.category.id, s.category);
      }
    }
    return [...map.values()];
  }, [floor.data?.categories, floorServices]);

  const readyCount = floorUnits.length + floorServices.length;

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["orders"] });
    void qc.invalidateQueries({ queryKey: ["order", selectedId] });
    void qc.invalidateQueries({ queryKey: ["reports"] });
    void qc.invalidateQueries({ queryKey: ["pos-rental-floor"] });
    void qc.invalidateQueries({ queryKey: ["catalog-services-for-rental"] });
  };

  const createRental = useMutation({
    mutationFn: async () => {
      if (!locationId) throw new Error("Select a location");
      let customerId: string | undefined;
      const name = walkInName.trim();
      const phoneRaw = walkInPhone.trim();
      const phoneDigits = phoneRaw.replace(/\D/g, "");
      if (name || phoneRaw) {
        if (!name) throw new Error("Enter customer name (or leave both blank for walk-in)");
        if (phoneDigits.length < 7 || phoneDigits.length > 15) {
          throw new Error("Enter a valid phone number (any country)");
        }
        const created = await customersApi.create({
          fullName: name,
          phone: phoneRaw.startsWith("+") ? phoneRaw : phoneDigits,
        });
        customerId = created.id;
      }
      return ordersApi.create({
        kind: "rental",
        locationId,
        ...(customerId ? { customerId } : {}),
        pickupDate: pickupDate || undefined,
        returnDueDate: returnDueDate || undefined,
      });
    },
    onSuccess: (data) => {
      toast.success(`Quote ${data.orderNumber} · scan units`);
      setSelectedId(data.id);
      setShowNew(false);
      setWalkInName("");
      setWalkInPhone("");
      invalidate();
      barcodeRef.current?.focus();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  async function collectViaStripe(opts?: { markReady?: boolean }) {
    if (!selectedId) throw new Error("No ticket");
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      throw new Error("Enter a valid amount");
    }
    if (!stripeConfig.data?.enabled) {
      throw new Error(
        "Stripe is not configured — card/UPI cannot be marked paid without a provider",
      );
    }

    setStripeBusy(true);
    try {
      const session = await paymentsApi.createStripeIntent({
        orderId: selectedId,
        amount: amt,
        type: payType,
        method,
        idempotencyKey: stablePaymentAttemptKey(
          `${selectedId}:${amt}:${payType}:${method}`,
          "rent-stripe",
        ),
      });
      setStripeCheckout({
        publishableKey: session.publishableKey,
        clientSecret: session.clientSecret,
        paymentIntentId: session.paymentIntentId,
        amount: amt,
        description: session.description,
        markReady: opts?.markReady,
      });
    } catch (e) {
      setStripeBusy(false);
      throw e;
    }
  }

  async function finishStripePayment(paymentIntentId: string) {
    if (!selectedId || !stripeCheckout) return;
    await paymentsApi.verifyStripe({
      orderId: selectedId,
      paymentIntentId,
      amount: stripeCheckout.amount,
      type: payType,
      method,
    });
    if (stripeCheckout.markReady) {
      try {
        await ordersApi.changeRentalLifecycle(selectedId, "reserved");
      } catch {
        /* already past quote */
      }
      try {
        await ordersApi.changeRentalLifecycle(selectedId, "ready");
      } catch {
        /* already ready / out */
      }
      toast.success("Paid · ticket ready");
    } else {
      toast.success("Stripe payment successful");
    }
    invalidate();
  }

  const takePayment = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("No ticket");
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) {
        throw new Error("Enter a valid amount");
      }

      if (method === "upi" || method === "card") {
        if (!isOnline()) {
          throw new Error("Card/UPI needs internet — use cash or collect later");
        }
        await collectViaStripe();
        return;
      }

      if (!isOnline()) {
        if (!storeId) throw new Error("No store on session for offline queue");
        enqueueOfflineEvent("pos.cash_payment", storeId, {
          orderId: selectedId,
          amount: amt,
          type: payType,
          method: "cash",
        });
        toast.success("Cash queued offline");
        setQueuedPayHint(true);
        setOfflinePending(pendingOfflineCount());
        return;
      }

      await posApi.checkout({
        orderId: selectedId,
        payments: [
          {
            method: "cash",
            amount: amt,
            type: payType,
            idempotencyKey: stablePaymentAttemptKey(
              `${selectedId}:${amt}:${payType}:cash`,
              "cash",
            ),
          },
        ],
      });
      toast.success("Cash recorded");
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const markReady = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("No ticket");
      const lc = rentalLifecycleOf(ticket.data ?? {});
      if (["ready", "checked_out", "returned", "closed"].includes(lc)) {
        throw new Error(`Already ${lifecycleLabel(lc)}`);
      }
      if (lc === "quote") {
        await ordersApi.changeRentalLifecycle(selectedId, "reserved");
      }
      return ordersApi.changeRentalLifecycle(selectedId, "ready");
    },
    onSuccess: () => {
      toast.success("Ticket ready for pickup");
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const handover = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("No ticket");
      const lc = rentalLifecycleOf(ticket.data ?? {});
      if (lc === "checked_out") throw new Error("Already checked out");
      if (["returned", "inspected", "closed", "cancelled"].includes(lc)) {
        throw new Error(`Cannot handover from ${lifecycleLabel(lc)}`);
      }
      if (lc === "quote") {
        await ordersApi.changeRentalLifecycle(selectedId, "reserved");
      }
      return ordersApi.changeRentalLifecycle(selectedId, "checked_out");
    },
    onSuccess: () => {
      toast.success("Handed over — units are out");
      invalidate();
      setReceiptOpen(true);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const advance = useMutation({
    mutationFn: (lifecycle: string) =>
      ordersApi.changeRentalLifecycle(selectedId!, lifecycle),
    onSuccess: (_, lifecycle) => {
      toast.success(`→ ${lifecycleLabel(lifecycle)}`);
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  async function findTicket() {
    const q = findQuery.trim();
    if (!q) return;
    try {
      if (/^\d{10}$/.test(q)) {
        const customers = await customersApi.list({ q, limit: 5 });
        const customer = customers.items[0];
        if (!customer) {
          toast.error("No customer with that phone");
          return;
        }
        const orders = await ordersApi.list({
          customerId: customer.id,
          kind: "rental",
          limit: 20,
        });
        const open = (orders.items ?? []).find((o) => {
          const lc = rentalLifecycleOf(o);
          return lc !== "closed" && lc !== "cancelled";
        });
        if (!open) {
          toast.error(`No open rental for ${customer.fullName}`);
          return;
        }
        setSelectedId(open.id);
        toast.success(`Loaded ${open.orderNumber}`);
        return;
      }

      const byNumber = await ordersApi.list({ q, kind: "rental", limit: 10 });
      const hit = byNumber.items[0];
      if (!hit) {
        toast.error("Ticket not found");
        return;
      }
      setSelectedId(hit.id);
      toast.success(`Loaded ${hit.orderNumber}`);
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  async function applyUnit(unit: {
    id: string;
    barcodeSku?: string;
    barcode?: string;
    variant?: string | null;
    size?: string | null;
    rentalPrice: string | number;
    deposit: string | number;
    status: string;
    title: string;
    image?: string | null;
    photoUrl?: string | null;
  }) {
    const status = String(unit.status ?? "").toLowerCase();
    const available = status === "available";
    const code = unit.barcodeSku || unit.barcode || "";

    setScannedUnit({
      id: unit.id,
      barcodeSku: code,
      variant: unit.variant || unit.size || "—",
      rentalPrice: unit.rentalPrice,
      deposit: unit.deposit,
      status: unit.status,
      title: unit.title,
      image: unit.image ?? unit.photoUrl ?? null,
      photoUrl: unit.photoUrl ?? unit.image ?? null,
    });

    if (!available) {
      toast.error(`${code} is ${unit.status} — not available to rent`);
      barcodeRef.current?.focus();
      return;
    }

    const orderData = ticket.data;
    const ticketMutable = orderData ? canMutateRentalItems(orderData) : false;

    if (selectedId && ticketMutable) {
      try {
        await ordersApi.addItem(selectedId, {
          itemKind: "stock_unit",
          stockUnitId: unit.id,
        });
        toast.success(`Added ${code} · ${unit.title}`);
        setScannedUnit(null);
        invalidate();
      } catch (e) {
        toast.success(`${code} · ${unit.title}`);
        toast.error(errMsg(e));
      }
      barcodeRef.current?.focus();
      return;
    }

    if (selectedId && !ticketMutable) {
      toast.message(
        `${code} found — this ticket is locked. Start New rental to add units.`,
      );
    } else {
      toast.success(
        `${code} · ${unit.title} — start New rental or open a quote to add`,
      );
    }
    barcodeRef.current?.focus();
  }

  async function applyService(svc: {
    productId: string;
    title: string;
    sku: string;
    rentalPrice: string | number;
  }) {
    const orderData = ticket.data;
    const ticketMutable = orderData ? canMutateRentalItems(orderData) : false;
    if (!selectedId || !ticketMutable) {
      toast.info("Create or open a quote, then add the service");
      return;
    }
    try {
      await ordersApi.addItem(selectedId, {
        itemKind: "product",
        productId: svc.productId,
        unitPrice: moneyNumber(svc.rentalPrice),
        quantity: 1,
        description: svc.title,
      });
      toast.success(`Added ${svc.title}`);
      invalidate();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  async function scanBarcode(code?: string) {
    const sku = (code ?? barcode).trim().toUpperCase();
    if (!sku) {
      toast.error("Enter or scan a barcode");
      barcodeRef.current?.focus();
      return;
    }
    try {
      const unit = await posApi.rentalLookup(sku);
      if (!unit?.id) {
        toast.error("Barcode not found");
        setScannedUnit(null);
        return;
      }
      setBarcode("");
      await applyUnit(unit);
    } catch (e) {
      toast.error(errMsg(e));
      barcodeRef.current?.focus();
    }
  }

  const addScanned = useMutation({
    mutationFn: async () => {
      if (!selectedId || !scannedUnit) throw new Error("Select ticket + scan");
      return ordersApi.addItem(selectedId, {
        itemKind: "stock_unit",
        stockUnitId: scannedUnit.id,
      });
    },
    onSuccess: () => {
      toast.success("Unit added");
      setScannedUnit(null);
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const data = ticket.data;
  const lifecycle = data ? rentalLifecycleOf(data) : "quote";
  const balance = moneyNumber(data?.balanceDue);
  const depositCollected = moneyNumber(
    data?.depositCollected ?? data?.depositTotal,
  );
  const depositRequired = moneyNumber(
    data?.depositRequired ??
      (data?.items ?? []).reduce(
        (sum, i) => sum + moneyNumber(i.stockUnit?.depositAmount),
        0,
      ),
  );
  const depositDue = moneyNumber(
    data?.depositDue ?? Math.max(0, depositRequired - depositCollected),
  );
  const settled = Boolean(data) && balance <= 0;
  const credit = settled ? Math.abs(balance) : 0;
  const canAddItems = data ? canMutateRentalItems(data) : false;
  const nextLifecycles = (
    RENTAL_LIFECYCLE_TRANSITIONS[lifecycle] ?? []
  ).filter((s) => s !== "cancelled");

  const pickup =
    data?.rentalExt?.pickupDate ?? data?.pickupDate ?? null;
  const retDue =
    data?.rentalExt?.returnDueDate ?? data?.returnDueDate ?? null;

  const suggestDeposit = () => {
    if (!data) return;
    const target = Math.min(
      depositDue > 0 ? depositDue : depositRequired,
      balance > 0 ? balance : depositDue,
    );
    if (target > 0) {
      setPayType("deposit");
      setAmount(String(target));
    }
  };

  const payLabel = settled
    ? null
    : method === "cash"
      ? "Collect cash"
      : stripeBusy
        ? "Opening Stripe…"
        : stripeConfig.data?.enabled
          ? `Stripe ${method.toUpperCase()}`
          : `Record ${method.toUpperCase()}`;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">Rental counter</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#0b1f33]">
            Tickets
          </h1>
          <p className="mt-0.5 text-sm text-[#5a6b7d]">
            Manage rental tickets and checkout.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isOnline() || offlinePending > 0 ? (
            <span className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[0.7rem] font-semibold text-amber-900">
              {!isOnline()
                ? "Offline"
                : `${offlinePending} pending sync`}
            </span>
          ) : null}
          <Button
            type="button"
            variant={showNew ? "secondary" : "default"}
            onClick={() => setShowNew((v) => !v)}
          >
            {showNew ? "Cancel" : "Start new rental"}
          </Button>
        </div>
      </header>

      {showNew ? (
        <section className="rounded-[14px] border border-[#d9e0ea] bg-white p-4 sm:p-5">
          <h2 className="text-base font-semibold text-[#0b1f33]">
            New rental quote
          </h2>
          <p className="mt-0.5 text-sm text-[#5a6b7d]">
            Customer is optional (walk-in). After create, scan units onto the
            ticket.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label>Customer name</Label>
              <Input
                className="mt-1.5"
                placeholder="Walk-in (optional)"
                value={walkInName}
                onChange={(e) => setWalkInName(e.target.value)}
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                className="mt-1.5"
                placeholder="+91… or any country"
                inputMode="numeric"
                value={walkInPhone}
                onChange={(e) => setWalkInPhone(e.target.value)}
              />
            </div>
            <div>
              <Label>Location</Label>
              <Select
                className="select-field mt-1.5"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
              >
                {(locations.data ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Pickup date</Label>
              <Input
                className="mt-1.5"
                type="date"
                value={pickupDate}
                onChange={(e) => setPickupDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Return due</Label>
              <Input
                className="mt-1.5"
                type="date"
                value={returnDueDate}
                onChange={(e) => setReturnDueDate(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                className="w-full"
                disabled={createRental.isPending || !locationId}
                onClick={() => createRental.mutate()}
              >
                {createRental.isPending ? "Creating…" : "Create quote"}
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <div className="rounded-[14px] border border-[#d9e0ea] bg-white p-3 sm:p-3.5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[12rem] flex-1">
            <Label>Find ticket</Label>
            <Input
              className="mt-1.5"
              placeholder="Order number or phone"
              value={findQuery}
              onChange={(e) => setFindQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void findTicket();
                }
              }}
            />
          </div>
          <div className="w-full sm:min-w-[16rem] sm:flex-1 sm:max-w-sm">
            <BarcodeScanInput
              value={barcode}
              onChange={setBarcode}
              onScan={(code) => void scanBarcode(code)}
              label="Scan barcode"
              placeholder="Scan unit barcode"
              inputRef={barcodeRef}
              autoFocus
            />
          </div>
          <div className="flex gap-2 pb-0.5">
            <Button
              type="button"
              variant="secondary"
              onClick={() => void findTicket()}
            >
              Load
            </Button>
          </div>
        </div>
      </div>

      {scannedUnit ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[#c9d7f5] bg-[#e8eefb]/70 px-3.5 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <ProductThumb
              src={scannedUnit.image ?? scannedUnit.photoUrl}
              label={scannedUnit.title}
              size="md"
            />
            <div className="min-w-0">
              <p className="font-semibold text-[#0b1f33]">
                {scannedUnit.barcodeSku}
                <span className="ml-2 text-xs font-medium text-[#5a6b7d]">
                  {scannedUnit.status}
                </span>
              </p>
              <p className="truncate text-sm text-[#5a6b7d]">
                {scannedUnit.title} · {scannedUnit.variant} · rent{" "}
                {money(scannedUnit.rentalPrice)}
                {moneyNumber(scannedUnit.deposit) > 0
                  ? ` · deposit ${money(scannedUnit.deposit)}`
                  : ""}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {canAddItems ? (
              <Button
                type="button"
                size="sm"
                disabled={addScanned.isPending}
                onClick={() => addScanned.mutate()}
              >
                Add to ticket
              </Button>
            ) : (
              <span className="self-center text-xs text-[#8b9bb0]">
                Open or create a quote to add
              </span>
            )}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setScannedUnit(null)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-[12px] border border-[#d9e0ea] bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-[#eef2f8] px-3 py-2.5">
          <p className="mr-1 text-xs font-semibold tracking-wide text-[#8b9bb0] uppercase">
            Available to rent
          </p>
          <Input
            className="h-9 max-w-[14rem] border-[#d9e0ea] bg-[#f8fafc] shadow-none"
            placeholder="Search title, barcode…"
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
          />
          <Select
            aria-label="Category"
            value={unitCategory}
            onChange={(e) => setUnitCategory(e.target.value)}
            wrapperClassName="w-auto shrink-0"
            className="h-9 min-w-[10rem] max-w-[14rem] border-[#d9e0ea] bg-[#f8fafc] text-[0.75rem] font-semibold shadow-none"
          >
            <option value="all">All categories</option>
            {floorCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <span className="text-[0.7rem] text-[#8b9bb0]">
            {readyCount} ready
          </span>
        </div>
        <ul className="max-h-[14rem] divide-y divide-[#eef2f8] overflow-y-auto">
          {floorServices.map((s) => (
            <li key={`svc-${s.productId}`}>
              <div
                onClick={() => void applyService(s)}
                className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left transition hover:bg-[#f8fafc]"
              >
                <ProductThumb
                  src={s.image ?? s.photoUrl}
                  label={s.title}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#0b1f33]">
                    {s.title}
                    <span className="ml-1.5 rounded bg-[#fff7ed] px-1.5 py-0.5 text-[0.6rem] font-semibold text-[#c2410c]">
                      {s.kind === "service" ? "Service" : "Item"}
                    </span>
                  </p>
                  <p className="font-mono text-[0.65rem] text-[#8b9bb0]">
                    {s.sku}
                    {s.category?.name ? ` · ${s.category.name}` : ""}
                    {" · no unit needed"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold tabular-nums text-[#0b1f33]">
                    {money(s.rentalPrice)}
                  </p>
                </div>
                <span className="inline-flex h-7 items-center rounded-md bg-[#1a56db] px-2 text-[0.65rem] font-semibold text-white">
                  ADD
                </span>
              </div>
            </li>
          ))}
          {floorUnits.map((u) => (
            <li key={u.id}>
              <div
                onClick={() => void applyUnit(u)}
                className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left transition hover:bg-[#f8fafc]"
              >
                <ProductThumb
                  src={u.image ?? u.photoUrl}
                  label={u.title}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#0b1f33]">
                    {u.title}
                    {u.variant || u.size ? (
                      <span className="ml-1.5 font-normal text-[#5a6b7d]">
                        · {u.variant || u.size}
                      </span>
                    ) : null}
                  </p>
                  <p className="font-mono text-[0.65rem] text-[#8b9bb0]">
                    {u.barcodeSku || u.barcode}
                    {u.category?.name ? ` · ${u.category.name}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold tabular-nums text-[#0b1f33]">
                    {money(u.rentalPrice)}
                  </p>
                  {moneyNumber(u.deposit) > 0 ? (
                    <p className="text-[0.65rem] text-[#8b9bb0]">
                      dep {money(u.deposit)}
                    </p>
                  ) : null}
                </div>
                <span className="inline-flex h-7 items-center rounded-md bg-[#1a56db] px-2 text-[0.65rem] font-semibold text-white">
                  ADD
                </span>
              </div>
            </li>
          ))}
          {!readyCount ? (
            <li className="px-3 py-8 text-center text-sm text-[#5a6b7d]">
              {floor.isLoading || serviceCatalog.isLoading
                ? "Loading…"
                : "No units or services — add Items (service) or rental stock units"}
            </li>
          ) : null}
        </ul>
      </section>

      <div className="grid overflow-hidden rounded-[14px] border border-[#d9e0ea] bg-white lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="border-b border-[#d9e0ea] bg-[#f8fafc] lg:border-r lg:border-b-0">
          <div className="border-b border-[#d9e0ea] p-2">
            <div className="flex gap-0.5 rounded-[10px] bg-[#eef2f7] p-1">
              {(
                [
                  ["ready", "Ready"],
                  ["pickup", "Today"],
                  ["out", "Out"],
                  ["balance", "Due"],
                  ["all", "Open"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={cn(
                    "flex-1 rounded-lg px-1 py-1.5 text-[0.7rem] font-semibold transition",
                    tab === key
                      ? "bg-white text-[#1a56db] shadow-sm ring-1 ring-[#d9e0ea]"
                      : "text-[#5a6b7d] hover:text-[#0b1f33]",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <ul className="max-h-[22rem] overflow-y-auto lg:max-h-[calc(100vh-16rem)]">
            {filteredQueue.map((o) => {
              const active = selectedId === o.id;
              const lc = rentalLifecycleOf(o);
              return (
                <li key={o.id} className="border-b border-[#eef1f4] last:border-0">
                  <button
                    type="button"
                    onClick={() => setSelectedId(o.id)}
                    className={cn(
                      "w-full px-3 py-3 text-left transition",
                      active
                        ? "border-l-[3px] border-l-[#1a56db] bg-[#e8eefb]/80"
                        : "border-l-[3px] border-l-transparent hover:bg-white",
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-1">
                      <p className="truncate text-[0.8125rem] font-semibold text-[#0b1f33]">
                        {o.orderNumber.replace(/^ORD-/, "")}
                      </p>
                      <span className="shrink-0 text-[0.75rem] tabular-nums text-[#5a6b7d]">
                        {money(o.balanceDue)}
                      </span>
                    </div>
                    <p className="truncate text-[0.75rem] text-[#5a6b7d]">
                      {o.customer?.fullName ?? "Walk-in"}
                    </p>
                    <p className="mt-1 text-[0.65rem] font-medium text-[#8b9bb0]">
                      {lifecycleLabel(lc)}
                    </p>
                  </button>
                </li>
              );
            })}
            {!filteredQueue.length ? (
              <li className="px-4 py-12 text-center text-sm text-[#8b9bb0]">
                No tickets here yet
              </li>
            ) : null}
          </ul>
        </aside>

        <div className="flex min-h-[28rem] flex-col">
          {!selectedId ? (
            <div className="flex flex-1 flex-col justify-center gap-5 p-8 sm:px-12">
              <div>
                <p className="text-lg font-bold tracking-tight text-[#0b1f33]">
                  No ticket selected
                </p>
                <p className="mt-1 max-w-sm text-sm leading-relaxed text-[#5a6b7d]">
                  Pick a ticket on the left, load by order/phone above, or start
                  a new rental.
                </p>
              </div>
              <ol className="grid max-w-lg gap-2 sm:grid-cols-3">
                {[
                  ["1", "Start", "Create a quote"],
                  ["2", "Scan", "Add barcode units"],
                  ["3", "Charge", "Then mark Ready"],
                ].map(([n, t, d]) => (
                  <li
                    key={n}
                    className="rounded-[10px] border border-[#d9e0ea] bg-[#f8fafc] px-3 py-2.5"
                  >
                    <p className="text-[0.65rem] font-semibold text-[#1a56db]">
                      Step {n}
                    </p>
                    <p className="text-sm font-semibold text-[#0b1f33]">{t}</p>
                    <p className="text-xs text-[#5a6b7d]">{d}</p>
                  </li>
                ))}
              </ol>
              {!showNew ? (
                <div>
                  <Button type="button" onClick={() => setShowNew(true)}>
                    Start new rental
                  </Button>
                </div>
              ) : null}
            </div>
          ) : ticket.isLoading ? (
            <p className="p-6 text-sm text-[#5a6b7d]">Loading ticket…</p>
          ) : !data ? (
            <p className="p-6 text-sm text-[#c81e1e]">Could not load ticket</p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#d9e0ea] px-4 py-3.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-bold text-[#0b1f33]">
                      {data.orderNumber}
                    </h2>
                    <span className="rounded-md bg-[#e8eefb] px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide text-[#1a56db] uppercase">
                      {lifecycleLabel(lifecycle)}
                    </span>
                    {settled ? (
                      <span className="rounded-md bg-[#f0fdf4] px-2 py-0.5 text-[0.65rem] font-semibold text-[#166534]">
                        Settled
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-[#2c3e50]">
                    {data.customer?.fullName ?? "Walk-in"}
                    {data.customer?.phone ? ` · ${data.customer.phone}` : ""}
                  </p>
                  <p className="text-[0.75rem] text-[#5a6b7d]">
                    {formatDate(pickup)} → {formatDate(retDue)}
                  </p>
                </div>
                <div className="flex items-start gap-4 text-right">
                  <div>
                    <p className="text-[0.65rem] font-semibold tracking-wide text-[#8b9bb0] uppercase">
                      Balance
                    </p>
                    <p className="text-xl font-bold tabular-nums text-[#0b1f33]">
                      {settled
                        ? credit > 0
                          ? money(credit)
                          : money(0)
                        : money(balance)}
                    </p>
                  </div>
                  <Link
                    href={`/orders/view?id=${data.id}`}
                    className="pt-1 text-xs font-semibold text-[#1a56db] hover:underline"
                  >
                    Full details
                  </Link>
                </div>
              </div>

              <div className="grid grid-cols-3 divide-x divide-[#d9e0ea] border-b border-[#d9e0ea] bg-[#f8fafc] text-sm">
                {[
                  ["Due", money(data.balanceDue)],
                  [
                    "Deposit left",
                    depositDue > 0
                      ? money(depositDue)
                      : depositRequired > 0
                        ? money(0)
                        : money(depositCollected),
                  ],
                  ["Rent", money(data.subtotal)],
                ].map(([k, v]) => (
                  <div key={k} className="px-3 py-2.5">
                    <p className="text-[0.65rem] font-semibold tracking-wide text-[#8b9bb0] uppercase">
                      {k}
                    </p>
                    <p className="font-semibold tabular-nums text-[#0b1f33]">
                      {v}
                    </p>
                    {k === "Deposit left" && depositRequired > 0 ? (
                      <p className="mt-0.5 text-[0.65rem] tabular-nums text-[#8b9bb0]">
                        {money(depositCollected)} of {money(depositRequired)}{" "}
                        paid
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-white text-[0.65rem] tracking-wide text-[#8b9bb0] uppercase">
                    <tr className="border-b border-[#d9e0ea]">
                      <th className="px-4 py-2.5 font-semibold">Unit</th>
                      <th className="px-2 py-2.5 font-semibold">Variant</th>
                      <th className="px-4 py-2.5 text-right font-semibold">
                        Rent
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => (
                      <tr key={item.id} className="border-b border-[#eef1f4]">
                        <td className="px-4 py-2.5 font-medium text-[#0b1f33]">
                          {item.stockUnit?.barcodeSku ??
                            item.inventoryUnit?.barcodeSku ??
                            item.description ??
                            item.itemKind ??
                            item.itemType}
                        </td>
                        <td className="px-2 py-2.5 text-[#6b7280]">
                          {item.stockUnit?.variantLabel ??
                            item.size ??
                            item.inventoryUnit?.size ??
                            "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {money(item.unitPrice)}
                        </td>
                      </tr>
                    ))}
                    {!data.items.length ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-4 py-12 text-center text-[#6b7280]"
                        >
                          Scan a barcode to add units
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              {nextLifecycles.length || ["quote", "reserved", "fitted", "ready"].includes(lifecycle) ? (
                <div className="flex flex-wrap items-center gap-1.5 border-t border-[#e5e7eb] px-3 py-2">
                  {["quote", "reserved", "fitted", "ready"].includes(lifecycle) ? (
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                      disabled={advance.isPending}
                      onClick={() => {
                        if (!selectedId) return;
                        void posApi
                          .rentalPickup({ orderId: selectedId, pickupCondition: "good" })
                          .then(() => {
                            toast.success("Rental active — handed over to customer!");
                            invalidate();
                          })
                          .catch((e) => toast.error(errMsg(e)));
                      }}
                    >
                      Handover &amp; Pickup (Active)
                    </Button>
                  ) : null}
                  {nextLifecycles.map((s) => (
                    <Button
                      key={s}
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-7 text-xs"
                      disabled={advance.isPending}
                      onClick={() => advance.mutate(s)}
                    >
                      → {lifecycleLabel(s)}
                    </Button>
                  ))}
                </div>
              ) : null}

              {["checked_out", "ready", "reserved", "fitted"].includes(
                lifecycle,
              ) ? (
                <div className="space-y-3 border-t border-[#e5e7eb] px-3 py-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                    <div>
                      <Label className="text-[0.65rem] uppercase text-[#8b9bb0]">
                        Extend return date
                      </Label>
                      <Input
                        type="date"
                        className="mt-1 h-9"
                        value={extendDate}
                        onChange={(e) => setExtendDate(e.target.value)}
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="h-9"
                      disabled={extendBusy || !extendDate || !selectedId}
                      onClick={() => {
                        if (!selectedId || !extendDate) return;
                        setExtendBusy(true);
                        void posApi
                          .rentalExtend({
                            orderId: selectedId,
                            newReturnDueDate: extendDate,
                          })
                          .then((r) => {
                            toast.success(
                              `Extended +${r.extraDays} day(s) · fee ${money(r.extensionFee)}`,
                            );
                            setExtendDate("");
                            invalidate();
                          })
                          .catch((e) => toast.error(errMsg(e)))
                          .finally(() => setExtendBusy(false));
                      }}
                    >
                      {extendBusy ? "…" : "Extend"}
                    </Button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <div>
                      <Label className="text-[0.65rem] uppercase text-[#8b9bb0]">
                        Swap from barcode
                      </Label>
                      <Input
                        className="mt-1 h-9 font-mono"
                        value={swapFrom}
                        onChange={(e) => setSwapFrom(e.target.value)}
                        placeholder="OUT unit"
                      />
                    </div>
                    <div>
                      <Label className="text-[0.65rem] uppercase text-[#8b9bb0]">
                        Swap to barcode
                      </Label>
                      <Input
                        className="mt-1 h-9 font-mono"
                        value={swapTo}
                        onChange={(e) => setSwapTo(e.target.value)}
                        placeholder="Available unit"
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-9"
                      disabled={swapBusy || !swapFrom.trim() || !swapTo.trim()}
                      onClick={() => {
                        if (!selectedId) return;
                        setSwapBusy(true);
                        void (async () => {
                          try {
                            const fromU = await posApi.rentalLookup(
                              swapFrom.trim().toUpperCase(),
                            );
                            const toU = await posApi.rentalLookup(
                              swapTo.trim().toUpperCase(),
                            );
                            await posApi.rentalExchange({
                              orderId: selectedId,
                              fromStockUnitId: fromU.id,
                              toStockUnitId: toU.id,
                            });
                            toast.success(
                              `Swapped ${fromU.barcodeSku} → ${toU.barcodeSku}`,
                            );
                            setSwapFrom("");
                            setSwapTo("");
                            invalidate();
                          } catch (e) {
                            toast.error(errMsg(e));
                          } finally {
                            setSwapBusy(false);
                          }
                        })();
                      }}
                    >
                      {swapBusy ? "…" : "Swap"}
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="border-t border-[#e5e7eb] bg-[#fafcfb] px-3 py-3">
                {queuedPayHint ? (
                  <p className="mb-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs font-medium text-amber-900">
                    Payment queued offline — do not collect again until sync
                    completes.
                  </p>
                ) : null}
                {!settled ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="flex shrink-0 gap-0.5 rounded-lg bg-[#eef2f0] p-0.5">
                      {(
                        [
                          ["payment", "Rent"],
                          ["deposit", "Deposit"],
                        ] as const
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setPayType(key)}
                          className={cn(
                            "h-8 rounded-md px-3 text-xs font-semibold",
                            payType === key
                              ? "bg-white text-[#0b1f33] shadow-sm"
                              : "text-[#6b7280]",
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <div className="flex shrink-0 gap-0.5 rounded-lg border border-[#e5e7eb] bg-white p-0.5">
                      {(
                        [
                          ["upi", "UPI"],
                          ["cash", "Cash"],
                          ["card", "Card"],
                        ] as const
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setMethod(key)}
                          className={cn(
                            "h-8 rounded-md px-3 text-xs font-semibold",
                            method === key
                              ? "bg-[#1a56db] text-white"
                              : "text-[#6b7280] hover:text-[#0b1f33]",
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <div className="relative min-w-0 flex-1">
                      <Input
                        className="h-9 bg-white text-sm font-semibold tabular-nums"
                        type="number"
                        step="0.01"
                        min="0"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                      />
                    </div>

                    <button
                      type="button"
                      className="text-[0.7rem] font-semibold text-[#0b1f33] hover:underline disabled:opacity-40"
                      disabled={balance <= 0}
                      onClick={() => setAmount(String(balance))}
                    >
                      Full
                    </button>
                    <button
                      type="button"
                      className="text-[0.7rem] font-semibold text-[#0b1f33] hover:underline disabled:opacity-40"
                      disabled={depositDue <= 0 && balance <= 0}
                      onClick={suggestDeposit}
                    >
                      Suggest deposit
                    </button>

                    <Button
                      type="button"
                      size="sm"
                      className="h-9 shrink-0"
                      disabled={
                        !selectedId || takePayment.isPending || stripeBusy
                      }
                      onClick={() => takePayment.mutate()}
                    >
                      {payLabel}
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs font-medium text-[#0b1f33]">
                    Ticket settled — Ready or Handover when customer picks up
                  </p>
                )}

                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8"
                    disabled={!selectedId || markReady.isPending || stripeBusy}
                    onClick={() => markReady.mutate()}
                  >
                    Ready
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8"
                    disabled={!selectedId || handover.isPending}
                    onClick={() => handover.mutate()}
                  >
                    Handover
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8"
                    disabled={!selectedId}
                    onClick={() => setReceiptOpen(true)}
                  >
                    Receipt
                  </Button>
                  <span
                    className={cn(
                      "ml-auto rounded-md px-2 py-1 text-[0.6rem] font-semibold tracking-wide uppercase",
                      stripeConfig.data?.enabled
                        ? "bg-[#e8eefb] text-[#0b1f33]"
                        : "text-[#9ca3af]",
                    )}
                  >
                    {stripeConfig.data?.enabled
                      ? `Stripe ${stripeConfig.data.mode}`
                      : "Cash / offline"}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {stripeCheckout ? (
        <StripeCheckoutModal
          publishableKey={stripeCheckout.publishableKey}
          clientSecret={stripeCheckout.clientSecret}
          amount={stripeCheckout.amount}
          description={stripeCheckout.description}
          onSuccess={finishStripePayment}
          onClose={() => {
            setStripeCheckout(null);
            setStripeBusy(false);
          }}
        />
      ) : null}

      {receiptOpen && selectedId ? (
        <ReceiptModal
          loading={receipt.isLoading}
          data={receipt.data}
          onClose={() => setReceiptOpen(false)}
        />
      ) : null}
    </div>
  );
}
