"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { loyaltyApi, paymentsApi, posApi, tenantsApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useBootstrap } from "@/lib/bootstrap";
import { useAuthStore } from "@/lib/auth-store";
import { canApproveRefund } from "@/lib/roles";
import { moneyNumber, newIdempotencyKey, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ReceiptModal, type ReceiptData } from "@/components/receipt-modal";
import { StripeCheckoutModal } from "@/components/stripe-checkout-modal";
import { ProductThumb } from "@/components/product-thumb";
import { ImageLightbox } from "@/components/image-lightbox";
import { CustomerPicker } from "@/components/customer-picker";
import { StationPinLock } from "@/components/station-pin-lock";
import { BarcodeScanInput } from "@/components/barcode-scan-input";
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
  /** Product override % (e.g. 18). null/undefined → tenant rate */
  taxRatePercent?: number | null;
};

type PayMethod =
  | "cash"
  | "upi"
  | "card"
  | "bank_transfer"
  | "wallet"
  | "qr"
  | "emi"
  | "store_credit"
  | "gift_card";

const TOUCH_KEY = "upos-counter-touch-mode";

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
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  const actingUser = useAuthStore((s) => s.user);
  const lockStation = useAuthStore((s) => s.lockStation);
  const stationToken = useAuthStore((s) => s.stationToken);
  const pinLocked = useAuthStore((s) => s.pinLocked);
  const [manualPinSwitch, setManualPinSwitch] = useState(false);
  const canOverrideDiscount = roles.some(
    (r) => r === "admin" || r === "manager",
  );
  const pinSwitchEnabled = (() => {
    const settings = boot?.tenant?.settings as
      | { pos?: { pinSwitchEnabled?: boolean } }
      | undefined;
    return settings?.pos?.pinSwitchEnabled !== false;
  })();
  const idleMinutes = (() => {
    const settings = boot?.tenant?.settings as
      | { pos?: { pinIdleMinutes?: number } }
      | undefined;
    const n = settings?.pos?.pinIdleMinutes;
    return typeof n === "number" && n > 0 ? n : 5;
  })();
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
      | { tax?: { ratePercent?: number | string; inclusive?: boolean } }
      | undefined;
    const mode = boot?.tenant?.taxMode ?? "in_gst";
    if (mode === "none") return { rate: 0, inclusive: false };
    const raw = settings?.tax?.ratePercent;
    const parsed =
      typeof raw === "number"
        ? raw
        : typeof raw === "string" && raw.trim()
          ? Number(raw.replace(/%/g, "").trim())
          : NaN;
    const ratePercent = Number.isFinite(parsed)
      ? parsed
      : mode === "vat"
        ? 20
        : 5;
    return {
      rate: Math.min(40, Math.max(0, ratePercent)) / 100,
      inclusive: settings?.tax?.inclusive === true,
    };
  }, [boot?.tenant]);

  const scanRef = useRef<HTMLInputElement>(null);

  const [scan, setScan] = useState("");
  const [filter, setFilter] = useState("");
  const [catalogPage, setCatalogPage] = useState(1);
  const pageSize = compact ? 24 : 40;
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [category, setCategory] = useState<string>("all");
  const [customerId, setCustomerId] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discountAmount, setDiscountAmount] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponApplied, setCouponApplied] = useState<string | null>(null);
  const [parkLabel, setParkLabel] = useState("");
  const [showParked, setShowParked] = useState(false);
  const [openingFloat, setOpeningFloat] = useState("0");
  const [closingCash, setClosingCash] = useState("");
  const [showCloseRegister, setShowCloseRegister] = useState(false);
  const [payMethod, setPayMethod] = useState<PayMethod>("cash");
  const [splitPay, setSplitPay] = useState(false);
  const [splitCashAmount, setSplitCashAmount] = useState("");
  const [cashTendered, setCashTendered] = useState("");
  const [allowPartial, setAllowPartial] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [giftCardCode, setGiftCardCode] = useState("");
  const [giftCardBalance, setGiftCardBalance] = useState<number | null>(null);
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankIfsc, setBankIfsc] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankReference, setBankReference] = useState("");
  const [loyaltyPointsInput, setLoyaltyPointsInput] = useState("");
  const [loyaltyQuote, setLoyaltyQuote] = useState<{
    points: number;
    amountOff: number;
  } | null>(null);
  const [sendReceipt, setSendReceipt] = useState(false);
  const [touchMode, setTouchMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offlinePending, setOfflinePending] = useState(0);
  const [online, setOnline] = useState(true);
  const chargeLock = useRef(false);
  const [stripeBusy, setStripeBusy] = useState(false);
  const [lightbox, setLightbox] = useState<{
    images: string[];
    index: number;
    label: string;
  } | null>(null);
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

  useEffect(() => {
    if (!pinSwitchEnabled || !stationToken || pinLocked) return;
    let timer: number | undefined;
    const bump = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(
        () => {
          lockStation();
        },
        idleMinutes * 60_000,
      );
    };
    bump();
    const events = ["pointerdown", "keydown", "touchstart", "mousemove"] as const;
    for (const ev of events) window.addEventListener(ev, bump, { passive: true });
    return () => {
      if (timer) window.clearTimeout(timer);
      for (const ev of events) window.removeEventListener(ev, bump);
    };
  }, [
    pinSwitchEnabled,
    stationToken,
    pinLocked,
    idleMinutes,
    lockStation,
  ]);

  const catalog = useQuery({
    queryKey: [
      "pos-sale-catalog",
      locationId,
      filter,
      lowStockOnly,
      catalogPage,
      pageSize,
    ],
    queryFn: () =>
      posApi.saleCatalog({
        locationId,
        q: filter.trim() || undefined,
        limit: pageSize,
        page: catalogPage,
        lowStock: lowStockOnly || undefined,
        maxQty: lowStockOnly ? 5 : undefined,
      }),
    enabled: Boolean(locationId),
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    setCatalogPage(1);
  }, [filter, lowStockOnly, locationId]);

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

  const catalogTotal = catalog.data?.total ?? items.length;
  const catalogTotalPages = catalog.data?.totalPages ?? 1;

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
  const taxAmount = (() => {
    if (taxSettings.rate <= 0 && !cart.some((l) => (l.taxRatePercent ?? null) != null))
      return 0;
    let tax = 0;
    for (const l of cart) {
      const lineGross = l.unitPrice * l.qty;
      const rate =
        l.taxRatePercent != null && Number.isFinite(l.taxRatePercent)
          ? Math.min(40, Math.max(0, l.taxRatePercent)) / 100
          : taxSettings.rate;
      if (rate <= 0) continue;
      if (taxSettings.inclusive) {
        const net = lineGross / (1 + rate);
        tax += lineGross - net;
      } else {
        tax += lineGross * rate;
      }
    }
    return Math.round(tax * 100) / 100;
  })();
  /** Pre-discount ticket total (matches server discountable base). */
  const ticketBeforeDiscount = taxSettings.inclusive
    ? subtotal
    : subtotal + taxAmount;
  const maxDiscountAmount =
    Math.round(
      ((ticketBeforeDiscount * maxCashierDiscountPercent) / 100) * 100,
    ) / 100;
  const discountEntered = Math.max(0, moneyNumber(discountAmount || 0));
  const discountNum = Math.min(
    discountEntered,
    ticketBeforeDiscount,
    canOverrideDiscount ? ticketBeforeDiscount : maxDiscountAmount,
  );
  const discountCapped =
    discountEntered > discountNum + 0.001 && !canOverrideDiscount;
  const loyaltyOff = loyaltyQuote?.amountOff ?? 0;
  const totalDue = Math.max(0, ticketBeforeDiscount - discountNum - loyaltyOff);
  const chargeAmount = (() => {
    if (!allowPartial) return totalDue;
    const entered = moneyNumber(payAmount || 0);
    if (entered <= 0) return totalDue;
    return Math.min(totalDue, entered);
  })();
  const tenderedNum = moneyNumber(cashTendered || 0);
  const changeDue =
    payMethod === "cash" && tenderedNum > 0
      ? Math.max(0, tenderedNum - chargeAmount)
      : 0;

  useEffect(() => {
    try {
      setTouchMode(localStorage.getItem(TOUCH_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

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
    trackQty?: boolean;
    category?: { name: string } | null;
    image?: string | null;
    photoUrl?: string | null;
    images?: string[];
    taxRatePercent?: number | null;
  }) {
    const price = moneyNumber(row.sellPrice);
    const image =
      row.image ?? row.photoUrl ?? row.images?.[0] ?? null;
    const unit = normalizeSellUnit(row.sellUnit);
    const step = qtyStep(unit);
    const onHand = Number(row.qtyOnHand);
    const tracks = row.trackQty !== false;
    const taxRatePercent =
      row.taxRatePercent != null && Number.isFinite(row.taxRatePercent)
        ? row.taxRatePercent
        : null;
    setCart((prev) => {
      const existing = prev.find((l) => l.stockLevelId === row.id);
      if (existing) {
        const next = normalizeQty(existing.qty + step, unit);
        if (tracks && next > onHand + 1e-9) {
          toast.error("Not enough stock");
          return prev;
        }
        return prev.map((l) =>
          l.stockLevelId === row.id
            ? {
                ...l,
                qty: next,
                maxQty: tracks ? onHand : Math.max(l.maxQty, next + 100),
                sellUnit: unit,
                image: l.image ?? image,
                taxRatePercent: l.taxRatePercent ?? taxRatePercent,
              }
            : l,
        );
      }
      if (tracks && onHand <= 0) {
        toast.error("Out of stock — set opening qty / stock in Inventory first");
        return prev;
      }
      const startQty = tracks ? Math.min(step, onHand) : step;
      return [
        ...prev,
        {
          stockLevelId: row.id,
          sku: row.sku,
          name: row.name,
          unitPrice: price,
          qty: normalizeQty(startQty, unit),
          maxQty: tracks ? onHand : 999999,
          sellUnit: unit,
          category: row.category?.name ?? null,
          image,
          taxRatePercent,
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

  function resolveScan(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    const norm = trimmed.toLowerCase();
    // Prefer local catalog hit for speed (SKU, product SKU, barcode)
    const local = (catalog.data?.items ?? []).find((s) => {
      const sku = s.sku?.toLowerCase();
      const productSku = s.productSku?.toLowerCase();
      const barcode = s.barcode?.toLowerCase();
      return sku === norm || productSku === norm || barcode === norm;
    });
    if (local) {
      upsertLine(local);
      setScan("");
      toast.success(`Added ${local.name}`);
      scanRef.current?.focus();
      return;
    }
    lookup.mutate(trimmed);
  }

  function onScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    resolveScan(scan);
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
    if (payMethod === "cash" && tenderedNum > 0 && tenderedNum < chargeAmount) {
      toast.error("Cash tendered is less than payment amount");
      return;
    }
    if (discountCapped) {
      toast.message(
        `Discount capped at ${money(maxDiscountAmount)} (${maxCashierDiscountPercent}% cashier max)`,
      );
    }
    if (
      chargeAmount < 60 &&
      (payMethod === "card" || payMethod === "upi")
    ) {
      toast.error(
        `Card/UPI minimum is ${money(60)} — use cash/QR/bank for smaller amounts`,
      );
      return;
    }
    if (payMethod === "store_credit" && !customerId) {
      toast.error("Select a customer for store credit");
      return;
    }
    if (payMethod === "gift_card" && !giftCardCode.trim()) {
      toast.error("Enter gift card code");
      return;
    }
    if (payMethod === "bank_transfer") {
      if (
        !bankAccountName.trim() ||
        !bankAccountNumber.trim() ||
        !bankReference.trim()
      ) {
        toast.error(
          "Enter bank account name, account number, and reference / UTR",
        );
        return;
      }
    }
    if (loyaltyPointsInput && !customerId) {
      toast.error("Select a customer to redeem loyalty points");
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
        ...(couponApplied
          ? { couponCode: couponApplied }
          : couponCode.trim()
            ? { couponCode: couponCode.trim() }
            : {}),
      };

      const checkoutExtras = {
        ...(loyaltyQuote && loyaltyQuote.points > 0
          ? { loyaltyPointsToRedeem: loyaltyQuote.points }
          : {}),
        ...(allowPartial && chargeAmount < totalDue - 0.001
          ? { allowPartial: true }
          : {}),
        ...(sendReceipt && customerId
          ? {
              sendReceipt: true,
              sendReceiptChannels: ["email", "sms"] as Array<
                "email" | "sms" | "whatsapp"
              >,
            }
          : {}),
      };

      if (payMethod === "store_credit" && !customerId) {
        toast.error("Select a customer to pay with store credit");
        return;
      }

      // Split + partial together is unsupported (prepare has no partial)
      if (splitPay && allowPartial && chargeAmount < totalDue - 0.001) {
        toast.error(
          "Turn off Partial payment when using Split cash + card/UPI",
        );
        return;
      }

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
        const stripeAmount = chargeAmount;
        try {
          const session = await paymentsApi.createStripeIntent({
            orderId: prepared.orderId,
            amount: stripeAmount,
            method: payMethod,
            type: "payment",
          });
          setStripeCheckout({
            orderId: prepared.orderId,
            orderNumber: prepared.orderNumber,
            publishableKey: session.publishableKey,
            clientSecret: session.clientSecret,
            paymentIntentId: session.paymentIntentId,
            amount: stripeAmount,
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

      const payAmt = chargeAmount;
      const settleMethod =
        payMethod === "store_credit"
          ? "store_credit"
          : payMethod === "gift_card"
            ? "gift_card"
            : payMethod === "bank_transfer"
              ? "bank_transfer"
              : payMethod === "qr"
                ? "qr"
                : payMethod === "wallet"
                  ? "wallet"
                  : payMethod === "emi"
                    ? "emi"
                    : "cash";
      const result = await posApi.saleCheckout({
        ...cartPayload,
        ...checkoutExtras,
        payments: [
          {
            method: settleMethod,
            amount: payAmt,
            idempotencyKey: newIdempotencyKey("sale"),
            ...(payMethod === "gift_card"
              ? { giftCardCode: giftCardCode.trim() }
              : {}),
            ...(payMethod === "bank_transfer"
              ? {
                  bankAccountName: bankAccountName.trim(),
                  bankAccountNumber: bankAccountNumber.trim(),
                  bankIfsc: bankIfsc.trim() || undefined,
                  bankName: bankName.trim() || undefined,
                  bankReference: bankReference.trim(),
                }
              : {}),
          },
        ],
        ...(payMethod === "cash"
          ? { cashTendered: tenderedNum > 0 ? tenderedNum : payAmt }
          : {}),
      });

      setCart([]);
      setDiscountAmount("");
      setCouponCode("");
      setCouponApplied(null);
      setCashTendered("");
      setSplitPay(false);
      setSplitCashAmount("");
      setAllowPartial(false);
      setPayAmount("");
      setGiftCardCode("");
      setGiftCardBalance(null);
      setBankAccountName("");
      setBankAccountNumber("");
      setBankIfsc("");
      setBankName("");
      setBankReference("");
      setLoyaltyPointsInput("");
      setLoyaltyQuote(null);
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
      void qc.invalidateQueries({ queryKey: ["customers"] });
      if (result.partial) {
        toast.success(
          `Sale ${result.order.orderNumber} · partial pay · balance ${money(result.balanceDue ?? result.order.balanceDue)}`,
        );
      } else {
        toast.success(
          `Sale ${result.order.orderNumber} complete${
            result.pointsEarned ? ` · +${result.pointsEarned} pts` : ""
          }`,
        );
      }
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
      toast.success(`Draft saved ${parkedSale.orderNumber}`);
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
    setAllowPartial(false);
    setPayAmount("");
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
    toast.success(
      amount + 0.001 < totalDue
        ? `Sale ${orderNumber} · partial ${money(amount)} via Stripe`
        : `Sale ${orderNumber} paid via Stripe`,
    );
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
      {/* Idle lock is handled in AppShell; this overlay is manual Switch user only */}
      <StationPinLock
        open={Boolean(manualPinSwitch && stationToken && pinSwitchEnabled && !pinLocked)}
        locationId={locationId}
        dismissible
        onDismiss={() => setManualPinSwitch(false)}
        onUnlocked={() => setManualPinSwitch(false)}
      />
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
              Tap a product, then charge. Open the register at shift start; close
              it when you count the drawer.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canApproveRefund(roles) ? (
              <Link href="/returns">
                <Button type="button" size="sm" variant="secondary">
                  Returns desk
                </Button>
              </Link>
            ) : null}
            {actingUser ? (
              <span className="rounded-md border border-[#d9e0ea] bg-white px-2.5 py-1.5 text-xs font-medium text-[#0b1f33]">
                {actingUser.fullName}
              </span>
            ) : null}
            {pinSwitchEnabled && stationToken ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setManualPinSwitch(true)}
              >
                Switch user
              </Button>
            ) : null}
            {!registerSession ? (
              <>
                <Input
                  className="h-9 w-24"
                  inputMode="decimal"
                  value={openingFloat}
                  onChange={(e) => setOpeningFloat(e.target.value)}
                  placeholder="Float"
                  title="Cash in drawer at start of shift"
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
          <strong className="font-semibold">Open register</strong> starts your
          shift with a cash float. Charging stays locked until the drawer is
          open. <strong className="font-semibold">Close register</strong> ends
          the shift and compares counted cash to expected sales.
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
            <BarcodeScanInput
              value={scan}
              onChange={setScan}
              onScan={resolveScan}
              label="Scan barcode / SKU"
              placeholder="Scan barcode or type SKU"
              disabled={lookup.isPending}
              autoFocus
              inputRef={scanRef}
            />
            {/* keep form handler for keyboard Submit key accessibility without double UI */}
            <form onSubmit={onScanSubmit} className="hidden" aria-hidden>
              <button type="submit" tabIndex={-1} />
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
                const gallery =
                  row.images?.length
                    ? row.images
                    : ([row.image ?? row.photoUrl].filter(Boolean) as string[]);
                const src = gallery[0] ?? row.image ?? row.photoUrl;
                const inCart = cart.find((l) => l.stockLevelId === row.id);
                const cartQty = inCart?.qty ?? 0;
                const tracks = row.trackQty !== false;
                const available = tracks
                  ? Math.max(0, Number(row.qtyOnHand) - cartQty)
                  : 999;
                const low = tracks && available < 5;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => upsertLine(row)}
                      className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-[#f8fafc] sm:gap-3.5 sm:px-4"
                    >
                      <ProductThumb
                        src={src}
                        label={row.name}
                        size="xl"
                        count={gallery.length}
                        onClick={
                          gallery.length
                            ? () =>
                                setLightbox({
                                  images: gallery,
                                  index: 0,
                                  label: row.name,
                                })
                            : undefined
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.9375rem] font-semibold text-[#0b1f33]">
                          {row.name}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[0.7rem] text-[#8b9bb0]">
                          <span>{row.sku}</span>
                          {row.category?.name ? (
                            <span className="font-sans text-[#5a6b7d]">
                              · {row.category.name}
                            </span>
                          ) : null}
                          <span
                            className={cn(
                              "rounded-md px-1.5 py-0.5 font-sans text-[0.65rem] font-semibold",
                              available <= 0 && tracks
                                ? "bg-[#fef2f2] text-[#c81e1e]"
                                : low
                                  ? "bg-[#fff7ed] text-[#9a3412]"
                                  : "bg-[#e8eefb] text-[#1a56db]",
                            )}
                          >
                            {tracks
                              ? available <= 0
                                ? "In ticket"
                                : `${formatQtyWithUnit(available, row.sellUnit)} left`
                              : "No stock limit"}
                          </span>
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                        <p className="text-[0.9375rem] font-bold tabular-nums text-[#0b1f33]">
                          {money(row.sellPrice)}
                        </p>
                        <span className="inline-flex h-9 min-w-[3.75rem] items-center justify-center rounded-[10px] bg-[#1a56db] px-3 text-xs font-semibold text-white shadow-[0_4px_12px_rgba(26,86,219,0.22)]">
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
                        href="/catalog"
                        className="inline-flex text-sm font-semibold text-[#1a56db] hover:underline"
                      >
                        Open Products →
                      </Link>
                    </div>
                  )}
                </li>
              ) : null}
            </ul>
            {catalogTotalPages > 1 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eef2f8] bg-[#fafbfc] px-3 py-2.5">
                <p className="text-[0.75rem] text-[#5a6b7d]">
                  Page {catalogPage} of {catalogTotalPages}
                  <span className="text-[#8b9bb0]">
                    {" "}
                    · {catalogTotal} in stock
                  </span>
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={catalogPage <= 1 || catalog.isFetching}
                    onClick={() => setCatalogPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={
                      catalogPage >= catalogTotalPages || catalog.isFetching
                    }
                    onClick={() =>
                      setCatalogPage((p) =>
                        Math.min(catalogTotalPages, p + 1),
                      )
                    }
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : catalogTotal > 0 ? (
              <p className="border-t border-[#eef2f8] px-3 py-2 text-[0.72rem] text-[#8b9bb0]">
                {catalogTotal} product{catalogTotal === 1 ? "" : "s"} in stock
              </p>
            ) : null}
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
            <CustomerPicker
              value={customerId}
              onChange={(id) => setCustomerId(id)}
              allowWalkIn
              placeholder="Search customer book…"
              showBalances
              money={money}
            />
          </div>

          <ul className="max-h-48 flex-1 space-y-1.5 overflow-y-auto px-3 py-3">
            {cart.map((l) => (
              <li
                key={l.stockLevelId}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-[10px] border border-[#e8edf4] bg-[#f8fafc] px-2 py-1.5"
              >
                <ProductThumb src={l.image} label={l.name} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#0b1f33]">
                    {l.name}
                  </p>
                  <p className="truncate font-mono text-[0.65rem] text-[#8b9bb0]">
                    {money(l.unitPrice)} {priceUnitLabel(l.sellUnit)}
                    {l.taxRatePercent != null
                      ? ` · tax ${l.taxRatePercent}%`
                      : ""}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex shrink-0 items-center rounded-lg bg-white p-0.5 ring-1 ring-[#e4e9f0]">
                      <button
                        type="button"
                        className="grid h-7 w-7 place-items-center rounded-md text-sm font-bold text-[#0b1f33] transition hover:bg-[#e8eefb]"
                        onClick={() =>
                          setCart((prev) =>
                            prev
                              .map((x) => {
                                if (x.stockLevelId !== l.stockLevelId) return x;
                                const step = qtyStep(x.sellUnit);
                                const next = normalizeQty(
                                  x.qty - step,
                                  x.sellUnit,
                                );
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
                          className="w-12 border-0 bg-transparent text-center text-sm font-bold tabular-nums text-[#0b1f33] outline-none"
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
                        className="grid h-7 w-7 place-items-center rounded-md text-sm font-bold text-[#0b1f33] transition hover:bg-[#e8eefb]"
                        onClick={() =>
                          setCart((prev) =>
                            prev.map((x) => {
                              if (x.stockLevelId !== l.stockLevelId) return x;
                              const step = qtyStep(x.sellUnit);
                              const next = normalizeQty(
                                x.qty + step,
                                x.sellUnit,
                              );
                              if (next > x.maxQty + 1e-9) return x;
                              return { ...x, qty: next };
                            }),
                          )
                        }
                      >
                        +
                      </button>
                    </div>
                    <p className="min-w-0 flex-1 truncate text-right text-sm font-bold tabular-nums text-[#0b1f33]">
                      {money(l.unitPrice * l.qty)}
                    </p>
                  </div>
                </div>
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
                  Discount {currencySymbol}
                  {!canOverrideDiscount
                    ? ` (max ${maxCashierDiscountPercent}%)`
                    : ""}
                </Label>
                <Input
                  className="h-10"
                  placeholder="0"
                  inputMode="decimal"
                  value={discountAmount}
                  onChange={(e) => {
                    setDiscountAmount(e.target.value);
                    setCouponApplied(null);
                  }}
                />
                <p
                  className={cn(
                    "text-[0.65rem]",
                    discountCapped ? "text-[#c81e1e]" : "text-[#8b9bb0]",
                  )}
                >
                  {discountCapped
                    ? `Applied ${money(discountNum)} — cashier cap ${money(maxDiscountAmount)}`
                    : canOverrideDiscount
                      ? `Up to ticket total ${money(ticketBeforeDiscount)}`
                      : `Cashier cap ${money(maxDiscountAmount)}`}
                </p>
              </div>
              <div className="field-shell">
                <div className="mb-1 flex items-center justify-between gap-1">
                  <Label className="text-[0.65rem] font-semibold tracking-[0.12em] text-[#8b9bb0] uppercase">
                    Coupon
                  </Label>
                  {couponApplied || moneyNumber(discountAmount || 0) > 0 ? (
                    <button
                      type="button"
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#d9e0ea] text-[#5a6b7d] hover:bg-white hover:text-[#0b1f33]"
                      title="Clear discount & coupon"
                      onClick={() => {
                        setCouponCode("");
                        setCouponApplied(null);
                        setDiscountAmount("");
                      }}
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 12 12"
                        fill="none"
                        aria-hidden
                      >
                        <path
                          d="M3 3l6 6M9 3L3 9"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  ) : null}
                </div>
                <div className="flex gap-1">
                  <Input
                    className="h-10 uppercase"
                    placeholder="CODE"
                    value={couponCode}
                    onChange={(e) => {
                      setCouponCode(e.target.value);
                      setCouponApplied(null);
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-10 shrink-0"
                    disabled={!couponCode.trim() || !cart.length}
                    onClick={async () => {
                      try {
                        const v = await loyaltyApi.validateCoupon(
                          couponCode.trim(),
                          ticketBeforeDiscount,
                        );
                        setDiscountAmount(String(v.amountOff));
                        setCouponApplied(v.code);
                        toast.success(
                          `Coupon ${v.code}: −${money(v.amountOff)}`,
                        );
                      } catch (e) {
                        toast.error(
                          e instanceof ApiError
                            ? e.messages.join(", ")
                            : "Invalid coupon",
                        );
                      }
                    }}
                  >
                    Apply
                  </Button>
                  {couponApplied ? (
                    <button
                      type="button"
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#d9e0ea] bg-white text-[#5a6b7d] hover:bg-[#f4f6fa] hover:text-[#0b1f33]"
                      title="Clear coupon & discount"
                      onClick={() => {
                        setCouponCode("");
                        setCouponApplied(null);
                        setDiscountAmount("");
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 12 12"
                        fill="none"
                        aria-hidden
                      >
                        <path
                          d="M3 3l6 6M9 3L3 9"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  ) : null}
                </div>
                <p className="text-[0.65rem] text-[#8b9bb0]">
                  {couponApplied
                    ? `Applied ${couponApplied}`
                    : "From Coupons setup"}
                </p>
              </div>
            </div>
            <div className="field-shell">
              <Label className="text-[0.65rem] font-semibold tracking-[0.12em] text-[#8b9bb0] uppercase">
                Hold name
              </Label>
              <Input
                className="h-10"
                placeholder="e.g. Table 4 · Walk-in draft"
                value={parkLabel}
                onChange={(e) => setParkLabel(e.target.value)}
                maxLength={80}
              />
              <p className="text-[0.65rem] text-[#8b9bb0]">
                Save cart as draft without stock or payment — resume anytime
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className={cn("h-10", touchMode && "h-14 text-base")}
                disabled={busy || !cart.length}
                onClick={() => void parkCart()}
                title="Save this cart as a draft/hold without taking stock or payment"
              >
                Save draft
              </Button>
              <Button
                type="button"
                variant="soft"
                size="sm"
                className={cn("h-10", touchMode && "h-14 text-base")}
                onClick={() => setShowParked((v) => !v)}
              >
                {showParked ? "Hide drafts" : "View drafts"}
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
                    No draft bills
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
                    {taxSettings.inclusive
                      ? "Tax (included in prices)"
                      : "Tax (added)"}
                  </span>
                  <span className="tabular-nums text-[#0b1f33]">
                    {taxSettings.inclusive ? "" : "+"}
                    {money(taxAmount)}
                  </span>
                </div>
              ) : (
                <div className="mt-1 flex items-baseline justify-between text-xs text-[#8b9bb0]">
                  <span>Tax</span>
                  <span>None · set on item or Settings</span>
                </div>
              )}
              {taxSettings.inclusive && taxAmount > 0 ? (
                <p className="mt-1 text-[0.65rem] leading-snug text-[#8b9bb0]">
                  Prices already include tax, so Due matches Subtotal. Turn off
                  “Catalog prices include tax” in Settings to add tax on top.
                </p>
              ) : null}
              {discountNum > 0 ? (
                <div className="mt-1 flex items-baseline justify-between text-sm text-[#0b1f33]">
                  <span>Discount</span>
                  <span className="tabular-nums">−{money(discountNum)}</span>
                </div>
              ) : null}
              {loyaltyOff > 0 ? (
                <div className="mt-1 flex items-baseline justify-between text-sm text-[#0b1f33]">
                  <span>Loyalty points</span>
                  <span className="tabular-nums">−{money(loyaltyOff)}</span>
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

            <div
              className={cn(
                "grid gap-1 rounded-[12px] bg-[#eef2f8] p-1",
                touchMode ? "grid-cols-3" : "grid-cols-5",
              )}
            >
              {(
                [
                  "cash",
                  "upi",
                  "card",
                  "qr",
                  "wallet",
                  "bank_transfer",
                  "emi",
                  "store_credit",
                  "gift_card",
                ] as const
              ).map((m) => (
                <button
                  key={m}
                  type="button"
                  data-active={payMethod === m ? "true" : "false"}
                  onClick={() => {
                    setPayMethod(m);
                    if (m !== "cash") setSplitPay(false);
                  }}
                  className={cn(
                    "rounded-[9px] font-bold tracking-[0.04em] uppercase transition",
                    touchMode ? "py-4 text-xs" : "py-2.5 text-[0.65rem]",
                    payMethod === m
                      ? "bg-[#1a56db] text-white shadow-[0_1px_3px_rgba(26,86,219,0.35)]"
                      : "text-[#5a6b7d] hover:bg-white/80 hover:text-[#0b1f33]",
                  )}
                >
                  {m === "store_credit"
                    ? "Credit"
                    : m === "gift_card"
                      ? "Gift"
                      : m === "bank_transfer"
                        ? "Bank"
                        : m === "wallet"
                          ? "Wallet"
                          : m === "qr"
                            ? "QR"
                            : m === "emi"
                              ? "EMI"
                              : m}
                </button>
              ))}
            </div>
            {payMethod === "store_credit" ? (
              <p className="text-[0.7rem] text-[#5a6b7d]">
                Debits customer store credit balance. Needs a linked customer.
              </p>
            ) : null}
            {payMethod === "qr" ? (
              <div className="space-y-2 rounded-[10px] border border-[#d9e0ea] bg-white p-3">
                {(() => {
                  const posSettings =
                    boot?.tenant?.settings &&
                    typeof boot.tenant.settings === "object"
                      ? (boot.tenant.settings as Record<string, unknown>).pos
                      : undefined;
                  const pos =
                    posSettings && typeof posSettings === "object"
                      ? (posSettings as Record<string, unknown>)
                      : {};
                  const vpa =
                    typeof pos.upiVpa === "string" ? pos.upiVpa.trim() : "";
                  const payee =
                    (typeof pos.upiPayeeName === "string" &&
                      pos.upiPayeeName.trim()) ||
                    productName ||
                    "Universal POS";
                  if (!vpa) {
                    return (
                      <p className="text-[0.75rem] text-amber-800">
                        Set your shop UPI ID in Settings → Counter first.
                        Scanning this incomplete QR causes PhonePe/GPay to show
                        a technical glitch.
                      </p>
                    );
                  }
                  const upiUri = `upi://pay?pa=${encodeURIComponent(vpa)}&pn=${encodeURIComponent(payee)}&am=${chargeAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(productName || "Universal POS")}`;
                  return (
                    <>
                      <p className="text-[0.7rem] text-[#5a6b7d]">
                        Show this QR to the customer (UPI / wallet scan), then
                        confirm payment collected. Payee: {vpa}
                      </p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        alt="Pay QR"
                        className="mx-auto h-36 w-36 rounded-md border border-[#eef2f8] bg-white"
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(upiUri)}`}
                      />
                    </>
                  );
                })()}
              </div>
            ) : null}
            {payMethod === "bank_transfer" ? (
              <div className="space-y-2 rounded-[10px] border border-[#d9e0ea] bg-white p-3">
                <p className="text-[0.7rem] text-[#5a6b7d]">
                  Enter payer bank details, then charge after you confirm the
                  transfer.
                </p>
                <Input
                  placeholder="Account holder name *"
                  value={bankAccountName}
                  onChange={(e) => setBankAccountName(e.target.value)}
                />
                <Input
                  placeholder="Account number *"
                  value={bankAccountNumber}
                  onChange={(e) => setBankAccountNumber(e.target.value)}
                  inputMode="numeric"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="IFSC / routing"
                    className="uppercase"
                    value={bankIfsc}
                    onChange={(e) => setBankIfsc(e.target.value)}
                  />
                  <Input
                    placeholder="Bank name"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                  />
                </div>
                <Input
                  placeholder="UTR / reference *"
                  value={bankReference}
                  onChange={(e) => setBankReference(e.target.value)}
                />
              </div>
            ) : null}
            {payMethod === "wallet" ? (
              <p className="text-[0.7rem] text-[#5a6b7d]">
                PhonePe / Paytm / similar — confirm collection on the device,
                then charge.
              </p>
            ) : null}
            {payMethod === "emi" ? (
              <p className="text-[0.7rem] text-[#5a6b7d]">
                Record EMI / installment collection at the counter (manual
                confirm).
              </p>
            ) : null}
            {payMethod === "gift_card" ? (
              <div className="flex gap-2">
                <Input
                  className="uppercase"
                  placeholder="Gift card code"
                  value={giftCardCode}
                  onChange={(e) => {
                    setGiftCardCode(e.target.value);
                    setGiftCardBalance(null);
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!giftCardCode.trim()}
                  onClick={async () => {
                    try {
                      const card = await loyaltyApi.lookupGiftCard(
                        giftCardCode.trim(),
                      );
                      setGiftCardBalance(moneyNumber(card.balance));
                      toast.success(`Balance ${money(card.balance)}`);
                    } catch (e) {
                      toast.error(
                        e instanceof ApiError
                          ? e.messages.join(", ")
                          : "Gift card not found",
                      );
                    }
                  }}
                >
                  Check
                </Button>
              </div>
            ) : null}
            {giftCardBalance != null && payMethod === "gift_card" ? (
              <p className="text-[0.7rem] text-[#5a6b7d]">
                Available {money(giftCardBalance)}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-3 text-xs">
              <label className="flex items-center gap-2 font-medium text-[#0b1f33]">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#1a56db]"
                  checked={allowPartial}
                  onChange={(e) => setAllowPartial(e.target.checked)}
                />
                Partial payment
              </label>
              <label className="flex items-center gap-2 font-medium text-[#0b1f33]">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#1a56db]"
                  checked={sendReceipt}
                  onChange={(e) => setSendReceipt(e.target.checked)}
                />
                Email / SMS receipt
              </label>
              <label className="flex items-center gap-2 font-medium text-[#0b1f33]">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#1a56db]"
                  checked={touchMode}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setTouchMode(on);
                    try {
                      localStorage.setItem(TOUCH_KEY, on ? "1" : "0");
                    } catch {
                      /* ignore */
                    }
                  }}
                />
                Touch mode
              </label>
            </div>
            {allowPartial ? (
              <div className="field-shell">
                <Label className="text-[0.65rem] font-semibold tracking-[0.12em] text-[#8b9bb0] uppercase">
                  Amount to collect now
                </Label>
                <Input
                  className="text-base tabular-nums"
                  inputMode="decimal"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder={String(totalDue || "")}
                />
                <p className="text-xs text-[#5a6b7d]">
                  Balance left{" "}
                  {money(Math.max(0, totalDue - chargeAmount))}
                </p>
              </div>
            ) : null}

            {customerId ? (
              <div className="space-y-1.5">
                <Label className="text-[0.65rem] font-semibold tracking-[0.12em] text-[#8b9bb0] uppercase">
                  Redeem loyalty points
                </Label>
                <div className="flex gap-2">
                  <Input
                    inputMode="numeric"
                    placeholder="Points to redeem"
                    value={loyaltyPointsInput}
                    onChange={(e) => {
                      setLoyaltyPointsInput(e.target.value);
                      setLoyaltyQuote(null);
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={!loyaltyPointsInput.trim()}
                    onClick={async () => {
                      try {
                        const q = await loyaltyApi.quotePoints(
                          customerId,
                          Number(loyaltyPointsInput),
                          totalDue + loyaltyOff,
                        );
                        setLoyaltyQuote({
                          points: q.points,
                          amountOff: q.amountOff,
                        });
                        toast.success(
                          `Redeem ${q.points} pts → −${money(q.amountOff)}`,
                        );
                      } catch (e) {
                        toast.error(
                          e instanceof ApiError
                            ? e.messages.join(", ")
                            : "Points quote failed",
                        );
                      }
                    }}
                  >
                    Apply pts
                  </Button>
                </div>
                {loyaltyQuote ? (
                  <p className="text-xs text-[#1a56db]">
                    Applied on charge: −{money(loyaltyQuote.amountOff)} (
                    {loyaltyQuote.points} pts)
                  </p>
                ) : (
                  <p className="text-[0.7rem] text-[#8b9bb0]">
                    Apply points, then Charge — discount applies to Due.
                  </p>
                )}
              </div>
            ) : null}

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
                      placeholder={String(chargeAmount || "")}
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
                          ? [chargeAmount, 500, 1000, 2000]
                          : currencyCode === "USD"
                            ? [chargeAmount, 20, 50, 100]
                            : [chargeAmount]
                        )
                          .filter((n, i, a) => n > 0 && a.indexOf(n) === i)
                          .map((n) => (
                            <button
                              key={n}
                              type="button"
                              className={cn(
                                "rounded-lg border border-[#cfd8e6] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#5a6b7d] transition hover:border-[#1a56db]/45 hover:bg-[#e8eefb] hover:text-[#0b1f33]",
                                touchMode && "px-3 py-2.5 text-sm",
                              )}
                              onClick={() => setCashTendered(String(n))}
                            >
                              {n === chargeAmount ? "Exact" : money(n)}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : payMethod === "card" || payMethod === "upi" ? (
              <p className="rounded-[10px] border border-[#d9e0ea] bg-white px-3 py-2 text-xs text-[#5a6b7d]">
                {stripeConfig.data?.enabled
                  ? `Stripe ${stripeConfig.data.mode} · ${payMethod.toUpperCase()}`
                  : "Stripe keys not set — card/UPI unavailable"}
              </p>
            ) : null}

            <Button
              size="lg"
              className={cn(
                "h-12 w-full text-[0.95rem]",
                touchMode && "h-16 text-lg",
              )}
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
                ? payMethod === "card" || payMethod === "upi"
                  ? "Opening Stripe…"
                  : "Processing…"
                : !registerSession
                  ? "Open register to charge"
                  : allowPartial && chargeAmount < totalDue - 0.001
                    ? `Collect ${money(chargeAmount)}`
                    : `Charge ${money(chargeAmount)}`}
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

      <ImageLightbox
        open={Boolean(lightbox)}
        images={lightbox?.images ?? []}
        startIndex={lightbox?.index ?? 0}
        label={lightbox?.label}
        onClose={() => setLightbox(null)}
      />
    </div>
  );
}
