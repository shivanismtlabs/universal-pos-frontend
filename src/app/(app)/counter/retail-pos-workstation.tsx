"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { customersApi, loyaltyApi, ordersApi, paymentsApi, posApi, resourcesApi, restaurantApi, tenantsApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useBootstrap } from "@/lib/bootstrap";
import { useBranchStore } from "@/lib/branch-store";
import { useAuthStore } from "@/lib/auth-store";
import { canApproveRefund } from "@/lib/roles";
import { moneyNumber, stablePaymentAttemptKey, clearPaymentAttemptKey, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ReceiptModal, type ReceiptData } from "@/components/receipt-modal";
import { StripeCheckoutModal } from "@/components/stripe-checkout-modal";
import { ProductThumb } from "@/components/product-thumb";
import { ImageLightbox } from "@/components/image-lightbox";
import { CustomerPicker } from "@/components/customer-picker";
import { CustomFieldsSection } from "@/components/custom-field-inputs";
import { SplitBillModal } from "@/components/split-bill-modal";
import { ModalFrame } from "@/components/modal-frame";
import { StationPinLock } from "@/components/station-pin-lock";
import { BarcodeScanInput } from "@/components/barcode-scan-input";
import {
  enqueueOfflineEvent,
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
import { productKindLabel, productStockHint } from "@/lib/product-kind";
import type { SplitBillMode, SplitBillPart } from "@/lib/split-bill";
import { roundMoney, scalePartsToTotal } from "@/lib/split-bill";
import { diningFeesFromConfig } from "@/lib/dining-fees";
import { sellingMenuCategoryFilter } from "@/lib/selling-menus";

type CartLine = {
  stockLevelId: string;
  sku: string;
  name: string;
  unitPrice: number;
  /** Catalog / shelf price when the line was added — used for urgent/special rate UI */
  listPrice: number;
  qty: number;
  maxQty: number;
  sellUnit: SellUnit;
  category?: string | null;
  image?: string | null;
  /** Product override % (e.g. 18). null/undefined → tenant rate */
  taxRatePercent?: number | null;
  requiresVariant?: boolean;
  variantId?: string;
  variantOptions?: Array<{
    id: string;
    skuCode: string;
    barcode?: string | null;
    label: string;
  }>;
  requiresBatch?: boolean;
  batchId?: string;
  batchOptions?: Array<{
    id: string;
    batchCode: string;
    qtyOnHand: number;
    expiresAt?: string | null;
  }>;
  requiresSerial?: boolean;
  serialNumber?: string;
  kind?: string | null;
  modifiers?: string[];
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
  const { money, productName, currencyCode, data: boot, hasCapability } =
    useBootstrap();
  const actingUser = useAuthStore((s) => s.user);
  const roles = actingUser?.roles ?? [];
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
  const pageSize = compact ? 16 : 20;
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [category, setCategory] = useState<string>("all");
  const [customerId, setCustomerId] = useState("");
  const customerWalletQ = useQuery({
    queryKey: ["customer", customerId],
    queryFn: () => customersApi.get(customerId),
    enabled: Boolean(customerId),
  });
  const walletBalance = customerId
    ? Number(
        customerWalletQ.data?.summary?.storeCreditBalance ??
          customerWalletQ.data?.storeCreditBalance ??
          0,
      )
    : 0;
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discountAmount, setDiscountAmount] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponApplied, setCouponApplied] = useState<string | null>(null);
  const [parkLabel, setParkLabel] = useState("");
  const [orderExtraFields, setOrderExtraFields] = useState<
    Record<string, string>
  >({});
  const [openingFloat, setOpeningFloat] = useState("0");
  const [closingCash, setClosingCash] = useState("");
  const [showCloseRegister, setShowCloseRegister] = useState(false);
  const [payMethod, setPayMethod] = useState<PayMethod>("cash");
  const [splitPay, setSplitPay] = useState(false);
  const [splitCashAmount, setSplitCashAmount] = useState("");
  const [splitBillOpen, setSplitBillOpen] = useState(false);
  const [payModal, setPayModal] = useState<"discount" | "draft" | "more" | null>(
    null,
  );
  const [rateEdit, setRateEdit] = useState<{
    stockLevelId: string;
    amount: string;
    percent: string;
  } | null>(null);
  const [splitSession, setSplitSession] = useState<{
    mode: SplitBillMode;
    parts: SplitBillPart[];
    index: number;
    orderId?: string;
    orderNumber?: string;
  } | null>(null);
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
  const [emiTenureMonths, setEmiTenureMonths] = useState("6");
  const [emiProvider, setEmiProvider] = useState("");
  const [emiReference, setEmiReference] = useState("");
  const [loyaltyPointsInput, setLoyaltyPointsInput] = useState("");
  const [loyaltyQuote, setLoyaltyQuote] = useState<{
    points: number;
    amountOff: number;
  } | null>(null);
  const [sendReceipt, setSendReceipt] = useState(false);
  const [orderType, setOrderType] = useState("walk_in");
  const [floorFilter, setFloorFilter] = useState("all");
  const [guestName, setGuestName] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [modPick, setModPick] = useState<{
    row: Parameters<typeof upsertLine>[0];
    groups: NonNullable<Parameters<typeof upsertLine>[0]["modifierGroups"]>;
    selected: string[];
  } | null>(null);
  const [serialPick, setSerialPick] = useState<{
    row: Parameters<typeof upsertLine>[0];
    value: string;
  } | null>(null);
  const [resourceId, setResourceId] = useState("");
  const [guestCount, setGuestCount] = useState("1");
  const [orderNote, setOrderNote] = useState("");
  const [lightbox, setLightbox] = useState<{
    images: string[];
    index: number;
    label: string;
  } | null>(null);
  const [touchMode, setTouchMode] = useState(false);
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
    keepOrder?: boolean;
    splitContinue?: boolean;
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
  const payMethods = useQuery({
    queryKey: ["payment-methods"],
    queryFn: () => paymentsApi.methods(),
  });

  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => tenantsApi.listLocations(),
  });
  const branchLocationId = useBranchStore((s) => s.currentLocationId);
  const locationId =
    (branchLocationId &&
    locations.data?.some((l) => l.id === branchLocationId && l.isActive !== false)
      ? branchLocationId
      : null) ??
    locations.data?.find((l) => l.code === "MAIN" && l.isActive !== false)?.id ??
    locations.data?.find((l) => l.isActive !== false)?.id ??
    locations.data?.[0]?.id;
  const resourceType = hasCapability("TABLE") ? "table" : undefined;
  const resources = useQuery({
    queryKey: ["counter-resources", locationId, resourceType],
    queryFn: () =>
      resourcesApi.list({
        limit: 100,
        ...(locationId ? { locationId } : {}),
        ...(resourceType ? { type: resourceType } : {}),
      }),
    enabled: Boolean(locationId) && (hasCapability("RESOURCE") || hasCapability("TABLE")),
  });
  const foodFulfillment =
    hasCapability("TABLE") ||
    hasCapability("KOT") ||
    hasCapability("KITCHEN") ||
    hasCapability("DELIVERY");
  const resourceDesk = hasCapability("RESOURCE") || hasCapability("TABLE");
  const diningCfg = useQuery({
    queryKey: ["restaurant-config"],
    queryFn: () => restaurantApi.config(),
    enabled: foodFulfillment,
  });
  const diningFloors = useQuery({
    queryKey: ["restaurant-floors", locationId],
    queryFn: () => restaurantApi.floors(locationId),
    enabled: hasCapability("TABLE") && Boolean(locationId),
  });
  const diningTables = useQuery({
    queryKey: ["restaurant-tables", locationId],
    queryFn: () => restaurantApi.tables(locationId),
    enabled: hasCapability("TABLE") && Boolean(locationId),
  });
  const selectedDiningTable = (diningTables.data ?? []).find(
    (t) => t.id === resourceId,
  );
  const selectedDiningFloor = (() => {
    const floors = diningFloors.data ?? [];
    const floorId =
      selectedDiningTable?.floorId ||
      (floorFilter !== "all" ? floorFilter : "");
    return floors.find((f) => f.id === floorId);
  })();
  const areaCategoryIds =
    selectedDiningTable?.areaCategoryIds?.length
      ? selectedDiningTable.areaCategoryIds
      : selectedDiningFloor?.categoryIds ?? [];
  const sellingMenuFilter = sellingMenuCategoryFilter({
    menus: diningCfg.data?.sellingMenus ?? [],
    channel: "pos",
    locationId,
  });
  const allowedCategoryIds = (() => {
    const area = areaCategoryIds.length ? areaCategoryIds : null;
    if (!sellingMenuFilter.restrict) return area;
    if (!sellingMenuFilter.categoryIds.length) return [];
    if (!area) return sellingMenuFilter.categoryIds;
    return area.filter((id) => sellingMenuFilter.categoryIds.includes(id));
  })();
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
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    setCatalogPage(1);
  }, [filter, lowStockOnly, locationId]);

  const categories = useMemo(() => {
    const set = new Map<string, string>();
    for (const row of catalog.data?.items ?? []) {
      if (!row.category?.id) continue;
      if (
        allowedCategoryIds &&
        (!row.category?.id || !allowedCategoryIds.includes(row.category.id))
      ) {
        continue;
      }
      set.set(row.category.id, row.category.name);
    }
    return Array.from(set.entries()).map(([id, name]) => ({ id, name }));
  }, [catalog.data, allowedCategoryIds]);

  const items = useMemo(() => {
    let list = catalog.data?.items ?? [];
    if (allowedCategoryIds) {
      list = list.filter(
        (s) => s.category?.id && allowedCategoryIds.includes(s.category.id),
      );
    }
    if (category === "all") return list;
    return list.filter((s) => s.category?.id === category);
  }, [catalog.data, category, allowedCategoryIds]);

  const catalogTotal = catalog.data?.total ?? items.length;
  const catalogTotalPages = catalog.data?.totalPages ?? 1;

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
      // Ignore HSN bleed / absurd product rates; fall back to shop GST %
      const productPct =
        l.taxRatePercent != null &&
        Number.isFinite(l.taxRatePercent) &&
        l.taxRatePercent > 0 &&
        l.taxRatePercent <= 28
          ? l.taxRatePercent
          : null;
      const rate =
        productPct != null ? productPct / 100 : taxSettings.rate;
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
  const ticketNet = Math.max(0, ticketBeforeDiscount - discountNum - loyaltyOff);
  const diningModeForFees =
    orderType === "walk_in" ? (resourceId ? "dine_in" : "") : orderType;
  const diningFeeLines = foodFulfillment
    ? diningFeesFromConfig({
        diningMode: diningModeForFees,
        merchandiseAfterDiscount: ticketNet,
        serviceChargePercent:
          selectedDiningTable?.areaServiceChargePercent ??
          selectedDiningFloor?.serviceChargePercent ??
          diningCfg.data?.serviceChargePercent,
        packagingCharge: diningCfg.data?.packagingCharge,
        deliveryCharge: diningCfg.data?.deliveryCharge,
        areaTaxPercent:
          selectedDiningTable?.areaTaxRatePercent ??
          selectedDiningFloor?.taxRatePercent,
      })
    : [];
  const diningExtras = diningFeeLines.reduce((s, f) => s + f.amount, 0);
  const totalDue = ticketNet + diningExtras;
  const splitPart = splitSession?.parts[splitSession.index] ?? null;
  const splitFollowUp = Boolean(splitSession?.orderId);
  const splitRemaining = splitSession
    ? splitSession.parts.length - splitSession.index
    : 0;
  const canSplitBill = hasCapability("PARTIAL_PAYMENT");
  const chargeAmount = (() => {
    if (splitPart) return splitPart.amount;
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
    if (!splitSession || splitSession.orderId) return;
    const sum = splitSession.parts.reduce((s, p) => s + p.amount, 0);
    if (Math.abs(sum - totalDue) <= 0.05) return;
    if (totalDue <= 0) {
      setSplitSession(null);
      toast.message("Split cancelled — ticket total is 0");
      return;
    }
    setSplitSession((cur) =>
      cur && !cur.orderId
        ? { ...cur, parts: scalePartsToTotal(cur.parts, totalDue) }
        : cur,
    );
  }, [totalDue, splitSession]);

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
    requiresVariant?: boolean;
    variantOptions?: Array<{
      id: string;
      skuCode: string;
      barcode?: string | null;
      label: string;
    }>;
    requiresBatch?: boolean;
    batchOptions?: Array<{
      id: string;
      batchCode: string;
      qtyOnHand: number;
      expiresAt?: string | null;
    }>;
    requiresSerial?: boolean;
    kind?: string | null;
    soldOut?: boolean;
    recipeTracked?: boolean;
    channelPrices?: {
      dine_in?: number;
      takeaway?: number;
      delivery?: number;
      online?: number;
    };
    modifierGroups?: Array<{
      id?: string;
      name: string;
      minSelect?: number;
      maxSelect?: number;
      required?: boolean;
      options: Array<{ id?: string; name: string; priceDelta?: number }>;
    }>;
    modifiers?: string[];
    skipModifierPrompt?: boolean;
    serialNumber?: string;
  }) {
    const image =
      row.image ?? row.photoUrl ?? row.images?.[0] ?? null;
    const unit = normalizeSellUnit(row.sellUnit);
    const step = qtyStep(unit);
    const onHand = Number(row.qtyOnHand);
    const tracks = row.trackQty !== false && row.recipeTracked !== true;
    const taxRatePercent =
      row.taxRatePercent != null &&
      Number.isFinite(row.taxRatePercent) &&
      row.taxRatePercent > 0 &&
      row.taxRatePercent <= 28
        ? row.taxRatePercent
        : null;
    if (row.soldOut) {
      toast.error("86 / sold out");
      return;
    }
    const groups = row.modifierGroups?.filter((g) => g.options?.length) ?? [];
    if (groups.length && !row.skipModifierPrompt && !row.modifiers?.length) {
      setModPick({ row, groups, selected: [] });
      return;
    }
    if (row.requiresSerial === true && !row.serialNumber?.trim()) {
      const alreadyOnTicket = cart.some((l) => l.stockLevelId === row.id);
      if (!alreadyOnTicket) {
        setSerialPick({ row, value: "" });
        return;
      }
    }
    const channelKey =
      orderType === "dine_in" ||
      orderType === "takeaway" ||
      orderType === "delivery" ||
      orderType === "online"
        ? orderType
        : null;
    const channelPrice = channelKey
      ? Number(row.channelPrices?.[channelKey])
      : NaN;
    const price =
      Number.isFinite(channelPrice) && channelPrice > 0
        ? channelPrice
        : moneyNumber(row.sellPrice) +
          (row.modifiers?.length
            ? groups
                .flatMap((g) => g.options)
                .filter((o) => row.modifiers?.includes(o.name))
                .reduce((s, o) => s + Number(o.priceDelta ?? 0), 0)
            : 0);
    setCart((prev) => {
      const modKey = (row.modifiers ?? []).join("|");
      const existing = prev.find(
        (l) =>
          l.stockLevelId === row.id && (l.modifiers ?? []).join("|") === modKey,
      );
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
                listPrice: l.listPrice ?? price,
                taxRatePercent: l.taxRatePercent ?? taxRatePercent,
                requiresVariant: row.requiresVariant === true,
                variantOptions: row.variantOptions ?? [],
                requiresBatch: row.requiresBatch === true,
                batchOptions: row.batchOptions ?? [],
          requiresSerial: row.requiresSerial === true,
          kind: row.kind ?? l.kind,
          modifiers: row.modifiers ?? l.modifiers,
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
          listPrice: price,
          qty: normalizeQty(startQty, unit),
          maxQty: tracks ? onHand : 999999,
          sellUnit: unit,
          category: row.category?.name ?? null,
          image,
          taxRatePercent,
          requiresVariant: row.requiresVariant === true,
          variantOptions: row.variantOptions ?? [],
          requiresBatch: row.requiresBatch === true,
          batchOptions: row.batchOptions ?? [],
          requiresSerial: row.requiresSerial === true,
          serialNumber: row.serialNumber?.trim() || undefined,
          variantId:
            row.requiresVariant && row.variantOptions?.length === 1
              ? row.variantOptions[0].id
              : undefined,
          batchId:
            row.requiresBatch && row.batchOptions?.length === 1
              ? row.batchOptions[0].id
              : undefined,
          kind: row.kind ?? null,
          modifiers: row.modifiers,
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

  function resetAfterFullSale() {
    setCart([]);
    setDiscountAmount("");
    setCouponCode("");
    setCouponApplied(null);
    setCashTendered("");
    setSplitPay(false);
    setSplitSession(null);
    setOrderExtraFields({});
    setSplitCashAmount("");
    setAllowPartial(false);
    setPayAmount("");
    setOrderNote("");
    setResourceId("");
    setGuestCount("1");
    setOrderType("walk_in");
    setGiftCardCode("");
    setGiftCardBalance(null);
    setBankAccountName("");
    setBankAccountNumber("");
    setBankIfsc("");
    setBankName("");
    setBankReference("");
    setEmiTenureMonths("6");
    setEmiProvider("");
    setEmiReference("");
    setLoyaltyPointsInput("");
    setLoyaltyQuote(null);
  }

  function settleMethod(): string {
    return payMethod === "wallet" ? "store_credit" : payMethod;
  }

  async function collectFollowUpSplitPart() {
    if (!splitSession?.orderId || !splitPart) return;
    if (chargeLock.current || busy || stripeBusy) return;
    chargeLock.current = true;
    setBusy(true);
    try {
      const live = await ordersApi.get(splitSession.orderId);
      const due = moneyNumber(live.balanceDue);
      const alreadyPaid =
        due <= 0.009 ||
        live.status === "closed" ||
        live.status === "cancelled";
      if (alreadyPaid) {
        const receiptData = await posApi.receipt(splitSession.orderId);
        resetAfterFullSale();
        setReceipt({
          data: receiptData as ReceiptData,
          change: 0,
          cashTendered: null,
        });
        toast.success(
          `Sale ${splitSession.orderNumber} is already fully paid`,
        );
        return;
      }
      const payAmt = Math.min(chargeAmount, due);
      const key = stablePaymentAttemptKey(
        `${splitSession.orderId}:${splitSession.index}:${payMethod}:${payAmt}`,
        "sale-split-part",
      );
      if (payMethod === "card" || payMethod === "upi") {
        if (!stripeConfig.data?.enabled) {
          toast.error("Stripe is not configured. Take cash for this part.");
          return;
        }
        const session = await paymentsApi.createStripeIntent({
          orderId: splitSession.orderId,
          amount: payAmt,
          method: payMethod,
          type: "payment",
          idempotencyKey: key,
        });
        setStripeCheckout({
          orderId: splitSession.orderId,
          orderNumber: splitSession.orderNumber || "",
          publishableKey: session.publishableKey,
          clientSecret: session.clientSecret,
          paymentIntentId: session.paymentIntentId,
          amount: payAmt,
          description: session.description,
          method: payMethod,
          keepOrder: true,
          splitContinue: true,
        });
        setStripeBusy(true);
        return;
      }
      await paymentsApi.create({
        orderId: splitSession.orderId,
        amount: payAmt,
        method: settleMethod(),
        type: "payment",
        idempotencyKey: key,
        ...(payMethod === "gift_card"
          ? { gatewayRef: giftCardCode.trim() }
          : {}),
      });
      const currentPartRemaining = Math.max(0, splitPart.amount - payAmt);
      const partFullyPaid = currentPartRemaining <= 0.009;
      const next = partFullyPaid ? splitSession.index + 1 : splitSession.index;
      const last = next >= splitSession.parts.length || due - payAmt <= 0.009;
      setCashTendered("");
      if (last) {
        const receiptData = await posApi.receipt(splitSession.orderId);
        resetAfterFullSale();
        setReceipt({
          data: receiptData as ReceiptData,
          change: changeDue,
          cashTendered: tenderedNum > 0 ? tenderedNum : null,
        });
        toast.success(
          `Sale ${splitSession.orderNumber} · all parts collected`,
        );
      } else if (!partFullyPaid) {
        const updatedParts = [...splitSession.parts];
        updatedParts[splitSession.index] = {
          ...splitPart,
          amount: roundMoney(currentPartRemaining),
        };
        setSplitSession({
          ...splitSession,
          parts: updatedParts,
        });
        toast.success(
          `Collected ${money(payAmt)} · Part ${splitSession.index + 1} remaining: ${money(currentPartRemaining)}`,
        );
      } else {
        const leftover = scalePartsToTotal(
          splitSession.parts.slice(next),
          Math.max(0, due - payAmt),
        );
        setSplitSession({
          ...splitSession,
          index: next,
          parts: [...splitSession.parts.slice(0, next), ...leftover],
        });
        toast.success(
          `Part ${splitSession.index + 1} of ${splitSession.parts.length} collected`,
        );
      }
      clearPaymentAttemptKey();
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.messages.join(", ") : "Could not collect this part";
      if (/already fully paid|closed order/i.test(msg)) {
        try {
          const receiptData = await posApi.receipt(splitSession.orderId);
          resetAfterFullSale();
          setReceipt({
            data: receiptData as ReceiptData,
            change: 0,
            cashTendered: null,
          });
          toast.success(
            `Sale ${splitSession.orderNumber} is already fully paid`,
          );
          return;
        } catch {
          /* fall through */
        }
      }
      toast.error(msg);
    } finally {
      chargeLock.current = false;
      setBusy(false);
    }
  }

  async function checkout() {
    if (chargeLock.current || busy || stripeBusy) return;
    if (!locationId) {
      toast.error("No location configured");
      return;
    }
    if (!isOnline()) {
      if (payMethod !== "cash" && payMethod !== "gift_card" && payMethod !== "store_credit") {
        toast.error("Card/UPI needs internet — use cash or wait to reconnect");
        return;
      }
    }
    if (splitFollowUp) {
      await collectFollowUpSplitPart();
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
      toast.error("Select a customer to pay from their wallet");
      return;
    }
    if (payMethod === "store_credit" && walletBalance + 1e-9 < chargeAmount) {
      toast.error(
        `Wallet has ${money(walletBalance)} — not enough for ${money(chargeAmount)}`,
      );
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
    if (payMethod === "emi") {
      if (!customerId) {
        toast.error("Select a customer for EMI");
        return;
      }
      const tenure = Number(emiTenureMonths);
      if (!Number.isFinite(tenure) || tenure < 1 || tenure > 36) {
        toast.error("Choose EMI tenure (1–36 months)");
        return;
      }
      if (!emiProvider.trim()) {
        toast.error("Enter EMI provider / bank");
        return;
      }
    }
    if (loyaltyPointsInput && !customerId) {
      toast.error("Select a customer to redeem loyalty points");
      return;
    }
    const posRoot =
      boot?.tenant?.settings && typeof boot.tenant.settings === "object"
        ? (boot.tenant.settings as Record<string, unknown>).pos
        : undefined;
    const posCfg =
      posRoot && typeof posRoot === "object"
        ? (posRoot as Record<string, unknown>)
        : {};
    if (posCfg.customerRequired === true && !customerId) {
      toast.error("Customer is required for checkout");
      return;
    }
    for (const line of cart) {
      if (line.requiresVariant && !line.variantId) {
        toast.error(`Select variant for ${line.name}`);
        return;
      }
      if (line.requiresBatch && !line.batchId) {
        toast.error(`Select batch for ${line.name}`);
        return;
      }
      if (line.requiresSerial && !line.serialNumber?.trim()) {
        toast.error(`Enter serial for ${line.name}`);
        return;
      }
    }

    chargeLock.current = true;
    setBusy(true);
    try {
      const fingerprint = JSON.stringify({
        locationId,
        customerId,
        items: cart.map((l) => ({
          id: l.stockLevelId,
          qty: l.qty,
          price: l.unitPrice,
        })),
        discountNum,
        payMethod,
        chargeAmount,
        splitPay,
        splitCashAmount,
        allowPartial,
      });
      const attemptKey = stablePaymentAttemptKey(fingerprint, "sale");
      const splitCashKey = stablePaymentAttemptKey(
        `${fingerprint}:cash`,
        "sale-split-cash",
      );
      const stripeAttemptKey = stablePaymentAttemptKey(
        `${fingerprint}:stripe`,
        "sale-stripe",
      );

      const cartPayload = {
        locationId,
        ...(customerId ? { customerId } : {}),
        items: cart.map((l) => ({
          stockLevelId: l.stockLevelId,
          quantity: l.qty,
          unitPrice: l.unitPrice,
          ...(l.variantId ? { variantId: l.variantId } : {}),
          ...(l.batchId ? { batchId: l.batchId } : {}),
          ...(l.serialNumber?.trim()
            ? { serialNumber: l.serialNumber.trim() }
            : {}),
          ...(l.modifiers?.length ? { modifiers: l.modifiers } : {}),
        })),
        ...(discountNum > 0 ? { discountAmount: discountNum } : {}),
        ...(couponApplied
          ? { couponCode: couponApplied }
          : couponCode.trim()
            ? { couponCode: couponCode.trim() }
            : {}),
        ...(orderNote.trim() ? { note: orderNote.trim() } : {}),
        meta: {
          ...(foodFulfillment ? { orderType } : {}),
          ...(resourceId ? { tableId: resourceId } : {}),
          ...(foodFulfillment && Number(guestCount) > 0
            ? { covers: Number(guestCount) }
            : {}),
          ...(guestName.trim() ? { guestName: guestName.trim() } : {}),
          ...(deliveryPhone.trim() ? { guestPhone: deliveryPhone.trim() } : {}),
          ...(deliveryAddress.trim()
            ? { deliveryAddress: deliveryAddress.trim() }
            : {}),
          ...(Object.keys(orderExtraFields).length
            ? {
                customFields: Object.fromEntries(
                  Object.entries(orderExtraFields).filter(
                    ([, v]) => String(v ?? "").trim() !== "",
                  ),
                ),
              }
            : {}),
          ...(splitSession
            ? {
                splitBill: {
                  mode: splitSession.mode,
                  parts: splitSession.parts.map((p) => ({
                    label: p.label,
                    amount: p.amount,
                    lineIds: p.lineIds,
                  })),
                },
              }
            : {}),
        },
      };

      const checkoutExtras = {
        ...(loyaltyQuote && loyaltyQuote.points > 0
          ? { loyaltyPointsToRedeem: loyaltyQuote.points }
          : {}),
        ...(allowPartial && chargeAmount < totalDue - 0.001
          ? { allowPartial: true }
          : {}),
        ...(splitSession ? { allowPartial: true } : {}),
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
        toast.error("Select a customer to pay from their wallet");
        return;
      }

      // Split + partial together is unsupported (prepare has no partial)
      if (
        !splitSession &&
        splitPay &&
        allowPartial &&
        chargeAmount < totalDue - 0.001
      ) {
        toast.error(
          "Turn off Partial payment when using Split cash + card/UPI",
        );
        return;
      }

      // Split cash + card/UPI: cash recorded, remainder collected via Stripe
      if (!splitSession && splitPay && payMethod === "cash") {
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
              idempotencyKey: splitCashKey,
            });
          }
          try {
            const session = await paymentsApi.createStripeIntent({
              orderId: prepared.orderId,
              amount: rest,
              method: "upi",
              type: "payment",
              idempotencyKey: stripeAttemptKey,
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
            idempotencyKey: stripeAttemptKey,
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
            splitContinue: Boolean(splitSession && splitRemaining > 1),
            keepOrder: Boolean(splitSession && splitRemaining > 1),
          });
          setStripeBusy(true);
        } catch (e) {
          await posApi.cancelPreparedSale(prepared.orderId).catch(() => null);
          throw e;
        }
        return;
      }

      const payAmt = chargeAmount;
      const result = await posApi.saleCheckout({
        ...cartPayload,
        ...checkoutExtras,
        payments: [
          {
            method: settleMethod(),
            amount: payAmt,
            idempotencyKey: attemptKey,
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
            ...(payMethod === "emi"
              ? {
                  emiTenureMonths: Number(emiTenureMonths),
                  emiProvider: emiProvider.trim(),
                  emiReference: emiReference.trim() || undefined,
                }
              : {}),
          },
        ],
        ...(payMethod === "cash"
          ? { cashTendered: tenderedNum > 0 ? tenderedNum : payAmt }
          : {}),
      });

      if (splitSession) {
        const remaining = moneyNumber(
          result.balanceDue ?? result.order.balanceDue,
        );
        if (remaining <= 0.009) {
          resetAfterFullSale();
          setReceipt({
            data: result.receipt as ReceiptData,
            change: result.change,
            cashTendered: result.cashTendered,
          });
          toast.success(`Sale ${result.order.orderNumber} complete`);
          clearPaymentAttemptKey();
          void qc.invalidateQueries({ queryKey: ["pos-sale-catalog"] });
          return;
        }

        const currentPart = splitSession.parts[splitSession.index];
        const currentPartRemaining = currentPart
          ? Math.max(0, currentPart.amount - payAmt)
          : 0;
        const partFullyPaid = currentPartRemaining <= 0.009;

        if (!partFullyPaid && currentPart) {
          const updatedParts = [...splitSession.parts];
          updatedParts[splitSession.index] = {
            ...currentPart,
            amount: roundMoney(currentPartRemaining),
          };
          setSplitSession({
            ...splitSession,
            orderId: result.order.id,
            orderNumber: result.order.orderNumber,
            parts: updatedParts,
          });
          setCart([]);
          setCashTendered("");
          toast.success(
            `Collected ${money(payAmt)} · Part ${splitSession.index + 1} remaining: ${money(currentPartRemaining)}`,
          );
        } else {
          const nextIndex = splitSession.index + 1;
          const leftover = scalePartsToTotal(
            splitSession.parts.slice(nextIndex),
            remaining,
          );
          setSplitSession({
            ...splitSession,
            index: nextIndex,
            orderId: result.order.id,
            orderNumber: result.order.orderNumber,
            parts: [...splitSession.parts.slice(0, nextIndex), ...leftover],
          });
          setCart([]);
          setCashTendered("");
          toast.success(
            `Part ${splitSession.index + 1} of ${splitSession.parts.length} collected · next ${money(leftover[0]?.amount ?? remaining)}`,
          );
        }
        clearPaymentAttemptKey();
        void qc.invalidateQueries({ queryKey: ["pos-sale-catalog"] });
        return;
      }

      resetAfterFullSale();
      setReceipt({
        data: result.receipt as ReceiptData,
        change: result.change,
        cashTendered: result.cashTendered,
      });
      clearPaymentAttemptKey();
      void qc.invalidateQueries({ queryKey: ["pos-sale-catalog"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-catalog"] });
      void qc.invalidateQueries({ queryKey: ["retail-skus"] });
      void qc.invalidateQueries({ queryKey: ["pos-sale-parked"] });
      void qc.invalidateQueries({ queryKey: ["pos-sale-recent"] });
      void qc.invalidateQueries({ queryKey: ["customers"] });
      if (customerId) {
        void qc.invalidateQueries({ queryKey: ["customer", customerId] });
        void qc.invalidateQueries({ queryKey: ["customer-crm"] });
      }
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
      const canQueueOffline =
        !isOnline() &&
        payMethod === "cash" &&
        !splitPay &&
        !allowPartial &&
        !!locationId &&
        cart.length > 0;
      if (canQueueOffline) {
        const queued = enqueueOfflineEvent("pos.sale_checkout_cash", locationId, {
          locationId,
          ...(customerId ? { customerId } : {}),
          items: cart.map((l) => ({
            stockLevelId: l.stockLevelId,
            quantity: l.qty,
            unitPrice: l.unitPrice,
            ...(l.variantId ? { variantId: l.variantId } : {}),
            ...(l.batchId ? { batchId: l.batchId } : {}),
            ...(l.serialNumber?.trim()
              ? { serialNumber: l.serialNumber.trim() }
              : {}),
            ...(l.modifiers?.length ? { modifiers: l.modifiers } : {}),
          })),
          ...(discountNum > 0 ? { discountAmount: discountNum } : {}),
          ...(orderNote.trim() ? { note: orderNote.trim() } : {}),
          ...(loyaltyQuote && loyaltyQuote.points > 0
            ? { loyaltyPointsToRedeem: loyaltyQuote.points }
            : {}),
          paymentAmount: chargeAmount,
          cashTendered: tenderedNum > 0 ? tenderedNum : chargeAmount,
          meta: {
            ...(foodFulfillment ? { orderType } : {}),
            ...(resourceId ? { tableId: resourceId } : {}),
            ...(foodFulfillment && Number(guestCount) > 0
              ? { covers: Number(guestCount) }
              : {}),
            ...(guestName.trim() ? { guestName: guestName.trim() } : {}),
            ...(deliveryPhone.trim() ? { guestPhone: deliveryPhone.trim() } : {}),
            ...(deliveryAddress.trim()
              ? { deliveryAddress: deliveryAddress.trim() }
              : {}),
            ...(Object.keys(orderExtraFields).length
              ? {
                  customFields: Object.fromEntries(
                    Object.entries(orderExtraFields).filter(
                      ([, v]) => String(v ?? "").trim() !== "",
                    ),
                  ),
                }
              : {}),
          },
        });
        setCart([]);
        setDiscountAmount("");
        setCouponCode("");
        setCouponApplied(null);
        setCashTendered("");
        setLoyaltyPointsInput("");
        setOrderExtraFields({});
        setLoyaltyQuote(null);
        toast.success(`Offline cash sale queued (${queued.clientEventId.slice(0, 8)})`);
        return;
      }
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
          ...(l.variantId ? { variantId: l.variantId } : {}),
          ...(l.batchId ? { batchId: l.batchId } : {}),
          ...(l.serialNumber?.trim()
            ? { serialNumber: l.serialNumber.trim() }
            : {}),
          ...(l.modifiers?.length ? { modifiers: l.modifiers } : {}),
        })),
        ...(discountNum > 0 ? { discountAmount: discountNum } : {}),
        label: parkLabel.trim() || undefined,
      });
      setCart([]);
      setDiscountAmount("");
      setParkLabel("");
      setPayModal(null);
      toast.success(`Draft saved ${parkedSale.orderNumber}`);
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Park failed",
      );
    } finally {
      setBusy(false);
    }
  }

  function openRateEdit(line: CartLine) {
    const base = line.listPrice ?? line.unitPrice;
    const pct = base > 0 ? ((line.unitPrice / base - 1) * 100) : 0;
    setRateEdit({
      stockLevelId: line.stockLevelId,
      amount: String(line.unitPrice),
      percent: Math.abs(pct) < 0.05 ? "" : String(Math.round(pct * 100) / 100),
    });
  }

  function applyRateEdit() {
    if (!rateEdit) return;
    const next = moneyNumber(rateEdit.amount || 0);
    if (!Number.isFinite(next) || next < 0) {
      toast.error("Enter a valid rate");
      return;
    }
    setCart((prev) =>
      prev.map((x) =>
        x.stockLevelId === rateEdit.stockLevelId
          ? { ...x, unitPrice: Math.round(next * 100) / 100 }
          : x,
      ),
    );
    setRateEdit(null);
  }

  async function finishStripeSale(paymentIntentId: string) {
    if (!stripeCheckout) return;
    const { orderId, orderNumber, amount, method, splitContinue } =
      stripeCheckout;
    await paymentsApi.verifyStripe({
      orderId,
      paymentIntentId,
      amount,
      method,
      type: "payment",
    });
    const receiptData = await posApi.finalizeStripeSale(orderId);
    setStripeCheckout(null);
    setStripeBusy(false);
    setCashTendered("");
    if (splitContinue && splitSession) {
      const next = splitSession.index + 1;
      const last = next >= splitSession.parts.length;
      setCart([]);
      if (last) {
        resetAfterFullSale();
        setReceipt({
          data: receiptData as ReceiptData,
          change: 0,
          cashTendered: null,
        });
        toast.success(`Sale ${orderNumber} · all parts collected`);
      } else {
        setSplitSession({
          ...splitSession,
          index: next,
          orderId,
          orderNumber,
        });
        toast.success(
          `Part ${next} of ${splitSession.parts.length} collected`,
        );
      }
    } else {
      resetAfterFullSale();
      setReceipt({
        data: receiptData as ReceiptData,
        change: 0,
        cashTendered: null,
      });
      toast.success(
        amount + 0.001 < totalDue
          ? `Sale ${orderNumber} · partial ${money(amount)} via Stripe`
          : `Sale ${orderNumber} paid via Stripe`,
      );
    }
    void qc.invalidateQueries({ queryKey: ["pos-sale-catalog"] });
    void qc.invalidateQueries({ queryKey: ["dashboard-catalog"] });
    void qc.invalidateQueries({ queryKey: ["retail-skus"] });
    clearPaymentAttemptKey();
    scanRef.current?.focus();
  }

  async function closeStripeModal() {
    const pending = stripeCheckout;
    setStripeCheckout(null);
    setStripeBusy(false);
    if (pending?.orderId && !pending.keepOrder) {
      await posApi.cancelPreparedSale(pending.orderId).catch(() => null);
      toast.message(
        "Card/UPI cancelled — any cash already taken stays on the ticket",
      );
    }
  }

  function clearCart() {
    setCart([]);
    setCashTendered("");
    if (!splitFollowUp) setSplitSession(null);
    scanRef.current?.focus();
  }

  return (
    <div
      className={cn(
        "relative",
        compact ? "" : "min-h-[calc(100vh-5rem)]",
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
            </div>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-[#0b1f33] sm:text-2xl">
              {productName}
            </h1>
            <p className="mt-1 text-sm text-[#5a6b7d]">
              Tap a product, then charge.
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

      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.72fr)] items-stretch gap-4">
        <section className="flex h-0 min-h-full flex-col overflow-hidden rounded-[16px] border border-[#d9e0ea] bg-white shadow-[0_1px_2px_rgba(11,31,51,0.04)]">
          <div className="shrink-0 space-y-3 border-b border-[#e8edf4] bg-[#f8fafc] p-3.5">
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

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative w-0 flex-1">
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

          <div className="min-h-0 flex-1 overflow-y-auto border-t border-[#eef2f8] bg-[#f4f6f9]">
            <ul
              className={cn(
                "grid min-h-full content-start gap-2 p-2.5",
                compact ? "grid-cols-3" : "grid-cols-4",
              )}
            >
              {items.map((row) => {
                const gallery =
                  row.images?.length
                    ? row.images
                    : ([row.image ?? row.photoUrl].filter(Boolean) as string[]);
                const src = gallery[0] ?? row.image ?? row.photoUrl;
                const inCart = cart.find((l) => l.stockLevelId === row.id);
                const cartQty = inCart?.qty ?? 0;
                const available =
                  row.trackQty !== false && !row.recipeTracked
                    ? Math.max(0, Number(row.qtyOnHand) - cartQty)
                    : 999;
                const kindLabel = productKindLabel(row.kind);
                const stock = productStockHint({
                  kind: row.kind,
                  trackQty: row.trackQty,
                  available,
                  qtyLeftLabel: formatQtyWithUnit(available, row.sellUnit),
                });
                return (
                  <li key={row.id} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => upsertLine(row)}
                      className={cn(
                        "flex h-full w-full flex-col overflow-hidden rounded-xl border bg-white text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition",
                        inCart
                          ? "border-[#1a56db] ring-1 ring-[#1a56db]/25"
                          : "border-[#e2e8f0] hover:border-[#cbd5e1] hover:shadow-[0_2px_8px_rgba(15,23,42,0.06)]",
                      )}
                    >
                      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#eef2f7]">
                        <div className="absolute inset-0">
                          <ProductThumb
                            src={src}
                            label={row.name}
                            size="fill"
                            className="h-full w-full rounded-none border-0 shadow-none"
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
                        </div>
                        <span
                          className={cn(
                            "absolute top-1.5 left-1.5 z-[1] max-w-[calc(100%-0.75rem)] truncate rounded-md px-1.5 py-0.5 text-[0.62rem] font-bold",
                            stock.tone === "out"
                              ? "bg-[#fef2f2] text-[#c81e1e]"
                              : stock.tone === "low"
                                ? "bg-[#fff7ed] text-[#9a3412]"
                                : "bg-white/95 text-[#1a56db]",
                          )}
                        >
                          {stock.label}
                        </span>
                      </div>
                      <div className="flex min-h-0 flex-1 flex-col gap-1 p-2.5">
                        <p className="line-clamp-2 text-[0.8rem] leading-snug font-semibold text-[#0b1f33]">
                          {row.name}
                        </p>
                        <p className="truncate font-mono text-[0.62rem] text-[#94a3b8]">
                          {row.sku}
                          {row.category?.name
                            ? ` · ${row.category.name}`
                            : ""}
                          {kindLabel ? ` · ${kindLabel}` : ""}
                        </p>
                        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                          <p className="text-[0.9rem] font-extrabold tabular-nums text-[#0b1f33]">
                            {money(row.sellPrice)}
                          </p>
                          <span className="inline-flex h-7 min-w-[2.75rem] items-center justify-center rounded-lg bg-[#1a56db] px-2 text-[0.68rem] font-bold tracking-wide text-white">
                            {inCart ? `+${inCart.qty}` : "ADD"}
                          </span>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
              {!items.length ? (
                <li className="col-span-full px-4 py-14 text-center">
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
          </div>
          {catalogTotalPages > 1 ? (
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[#eef2f8] bg-[#fafbfc] px-3 py-2.5">
              <p className="text-[0.75rem] text-[#5a6b7d]">
                Page {catalogPage} of {catalogTotalPages}
                <span className="text-[#8b9bb0]">
                  {" "}
                  · {catalogTotal} in this list
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
            <p className="shrink-0 border-t border-[#eef2f8] bg-[#fafbfc] px-3 py-2 text-[0.72rem] text-[#8b9bb0]">
              {catalogTotal} product{catalogTotal === 1 ? "" : "s"} shown
            </p>
          ) : null}
        </section>

        <aside className="flex min-h-0 flex-col self-start overflow-hidden rounded-[16px] border border-[#d9e0ea] bg-white shadow-[0_1px_2px_rgba(11,31,51,0.04)]">
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
              placeholder="Search name or phone…"
              showBalances
              money={money}
            />
            {customerId ? (
              <p className="text-[0.75rem] text-[#5a6b7d]">
                Wallet (store credit):{" "}
                <span className="font-semibold tabular-nums text-[#0b1f33]">
                  {money(walletBalance)}
                </span>
                . Use the Wallet button below to take money from this balance.
              </p>
            ) : (
              <p className="text-[0.75rem] text-[#5a6b7d]">
                Wallet pay needs a customer. Walk-in has no wallet.
              </p>
            )}
          </div>

          {foodFulfillment || resourceDesk ? (
            <div className="grid gap-2 border-b border-[#e8edf4] px-4 py-3 sm:grid-cols-2">
              {foodFulfillment ? (
                <div className="field-shell">
                  <Label className="text-[0.65rem] font-semibold tracking-[0.12em] text-[#8b9bb0] uppercase">
                    Order type
                  </Label>
                  <Select
                    className="mt-1 flex h-10 w-full rounded-md border border-[#d9e0ea] bg-white px-3 text-sm text-[#0b1f33]"
                    value={orderType}
                    onChange={(e) => setOrderType(e.target.value)}
                  >
                    <option value="walk_in">Walk-in</option>
                    {(diningCfg.data?.enabledDiningModes ?? [
                      "dine_in",
                      "takeaway",
                      "delivery",
                    ]).map((m) => (
                      <option key={m} value={m}>
                        {m.replaceAll("_", " ")}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}
              {hasCapability("TABLE") ? (
                <>
                  <div className="field-shell">
                    <Label className="text-[0.65rem] font-semibold tracking-[0.12em] text-[#8b9bb0] uppercase">
                      Area / floor
                    </Label>
                    <Select
                      className="mt-1 flex h-10 w-full rounded-md border border-[#d9e0ea] bg-white px-3 text-sm text-[#0b1f33]"
                      value={floorFilter}
                      onChange={(e) => setFloorFilter(e.target.value)}
                    >
                      <option value="all">All areas</option>
                      {(diningFloors.data ?? []).map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="field-shell">
                    <Label className="text-[0.65rem] font-semibold tracking-[0.12em] text-[#8b9bb0] uppercase">
                      Table
                    </Label>
                    <Select
                      className="mt-1 flex h-10 w-full rounded-md border border-[#d9e0ea] bg-white px-3 text-sm text-[#0b1f33]"
                      value={resourceId}
                      onChange={(e) => setResourceId(e.target.value)}
                    >
                      <option value="">None</option>
                      {(diningTables.data ?? [])
                        .filter(
                          (t) =>
                            floorFilter === "all" || t.floorId === floorFilter,
                        )
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.floorName ? `${t.floorName} · ` : ""}
                            {t.name}
                            {t.status !== "available" ? ` · ${t.status}` : ""}
                          </option>
                        ))}
                    </Select>
                    {areaCategoryIds.length ||
                    selectedDiningFloor?.taxRatePercent != null ||
                    selectedDiningFloor?.serviceChargePercent != null ? (
                      <p className="mt-1 text-[0.65rem] text-[#5a6b7d]">
                        {areaCategoryIds.length
                          ? `Area menu · ${areaCategoryIds.length} ${areaCategoryIds.length === 1 ? "category" : "categories"}`
                          : "Full menu"}
                        {selectedDiningFloor?.taxRatePercent != null
                          ? ` · tax ${selectedDiningFloor.taxRatePercent}%`
                          : ""}
                        {(selectedDiningTable?.areaServiceChargePercent ??
                          selectedDiningFloor?.serviceChargePercent) != null
                          ? ` · service ${selectedDiningTable?.areaServiceChargePercent ?? selectedDiningFloor?.serviceChargePercent}%`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                </>
              ) : resourceDesk ? (
                <div className="field-shell">
                  <Label className="text-[0.65rem] font-semibold tracking-[0.12em] text-[#8b9bb0] uppercase">
                    Resource
                  </Label>
                  <Select
                    className="mt-1 flex h-10 w-full rounded-md border border-[#d9e0ea] bg-white px-3 text-sm text-[#0b1f33]"
                    value={resourceId}
                    onChange={(e) => setResourceId(e.target.value)}
                  >
                    <option value="">None</option>
                    {(resources.data?.data ?? []).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} · {r.status}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}
              {foodFulfillment && hasCapability("TABLE") ? (
                <div className="field-shell">
                  <Label className="text-[0.65rem] font-semibold tracking-[0.12em] text-[#8b9bb0] uppercase">
                    Covers / guests
                  </Label>
                  <Input
                    className="h-10"
                    inputMode="numeric"
                    value={guestCount}
                    onChange={(e) => setGuestCount(e.target.value)}
                    placeholder="1"
                  />
                </div>
              ) : null}
              {orderType === "delivery" ? (
                <>
                  <div className="field-shell">
                    <Label className="text-[0.65rem] font-semibold tracking-[0.12em] text-[#8b9bb0] uppercase">
                      Guest name
                    </Label>
                    <Input
                      className="h-10"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Name"
                    />
                  </div>
                  <div className="field-shell">
                    <Label className="text-[0.65rem] font-semibold tracking-[0.12em] text-[#8b9bb0] uppercase">
                      Phone
                    </Label>
                    <Input
                      className="h-10"
                      value={deliveryPhone}
                      onChange={(e) => setDeliveryPhone(e.target.value)}
                      placeholder="Mobile"
                    />
                  </div>
                  <div className="field-shell sm:col-span-2">
                    <Label className="text-[0.65rem] font-semibold tracking-[0.12em] text-[#8b9bb0] uppercase">
                      Delivery address
                    </Label>
                    <Input
                      className="h-10"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      placeholder="Street, area, landmark"
                    />
                  </div>
                </>
              ) : null}
              <div className="field-shell sm:col-span-2">
                <Label className="text-[0.65rem] font-semibold tracking-[0.12em] text-[#8b9bb0] uppercase">
                  Order notes
                </Label>
                <Input
                  className="h-10"
                  value={orderNote}
                  onChange={(e) => setOrderNote(e.target.value)}
                  placeholder="Notes, allergies, prep note, booking reference…"
                />
              </div>
            </div>
          ) : null}

          {/* <div className="border-b border-[#e8edf4] px-4 py-3">
            
          </div> */}

          <ul className="max-h-48 flex-1 space-y-1.5 overflow-y-auto px-3 py-3">
            {cart.map((l) => {
              const catalogRate = l.listPrice ?? l.unitPrice;
              const rateChanged =
                Math.abs(l.unitPrice - catalogRate) > 0.001;
              const ratePct =
                catalogRate > 0
                  ? Math.round(((l.unitPrice / catalogRate - 1) * 100) * 10) /
                    10
                  : 0;
              return (
              <li
                key={l.stockLevelId}
                className="rounded-[10px] border border-[#e8edf4] bg-white px-2 py-2"
              >
                <div className="flex items-start gap-2">
                <ProductThumb src={l.image} label={l.name} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-[#0b1f33]">
                      {l.name}
                    </p>
                    <p className="shrink-0 text-sm font-bold tabular-nums text-[#0b1f33]">
                      {money(l.unitPrice * l.qty)}
                    </p>
                  </div>
                  {productKindLabel(l.kind) ? (
                    <p className="text-[0.65rem] font-medium text-[#5a6b7d]">
                      {productKindLabel(l.kind)}
                    </p>
                  ) : null}
                  <p className="truncate font-mono text-[0.65rem] text-[#8b9bb0]">
                    {l.sku}
                    {" · "}
                    {money(l.unitPrice)} {priceUnitLabel(l.sellUnit)}
                    {l.taxRatePercent != null &&
                    Number.isFinite(l.taxRatePercent) &&
                    l.taxRatePercent > 0 &&
                    l.taxRatePercent <= 28
                      ? ` · tax ${l.taxRatePercent}%`
                      : taxSettings.rate > 0
                        ? ` · tax ${Math.round(taxSettings.rate * 1000) / 10}%`
                        : ""}
                  </p>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <div className="flex shrink-0 items-center rounded-lg bg-[#f8fafc] p-0.5 ring-1 ring-[#e4e9f0]">
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
                    <button
                      type="button"
                      className={cn(
                        "rounded-lg border px-2 py-1 text-[0.65rem] font-semibold",
                        rateChanged
                          ? "border-[#fdba74] bg-[#fff7ed] text-[#c2410c]"
                          : "border-[#e2e8f0] bg-[#f8fafc] text-[#475569] hover:border-[#1a56db] hover:text-[#1a56db]",
                      )}
                      title="Urgent / extra % for this item"
                      onClick={() => openRateEdit(l)}
                    >
                      {rateChanged
                        ? `${ratePct > 0 ? "+" : ""}${ratePct}%`
                        : "Rate"}
                    </button>
                  </div>
                  {(l.requiresVariant || l.requiresBatch || l.requiresSerial) && (
                    <div className="mt-2 grid gap-1">
                      {l.requiresVariant && (
                        <Select
                          className="h-8 rounded-md border border-[#d6deea] bg-white px-2 text-xs text-[#0b1f33]"
                          value={l.variantId ?? ""}
                          onChange={(e) =>
                            setCart((prev) =>
                              prev.map((x) =>
                                x.stockLevelId === l.stockLevelId
                                  ? { ...x, variantId: e.target.value || undefined }
                                  : x,
                              ),
                            )
                          }
                        >
                          <option value="">Select variant</option>
                          {(l.variantOptions ?? []).map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.label || v.skuCode}
                            </option>
                          ))}
                        </Select>
                      )}
                      {l.requiresBatch && (
                        <Select
                          className="h-8 rounded-md border border-[#d6deea] bg-white px-2 text-xs text-[#0b1f33]"
                          value={l.batchId ?? ""}
                          onChange={(e) =>
                            setCart((prev) =>
                              prev.map((x) =>
                                x.stockLevelId === l.stockLevelId
                                  ? { ...x, batchId: e.target.value || undefined }
                                  : x,
                              ),
                            )
                          }
                        >
                          <option value="">Select batch</option>
                          {(l.batchOptions ?? []).map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.batchCode} ({formatQtyWithUnit(b.qtyOnHand, l.sellUnit)})
                            </option>
                          ))}
                        </Select>
                      )}
                      {l.requiresSerial && (
                        <Input
                          className="h-8 bg-white text-xs"
                          placeholder="Serial / barcode"
                          value={l.serialNumber ?? ""}
                          onChange={(e) =>
                            setCart((prev) =>
                              prev.map((x) =>
                                x.stockLevelId === l.stockLevelId
                                  ? { ...x, serialNumber: e.target.value }
                                  : x,
                              ),
                            )
                          }
                        />
                      )}
                    </div>
                  )}
                </div>
                </div>
              </li>
              );
            })}
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
            <div className="rounded-[12px] border border-[#e2e8f0] bg-white px-3.5 py-3">
              {discountNum > 0 ? (
                <div className="mb-1 flex items-baseline justify-between text-sm text-[#0b1f33]">
                  <span>Discount</span>
                  <span className="tabular-nums">−{money(discountNum)}</span>
                </div>
              ) : null}
              {loyaltyOff > 0 ? (
                <div className="mb-1 flex items-baseline justify-between text-sm text-[#0b1f33]">
                  <span>Points</span>
                  <span className="tabular-nums">−{money(loyaltyOff)}</span>
                </div>
              ) : null}
              {diningFeeLines.map((f) => (
                <div
                  key={f.feeCode}
                  className="mb-1 flex items-baseline justify-between text-sm text-[#0b1f33]"
                >
                  <span>{f.reason}</span>
                  <span className="tabular-nums">{money(f.amount)}</span>
                </div>
              ))}
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-[#0b1f33]">
                  Pay this
                </span>
                <span className="text-[1.75rem] leading-none font-bold tabular-nums text-[#0b1f33]">
                  {money(splitPart ? chargeAmount : totalDue)}
                </span>
              </div>
              {taxAmount > 0 ? (
                <p className="mt-1 text-[0.65rem] text-[#8b9bb0]">
                  Includes tax {money(taxAmount)}
                  {discountNum > 0 ? ` · after discount` : ""}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-10"
                disabled={!cart.length && !splitFollowUp}
                onClick={() => setPayModal("discount")}
              >
                {discountNum > 0 ? `Discount ${money(discountNum)}` : "Discount"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-10"
                disabled={
                  !canSplitBill ||
                  (!cart.length && !splitFollowUp) ||
                  totalDue <= 0
                }
                onClick={() => {
                  if (splitSession) {
                    toast.message(
                      "Split is already running. Cancel it below, then start a new split.",
                    );
                    return;
                  }
                  setSplitBillOpen(true);
                }}
              >
                {splitSession
                  ? `${splitPart?.label ?? "Split"} · ${money(chargeAmount)}`
                  : "Split bill"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-10"
                disabled={busy || !cart.length || Boolean(splitSession)}
                onClick={() => setPayModal("draft")}
              >
                Save later
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-10"
                onClick={() => setPayModal("more")}
              >
                More options
              </Button>
            </div>
            {splitSession ? (
              <p className="text-[0.7rem] text-[#1a56db]">
                Collect {splitPart?.label} now
                {splitSession.orderNumber
                  ? ` · ${splitSession.orderNumber}`
                  : ""}
                .{" "}
                <button
                  type="button"
                  className="font-semibold underline"
                  onClick={() => {
                    if (splitFollowUp) {
                      toast.message(
                        "Earlier parts stay on the ticket. Remaining balance can be collected later.",
                      );
                    }
                    setSplitSession(null);
                  }}
                >
                  {splitFollowUp ? "Stop split" : "Cancel split"}
                </button>
              </p>
            ) : null}

            {(() => {
              const catalogItems = payMethods.data?.items ?? [];
              const byMethod = new Map(
                catalogItems.map((m) => [m.method, m] as const),
              );
              const frontRow = [
                "cash",
                "qr",
                "store_credit",
                "card",
                "upi",
              ] as const;
              const shownPrimary = frontRow.map((method) => {
                const m = byMethod.get(method);
                const alwaysOn =
                  method === "cash" ||
                  method === "qr" ||
                  method === "store_credit";
                return {
                  method,
                  displayName:
                    method === "qr"
                      ? "QR"
                      : method === "store_credit"
                        ? "Wallet"
                        : m?.displayName ?? method,
                  available: alwaysOn || Boolean(m?.available),
                  reason: m?.reason,
                };
              });
              const visible = shownPrimary;
              const methodLabel = (method: string, displayName: string) => {
                if (method === "store_credit") return "Wallet";
                if (method === "wallet") return "App pay";
                if (method === "gift_card") return "Gift";
                if (method === "bank_transfer") return "Bank";
                return displayName;
              };
              return (
                <>
            <div
              className={cn(
                "grid gap-1 rounded-[12px] bg-[#eef2f8] p-1",
                touchMode ? "grid-cols-3" : "grid-cols-3",
              )}
            >
              {visible.map((m) => (
                <button
                  key={m.method}
                  type="button"
                  disabled={!m.available}
                  title={m.reason}
                  data-active={payMethod === m.method ? "true" : "false"}
                  onClick={() => {
                    if (!m.available) {
                      toast.message(m.reason || `${m.displayName} is not configured`);
                      return;
                    }
                    setPayMethod(m.method as PayMethod);
                    if (m.method !== "cash") setSplitPay(false);
                  }}
                  className={cn(
                    "rounded-[9px] font-bold tracking-[0.04em] uppercase transition",
                    touchMode ? "py-4 text-xs" : "py-2.5 text-[0.65rem]",
                    !m.available && "cursor-not-allowed opacity-40",
                    payMethod === m.method
                      ? "bg-[#1a56db] text-white shadow-[0_1px_3px_rgba(26,86,219,0.35)]"
                      : "text-[#5a6b7d] hover:bg-white/80 hover:text-[#0b1f33]",
                  )}
                >
                  {methodLabel(m.method, m.displayName)}
                </button>
              ))}
            </div>
                </>
              );
            })()}
            {["gift_card", "bank_transfer", "emi", "wallet"].includes(
              payMethod,
            ) ? (
              <button
                type="button"
                className="w-full rounded-lg border border-[#c9d7f5] bg-[#f5f8ff] px-3 py-2 text-left text-xs font-semibold text-[#1a56db]"
                onClick={() => setPayModal("more")}
              >
                Extra pay details — tap to fill ({payMethod.replace("_", " ")})
              </button>
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
            {payMethod === "cash" ? (
              <div className="field-shell">
                <Label className="text-[0.75rem] font-semibold text-[#0b1f33]">
                  Cash given
                </Label>
                <Input
                  className="mt-1 text-base tabular-nums"
                  inputMode="decimal"
                  placeholder={String(chargeAmount || "")}
                  value={cashTendered}
                  onChange={(e) => setCashTendered(e.target.value)}
                />
                {tenderedNum > 0 ? (
                  <p className="mt-1 text-sm font-semibold text-[#1a56db]">
                    Return {money(changeDue)}
                  </p>
                ) : (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
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
                            "rounded-lg border border-[#cfd8e6] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#5a6b7d] hover:border-[#1a56db]/45 hover:bg-[#e8eefb] hover:text-[#0b1f33]",
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
            ) : payMethod === "card" || payMethod === "upi" ? (
              <p className="text-[0.7rem] text-[#5a6b7d]">
                {stripeConfig.data?.enabled
                  ? "Card / UPI opens on the next screen."
                  : "Card / UPI not set up. Use cash or QR."}
              </p>
            ) : payMethod === "store_credit" ? (
              <p className="text-[0.7rem] text-[#5a6b7d]">
                {customerId
                  ? `Takes from customer wallet (${money(walletBalance)} left).`
                  : "Pick a customer first to use wallet."}
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
                (!cart.length && !splitFollowUp) ||
                (!online &&
                  payMethod !== "cash" &&
                  payMethod !== "qr" &&
                  payMethod !== "wallet") ||
                ((payMethod === "card" || payMethod === "upi") &&
                  !stripeConfig.data?.enabled) ||
                (payMethod === "emi" &&
                  (!customerId || !emiProvider.trim()))
              }
              onClick={() => void checkout()}
            >
              {busy || stripeBusy
                ? payMethod === "card" || payMethod === "upi"
                  ? "Opening Stripe…"
                  : "Processing…"
                : splitPart
                  ? `Collect ${splitPart.label} · ${money(chargeAmount)}`
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

      {modPick ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#0b1f33]/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-[#e2e8f0] bg-white p-4 shadow-lg">
            <h3 className="text-sm font-semibold text-[#0b1f33]">
              Modifiers · {modPick.row.name}
            </h3>
            <div className="mt-3 max-h-72 space-y-3 overflow-auto">
              {modPick.groups.map((g) => (
                <div key={g.id ?? g.name}>
                  <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-[#8b9bb0]">
                    {g.name}
                    {g.required ? " · required" : ""}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {g.options.map((o) => {
                      const on = modPick.selected.includes(o.name);
                      return (
                        <li key={o.id ?? o.name}>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() =>
                                setModPick((cur) =>
                                  cur
                                    ? {
                                        ...cur,
                                        selected: on
                                          ? cur.selected.filter((n) => n !== o.name)
                                          : [...cur.selected, o.name],
                                      }
                                    : cur,
                                )
                              }
                            />
                            <span>{o.name}</span>
                            {Number(o.priceDelta) ? (
                              <span className="tabular-nums text-[#5a6b7d]">
                                +{Number(o.priceDelta).toFixed(2)}
                              </span>
                            ) : null}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setModPick(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  const row = modPick.row;
                  setModPick(null);
                  upsertLine({
                    ...row,
                    modifiers: modPick.selected,
                    skipModifierPrompt: true,
                  });
                }}
              >
                Add
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {serialPick ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#0b1f33]/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-[#e2e8f0] bg-white p-4 shadow-lg">
            <h3 className="text-sm font-semibold text-[#0b1f33]">
              Serial number · {serialPick.row.name}
            </h3>
            <p className="mt-1 text-xs text-[#5a6b7d]">
              This item is serial-tracked. Enter the serial / IMEI / barcode
              before adding it to the ticket.
            </p>
            <Input
              className="mt-3"
              autoFocus
              placeholder="Serial / barcode"
              value={serialPick.value}
              onChange={(e) =>
                setSerialPick((cur) =>
                  cur ? { ...cur, value: e.target.value } : cur,
                )
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const value = serialPick.value.trim();
                  if (!value) return;
                  const row = serialPick.row;
                  setSerialPick(null);
                  upsertLine({ ...row, serialNumber: value });
                }
              }}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setSerialPick(null)}>
                Cancel
              </Button>
              <Button
                disabled={!serialPick.value.trim()}
                onClick={() => {
                  const value = serialPick.value.trim();
                  if (!value) return;
                  const row = serialPick.row;
                  setSerialPick(null);
                  upsertLine({ ...row, serialNumber: value });
                }}
              >
                Add
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {receipt ? (
        <ReceiptModal
          data={receipt.data}
          change={receipt.change}
          cashTendered={receipt.cashTendered}
          onClose={() => setReceipt(null)}
        />
      ) : null}

      {rateEdit ? (
        <ModalFrame
          title="Change rate"
          subtitle="Urgent extra or a % on this item only. Then tap Apply."
          onClose={() => setRateEdit(null)}
          footer={
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setRateEdit(null)}
              >
                Cancel
              </Button>
              <Button className="flex-1" onClick={applyRateEdit}>
                Apply
              </Button>
            </div>
          }
        >
          {(() => {
            const line = cart.find(
              (x) => x.stockLevelId === rateEdit.stockLevelId,
            );
            if (!line) return <p className="text-sm">Item is gone.</p>;
            const base = line.listPrice ?? line.unitPrice;
            const draft = moneyNumber(rateEdit.amount || 0);
            const applyPct = (pct: number) => {
              const amount = Math.round(base * (1 + pct / 100) * 100) / 100;
              setRateEdit({
                ...rateEdit,
                percent: String(pct),
                amount: String(amount),
              });
            };
            return (
              <div className="space-y-4">
                <p className="text-sm font-semibold text-[#0b1f33]">
                  {line.name}
                </p>
                <p className="text-xs text-[#8b9bb0]">
                  Catalog rate {money(base)} {priceUnitLabel(line.sellUnit)}
                  {" · "}qty {line.qty}
                </p>
                <div className="field-shell">
                  <Label>New rate</Label>
                  <Input
                    className="mt-1 text-lg tabular-nums"
                    inputMode="decimal"
                    value={rateEdit.amount}
                    onChange={(e) => {
                      const amountStr = e.target.value;
                      const next = moneyNumber(amountStr || 0);
                      const pct =
                        base > 0 && Number.isFinite(next)
                          ? Math.round(((next / base - 1) * 100) * 100) / 100
                          : 0;
                      setRateEdit({
                        ...rateEdit,
                        amount: amountStr,
                        percent:
                          Math.abs(pct) < 0.05 ? "" : String(pct),
                      });
                    }}
                  />
                </div>
                <div className="field-shell">
                  <Label>Extra % (urgent)</Label>
                  <Input
                    className="mt-1 text-lg tabular-nums"
                    inputMode="decimal"
                    placeholder="e.g. 20"
                    value={rateEdit.percent}
                    onChange={(e) => {
                      const percentStr = e.target.value;
                      const pct = moneyNumber(percentStr || 0);
                      const amount =
                        Math.round(base * (1 + pct / 100) * 100) / 100;
                      setRateEdit({
                        ...rateEdit,
                        percent: percentStr,
                        amount: String(amount),
                      });
                    }}
                  />
                  <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">
                    20 means 20% more than catalog. Use minus for less, e.g. −10.
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[10, 20, 50].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      className="rounded-lg border border-[#e2e8f0] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#475569] hover:border-[#1a56db] hover:text-[#1a56db]"
                      onClick={() => applyPct(pct)}
                    >
                      Urgent +{pct}%
                    </button>
                  ))}
                  <button
                    type="button"
                    className="rounded-lg border border-[#e2e8f0] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#475569] hover:border-[#1a56db] hover:text-[#1a56db]"
                    onClick={() =>
                      setRateEdit({
                        ...rateEdit,
                        amount: String(base),
                        percent: "",
                      })
                    }
                  >
                    Reset {money(base)}
                  </button>
                </div>
                <p className="text-sm font-semibold text-[#1a56db]">
                  This line: {money(Math.max(0, draft) * line.qty)}
                </p>
              </div>
            );
          })()}
        </ModalFrame>
      ) : null}

      {payModal === "discount" ? (
        <ModalFrame
          title="Discount"
          subtitle="Type an amount, or apply a coupon. Then tap Done."
          onClose={() => setPayModal(null)}
          footer={
            <Button className="w-full" onClick={() => setPayModal(null)}>
              Done
            </Button>
          }
        >
          <div className="space-y-4">
            <div className="field-shell">
              <Label>How much off?</Label>
              <Input
                className="mt-1 text-lg tabular-nums"
                inputMode="decimal"
                placeholder="0"
                value={discountAmount}
                onChange={(e) => {
                  setDiscountAmount(e.target.value);
                  setCouponApplied(null);
                }}
              />
              {discountNum > 0 ? (
                <p className="mt-1 text-sm font-semibold text-[#1a56db]">
                  Off the bill: {money(discountNum)}
                </p>
              ) : null}
              {discountCapped ? (
                <p className="mt-1 text-xs text-amber-800">
                  Cashier max is {money(maxDiscountAmount)} (
                  {maxCashierDiscountPercent}%). Ask a manager for more.
                </p>
              ) : (
                <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">
                  Ticket before discount: {money(ticketBeforeDiscount)}
                </p>
              )}
            </div>
            <div className="field-shell">
              <Label>Coupon code</Label>
              <div className="mt-1 flex gap-2">
                <Input
                  className="uppercase"
                  placeholder="CODE"
                  value={couponCode}
                  onChange={(e) => {
                    setCouponCode(e.target.value);
                    setCouponApplied(null);
                  }}
                />
                {couponApplied ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setCouponCode("");
                      setCouponApplied(null);
                      setDiscountAmount("");
                    }}
                  >
                    Clear
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!couponCode.trim() || ticketBeforeDiscount <= 0}
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
                )}
              </div>
              {couponApplied ? (
                <p className="mt-1 text-xs text-[#1a56db]">
                  Coupon {couponApplied} applied
                </p>
              ) : null}
            </div>
          </div>
        </ModalFrame>
      ) : null}

      {payModal === "draft" ? (
        <ModalFrame
          title="Save for later"
          subtitle="Hold this ticket. You can open it again from drafts."
          onClose={() => setPayModal(null)}
          footer={
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setPayModal(null)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={busy || !cart.length}
                onClick={() => void parkCart()}
              >
                {busy ? "Saving…" : "Save draft"}
              </Button>
            </div>
          }
        >
          <div className="field-shell">
            <Label>Name this bill (optional)</Label>
            <Input
              className="mt-1"
              placeholder="e.g. Table 4, walk-in, pickup"
              value={parkLabel}
              onChange={(e) => setParkLabel(e.target.value)}
            />
            <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">
              {cart.length} item{cart.length === 1 ? "" : "s"} ·{" "}
              {money(totalDue)}
            </p>
          </div>
        </ModalFrame>
      ) : null}

      {payModal === "more" ? (
        <ModalFrame
          title="More options"
          subtitle="Extra pay methods and extras. Fill what you need, then Done and Charge."
          onClose={() => setPayModal(null)}
          className="max-w-lg"
          footer={
            <Button className="w-full" onClick={() => setPayModal(null)}>
              Done
            </Button>
          }
        >
          <div className="space-y-4">
            {(() => {
              const catalogItems = payMethods.data?.items ?? [];
              const byMethod = new Map(
                catalogItems.map((m) => [m.method, m] as const),
              );
              const extraRow = [
                "gift_card",
                "bank_transfer",
                "emi",
                "wallet",
              ] as const;
              const extras = extraRow.map((method) => {
                const m = byMethod.get(method);
                return {
                  method,
                  displayName:
                    method === "gift_card"
                      ? "Gift card"
                      : method === "bank_transfer"
                        ? "Bank transfer"
                        : method === "emi"
                          ? "EMI"
                          : "App pay",
                  available: Boolean(m?.available),
                  reason: m?.reason,
                };
              });
              return (
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-[#0b1f33]">
                    Extra pay methods
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {extras.map((m) => (
                      <button
                        key={m.method}
                        type="button"
                        title={m.reason}
                        onClick={() => {
                          if (!m.available) {
                            toast.message(
                              m.reason || `${m.displayName} is not set up`,
                            );
                            return;
                          }
                          setPayMethod(m.method as PayMethod);
                          if ((m.method as string) !== "cash") setSplitPay(false);
                        }}
                        className={cn(
                          "rounded-lg border px-3 py-2.5 text-left text-sm font-semibold",
                          !m.available && "cursor-not-allowed opacity-40",
                          payMethod === m.method
                            ? "border-[#1a56db] bg-[#e8eefb] text-[#1a56db]"
                            : "border-[#d9e0ea] bg-white text-[#0b1f33]",
                        )}
                      >
                        {m.displayName}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {payMethod === "gift_card" ? (
              <div className="field-shell">
                <Label>Gift card code</Label>
                <div className="mt-1 flex gap-2">
                  <Input
                    value={giftCardCode}
                    onChange={(e) => {
                      setGiftCardCode(e.target.value);
                      setGiftCardBalance(null);
                    }}
                    placeholder="Scan or type code"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!giftCardCode.trim()}
                    onClick={async () => {
                      try {
                        const g = await loyaltyApi.lookupGiftCard(
                          giftCardCode.trim(),
                        );
                        setGiftCardBalance(Number(g.balance));
                        toast.success(
                          `Balance ${money(Number(g.balance))}`,
                        );
                      } catch (e) {
                        setGiftCardBalance(null);
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
                {giftCardBalance != null ? (
                  <p className="mt-1 text-sm font-semibold text-[#1a56db]">
                    Balance {money(giftCardBalance)}
                  </p>
                ) : (
                  <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">
                    Check the card, then Charge.
                  </p>
                )}
              </div>
            ) : null}

            {payMethod === "bank_transfer" ? (
              <div className="space-y-3">
                <div className="field-shell">
                  <Label>Account name</Label>
                  <Input
                    className="mt-1"
                    value={bankAccountName}
                    onChange={(e) => setBankAccountName(e.target.value)}
                  />
                </div>
                <div className="field-shell">
                  <Label>Account number</Label>
                  <Input
                    className="mt-1"
                    value={bankAccountNumber}
                    onChange={(e) => setBankAccountNumber(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="field-shell">
                    <Label>IFSC (optional)</Label>
                    <Input
                      className="mt-1 uppercase"
                      value={bankIfsc}
                      onChange={(e) => setBankIfsc(e.target.value)}
                    />
                  </div>
                  <div className="field-shell">
                    <Label>Bank name (optional)</Label>
                    <Input
                      className="mt-1"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                    />
                  </div>
                </div>
                <div className="field-shell">
                  <Label>Reference / UTR</Label>
                  <Input
                    className="mt-1"
                    value={bankReference}
                    onChange={(e) => setBankReference(e.target.value)}
                  />
                </div>
              </div>
            ) : null}

            {payMethod === "emi" ? (
              <div className="space-y-3">
                {!customerId ? (
                  <p className="text-sm text-amber-800">
                    Pick a customer on the ticket first.
                  </p>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  <div className="field-shell">
                    <Label>Months</Label>
                    <Input
                      className="mt-1"
                      inputMode="numeric"
                      value={emiTenureMonths}
                      onChange={(e) => setEmiTenureMonths(e.target.value)}
                    />
                  </div>
                  <div className="field-shell">
                    <Label>Bank / provider</Label>
                    <Input
                      className="mt-1"
                      value={emiProvider}
                      onChange={(e) => setEmiProvider(e.target.value)}
                    />
                  </div>
                </div>
                <div className="field-shell">
                  <Label>Reference (optional)</Label>
                  <Input
                    className="mt-1"
                    value={emiReference}
                    onChange={(e) => setEmiReference(e.target.value)}
                  />
                </div>
              </div>
            ) : null}

            {payMethod === "wallet" ? (
              <p className="text-sm text-[#5a6b7d]">
                Confirm after the customer pays in the wallet app, then Charge.
              </p>
            ) : null}

            <label className="flex items-center gap-2 text-sm font-medium text-[#0b1f33]">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#1a56db]"
                checked={allowPartial}
                disabled={Boolean(splitSession)}
                onChange={(e) => setAllowPartial(e.target.checked)}
              />
              Collect only part now
            </label>
            {allowPartial && !splitSession ? (
              <div className="field-shell">
                <Label>Amount to collect now</Label>
                <Input
                  className="mt-1 text-base tabular-nums"
                  inputMode="decimal"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder={String(totalDue || "")}
                />
                <p className="mt-1 text-xs text-[#5a6b7d]">
                  Left after this: {money(Math.max(0, totalDue - chargeAmount))}
                </p>
              </div>
            ) : null}

            {customerId ? (
              <div className="field-shell">
                <Label>Loyalty points</Label>
                <div className="mt-1 flex gap-2">
                  <Input
                    inputMode="numeric"
                    placeholder="Points to use"
                    value={loyaltyPointsInput}
                    onChange={(e) => {
                      setLoyaltyPointsInput(e.target.value);
                      setLoyaltyQuote(null);
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
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
                    Apply
                  </Button>
                </div>
                {loyaltyQuote ? (
                  <p className="mt-1 text-xs text-[#1a56db]">
                    −{money(loyaltyQuote.amountOff)} ({loyaltyQuote.points} pts)
                  </p>
                ) : (
                  <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">
                    Apply points, then Charge.
                  </p>
                )}
              </div>
            ) : null}

            {payMethod === "cash" && !splitSession ? (
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-[#0b1f33]">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#1a56db]"
                    checked={splitPay}
                    onChange={(e) => setSplitPay(e.target.checked)}
                  />
                  Split cash + card/UPI
                </label>
                {splitPay ? (
                  <div className="field-shell">
                    <Label>Cash portion</Label>
                    <Input
                      className="mt-1 text-base tabular-nums"
                      inputMode="decimal"
                      value={splitCashAmount}
                      onChange={(e) => setSplitCashAmount(e.target.value)}
                      placeholder="0"
                    />
                    <p className="mt-1 text-xs text-[#5a6b7d]">
                      Card/UPI collects{" "}
                      {money(
                        Math.max(
                          0,
                          totalDue - moneyNumber(splitCashAmount || 0),
                        ),
                      )}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            <label className="flex items-center gap-2 text-sm font-medium text-[#0b1f33]">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#1a56db]"
                checked={sendReceipt}
                onChange={(e) => setSendReceipt(e.target.checked)}
              />
              Send receipt by email / SMS
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-[#0b1f33]">
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
              Bigger buttons (touch mode)
            </label>
          </div>
        </ModalFrame>
      ) : null}

      <SplitBillModal
        open={splitBillOpen}
        total={totalDue}
        lines={cart.map((l) => ({
          id: l.stockLevelId,
          name: l.name,
          qty: l.qty,
          amount: l.unitPrice * l.qty,
        }))}
        money={money}
        onClose={() => setSplitBillOpen(false)}
        onSave={(parts, mode) => {
          setSplitSession({ mode, parts, index: 0 });
          setSplitPay(false);
          setAllowPartial(false);
          setSplitBillOpen(false);
          toast.success(
            `Split into ${parts.length} parts — collect ${parts[0]?.label ?? "Part 1"} first`,
          );
        }}
      />

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
