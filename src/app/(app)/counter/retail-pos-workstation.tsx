"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { customersApi, loyaltyApi, ordersApi, paymentsApi, posApi, resourcesApi, restaurantApi, tenantsApi, billingApi, catalogApi } from "@/lib/api";
import {
  UPI_PSP_OPTIONS,
  buildUpiPayUri,
  isValidUpiVpa,
  normalizeInMobile,
  shopPhoneFromTenantSettings,
  shopUpiFromPosSettings,
  vpaFromMobile,
  type UpiPspSuffix,
} from "@/lib/shop-upi";
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
import { BillTotalsLines } from "@/components/bill-totals-lines";
import { StripeCheckoutModal } from "@/components/stripe-checkout-modal";
import { ProductThumb } from "@/components/product-thumb";
import { FoodTypeBadge } from "@/components/food-type-badge";
import { ImageLightbox } from "@/components/image-lightbox";
import { CustomerPicker } from "@/components/customer-picker";
import { CustomFieldsSection } from "@/components/custom-field-inputs";
import { SplitBillModal } from "@/components/split-bill-modal";
import { ModalFrame } from "@/components/modal-frame";
import { PhoneCountryInput } from "@/components/phone-country-input";
import { canonicalPhoneE164, validatePhoneE164 } from "@/lib/phone";
import { StationPinLock } from "@/components/station-pin-lock";
import { BarcodeScanInput } from "@/components/barcode-scan-input";
import { guardedAction } from "@/components/unsaved-work-guard";
import { useUnsavedWorkStore } from "@/lib/unsaved-work-store";
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
import {
  buildBillSummary,
  cashChangeDue,
  lineTaxAmount,
  roundOffForDisplay,
  shouldApplyCashRoundOff,
} from "@/lib/bill-summary";

type CartLine = {
  stockLevelId: string;
  sku: string;
  name: string;
  mrp?: number;
  unitPrice: number;
  /** Catalog / shelf price when the line was added — used for urgent/special rate UI */
  listPrice: number;
  qty: number;
  maxQty: number;
  sellUnit: SellUnit;
  sellingUnitId?: string;
  baseQty?: number;
  conversionFactor?: number;
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
  foodType?: "veg" | "non_veg" | "egg" | null;
  modifiers?: string[];
};

/** Shelf / list rate for a cart line (before this ticket’s line discount). */
function cartLineListPrice(line: CartLine): number {
  if (line.mrp && line.mrp > 0) return line.mrp;
  return line.listPrice > 0 ? line.listPrice : line.unitPrice;
}

/** Discount % off list for this line only (0 if none / markup). */
function cartLineDiscountPercent(line: CartLine): number {
  const base = cartLineListPrice(line);
  if (base <= 0 || line.unitPrice >= base - 0.001) return 0;
  return Math.round(((1 - line.unitPrice / base) * 100) * 10) / 10;
}

/** ₹ off list × qty for this line (not bill-level coupon). */
function cartLineDiscountAmount(line: CartLine): number {
  const base = cartLineListPrice(line);
  const off = Math.max(0, base - line.unitPrice) * line.qty;
  return Math.round(off * 100) / 100;
}

function unitPriceAfterLineDiscount(
  listPrice: number,
  opts: { percent?: number; amountOffPerUnit?: number },
): number {
  const base = Math.max(0, listPrice);
  if (opts.amountOffPerUnit != null && Number.isFinite(opts.amountOffPerUnit)) {
    return Math.max(
      0,
      Math.round((base - Math.max(0, opts.amountOffPerUnit)) * 100) / 100,
    );
  }
  const pct = Math.max(0, opts.percent ?? 0);
  if (pct > 0) {
    return Math.max(0, Math.round(base * (1 - pct / 100) * 100) / 100);
  }
  return Math.round(base * 100) / 100;
}

type PayMethod =
  | "cash"
  | "upi"
  | "card"
  | "bank_transfer"
  | "wallet"
  | "qr"
  | "emi"
  | "store_credit"
  | "gift_card"
  | "collect_later";

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
    const inclusiveFlag =
      settings?.tax?.inclusive === true ||
      (settings as { taxInclusive?: boolean } | undefined)?.taxInclusive ===
        true;
    return {
      rate: Math.min(40, Math.max(0, ratePercent)) / 100,
      // India GST: listed price is exclusive — add CGST/SGST on Net Payable
      inclusive: mode === "in_gst" ? false : inclusiveFlag,
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
  /** Counter QR: optional override when Settings UPI ID is empty */
  const [qrPhone, setQrPhone] = useState("");
  const [qrPsp, setQrPsp] = useState<UpiPspSuffix>("@ybl");
  const [qrCustomVpa, setQrCustomVpa] = useState("");
  const [splitPay, setSplitPay] = useState(false);
  const [splitCashAmount, setSplitCashAmount] = useState("");
  const [splitBillOpen, setSplitBillOpen] = useState(false);
  const [payModal, setPayModal] = useState<
    "discount" | "draft" | "drafts" | "more" | "customer" | "orderDetails" | null
  >(null);
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
  /** Bulk qty: type 455 instead of tapping + hundreds of times */
  const [qtyPick, setQtyPick] = useState<{
    row: Parameters<typeof upsertLine>[0];
    value: string;
    maxQty: number;
    tracks: boolean;
    entryUnitId: string;
  } | null>(null);
  /** Draft text while editing cart line qty (allows typing 455 freely) */
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});
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
  const scanQtyRef = useRef<number | null>(null);
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
    queryKey: ["locations", actingUser?.tenantId],
    queryFn: () => tenantsApi.listLocations(),
    enabled: Boolean(actingUser?.tenantId),
  });
  const branchLocationId = useBranchStore((s) => s.currentLocationId);
  /** Shell branch is SSOT — don't fall back to MAIN when list is still loading/stale. */
  const locationId =
    branchLocationId ||
    locations.data?.find((l) => l.code === "MAIN" && l.isActive !== false)?.id ||
    locations.data?.find((l) => l.isActive !== false)?.id ||
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

  const parkedQ = useQuery({
    queryKey: ["pos-sale-parked", locationId],
    queryFn: () => posApi.listParkedSales(locationId),
    enabled: Boolean(locationId),
    refetchInterval: 30_000,
  });
  const parkedItems = parkedQ.data?.items ?? [];

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

  const subtotal = Math.round(cart.reduce((s, l) => s + l.unitPrice * l.qty, 0) * 100) / 100;
  /** Gross MRP across all items: MRP × qty */
  const grossMrpTotal =
    Math.round(
      cart.reduce((s, l) => s + cartLineListPrice(l) * l.qty, 0) * 100,
    ) / 100;
  /** Sum of per-item discounts (MRP − selling price) × qty */
  const lineDiscountsTotal =
    Math.round(Math.max(0, grossMrpTotal - subtotal) * 100) / 100;
  /** Payment “Total” before item discounts (Gross MRP). */
  const displaySubtotal = grossMrpTotal;

  const maxDiscountAmount =
    Math.round(
      ((subtotal * maxCashierDiscountPercent) / 100) * 100,
    ) / 100;
  const discountEntered = Math.max(0, moneyNumber(discountAmount || 0));
  const discountNum = Math.min(
    discountEntered,
    subtotal,
    canOverrideDiscount ? subtotal : maxDiscountAmount,
  );
  const discountCapped =
    discountEntered > discountNum + 0.001 && !canOverrideDiscount;
  const loyaltyOff = Math.min(Math.max(0, subtotal - discountNum), loyaltyQuote?.amountOff ?? 0);
  /** Item discounts + whole-bill discount — shown on payment panel. */
  const totalDiscountShown =
    Math.round((lineDiscountsTotal + discountNum) * 100) / 100;

  const netMerchandise = Math.max(0, subtotal - discountNum - loyaltyOff);
  const discountRatio = subtotal > 0 ? (discountNum + loyaltyOff) / subtotal : 0;

  let totalTax = 0;
  let totalTaxable = 0;
  for (const l of cart) {
    const lineGross = l.unitPrice * l.qty;
    const lineNet = Math.max(0, lineGross * (1 - discountRatio));
    const productPct =
      l.taxRatePercent != null &&
      Number.isFinite(l.taxRatePercent) &&
      l.taxRatePercent > 0 &&
      l.taxRatePercent <= 28
        ? l.taxRatePercent
        : null;
    const rate = productPct != null ? productPct / 100 : taxSettings.rate;
    if (rate <= 0) {
      totalTaxable += lineNet;
      continue;
    }
    if (taxSettings.inclusive) {
      const taxable = lineNet / (1 + rate);
      const tax = lineNet - taxable;
      totalTaxable += taxable;
      totalTax += tax;
    } else {
      const tax = lineNet * rate;
      totalTaxable += lineNet;
      totalTax += tax;
    }
  }

  const taxAmount = Math.round(totalTax * 100) / 100;
  const taxableValue = Math.round(totalTaxable * 100) / 100;

  const diningModeForFees =
    orderType === "walk_in" ? (resourceId ? "dine_in" : "") : orderType;
  const diningFeeLines = foodFulfillment
    ? diningFeesFromConfig({
        diningMode: diningModeForFees,
        merchandiseAfterDiscount: netMerchandise,
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

  /** Exact ticket before nearest-rupee round-off: netMerchandise (+ tax if exclusive) + fees */
  const exactDue = Math.max(
    0,
    Math.round((taxSettings.inclusive ? netMerchandise + diningExtras : netMerchandise + taxAmount + diningExtras) * 100) / 100,
  );
  const paymentRound = roundOffForDisplay(exactDue);
  const applyCashRound = shouldApplyCashRoundOff(payMethod, {
    splitPay,
    splitSession: Boolean(splitSession),
  });
  /** Collectable total — half-up to nearest ₹ for sole cash, exactDue for digital/UPI/QR/card. */
  const totalDue = applyCashRound ? paymentRound.roundedTotal : exactDue;
  const paymentRoundOff = applyCashRound ? paymentRound.roundOff : 0;
  const splitPart = splitSession?.parts[splitSession.index] ?? null;
  const splitFollowUp = Boolean(splitSession?.orderId);
  const splitRemaining = splitSession
    ? splitSession.parts.length - splitSession.index
    : 0;
  const canSplitBill = true; // Universal POS — split / multi-tender for every shop
  const splitRemainingDue = splitSession
    ? splitSession.parts
        .slice(splitSession.index)
        .reduce((s, p) => s + p.amount, 0)
    : 0;
  const chargeAmount = (() => {
    if (splitPart) return splitPart.amount;
    if (!allowPartial) return totalDue;
    const entered = moneyNumber(payAmount || 0);
    if (entered <= 0) return totalDue;
    return Math.min(totalDue, entered);
  })();

  const settingsRoot =
    boot?.tenant?.settings && typeof boot.tenant.settings === "object"
      ? (boot.tenant.settings as Record<string, unknown>)
      : null;
  const configuredUpi = shopUpiFromPosSettings(settingsRoot);
  const shopMobile = shopPhoneFromTenantSettings(settingsRoot);

  useEffect(() => {
    if (!qrPhone && shopMobile) setQrPhone(shopMobile);
  }, [shopMobile, qrPhone]);

  const activeQrVpa = useMemo(() => {
    if (configuredUpi?.vpa) return configuredUpi.vpa;
    const custom = qrCustomVpa.trim();
    if (custom && isValidUpiVpa(custom)) return custom;
    const mobile = normalizeInMobile(qrPhone) ?? shopMobile;
    if (mobile) return vpaFromMobile(mobile, qrPsp);
    return "";
  }, [configuredUpi?.vpa, qrCustomVpa, qrPhone, qrPsp, shopMobile]);

  const activeQrPayee =
    configuredUpi?.payeeName || productName || "Universal POS";

  const tenderedNum = moneyNumber(cashTendered || 0);
  const changeDue =
    payMethod === "cash" && tenderedNum > 0
      ? cashChangeDue(tenderedNum, chargeAmount)
      : 0;
  const billTaxLines = cart.map((l) => {
    const lineGross = l.unitPrice * l.qty;
    const productPct =
      l.taxRatePercent != null &&
      Number.isFinite(l.taxRatePercent) &&
      l.taxRatePercent > 0 &&
      l.taxRatePercent <= 28
        ? l.taxRatePercent
        : null;
    const rateFrac =
      productPct != null ? productPct / 100 : taxSettings.rate;
    const tax = lineTaxAmount(lineGross, rateFrac, taxSettings.inclusive);
    return {
      lineTotal: lineGross,
      taxAmount: tax,
      taxRatePercent: rateFrac > 0 ? rateFrac * 100 : 0,
    };
  });
  const billSummary = buildBillSummary({
    itemsSubtotal: subtotal,
    grossMrp: grossMrpTotal,
    productDiscountTotal: lineDiscountsTotal,
    taxTotal: taxAmount,
    discount: discountNum,
    billDiscount: discountNum,
    loyaltyOff,
    fees: diningFeeLines,
    taxInclusive: taxSettings.inclusive,
    lines: billTaxLines,
    applyRoundOff: applyCashRound,
    amountDue: totalDue,
  });
  const payMethodConfirmLabel = (() => {
    const m = payMethod;
    if (m === "cash") return "Cash";
    if (m === "qr") return "QR";
    if (m === "store_credit") return "Wallet";
    if (m === "upi") return "UPI";
    if (m === "card") return "Card";
    if (m === "bank_transfer") return "Bank transfer";
    if (m === "gift_card") return "Gift card";
    if (m === "emi") return "EMI";
    if (m === "wallet") return "App pay";
    return m;
  })();
  const stillDueAfter = splitPart
    ? Math.max(
        0,
        Math.round((splitRemainingDue - chargeAmount) * 100) / 100,
      )
    : allowPartial
      ? Math.max(0, Math.round((totalDue - chargeAmount) * 100) / 100)
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
    foodType?: "veg" | "non_veg" | "egg" | null;
    recipeTracked?: boolean;
    productId?: string;
    pricingStrategy?: "converted" | "fixed_tier";
    entryUnits?: Array<{ unitId: string; symbol: string; name: string }>;
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
  },
    opts?: {
      setQty?: number;
      addQty?: number;
      unitPriceOverride?: number;
      sellingUnitId?: string;
      orderedUnitSymbol?: string;
      baseQty?: number;
      conversionFactor?: number;
    },
  ) {
    if (splitSession) {
      toast.message(
        "Split payment in progress — finish collecting parts before changing the ticket",
      );
      return;
    }
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
    const r = row as Record<string, any>;
    const rawMrp =
      r.mrp ??
      r.product?.mrp ??
      r.meta?.mrp ??
      null;
    const mrp =
      rawMrp != null && Number(rawMrp) > 0 ? Number(rawMrp) : undefined;
    const price =
      opts?.unitPriceOverride != null &&
      Number.isFinite(opts.unitPriceOverride)
        ? opts.unitPriceOverride
        : Number.isFinite(channelPrice) && channelPrice > 0
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
        const lineUnit = normalizeSellUnit(
          opts?.orderedUnitSymbol ?? existing.sellUnit ?? row.sellUnit,
        );
        const lineStep = qtyStep(lineUnit);
        let next: number;
        if (opts?.setQty != null && Number.isFinite(opts.setQty)) {
          next = normalizeQty(opts.setQty, lineUnit);
        } else {
          const add =
            opts?.addQty != null && Number.isFinite(opts.addQty)
              ? opts.addQty
              : lineStep;
          next = normalizeQty(existing.qty + add, lineUnit);
        }
        if (next <= 0) {
          return prev.filter(
            (l) =>
              !(
                l.stockLevelId === row.id &&
                (l.modifiers ?? []).join("|") === modKey
              ),
          );
        }
        if (tracks) {
          const factor =
            opts?.conversionFactor ?? existing.conversionFactor ?? 1;
          const need = opts?.baseQty ?? next * factor;
          if (need > onHand + 1e-9) {
            toast.error(
              `Only ${formatQtyWithUnit(onHand, row.sellUnit ?? unit)} in stock`,
            );
            return prev;
          }
        }
        return prev.map((l) =>
          l.stockLevelId === row.id &&
          (l.modifiers ?? []).join("|") === modKey
            ? {
                ...l,
                qty: next,
                mrp: mrp ?? l.mrp,
                ...(opts?.unitPriceOverride != null
                  ? {
                      unitPrice: opts.unitPriceOverride,
                      listPrice: opts.unitPriceOverride,
                    }
                  : {}),
                ...(opts?.sellingUnitId
                  ? { sellingUnitId: opts.sellingUnitId }
                  : {}),
                ...(opts?.orderedUnitSymbol
                  ? { sellUnit: opts.orderedUnitSymbol }
                  : {}),
                ...(opts?.baseQty != null ? { baseQty: opts.baseQty } : {}),
                ...(opts?.conversionFactor != null
                  ? { conversionFactor: opts.conversionFactor }
                  : {}),
                maxQty: tracks ? onHand : Math.max(l.maxQty, next + 100),
                sellUnit: opts?.orderedUnitSymbol
                  ? normalizeSellUnit(opts.orderedUnitSymbol)
                  : unit,
                image: l.image ?? image,
                listPrice: opts?.unitPriceOverride != null ? opts.unitPriceOverride : (l.listPrice ?? (mrp ?? price)),
                taxRatePercent: l.taxRatePercent ?? taxRatePercent,
                requiresVariant: row.requiresVariant === true,
                variantOptions: row.variantOptions ?? [],
                requiresBatch: row.requiresBatch === true,
                batchOptions: row.batchOptions ?? [],
                requiresSerial: row.requiresSerial === true,
                kind: row.kind ?? l.kind,
                foodType: row.foodType ?? l.foodType,
                modifiers: row.modifiers ?? l.modifiers,
              }
            : l,
        );
      }
      if (tracks && onHand <= 0) {
        toast.error("Out of stock — set opening qty / stock in Inventory first");
        return prev;
      }
      let startQty =
        opts?.setQty != null && Number.isFinite(opts.setQty)
          ? normalizeQty(opts.setQty, unit)
          : opts?.addQty != null && Number.isFinite(opts.addQty)
            ? normalizeQty(opts.addQty, unit)
            : normalizeQty(step, unit);
        if (tracks) {
          const need = opts?.baseQty ?? startQty;
          if (need > onHand + 1e-9) {
            toast.error(`Only ${formatQtyWithUnit(onHand, unit)} in stock`);
            return prev;
          }
        }
        if (startQty <= 0) {
          toast.error("Out of stock — set opening qty / stock in Inventory first");
          return prev;
        }
      const initialPrice = opts?.unitPriceOverride != null && Number.isFinite(opts.unitPriceOverride) ? opts.unitPriceOverride : price;
      return [
        ...prev,
        {
          stockLevelId: row.id,
          sku: row.sku,
          name: row.name,
          mrp: mrp,
          unitPrice: initialPrice,
          listPrice: mrp != null && mrp > initialPrice ? mrp : initialPrice,
          qty: startQty,
          maxQty: tracks ? onHand : 999999,
          sellUnit: opts?.orderedUnitSymbol
            ? normalizeSellUnit(opts.orderedUnitSymbol)
            : unit,
          sellingUnitId: opts?.sellingUnitId,
          baseQty: opts?.baseQty,
          conversionFactor: opts?.conversionFactor,
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
          foodType: row.foodType ?? null,
          modifiers: row.modifiers,
        },
      ];
    });
  }

  const lookup = useMutation({
    mutationFn: (sku: string) => posApi.saleLookup(sku, locationId),
    onSuccess: (row) => {
      const pendingQty = scanQtyRef.current;
      scanQtyRef.current = null;
      upsertLine(
        row,
        pendingQty != null ? { setQty: pendingQty } : undefined,
      );
      setScan("");
      toast.success(
        pendingQty != null
          ? `Added ${formatQtyWithUnit(pendingQty, row.sellUnit)} · ${row.name}`
          : `Added ${row.name}`,
      );
      scanRef.current?.focus();
    },
    onError: (e) => {
      scanQtyRef.current = null;
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "SKU not found",
      );
      scanRef.current?.select();
    },
  });

  function parseScanQtyCode(raw: string): { code: string; qty?: number } {
    const trimmed = raw.trim();
    const lead = trimmed.match(/^(\d+(?:\.\d+)?)\s*[*xX]\s*(.+)$/);
    if (lead) {
      const qty = Number(lead[1]);
      const code = lead[2].trim();
      if (Number.isFinite(qty) && qty > 0 && code) return { code, qty };
    }
    const trail = trimmed.match(/^(.+?)\s*[*xX]\s*(\d+(?:\.\d+)?)$/);
    if (trail) {
      const code = trail[1].trim();
      const qty = Number(trail[2]);
      if (Number.isFinite(qty) && qty > 0 && code) return { code, qty };
    }
    return { code: trimmed };
  }

  function openQtyPick(row: Parameters<typeof upsertLine>[0]) {
    if (splitSession) {
      toast.message(
        "Split payment in progress — finish collecting parts before changing the ticket",
      );
      return;
    }
    if (row.soldOut) {
      toast.error("86 / sold out");
      return;
    }
    const tracks = row.trackQty !== false && row.recipeTracked !== true;
    const onHand = Number(row.qtyOnHand);
    if (tracks && onHand <= 0) {
      toast.error("Out of stock — set opening qty / stock in Inventory first");
      return;
    }
    const inCart = cart.find((l) => l.stockLevelId === row.id);
    const unit = normalizeSellUnit(row.sellUnit);
    const entryUnits = row.entryUnits ?? [];
    const defaultEntry =
      entryUnits.find(
        (u) =>
          u.symbol.toLowerCase() === String(row.sellUnit ?? "").toLowerCase(),
      )?.unitId ||
      entryUnits[0]?.unitId ||
      "";
    setQtyPick({
      row,
      value: inCart
        ? String(inCart.qty)
        : String(qtyStep(unit) >= 1 ? 1 : qtyStep(unit)),
      maxQty: tracks ? onHand : 999999,
      tracks,
      entryUnitId: defaultEntry,
    });
  }

  async function applyQtyPick() {
    if (!qtyPick) return;
    const n = Number(qtyPick.value.trim().replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Enter a quantity greater than 0");
      return;
    }
    const row = qtyPick.row;
    const entryUnitId = qtyPick.entryUnitId;
    const entrySym =
      row.entryUnits?.find((u) => u.unitId === entryUnitId)?.symbol ??
      row.sellUnit;

    // Grocery / multi-unit: quote → cart qty in stock base unit + correct amount
    if (row.productId && entryUnitId && (row.entryUnits?.length ?? 0) > 0) {
      try {
        const quote = await catalogApi.quotePricingLine({
          productId: row.productId,
          enteredQty: n,
          sellingUnitId: entryUnitId,
        });
        const qtyBase = Number(quote.qtyBase);
        if (!(qtyBase > 0)) {
          toast.error("Quantity converts to zero in stock unit");
          return;
        }
        if (qtyPick.tracks && qtyBase > qtyPick.maxQty + 1e-9) {
          toast.error(
            `Only ${formatQtyWithUnit(qtyPick.maxQty, row.sellUnit)} available`,
          );
          return;
        }
        const unitPrice =
          quote.unitPrice != null
            ? Number(quote.unitPrice)
            : n > 0
              ? Number(quote.amount) / n
              : moneyNumber(row.sellPrice);
        setQtyPick(null);
        upsertLine(row, {
          setQty: n,
          unitPriceOverride: unitPrice,
          sellingUnitId: entryUnitId,
          orderedUnitSymbol: entrySym,
          baseQty: qtyBase,
          conversionFactor: Number(quote.conversionFactorUsed),
        });
        toast.success(
          `${formatQtyWithUnit(n, entrySym)} · ${money(Number(quote.amount))}`,
        );
        return;
      } catch (e) {
        // Fall through to plain qty if product has no base unit yet
        if (!(e instanceof ApiError && /base unit/i.test(e.message))) {
          toast.error(
            e instanceof ApiError ? e.messages.join(", ") : "Could not price qty",
          );
          return;
        }
      }
    }

    setQtyPick(null);
    upsertLine(row, { setQty: n });
    toast.success(
      `Qty ${formatQtyWithUnit(n, row.sellUnit)} · ${row.name}`,
    );
  }

  function commitCartLineQty(line: CartLine, raw: string) {
    const cleaned = raw.trim().replace(",", ".");
    if (cleaned === "") {
      setCart((prev) =>
        prev.filter((x) => x.stockLevelId !== line.stockLevelId),
      );
      setQtyDraft((d) => {
        const next = { ...d };
        delete next[line.stockLevelId];
        return next;
      });
      return;
    }
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("Enter a valid quantity");
      setQtyDraft((d) => {
        const next = { ...d };
        delete next[line.stockLevelId];
        return next;
      });
      return;
    }
    let next = normalizeQty(n, line.sellUnit);
    if (next <= 0) {
      setCart((prev) =>
        prev.filter((x) => x.stockLevelId !== line.stockLevelId),
      );
    } else {
      const factor = line.conversionFactor ?? 1;
      const needBase = next * factor;
      if (needBase > line.maxQty + 1e-9) {
        toast.error(
          `Only ${formatQtyWithUnit(line.maxQty, line.sellUnit)} available`,
        );
        next = line.conversionFactor && line.conversionFactor > 0
          ? normalizeQty(line.maxQty / line.conversionFactor, line.sellUnit)
          : normalizeQty(line.maxQty, line.sellUnit);
      }
      setCart((prev) =>
        prev.map((x) =>
          x.stockLevelId === line.stockLevelId ? { ...x, qty: next } : x,
        ),
      );
    }
    setQtyDraft((d) => {
      const nextDraft = { ...d };
      delete nextDraft[line.stockLevelId];
      return nextDraft;
    });
  }

  function resolveScan(code: string) {
    const parsed = parseScanQtyCode(code);
    const trimmed = parsed.code;
    if (!trimmed) return;
    const qty = parsed.qty;
    const norm = trimmed.toLowerCase();
    const local = (catalog.data?.items ?? []).find((s) => {
      const sku = s.sku?.toLowerCase();
      const productSku = s.productSku?.toLowerCase();
      const barcode = s.barcode?.toLowerCase();
      return sku === norm || productSku === norm || barcode === norm;
    });
    if (local) {
      upsertLine(local, qty != null ? { setQty: qty } : undefined);
      setScan("");
      toast.success(
        qty != null
          ? `Added ${formatQtyWithUnit(qty, local.sellUnit)} · ${local.name}`
          : `Added ${local.name}`,
      );
      scanRef.current?.focus();
      return;
    }
    scanQtyRef.current = qty ?? null;
    lookup.mutate(trimmed);
  }

  function onScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    resolveScan(scan);
  }

  function resetAfterFullSale() {
    setCart([]);
    setQtyDraft({});
    setQtyPick(null);
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

  /** Create GST invoice for a completed split part and open the receipt. */
  async function showSplitPartInvoice(
    orderId: string,
    orderNumber: string,
    part: SplitBillPart,
    partIndex: number,
    opts?: {
      change?: string | number | null;
      cashTendered?: string | number | null;
      invoiceFromCheckout?: {
        invoiceNumber?: string;
        id?: string;
      } | null;
      done?: boolean;
    },
  ) {
    let invoiceNumber = opts?.invoiceFromCheckout?.invoiceNumber ?? null;
    try {
      if (!invoiceNumber) {
        const inv = await billingApi.createInvoice(orderId, {
          amount: part.amount,
          splitPartIndex: partIndex,
          splitPartLabel: part.label,
        });
        invoiceNumber = inv.invoiceNumber;
      }
    } catch {
      /* checkout may have already minted this part */
    }
    const receiptData = (await posApi.receipt(orderId)) as ReceiptData;
    setReceipt({
      data: {
        ...receiptData,
        activeInvoiceNumber:
          invoiceNumber ||
          receiptData.invoices?.find((i) => {
            const b = i.taxBreakdown ?? {};
            return Number(b.splitPartIndex) === partIndex;
          })?.invoiceNumber ||
          receiptData.invoices?.[receiptData.invoices.length - 1]
            ?.invoiceNumber ||
          null,
        activeInvoiceLabel: part.label,
      },
      change: opts?.change ?? 0,
      cashTendered: opts?.cashTendered ?? null,
    });
    toast.success(
      opts?.done
        ? `${orderNumber} · ${part.label} invoice · all parts done`
        : `${orderNumber} · ${part.label} invoice created`,
    );
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
        await showSplitPartInvoice(
          splitSession.orderId,
          splitSession.orderNumber || "",
          splitPart,
          splitSession.index,
          {
            change: changeDue,
            cashTendered: tenderedNum > 0 ? tenderedNum : null,
            done: true,
          },
        );
        resetAfterFullSale();
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
        await showSplitPartInvoice(
          splitSession.orderId,
          splitSession.orderNumber || "",
          splitPart,
          splitSession.index,
        );
        const leftover = scalePartsToTotal(
          splitSession.parts.slice(next),
          Math.max(0, due - payAmt),
        );
        setSplitSession({
          ...splitSession,
          index: next,
          parts: [...splitSession.parts.slice(0, next), ...leftover],
        });
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
      toast.error("Enter the gift card code");
      return;
    }
    if (payMethod === "collect_later" && !customerId) {
      toast.error("Select a customer for pay-on-pickup / credit");
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
    if (payMethod === "qr" && !activeQrVpa) {
      toast.error(
        "Enter shop mobile or UPI ID for QR — or set UPI ID in Settings → Counter",
      );
      return;
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
    if (orderType === "delivery" && deliveryPhone.trim()) {
      if (!validatePhoneE164(deliveryPhone.trim())) {
        toast.error("Enter a valid delivery phone for the selected country");
        return;
      }
    }

    chargeLock.current = true;
    setBusy(true);
    try {
      // Cash needs a register session — open one quietly if the shift was never started.
      if (
        (payMethod === "cash" ||
          (splitPay && moneyNumber(splitCashAmount || 0) > 0)) &&
        !registerSession?.id &&
        locationId
      ) {
        try {
          await posApi.openRegister({
            locationId,
            openingFloat: moneyNumber(openingFloat || 0),
          });
          void qc.invalidateQueries({ queryKey: ["pos-sale-register"] });
        } catch (regErr) {
          // Already open elsewhere is fine; other errors surface on checkout.
          const msg =
            regErr instanceof ApiError ? regErr.messages.join(" ") : "";
          if (!/already open/i.test(msg)) {
            /* continue — API also auto-opens on cash */
          }
        }
      }

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
          ...(l.sellingUnitId ? { sellingUnitId: l.sellingUnitId } : {}),
          ...(l.variantId ? { variantId: l.variantId } : {}),
          ...(l.batchId ? { batchId: l.batchId } : {}),
          ...(l.serialNumber?.trim()
            ? { serialNumber: l.serialNumber.trim() }
            : {}),
          ...(l.modifiers?.length ? { modifiers: l.modifiers } : {}),
        })),
        ...(discountNum > 0 ? { discountAmount: discountNum } : {}),
        ...(applyCashRound && Math.abs(paymentRoundOff) >= 0.005
          ? { roundOffAmount: paymentRoundOff }
          : {}),
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
          ...(deliveryPhone.trim()
            ? { guestPhone: canonicalPhoneE164(deliveryPhone.trim()) }
            : {}),
          ...(deliveryAddress.trim()
            ? { deliveryAddress: deliveryAddress.trim() }
            : {}),
          ...(applyCashRound && Math.abs(paymentRoundOff) >= 0.005
            ? {
                roundOff: paymentRoundOff,
                exactTotal: exactDue,
                roundedTotal: totalDue,
              }
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
            splitContinue: Boolean(splitSession),
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
        const part = splitSession.parts[splitSession.index];
        const inv = (
          result as {
            invoice?: { invoiceNumber?: string; id?: string } | null;
          }
        ).invoice;
        if (remaining <= 0.009) {
          if (part) {
            await showSplitPartInvoice(
              result.order.id,
              result.order.orderNumber,
              part,
              splitSession.index,
              {
                change: result.change,
                cashTendered: result.cashTendered,
                invoiceFromCheckout: inv,
                done: true,
              },
            );
          } else {
            setReceipt({
              data: result.receipt as ReceiptData,
              change: result.change,
              cashTendered: result.cashTendered,
            });
          }
          resetAfterFullSale();
          clearPaymentAttemptKey();
          void qc.invalidateQueries({ queryKey: ["pos-sale-catalog"] });
          return;
        }
        if (part) {
          await showSplitPartInvoice(
            result.order.id,
            result.order.orderNumber,
            part,
            splitSession.index,
            { invoiceFromCheckout: inv },
          );
        }
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
        setCashTendered("");
        clearPaymentAttemptKey();
        // Keep ticket lines visible while collecting remaining split parts
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
            ...(l.sellingUnitId ? { sellingUnitId: l.sellingUnitId } : {}),
            ...(l.variantId ? { variantId: l.variantId } : {}),
            ...(l.batchId ? { batchId: l.batchId } : {}),
            ...(l.serialNumber?.trim()
              ? { serialNumber: l.serialNumber.trim() }
              : {}),
            ...(l.modifiers?.length ? { modifiers: l.modifiers } : {}),
          })),
          ...(discountNum > 0 ? { discountAmount: discountNum } : {}),
          ...(Math.abs(paymentRoundOff) >= 0.005
            ? { roundOffAmount: paymentRoundOff }
            : {}),
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
            ...(deliveryPhone.trim()
            ? { guestPhone: canonicalPhoneE164(deliveryPhone.trim()) }
            : {}),
            ...(Math.abs(paymentRoundOff) >= 0.005
              ? {
                  roundOff: paymentRoundOff,
                  exactTotal: exactDue,
                  roundedTotal: totalDue,
                }
              : {}),
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

  async function parkCart(): Promise<boolean> {
    if (!locationId || !cart.length) {
      toast.error("Cart is empty");
      return false;
    }
    if (splitSession) {
      toast.message("Finish or cancel the split payment before saving a draft");
      return false;
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
          ...(l.sellingUnitId ? { sellingUnitId: l.sellingUnitId } : {}),
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
      setCustomerId("");
      setOrderNote("");
      setCashTendered("");
      toast.success(
        `Draft saved ${parkedSale.orderNumber} — open from Drafts on Counter`,
      );
      void qc.invalidateQueries({ queryKey: ["pos-sale-parked"] });
      return true;
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Park failed",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  function discardTicket() {
    setCart([]);
    setDiscountAmount("");
    setParkLabel("");
    setCashTendered("");
    setCustomerId("");
    setOrderNote("");
    setAllowPartial(false);
    setPayAmount("");
    setSplitPay(false);
    setSplitCashAmount("");
    setSplitSession(null);
    setPayModal(null);
    scanRef.current?.focus();
  }

  // Register dirty ticket with shell — Leave / Switch shop asks Save or discard
  useEffect(() => {
    const dirty =
      cart.length > 0 || Boolean(splitSession) || Boolean(stripeCheckout);
    const summary = splitSession
      ? `Split payment open · ${money(totalDue)} still on this ticket`
      : stripeCheckout
        ? "Card / UPI payment in progress"
        : cart.length
          ? `${cart.length} line${cart.length === 1 ? "" : "s"} · ${money(totalDue)}`
          : "";
    useUnsavedWorkStore.getState().register({
      dirty,
      summary,
      canSave: cart.length > 0 && !splitSession && !stripeCheckout,
      saveLabel: "Save draft",
      onSave: () => parkCart(),
      onDiscard: () => discardTicket(),
    });
    return () => {
      useUnsavedWorkStore.getState().clear();
    };
    // parkCart/discard close over latest state when invoked from dialog
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    cart,
    splitSession,
    stripeCheckout,
    totalDue,
    customerId,
    discountNum,
    parkLabel,
    locationId,
  ]);

  async function resumeParked(orderId: string) {
    if (splitSession) {
      toast.message("Finish or cancel the split payment first");
      return;
    }
    if (cart.length) {
      toast.message("Clear or save the current ticket before opening a draft");
      return;
    }
    setBusy(true);
    try {
      const resumed = await posApi.resumeParkedSale(orderId);
      const lines: CartLine[] = resumed.cart.map((l) => ({
        stockLevelId: l.stockLevelId,
        sku: l.sku,
        name: l.name,
        unitPrice: l.unitPrice,
        listPrice: l.unitPrice,
        qty: l.qty,
        maxQty: Math.max(l.maxQty, l.qty),
        sellUnit: normalizeSellUnit(l.sellUnit ?? "pcs"),
        sellingUnitId: (l as { sellingUnitId?: string }).sellingUnitId,
        baseQty: (l as { baseQty?: number }).baseQty,
      }));
      if (!lines.length) {
        toast.error("This draft has no items");
        return;
      }
      setCart(lines);
      setCustomerId(resumed.customerId ?? "");
      setDiscountAmount(
        resumed.discountAmount > 0 ? String(resumed.discountAmount) : "",
      );
      setOrderNote(resumed.note ?? "");
      await posApi.discardParkedSale(orderId).catch(() => null);
      void qc.invalidateQueries({ queryKey: ["pos-sale-parked"] });
      setPayModal(null);
      toast.success(`Opened draft ${resumed.orderNumber}`);
      scanRef.current?.focus();
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Could not open draft",
      );
    } finally {
      setBusy(false);
    }
  }

  async function discardParked(orderId: string) {
    setBusy(true);
    try {
      await posApi.discardParkedSale(orderId);
      void qc.invalidateQueries({ queryKey: ["pos-sale-parked"] });
      toast.success("Draft discarded");
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Could not discard",
      );
    } finally {
      setBusy(false);
    }
  }

  function openRateEdit(line: CartLine) {
    const base = cartLineListPrice(line);
    const discPct = cartLineDiscountPercent(line);
    const markupPct =
      base > 0 && line.unitPrice > base + 0.001
        ? Math.round(((line.unitPrice / base - 1) * 100) * 100) / 100
        : 0;
    setRateEdit({
      stockLevelId: line.stockLevelId,
      amount: String(line.unitPrice),
      percent:
        discPct > 0
          ? String(-discPct)
          : markupPct > 0
            ? String(markupPct)
            : "",
    });
  }

  function applyRateEdit() {
    if (!rateEdit) return;
    const next = moneyNumber(rateEdit.amount || 0);
    if (!Number.isFinite(next) || next < 0) {
      toast.error("Enter a valid price");
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

  function setCartLineDiscount(
    stockLevelId: string,
    opts: { percent?: number; amountOffPerUnit?: number; reset?: boolean },
  ) {
    setCart((prev) =>
      prev.map((x) => {
        if (x.stockLevelId !== stockLevelId) return x;
        const base = cartLineListPrice(x);
        if (opts.reset) {
          return { ...x, unitPrice: Math.round(base * 100) / 100 };
        }
        return {
          ...x,
          unitPrice: unitPriceAfterLineDiscount(base, opts),
        };
      }),
    );
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
      const part = splitSession.parts[splitSession.index];
      if (!part) {
        resetAfterFullSale();
      } else {
        const currentPartRemaining = Math.max(0, part.amount - amount);
        const partFullyPaid = currentPartRemaining <= 0.009;
        const next = partFullyPaid ? splitSession.index + 1 : splitSession.index;
        const last =
          partFullyPaid &&
          (next >= splitSession.parts.length || amount + 0.001 >= totalDue);
        if (!partFullyPaid) {
          const updatedParts = [...splitSession.parts];
          updatedParts[splitSession.index] = {
            ...part,
            amount: roundMoney(currentPartRemaining),
          };
          setSplitSession({
            ...splitSession,
            parts: updatedParts,
            orderId,
            orderNumber,
          });
          toast.success(
            `Collected ${money(amount)} · Part ${splitSession.index + 1} remaining: ${money(currentPartRemaining)}`,
          );
        } else {
          await showSplitPartInvoice(
            orderId,
            orderNumber,
            part,
            splitSession.index,
            { done: last },
          );
          if (last) {
            resetAfterFullSale();
          } else {
            const leftover = scalePartsToTotal(
              splitSession.parts.slice(next),
              Math.max(0, totalDue - amount),
            );
            setSplitSession({
              ...splitSession,
              index: next,
              orderId,
              orderNumber,
              parts: [...splitSession.parts.slice(0, next), ...leftover],
            });
          }
        }
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
    if (splitSession) {
      toast.message(
        "Finish or cancel the split payment before clearing the ticket",
      );
      return;
    }
    if (cart.length) {
      guardedAction(() => discardTicket());
      return;
    }
    discardTicket();
  }

  return (
    <div
      className={cn(
        "relative bg-white",
        compact
          ? "rounded-xl p-2"
          : "min-h-0 -mx-1 px-1 pb-3 sm:-mx-2 sm:px-2",
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
        <header className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-2xl bg-white px-4 py-2.5">
          <p className="text-sm font-semibold text-[#0b1f33]">
            {productName}
            <span className="ml-2 font-normal text-[#8b9bb0]">
              Counter · scan &amp; charge
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setPayModal("drafts")}
            >
              Drafts
              {parkedItems.length > 0 ? (
                <span className="ml-1.5 rounded-full bg-[#1a56db] px-1.5 py-0.5 text-[0.65rem] font-bold text-white">
                  {parkedItems.length > 99 ? "99+" : parkedItems.length}
                </span>
              ) : null}
            </Button>
            {canApproveRefund(roles) ? (
              <Link href="/returns">
                <Button type="button" size="sm" variant="secondary">
                  Returns
                </Button>
              </Link>
            ) : null}
            {actingUser ? (
              <span className="rounded-full bg-[#f1f5f9] px-2.5 py-1 text-xs font-medium text-[#5a6b7d]">
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
        <div className="mb-2 shrink-0 rounded-xl border border-[#f5c2c2] bg-[#fff6f6] px-3 py-2 text-sm text-[#a01818]">
          Offline — Sale counter needs internet to charge. Reconnect, then try
          again.
        </div>
      ) : offlinePending > 0 ? (
        <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-[#c9d7f5] bg-[#e8eefb] px-3 py-2 text-sm text-[#1341a8]">
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

      <div className="grid grid-cols-[minmax(0,1.45fr)_minmax(300px,0.7fr)] items-stretch gap-3">
        <section className="flex h-0 min-h-full flex-col overflow-hidden rounded-xl border border-[#e2e8f0] bg-white">
          <div className="shrink-0 space-y-2 border-b border-[#eef2f8] bg-white p-3">
            <BarcodeScanInput
              value={scan}
              onChange={setScan}
              onScan={resolveScan}
              label=""
              placeholder="Scan barcode / SKU · bulk: 455*SKU"
              disabled={lookup.isPending}
              autoFocus
              inputRef={scanRef}
            />
            {/* keep form handler for keyboard Submit key accessibility without double UI */}
            <form onSubmit={onScanSubmit} className="hidden" aria-hidden>
              <button type="submit" tabIndex={-1} />
            </form>

            <div className="flex flex-wrap items-center gap-2">
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
                  placeholder="Search"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="h-9 border-[#e2e8f0] bg-[#f8fafc] pl-9 shadow-none"
                />
              </div>

              <button
                type="button"
                onClick={() => setLowStockOnly((v) => !v)}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition",
                  lowStockOnly
                    ? "bg-[#fff7ed] text-[#9a3412] ring-1 ring-[#fdba74]"
                    : "bg-[#f8fafc] text-[#5a6b7d] ring-1 ring-[#e2e8f0] hover:text-[#0b1f33]",
                )}
              >
                Low stock
              </button>

              {categories.length ? (
                <div className="field-shell min-w-[8.5rem] max-w-[12rem] flex-1">
                  <Label className="sr-only">Category</Label>
                  <Select
                    className="flex h-9 w-full rounded-md border border-[#e2e8f0] bg-[#f8fafc] px-2.5 text-sm text-[#0b1f33]"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="all">All</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-[#f4f6fa]">
            <ul
              className={cn(
                "grid min-h-full content-start gap-3 p-3",
                compact
                  ? "grid-cols-2 sm:grid-cols-3"
                  : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5",
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
                const stock = productStockHint({
                  kind: row.kind,
                  trackQty: row.trackQty,
                  recipeTracked: row.recipeTracked,
                  available,
                  qtyLeftLabel: formatQtyWithUnit(available, row.sellUnit),
                });
                return (
                  <li key={row.id} className="min-w-0">
                    <div
                      role="button"
                      tabIndex={stock.tone === "out" ? -1 : 0}
                      onClick={() => {
                        if (stock.tone !== "out") upsertLine(row);
                      }}
                      onKeyDown={(e) => {
                        if (
                          (e.key === "Enter" || e.key === " ") &&
                          stock.tone !== "out"
                        ) {
                          e.preventDefault();
                          upsertLine(row);
                        }
                      }}
                      className={cn(
                        "group flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-xl border border-[#e2e8f0] bg-white text-left shadow-[0_1px_2px_rgba(11,31,51,0.04)] transition hover:border-[#1a56db]/50 hover:shadow-[0_2px_8px_rgba(26,86,219,0.08)]",
                        inCart &&
                          "border-[#1a56db] bg-[#f5f8ff] shadow-[0_0_0_1px_rgba(26,86,219,0.2)]",
                        stock.tone === "out" &&
                          "cursor-not-allowed opacity-55 hover:border-[#e2e8f0] hover:shadow-[0_1px_2px_rgba(11,31,51,0.04)]",
                      )}
                    >
                      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-[#f8fafc]">
                        <ProductThumb
                          src={src}
                          label={row.name}
                          size="fill"
                          className="!rounded-none border-0 bg-[#f8fafc] shadow-none ring-0"
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
                        <span
                          className={cn(
                            "absolute top-1.5 left-1.5 z-[1] max-w-[calc(100%-0.75rem)] truncate rounded-md bg-white/95 px-1.5 py-0.5 text-[0.62rem] font-bold shadow-sm",
                            stock.tone === "out"
                              ? "text-[#c81e1e]"
                              : stock.tone === "low"
                                ? "text-[#9a3412]"
                                : stock.tone === "info"
                                  ? "text-[#1a56db]"
                                  : "text-[#0f766e]",
                          )}
                        >
                          {stock.label}
                        </span>
                        {row.foodType ? (
                          <span className="absolute top-1.5 right-1.5 z-[1]">
                            <FoodTypeBadge
                              value={row.foodType}
                              showLabel
                              size="sm"
                            />
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-end justify-between gap-2 px-2.5 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 min-h-[2rem] text-[0.8125rem] leading-snug font-semibold text-[#0b1f33]">
                            {row.name}
                          </p>
                          {(() => {
                            const r = row as Record<string, any>;
                            const rawMrp =
                              r.mrp ??
                              r.product?.mrp ??
                              r.meta?.mrp ??
                              null;
                            const mrpNum =
                              rawMrp != null && Number(rawMrp) > 0
                                ? Number(rawMrp)
                                : 0;
                            const sellNum = Number(row.sellPrice);
                            const hasDisc = mrpNum > sellNum + 0.001;
                            const discPct = hasDisc
                              ? Math.round((1 - sellNum / mrpNum) * 100)
                              : 0;
                            return (
                              <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
                                {hasDisc ? (
                                  <>
                                    <span className="text-[0.7rem] text-[#8b9bb0] line-through">
                                      {money(mrpNum)}
                                    </span>
                                    <span className="rounded bg-emerald-50 px-1 py-0.2 text-[0.62rem] font-bold text-emerald-700">
                                      {discPct}% OFF
                                    </span>
                                  </>
                                ) : null}
                                <span className="text-[0.875rem] font-bold tabular-nums leading-none text-[#1a56db]">
                                  {money(sellNum)}
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                        <span
                          role="button"
                          tabIndex={stock.tone === "out" ? -1 : 0}
                          title="Tap to type quantity (e.g. 455)"
                          className={cn(
                            "grid h-8 min-w-8 place-items-center rounded-full px-1.5 text-sm font-bold transition",
                            stock.tone === "out"
                              ? "bg-[#f1f5f9] text-[#94a3b8]"
                              : inCart
                                ? "bg-[#1a56db] text-white shadow-sm"
                                : "bg-[#e8eefb] text-[#1a56db] group-hover:bg-[#1a56db] group-hover:text-white",
                          )}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (stock.tone === "out") return;
                            openQtyPick(row);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              if (stock.tone !== "out") openQtyPick(row);
                            }
                          }}
                        >
                          {inCart ? inCart.qty : "+"}
                        </span>
                      </div>
                    </div>
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

        <aside className="flex min-h-0 flex-col self-start overflow-hidden rounded-xl border border-[#e2e8f0] bg-white">
          <div className="flex items-center justify-between gap-2 border-b border-[#eef2f8] px-3 py-2.5">
            <div>
              <p className="text-sm font-semibold text-[#0b1f33]">
                {cart.length
                  ? `${cart.reduce((n, l) => n + l.qty, 0)} item${
                      cart.reduce((n, l) => n + l.qty, 0) === 1 ? "" : "s"
                    }`
                  : "Ticket"}
              </p>
              {!cart.length ? (
                <p className="text-[0.7rem] text-[#8b9bb0]">
                  Tap a product to add
                </p>
              ) : null}
            </div>
            {cart.length ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-[#c81e1e] hover:bg-[#fff6f6] hover:text-[#a01818]"
                onClick={clearCart}
              >
                Clear
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-[#1a56db] hover:bg-[#eef4ff]"
                onClick={() => setPayModal("drafts")}
              >
                Drafts
                {parkedItems.length > 0 ? ` (${parkedItems.length})` : ""}
              </Button>
            )}
          </div>
          <div className="border-b border-[#eef2f8] px-3 py-2">
            <button
              type="button"
              onClick={() => setPayModal("customer")}
              className="flex min-h-9 w-full items-center justify-between gap-2 rounded-md bg-[#f8fafc] px-2.5 py-1.5 text-left ring-1 ring-[#e8edf4] hover:ring-[#c5d0e0]"
            >
              <span className="min-w-0 truncate">
                {customerId ? (
                  <>
                    <span className="block truncate text-sm font-medium text-[#0b1f33]">
                      {customerWalletQ.data?.fullName ?? "Customer"}
                    </span>
                    <span className="block truncate text-[0.65rem] tabular-nums text-[#8b9bb0]">
                      {customerWalletQ.data?.phone
                        ? `${customerWalletQ.data.phone} · `
                        : ""}
                      wallet {money(walletBalance)}
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-[#8b9bb0]">
                    Walk-in customer
                  </span>
                )}
              </span>
              <span className="shrink-0 text-[0.7rem] font-semibold text-[#1a56db]">
                {customerId ? "Change" : "Add"}
              </span>
            </button>
          </div>

          {foodFulfillment || resourceDesk ? (
            <div className="space-y-1.5 border-b border-[#e8edf4] px-4 py-3">
              <Label className="text-[0.65rem] font-semibold tracking-[0.12em] text-[#8b9bb0] uppercase">
                Order details
              </Label>
              <button
                type="button"
                onClick={() => setPayModal("orderDetails")}
                className="flex min-h-9 w-full items-center justify-between gap-2 rounded-md border border-[#d9e0ea] bg-white px-2.5 py-1.5 text-left hover:border-[#c5d0e0]"
              >
                <span className="min-w-0 truncate text-sm text-[#0b1f33]">
                  {(() => {
                    const parts: string[] = [];
                    if (foodFulfillment) {
                      parts.push(
                        orderType.replaceAll("_", " ") || "Walk-in",
                      );
                    }
                    if (hasCapability("TABLE") && selectedDiningTable) {
                      parts.push(
                        `${selectedDiningTable.floorName ? `${selectedDiningTable.floorName} · ` : ""}${selectedDiningTable.name}`,
                      );
                    } else if (resourceDesk && resourceId) {
                      const r = (resources.data?.data ?? []).find(
                        (x) => x.id === resourceId,
                      );
                      if (r) parts.push(r.name);
                    }
                    if (foodFulfillment && hasCapability("TABLE")) {
                      parts.push(
                        `${guestCount || "1"} guest${Number(guestCount) === 1 ? "" : "s"}`,
                      );
                    }
                    if (orderNote.trim()) parts.push("note");
                    return parts.length
                      ? parts
                          .map((p) =>
                            p.replace(/\b\w/g, (c) => c.toUpperCase()),
                          )
                          .join(" · ")
                      : "Type, table, covers, notes…";
                  })()}
                </span>
                <span className="shrink-0 text-[0.7rem] font-semibold text-[#1a56db]">
                  Edit
                </span>
              </button>
            </div>
          ) : null}

          {/* <div className="border-b border-[#e8edf4] px-4 py-3">
            
          </div> */}

          <ul className="max-h-[min(48vh,26rem)] min-h-[8rem] flex-1 space-y-3.5 overflow-y-auto px-3 py-3">
            {cart.map((l) => {
              const unitSellingPrice = l.unitPrice;
              const lineMrp =
                l.mrp && l.mrp > 0
                  ? l.mrp
                  : l.listPrice > 0
                    ? l.listPrice
                    : unitSellingPrice;
              const hasLineDiscount = lineMrp > unitSellingPrice + 0.001;
              const discPct = hasLineDiscount
                ? Math.round(((1 - unitSellingPrice / lineMrp) * 100) * 10) / 10
                : 0;
              const rateChanged =
                Math.abs(l.unitPrice - (l.listPrice ?? l.unitPrice)) > 0.005 &&
                (l.listPrice ?? 0) > 0;
              const ratePct =
                rateChanged && (l.listPrice ?? 0) > 0
                  ? Math.round(
                      ((l.unitPrice - (l.listPrice ?? l.unitPrice)) /
                        (l.listPrice ?? l.unitPrice)) *
                        100,
                    )
                  : 0;
              const lineProductDiscount =
                Math.round(
                  Math.max(0, lineMrp - unitSellingPrice) * l.qty * 100,
                ) / 100;
              const lineNet =
                Math.round(unitSellingPrice * l.qty * 100) / 100;
              const unitLbl = priceUnitLabel(l.sellUnit);
              const unitShort = unitLbl.replace(/^per\s+/i, "") || "pcs";
              return (
              <li
                key={l.stockLevelId}
                className="rounded-2xl border border-[#e8edf4] bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
              >
                <div className="flex gap-3">
                  <ProductThumb
                    src={l.image}
                    label={l.name}
                    size="md"
                    className="h-16 w-16 shrink-0 rounded-xl"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 pr-1">
                        <p className="flex min-w-0 items-center gap-1.5 text-[0.875rem] font-semibold text-[#0b1f33]">
                          {l.foodType ? (
                            <FoodTypeBadge value={l.foodType} className="shrink-0" />
                          ) : null}
                          <span className="truncate">{l.name}</span>
                        </p>
                        <div className="mt-1 space-y-0.5 text-[0.75rem] tabular-nums">
                          {hasLineDiscount ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[#8b9bb0] line-through decoration-[#94a3b8]">
                                MRP {money(lineMrp)}
                              </span>
                              <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[0.65rem] font-bold text-emerald-800">
                                {discPct}% OFF
                              </span>
                              <span className="font-bold text-[#0b1f33]">
                                {money(unitSellingPrice)}
                              </span>
                              <span className="text-[#8b9bb0]">
                                · {l.qty} {unitShort}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-[#8b9bb0]">
                              <span className="font-semibold text-[#0b1f33]">
                                {money(unitSellingPrice)}
                              </span>
                              <span>
                                · {l.qty} {unitShort}
                              </span>
                            </div>
                          )}
                          {hasLineDiscount ? (
                            <div className="flex flex-wrap items-center gap-1.5 text-[0.7rem] text-[#64748b]">
                              <span>Product discount {money(lineProductDiscount)}</span>
                              <span>·</span>
                              <span className="font-semibold text-[#0f172a]">
                                Net {money(lineNet)}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <p className="text-[0.9375rem] font-bold tabular-nums text-[#0b1f33]">
                          {money(lineNet)}
                        </p>
                        <button
                          type="button"
                          disabled={Boolean(splitSession)}
                          className="grid h-7 w-7 place-items-center rounded-md text-[#94a3b8] transition hover:bg-[#fff1f1] hover:text-[#c81e1e] disabled:opacity-40"
                          title="Remove item"
                          aria-label={`Remove ${l.name}`}
                          onClick={() =>
                            setCart((prev) =>
                              prev.filter(
                                (x) => x.stockLevelId !== l.stockLevelId,
                              ),
                            )
                          }
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                            <path
                              d="M3 4.5h10M6 4.5V3.5a1 1 0 011-1h2a1 1 0 011 1v1M5.5 4.5l.5 8h4l.5-8"
                              stroke="currentColor"
                              strokeWidth="1.4"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="flex shrink-0 items-center rounded-lg border border-[#e2e8f0] bg-white">
                          <button
                            type="button"
                            disabled={Boolean(splitSession)}
                            className="grid h-8 w-8 place-items-center text-sm font-bold text-[#0b1f33] transition hover:bg-[#f8fafc] disabled:opacity-40"
                            onClick={() =>
                              setCart((prev) =>
                                prev
                                  .map((x) => {
                                    if (x.stockLevelId !== l.stockLevelId)
                                      return x;
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
                          <input
                            type="text"
                            inputMode={
                              allowsDecimalQty(l.sellUnit)
                                ? "decimal"
                                : "numeric"
                            }
                            className="h-8 w-14 border-0 bg-transparent text-center text-sm font-bold tabular-nums text-[#0b1f33] outline-none disabled:opacity-40"
                            aria-label={`Quantity for ${l.name}`}
                            title="Type quantity (e.g. 455)"
                            value={
                              qtyDraft[l.stockLevelId] !== undefined
                                ? qtyDraft[l.stockLevelId]
                                : String(l.qty)
                            }
                            disabled={Boolean(splitSession)}
                            onFocus={(e) => {
                              setQtyDraft((d) => ({
                                ...d,
                                [l.stockLevelId]: String(l.qty),
                              }));
                              e.target.select();
                            }}
                            onChange={(e) => {
                              const v = e.target.value.replace(",", ".");
                              if (v !== "" && !/^\d*\.?\d*$/.test(v)) return;
                              setQtyDraft((d) => ({
                                ...d,
                                [l.stockLevelId]: v,
                              }));
                            }}
                            onBlur={() =>
                              commitCartLineQty(
                                l,
                                qtyDraft[l.stockLevelId] ?? String(l.qty),
                              )
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                          />
                          <button
                            type="button"
                            disabled={Boolean(splitSession)}
                            className="grid h-8 w-8 place-items-center text-sm font-bold text-[#0b1f33] transition hover:bg-[#f8fafc] disabled:opacity-40"
                            onClick={() =>
                              setCart((prev) =>
                                prev.map((x) => {
                                  if (x.stockLevelId !== l.stockLevelId)
                                    return x;
                                  const step = qtyStep(x.sellUnit);
                                  const next = normalizeQty(
                                    x.qty + step,
                                    x.sellUnit,
                                  );
                                  const factor = x.conversionFactor ?? 1;
                                  const needBase = next * factor;
                                  if (needBase > x.maxQty + 1e-9) {
                                    toast.error(
                                      `Only ${formatQtyWithUnit(x.maxQty, x.sellUnit)} available`,
                                    );
                                    return x;
                                  }
                                  return { ...x, qty: next };
                                }),
                              )
                            }
                          >
                            +
                          </button>
                        </div>
                        <span className="text-[0.8125rem] font-medium text-[#8b9bb0]">
                          {unitShort}
                        </span>
                      </div>
                      <button
                        type="button"
                        className={cn(
                          "text-[0.8125rem] font-semibold",
                          discPct > 0
                            ? "text-[#c2410c] hover:underline"
                            : rateChanged
                              ? "text-[#c2410c] hover:underline"
                              : "text-[#1a56db] hover:underline",
                        )}
                        title="Change price or discount for this item only"
                        onClick={() => openRateEdit(l)}
                      >
                        {discPct > 0
                          ? `−${discPct}%`
                          : rateChanged
                            ? `${ratePct > 0 ? "+" : ""}${ratePct}%`
                            : "Disc"}
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
              <li className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
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

          <div className="mt-auto space-y-2.5 border-t border-[#eef2f8] bg-[#fafbfc] p-3">
            <div className="space-y-2 rounded-xl border border-[#e2e8f0] bg-white px-3 py-3 shadow-[0_1px_2px_rgba(11,31,51,0.04)]">
              <BillTotalsLines
                summary={billSummary}
                discount={totalDiscountShown}
                loyaltyOff={loyaltyOff}
                formatMoney={money}
                netAmount={splitPart ? chargeAmount : billSummary.amountDue}
              />
              {splitPart || stillDueAfter > 0.001 ? (
                <p className="text-sm text-[#1341a8]">
                  Collecting {money(chargeAmount)}
                  {stillDueAfter > 0.001
                    ? ` · still due ${money(stillDueAfter)}`
                    : ""}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-9 px-1 text-[0.7rem]"
                disabled={!cart.length && !splitFollowUp}
                onClick={() => setPayModal("discount")}
              >
                {totalDiscountShown > 0
                  ? `−${money(totalDiscountShown)}`
                  : "Discount"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-9 px-1 text-[0.7rem]"
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
                {splitSession ? "Split…" : "Split"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-9 px-1 text-[0.7rem]"
                disabled={busy || !cart.length || Boolean(splitSession)}
                onClick={() => setPayModal("draft")}
              >
                Save
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-9 px-1 text-[0.7rem]"
                onClick={() => setPayModal("more")}
              >
                More
              </Button>
            </div>
            {splitSession ? (
              <p className="text-[0.65rem] text-[#1a56db]">
                {splitPart?.label}
                {` · part ${splitSession.index + 1}/${splitSession.parts.length}`}
                {splitSession.orderNumber
                  ? ` · ${splitSession.orderNumber}`
                  : ""}{" "}
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
                  {splitFollowUp ? "Stop" : "Cancel"}
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
              const methodLabel = (method: string, displayName: string) => {
                if (method === "store_credit") return "Wallet";
                if (method === "wallet") return "App pay";
                if (method === "gift_card") return "Gift";
                if (method === "bank_transfer") return "Bank";
                return displayName;
              };
              return (
                <div className="grid grid-cols-5 gap-0.5 rounded-lg bg-[#eef2f8] p-0.5">
                  {shownPrimary.map((m) => (
                    <button
                      key={m.method}
                      type="button"
                      disabled={!m.available}
                      title={m.reason}
                      data-active={payMethod === m.method ? "true" : "false"}
                      onClick={() => {
                        if (!m.available) {
                          toast.message(
                            m.reason || `${m.displayName} is not configured`,
                          );
                          return;
                        }
                        setPayMethod(m.method as PayMethod);
                        if (m.method !== "cash") setSplitPay(false);
                      }}
                      className={cn(
                        "rounded-md py-1.5 text-[0.62rem] font-semibold tracking-wide uppercase transition",
                        !m.available && "cursor-not-allowed opacity-40",
                        payMethod === m.method
                          ? "bg-[#1a56db] text-white"
                          : "text-[#5a6b7d] hover:bg-white/80 hover:text-[#0b1f33]",
                      )}
                    >
                      {methodLabel(m.method, m.displayName)}
                    </button>
                  ))}
                </div>
              );
            })()}
            {["gift_card", "bank_transfer", "emi", "wallet"].includes(
              payMethod,
            ) ? (
              <button
                type="button"
                className="w-full rounded-md border border-[#c9d7f5] bg-[#f5f8ff] px-2 py-1.5 text-left text-[0.7rem] font-semibold text-[#1a56db]"
                onClick={() => setPayModal("more")}
              >
                Extra details · {payMethod.replace("_", " ")}
              </button>
            ) : null}
            {payMethod === "qr" ? (
              <div className="rounded-lg border border-[#d9e0ea] bg-white p-2">
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
                      <div className="flex items-center justify-between gap-2 rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5">
                        <p className="text-[0.7rem] font-medium text-amber-800">
                          Set UPI ID in Counter Settings first.
                        </p>
                        <Link
                          href="/settings/counter"
                          className="shrink-0 rounded bg-amber-600 px-2 py-0.5 text-[0.68rem] font-semibold text-white hover:bg-amber-700 transition"
                        >
                          Set UPI ID →
                        </Link>
                      </div>
                    );
                  }
                  const upiUri = `upi://pay?pa=${encodeURIComponent(vpa)}&pn=${encodeURIComponent(payee)}&am=${chargeAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(productName || "Universal POS")}`;
                  return (
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        alt="Pay QR"
                        className="h-20 w-20 shrink-0 rounded border border-[#eef2f8] bg-white"
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(upiUri)}`}
                      />
                      <p className="text-[0.65rem] leading-snug text-[#5a6b7d]">
                        Customer scans, then Charge.
                        <br />
                        <span className="font-medium text-[#0b1f33]">{vpa}</span>
                      </p>
                    </div>
                  );
                })()}
              </div>
            ) : null}
            {payMethod === "cash" ? (
              <div className="rounded-lg border border-[#e2e8f0] bg-white px-2.5 py-2">
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <Label className="text-[0.65rem] font-semibold text-[#5a6b7d]">
                      Cash given
                    </Label>
                    <Input
                      className="mt-0.5 h-8 text-sm tabular-nums"
                      inputMode="decimal"
                      placeholder={String(chargeAmount || "")}
                      value={cashTendered}
                      onChange={(e) => setCashTendered(e.target.value)}
                    />
                  </div>
                  {tenderedNum > 0 ? (
                    <div className="shrink-0 text-right">
                      <p className="text-[0.6rem] font-medium text-[#8b9bb0]">
                        Change
                      </p>
                      <p className="text-base font-bold tabular-nums text-[#1a56db]">
                        {money(changeDue)}
                      </p>
                    </div>
                  ) : null}
                </div>
                {tenderedNum > 0 && tenderedNum + 0.001 < chargeAmount ? (
                  <p className="mt-1 text-[0.65rem] font-medium text-amber-700">
                    Short by {money(chargeAmount - tenderedNum)}
                  </p>
                ) : null}
                {tenderedNum <= 0 ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {(currencyCode === "INR"
                      ? [chargeAmount, 500, 1000, 2000, 3000]
                      : currencyCode === "USD"
                        ? [chargeAmount, 20, 50, 100]
                        : [chargeAmount]
                    )
                      .filter((n, i, a) => n > 0 && a.indexOf(n) === i)
                      .map((n) => (
                        <button
                          key={n}
                          type="button"
                          className="rounded-md border border-[#cfd8e6] bg-white px-2 py-0.5 text-[0.65rem] font-semibold text-[#5a6b7d] hover:border-[#1a56db]/45 hover:bg-[#e8eefb]"
                          onClick={() => setCashTendered(String(n))}
                        >
                          {n === chargeAmount ? "Exact" : money(n)}
                        </button>
                      ))}
                  </div>
                ) : null}
              </div>
            ) : payMethod === "card" || payMethod === "upi" ? (
              <p className="text-[0.65rem] text-[#5a6b7d]">
                {stripeConfig.data?.enabled
                  ? "Opens on the next screen."
                  : "Not set up — use cash or QR."}
              </p>
            ) : payMethod === "store_credit" ? (
              <p className="text-[0.65rem] text-[#5a6b7d]">
                {customerId
                  ? `Wallet · ${money(walletBalance)} left`
                  : "Pick a customer first."}
              </p>
            ) : null}

            <Button
              size="sm"
              className="h-11 w-full rounded-xl text-[0.95rem] font-bold shadow-[0_4px_12px_rgba(26,86,219,0.28)]"
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
                  ? "Opening…"
                  : "Processing…"
                : splitPart
                  ? `Collect ${splitPart.label} · ${money(chargeAmount)}`
                  : allowPartial && chargeAmount < totalDue - 0.001
                    ? `Collect ${money(chargeAmount)}`
                    : `Charge · ${payMethodConfirmLabel} · ${money(chargeAmount)}`}
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

      {qtyPick ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#0b1f33]/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-[#e2e8f0] bg-white p-4 shadow-lg">
            <h3 className="text-sm font-semibold text-[#0b1f33]">
              Quantity · {qtyPick.row.name}
            </h3>
            <p className="mt-1 text-xs text-[#5a6b7d]">
              Type how many to put on the bill
              {qtyPick.tracks
                ? ` · max ${formatQtyWithUnit(qtyPick.maxQty, qtyPick.row.sellUnit)}`
                : ""}
              {(qtyPick.row.entryUnits?.length ?? 0) > 1
                ? " · pick entry unit (e.g. g or kg)"
                : ""}
              .
            </p>
            {(qtyPick.row.entryUnits?.length ?? 0) > 1 ? (
              <div className="mt-3">
                <Label className="text-[0.65rem] uppercase text-[#8b9bb0]">
                  Enter as
                </Label>
                <Select
                  className="mt-1 h-9 w-full rounded-md border border-[#d9e0ea] bg-white px-2 text-sm"
                  value={qtyPick.entryUnitId}
                  onChange={(e) =>
                    setQtyPick((cur) =>
                      cur ? { ...cur, entryUnitId: e.target.value } : cur,
                    )
                  }
                >
                  {qtyPick.row.entryUnits!.map((u) => (
                    <option key={u.unitId} value={u.unitId}>
                      {u.symbol} — {u.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
            <Input
              className="mt-3 text-center text-lg font-bold tabular-nums"
              autoFocus
              inputMode="decimal"
              placeholder="e.g. 500"
              value={qtyPick.value}
              onChange={(e) => {
                const v = e.target.value.replace(",", ".");
                if (v !== "" && !/^\d*\.?\d*$/.test(v)) return;
                setQtyPick((cur) => (cur ? { ...cur, value: v } : cur));
              }}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void applyQtyPick();
                }
              }}
            />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {[1, 5, 10, 25, 50, 100, 250, 500].map((q) => (
                <button
                  key={q}
                  type="button"
                  className="rounded-md border border-[#e2e8f0] bg-[#f8fafc] px-2.5 py-1 text-xs font-semibold text-[#0b1f33] hover:border-[#1a56db] hover:text-[#1a56db]"
                  onClick={() =>
                    setQtyPick((cur) =>
                      cur ? { ...cur, value: String(q) } : cur,
                    )
                  }
                >
                  {q}
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setQtyPick(null)}>
                Cancel
              </Button>
              <Button onClick={() => void applyQtyPick()}>Set qty</Button>
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
          title="Price & discount"
          subtitle="Discount or change price for this item only — other cart lines stay as they are."
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
            const base = cartLineListPrice(line);
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
                  List price {money(base)} {priceUnitLabel(line.sellUnit)}
                  {" · "}qty {line.qty}
                </p>
                <div className="field-shell">
                  <Label>Selling price</Label>
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
                  <Label>Discount / markup % (this item)</Label>
                  <Input
                    className="mt-1 text-lg tabular-nums"
                    inputMode="decimal"
                    placeholder="e.g. −10 or 20"
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
                    −10 = 10% off list. +20 = 20% above list. Applies only to this
                    product.
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[-5, -10, -20, -50].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      className="rounded-lg border border-[#fed7aa] bg-[#fff7ed] px-2.5 py-1.5 text-xs font-semibold text-[#c2410c] hover:border-[#ea580c]"
                      onClick={() => applyPct(pct)}
                    >
                      {pct}%
                    </button>
                  ))}
                  {[10, 20, 50].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      className="rounded-lg border border-[#e2e8f0] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#475569] hover:border-[#1a56db] hover:text-[#1a56db]"
                      onClick={() => applyPct(pct)}
                    >
                      +{pct}%
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
                  Line total: {money(Math.max(0, draft) * line.qty)}
                  {draft < base - 0.001 ? (
                    <span className="ml-2 text-[#c2410c]">
                      (save {money((base - draft) * line.qty)})
                    </span>
                  ) : null}
                </p>
              </div>
            );
          })()}
        </ModalFrame>
      ) : null}

      {payModal === "customer" ? (
        <ModalFrame
          title="Attach customer"
          subtitle="Search or add — tap a row to attach. Needed for wallet."
          onClose={() => setPayModal(null)}
          className="max-w-sm"
          bodyScroll
        >
          <CustomerPicker
            embedded
            value={customerId}
            onChange={(id) => setCustomerId(id)}
            onPicked={() => setPayModal(null)}
            allowWalkIn
            walkInLabel="Walk-in Guest"
            placeholder="Name or phone…"
            showBalances
            money={money}
          />
        </ModalFrame>
      ) : null}

      {payModal === "orderDetails" ? (
        <ModalFrame
          title="Order details"
          subtitle="Type, table, covers, and notes for this ticket."
          onClose={() => setPayModal(null)}
          className="max-w-md"
          footer={
            <Button
              className="w-full"
              size="sm"
              onClick={() => setPayModal(null)}
            >
              Done
            </Button>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
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
                      .map((t) => {
                        const isAssignable = t.status === "available" && !t.currentOrderId;
                        return (
                          <option
                            key={t.id}
                            value={t.id}
                            disabled={!isAssignable}
                          >
                            {t.floorName ? `${t.floorName} · ` : ""}
                            {t.name}
                            {!isAssignable ? ` [${(t.status || "UNAVAILABLE").toUpperCase()} - NOT ASSIGNABLE]` : ""}
                          </option>
                        );
                      })}
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
                  className="mt-1 h-10"
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
                    className="mt-1 h-10"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Name"
                  />
                </div>
                <div className="field-shell">
                  <PhoneCountryInput
                    label="Phone"
                    value={deliveryPhone}
                    onChange={setDeliveryPhone}
                  />
                </div>
                <div className="field-shell sm:col-span-2">
                  <Label className="text-[0.65rem] font-semibold tracking-[0.12em] text-[#8b9bb0] uppercase">
                    Delivery address
                  </Label>
                  <Input
                    className="mt-1 h-10"
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
                className="mt-1 h-10"
                value={orderNote}
                onChange={(e) => setOrderNote(e.target.value)}
                placeholder="Notes, allergies, prep note, booking reference…"
              />
            </div>
          </div>
        </ModalFrame>
      ) : null}

      {payModal === "discount" ? (() => {
        const ticketBeforeDiscount =
          billSummary.productNet > 0
            ? billSummary.productNet
            : billSummary.itemsSubtotal;
        const discountNum = moneyNumber(discountAmount || 0);
        const maxCashierDiscountPercent = 100;
        const maxDiscountAmount = ticketBeforeDiscount;
        const discountCapped = false;
        return (
        <ModalFrame
          title="Discount"
          subtitle="Set a different discount on each product, and/or an amount off the whole bill."
          onClose={() => setPayModal(null)}
          className="max-w-md"
          bodyScroll
          footer={
            <Button className="w-full" onClick={() => setPayModal(null)}>
              Done
            </Button>
          }
        >
          <div className="space-y-5">
            {cart.length ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[0.65rem] font-semibold tracking-[0.1em] text-[#8b9bb0] uppercase">
                    Per item
                  </p>
                  {lineDiscountsTotal > 0 ? (
                    <p className="text-xs font-semibold text-[#c2410c]">
                      Items save {money(lineDiscountsTotal)}
                    </p>
                  ) : null}
                </div>
                <ul className="max-h-[min(40vh,16rem)] space-y-2.5 overflow-y-auto">
                  {cart.map((l) => {
                    const base = cartLineListPrice(l);
                    const discPct = cartLineDiscountPercent(l);
                    const offUnit = Math.max(0, base - l.unitPrice);
                    return (
                      <li
                        key={l.stockLevelId}
                        className="rounded-xl border border-[#e8edf4] bg-[#fafbfc] p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#0b1f33]">
                              {l.name}
                            </p>
                            <p className="mt-0.5 text-[0.7rem] tabular-nums text-[#8b9bb0]">
                              List {money(base)} · qty {l.qty}
                              {discPct > 0 ? (
                                <span className="ml-1 font-semibold text-[#c2410c]">
                                  · −{discPct}%
                                </span>
                              ) : null}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="shrink-0 text-[0.7rem] font-semibold text-[#1a56db] hover:underline"
                            onClick={() =>
                              setCartLineDiscount(l.stockLevelId, {
                                reset: true,
                              })
                            }
                          >
                            Reset
                          </button>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[0.65rem] text-[#8b9bb0]">
                              Disc %
                            </Label>
                            <Input
                              className="mt-0.5 h-9 tabular-nums"
                              inputMode="decimal"
                              placeholder="0"
                              value={discPct > 0 ? String(discPct) : ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === "") {
                                  setCartLineDiscount(l.stockLevelId, {
                                    reset: true,
                                  });
                                  return;
                                }
                                const pct = Math.max(
                                  0,
                                  Math.min(100, moneyNumber(raw || 0)),
                                );
                                setCartLineDiscount(l.stockLevelId, {
                                  percent: pct,
                                });
                              }}
                            />
                          </div>
                          <div>
                            <Label className="text-[0.65rem] text-[#8b9bb0]">
                              Off ₹ / unit
                            </Label>
                            <Input
                              className="mt-0.5 h-9 tabular-nums"
                              inputMode="decimal"
                              placeholder="0"
                              value={offUnit > 0.001 ? String(offUnit) : ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === "") {
                                  setCartLineDiscount(l.stockLevelId, {
                                    reset: true,
                                  });
                                  return;
                                }
                                const amt = Math.max(0, moneyNumber(raw || 0));
                                setCartLineDiscount(l.stockLevelId, {
                                  amountOffPerUnit: amt,
                                });
                              }}
                            />
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {[5, 10, 15, 20].map((pct) => (
                            <button
                              key={pct}
                              type="button"
                              className={cn(
                                "rounded-md border px-2 py-0.5 text-[0.7rem] font-semibold",
                                discPct === pct
                                  ? "border-[#c2410c] bg-[#fff7ed] text-[#c2410c]"
                                  : "border-[#e2e8f0] bg-white text-[#475569] hover:border-[#c2410c]",
                              )}
                              onClick={() =>
                                setCartLineDiscount(l.stockLevelId, {
                                  percent: pct,
                                })
                              }
                            >
                              −{pct}%
                            </button>
                          ))}
                        </div>
                        <p className="mt-2 text-xs font-semibold tabular-nums text-[#0b1f33]">
                          Now {money(l.unitPrice)} · line {money(l.unitPrice * l.qty)}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            <div className="space-y-3 border-t border-[#eef2f8] pt-4">
              <p className="text-[0.65rem] font-semibold tracking-[0.1em] text-[#8b9bb0] uppercase">
                Whole bill
              </p>
              <div className="field-shell">
                <Label>How much off the bill?</Label>
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
                    Ticket before bill discount: {money(ticketBeforeDiscount)}
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
          </div>
        </ModalFrame>
        );
      })() : null}

      {payModal === "draft" ? (
        <ModalFrame
          title="Save for later"
          subtitle="Hold this ticket. Open it again from Drafts on the Counter."
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

      {payModal === "drafts" ? (
        <ModalFrame
          title="Saved drafts"
          subtitle="Parked bills for this counter — open to continue charging."
          onClose={() => setPayModal(null)}
          className="max-w-lg"
          footer={
            <Button className="w-full" variant="secondary" onClick={() => setPayModal(null)}>
              Close
            </Button>
          }
        >
          {parkedQ.isLoading ? (
            <p className="text-sm text-[#8b9bb0]">Loading drafts…</p>
          ) : parkedItems.length === 0 ? (
            <p className="text-sm text-[#5a6b7d]">
              No drafts yet. Save a ticket with{" "}
              <span className="font-semibold text-[#0b1f33]">Save draft</span>{" "}
              (or Leave → Save draft) to see it here.
            </p>
          ) : (
            <ul className="max-h-[22rem] space-y-2 overflow-y-auto">
              {parkedItems.map((d) => (
                <li
                  key={d.id}
                  className="rounded-lg border border-[#e8edf4] bg-[#fafbfc] px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#0b1f33]">
                        {d.label?.trim() || d.orderNumber}
                      </p>
                      <p className="mt-0.5 text-[0.72rem] text-[#8b9bb0]">
                        {d.orderNumber}
                        {d.label?.trim() ? ` · ${d.customerName}` : ` · ${d.customerName}`}
                        {d.itemCount != null
                          ? ` · ${d.itemCount} item${d.itemCount === 1 ? "" : "s"}`
                          : ""}
                      </p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums text-[#1a56db]">
                        {money(Number(d.balanceDue))}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy || cart.length > 0 || Boolean(splitSession)}
                        title={
                          cart.length
                            ? "Clear or save the current ticket first"
                            : "Open on counter"
                        }
                        onClick={() => void resumeParked(d.id)}
                      >
                        Open
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="text-[#b91c1c]"
                        disabled={busy}
                        onClick={() => void discardParked(d.id)}
                      >
                        Discard
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
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
                "qr",
                "store_credit",
                "gift_card",
                "bank_transfer",
                "emi",
                "wallet",
                "collect_later",
              ] as const;
              const extras = extraRow.map((method) => {
                const m = byMethod.get(method);
                const alwaysOn =
                  method === "qr" ||
                  method === "store_credit" ||
                  method === "collect_later";
                return {
                  method,
                  displayName:
                    method === "qr"
                      ? "QR / UPI scan"
                      : method === "store_credit"
                        ? "Wallet"
                        : method === "gift_card"
                          ? "Gift card"
                          : method === "bank_transfer"
                            ? "Bank transfer"
                            : method === "emi"
                              ? "EMI"
                              : method === "collect_later"
                                ? "Pay on pickup"
                                : "App pay",
                  available: alwaysOn || Boolean(m?.available),
                  reason: m?.reason,
                };
              });
              return (
                <div className="space-y-3">
                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-[#0b1f33]">
                      More pay methods
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
                            if ((m.method as string) !== "cash")
                              setSplitPay(false);
                            setPayModal(null);
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
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    disabled={busy || !cart.length || Boolean(splitSession)}
                    onClick={() => setPayModal("draft")}
                  >
                    Save draft / park bill
                  </Button>
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

            {payMethod === "collect_later" ? (
              <p className="rounded-lg border border-[#e8edf4] bg-[#f8fafc] px-3 py-2 text-sm text-[#5a6b7d]">
                Charge now books the sale with{" "}
                <span className="font-semibold text-[#0b1f33]">balance due</span>
                . Customer pays when they take the stuff — collect from Orders
                later. Prefer a customer on the ticket.
              </p>
            ) : null}

            {payMethod === "wallet" ? (
              <p className="text-sm text-[#5a6b7d]">
                Confirm after the customer pays in the wallet app, then Charge.
              </p>
            ) : null}

            <label className="flex items-start gap-2 text-sm font-medium text-[#0b1f33]">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[#1a56db]"
                checked={allowPartial}
                disabled={Boolean(splitSession)}
                onChange={(e) => {
                  setAllowPartial(e.target.checked);
                  if (e.target.checked && !payAmount) {
                    setPayAmount(
                      String(Math.round((totalDue / 2) * 100) / 100),
                    );
                  }
                }}
              />
              <span>
                Collect part now
                <span className="mt-0.5 block text-[0.72rem] font-normal text-[#8b9bb0]">
                  Pay half (or any amount) now — rest when they return / pick up.
                  Order stays open with balance due.
                </span>
              </span>
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
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {[0.25, 0.5, 0.75].map((f) => (
                    <button
                      key={f}
                      type="button"
                      className="rounded-md border border-[#e2e8f0] bg-white px-2 py-1 text-[0.7rem] font-semibold text-[#475569] hover:border-[#1a56db] hover:text-[#1a56db]"
                      onClick={() =>
                        setPayAmount(
                          String(Math.round(totalDue * f * 100) / 100),
                        )
                      }
                    >
                      {Math.round(f * 100)}%
                    </button>
                  ))}
                  <button
                    type="button"
                    className="rounded-md border border-[#e2e8f0] bg-white px-2 py-1 text-[0.7rem] font-semibold text-[#475569] hover:border-[#1a56db] hover:text-[#1a56db]"
                    onClick={() => setPayAmount(String(totalDue))}
                  >
                    Full
                  </button>
                </div>
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
