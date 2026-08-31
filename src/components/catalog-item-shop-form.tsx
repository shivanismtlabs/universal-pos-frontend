"use client";

import {
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type Ref,
  type SetStateAction,
} from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { CatalogProductKind } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { CategorySelectCombobox } from "@/components/category-select-combobox";
import { BrandSelectCombobox } from "@/components/brand-select-combobox";
import {
  UnitPricingFields,
  type UnitPricingValue,
} from "@/components/unit-pricing-fields";
import { BarcodeScanInput } from "@/components/barcode-scan-input";
import { ProductBarcodePreview } from "@/components/product-barcode-preview";
import {
  ProductImagePicker,
  type ProductImagePickerHandle,
} from "@/components/product-image-picker";
import { CustomFieldsSection } from "@/components/custom-field-inputs";
import type { MetaFieldDef } from "@/lib/business-config";
import { cn } from "@/lib/utils";
import {
  catalogNeedsPackedContents,
  defaultPackedContentsQty,
  formatPackedContents,
} from "@/lib/measure-units";
import {
  allowsDecimalQty,
  formatQtyWithUnit,
} from "@/lib/sell-units";
import {
  FOOD_TYPE_OPTIONS,
  FoodTypeBadge,
  type FoodType,
} from "@/components/food-type-badge";
import { Info } from "lucide-react";

const TRACKING_FLAG_HELP_BASE: Record<
  | "trackInventory"
  | "trackSerial"
  | "trackBatch"
  | "canSell"
  | "canPurchase"
  | "availableInPos",
  string
> = {
  trackInventory:
    "On: count Stock on Hand when you sell or stock in. Off: no quantity — stock not counted.",
  trackSerial:
    "On: each unit has a unique serial. Opening qty stays 0 — register serials after save.",
  trackBatch:
    "On: track lots / expiry on this item. Use batches after save (Inventory / item page).",
  canSell: "On: this item can be sold on bills. Off: buy/use only (not sold to customers).",
  canPurchase:
    "On: you can purchase / stock in this item from suppliers. Off: you don’t buy it in the app.",
  availableInPos:
    "On: cashiers see it on the counter. Off: stays in catalog only (hidden from POS).",
};

/** Types that never keep their own Stock on Hand on New Item. */
export function catalogKindSkipsStock(kind: CatalogProductKind): boolean {
  return kind === "service" || kind === "digital" || kind === "bundle";
}

function trackingFlagHelp(
  key: keyof typeof TRACKING_FLAG_HELP_BASE,
  kind: CatalogProductKind,
): string {
  if (key === "trackInventory") {
    if (kind === "service") {
      return "Services don’t use stock. This stays off — you can’t turn it on for Service.";
    }
    if (kind === "digital") {
      return "Digital items don’t use stock. This stays off — you can’t turn it on for Digital.";
    }
    if (kind === "bundle") {
      return "Combo stock comes from items inside. This stays off — you can’t turn it on for Combo.";
    }
    if (kind === "rental") {
      return "On: count how many rental units you have. Off: rent without counting quantity.";
    }
  }
  if (key === "trackSerial") {
    if (catalogKindSkipsStock(kind)) {
      return "Serial numbers are for counted goods/rentals — not used on this type.";
    }
  }
  if (key === "trackBatch") {
    if (catalogKindSkipsStock(kind)) {
      return "Batch / expiry is for counted goods — not used on this type.";
    }
  }
  if (key === "canPurchase") {
    if (kind === "service" || kind === "digital") {
      return "Services and digital items aren’t purchased as stock. This stays off for this type.";
    }
  }
  return TRACKING_FLAG_HELP_BASE[key];
}

/** Which checkboxes can’t be clicked for this item type. */
function isTrackingFlagLocked(
  key:
    | "trackInventory"
    | "trackSerial"
    | "trackBatch"
    | "canSell"
    | "canPurchase"
    | "availableInPos",
  kind: CatalogProductKind,
  trackInventory: boolean,
): boolean {
  if (key === "trackInventory") return catalogKindSkipsStock(kind);
  if (key === "trackSerial" || key === "trackBatch") {
    return catalogKindSkipsStock(kind) || !trackInventory;
  }
  if (key === "canPurchase") return kind === "service" || kind === "digital";
  return false;
}

function FlagInfo({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex shrink-0">
      <button
        type="button"
        className="rounded-full p-0.5 text-[#8b9bb0] hover:bg-[#eef2f8] hover:text-[#1a56db] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a56db]/60"
        aria-label={text}
        title={text}
      >
        <Info className="size-3.5" aria-hidden />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 w-52 -translate-x-1/2 rounded-md border border-[#d9e0ea] bg-white px-2.5 py-1.5 text-left text-[0.7rem] leading-snug font-normal text-[#5a6b7d] opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

export const CATALOG_ITEM_KINDS: { id: CatalogProductKind; label: string }[] = [
  { id: "physical", label: "Goods" },
  { id: "service", label: "Service" },
  { id: "digital", label: "Digital" },
  { id: "bundle", label: "Combo" },
  { id: "rental", label: "Rental" },
];

/** Which item types to offer — driven by enabled commerce modes, not industry. */
export function catalogKindsForModes(
  modes?: string[] | null,
): typeof CATALOG_ITEM_KINDS {
  const m = new Set((modes ?? []).map((x) => x.toLowerCase()));
  const hasAny = m.size > 0;
  return CATALOG_ITEM_KINDS.filter((k) => {
    if (!hasAny) return true;
    if (k.id === "rental") return m.has("rental");
    if (k.id === "service") return m.has("service") || m.has("sale");
    if (k.id === "digital" || k.id === "bundle" || k.id === "physical") {
      return m.has("sale") || m.has("subscription") || m.has("rental");
    }
    return true;
  });
}

const fieldSelect =
  "mt-0 h-10 w-full rounded-lg border border-[#d9e0ea] bg-white px-3 text-sm text-[#0b1f33] outline-none focus:border-[#1a56db] focus:shadow-[0_0_0_3px_rgba(26,86,219,0.12)]";
const textareaClass =
  "min-h-[72px] w-full rounded-lg border border-[#d9e0ea] bg-white px-3 py-2 text-sm outline-none focus:border-[#1a56db] focus:shadow-[0_0_0_3px_rgba(26,86,219,0.12)]";

/** Common salon / appointment lengths — also allows custom minutes. */
export const SERVICE_DURATION_PRESETS = [15, 30, 45, 60, 90, 120] as const;
export const DEFAULT_SERVICE_DURATION_MINUTES = "30";

export type CatalogItemShopValues = {
  name: string;
  shortName: string;
  kind: CatalogProductKind;
  status: string;
  skuCode: string;
  barcode: string;
  barcodeType: string;
  internalCode: string;
  categoryId: string;
  brandId: string;
  shortDescription: string;
  description: string;
  basePrice: string;
  costPrice: string;
  mrp: string;
  taxCode: string;
  taxRatePercent: string;
  unitOfMeasure: string;
  trackInventory: boolean;
  trackSerial: boolean;
  trackBatch: boolean;
  canSell: boolean;
  canPurchase: boolean;
  availableInPos: boolean;
  openingQty: string;
  reorderPoint: string;
  /** How many of the smaller unit are inside 1 box/pack (when UOM is packed). */
  multiUnitBaseQty: string;
  multiUnitBaseUnit: string;
};

export function applyCatalogKindDefaults<T extends CatalogItemShopValues>(
  prev: T,
  kind: CatalogProductKind,
): T {
  const nonStock = catalogKindSkipsStock(kind);
  let unit = prev.unitOfMeasure;
  if (kind === "service") {
    unit = "service";
  } else if (prev.unitOfMeasure === "service") {
    // Leaving service → sensible goods/rental default
    unit = kind === "rental" ? "pcs" : "pcs";
  }
  return {
    ...prev,
    kind,
    trackInventory: nonStock ? false : true,
    trackSerial: nonStock ? false : prev.trackSerial,
    trackBatch: nonStock ? false : prev.trackBatch,
    canPurchase: kind === "service" || kind === "digital" ? false : true,
    // Rentals / goods sell on counter by default
    canSell: kind === "digital" ? prev.canSell : true,
    availableInPos: true,
    unitOfMeasure: unit,
    ...(nonStock
      ? {
          openingQty: "",
          reorderPoint: "",
          multiUnitBaseQty: "",
          multiUnitBaseUnit: "pcs",
        }
      : catalogNeedsPackedContents(kind, unit)
        ? {
            multiUnitBaseQty:
              prev.multiUnitBaseQty.trim() || defaultPackedContentsQty(unit),
            multiUnitBaseUnit: prev.multiUnitBaseUnit || "pcs",
          }
        : { multiUnitBaseQty: "", multiUnitBaseUnit: "pcs" }),
  };
}

export function applyCatalogUnitChange<T extends CatalogItemShopValues>(
  prev: T,
  nextUnit: string,
): T {
  const nextPacked = catalogNeedsPackedContents(prev.kind, nextUnit);
  const prevPacked = catalogNeedsPackedContents(prev.kind, prev.unitOfMeasure);
  let qty = prev.multiUnitBaseQty;
  let base = prev.multiUnitBaseUnit || "pcs";
  if (!nextPacked) {
    qty = "";
    base = "pcs";
  } else if (!prevPacked || !qty.trim()) {
    qty = defaultPackedContentsQty(nextUnit);
    if ((nextUnit || "").trim().toLowerCase() === "dozen") base = "pcs";
  }
  return {
    ...prev,
    unitOfMeasure: nextUnit,
    multiUnitBaseQty: qty,
    multiUnitBaseUnit: base,
  };
}

/** Keep inventory flags consistent when Track inventory is toggled. */
export function patchCatalogTrackingFlags<T extends CatalogItemShopValues>(
  prev: T,
  key: keyof CatalogItemShopValues,
  checked: boolean,
): T {
  if (key === "trackInventory" && !checked) {
    return {
      ...prev,
      trackInventory: false,
      trackSerial: false,
      trackBatch: false,
      openingQty: "",
      reorderPoint: "",
    };
  }
  if ((key === "trackSerial" || key === "trackBatch") && checked) {
    return { ...prev, [key]: true, trackInventory: true };
  }
  return { ...prev, [key]: checked };
}

function ShopField({
  label,
  required,
  children,
  hint,
  htmlFor,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[148px_minmax(0,1fr)] sm:items-start">
      <Label htmlFor={htmlFor} className="sm:pt-2.5">
        {label}
        {required ? " *" : ""}
      </Label>
      <div>
        {children}
        {hint}
      </div>
    </div>
  );
}

function ShopSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 border-t border-[#eef1f4] py-6 first:border-t-0 first:pt-0">
      <h3 className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-[#21263c]">
        {title}
      </h3>
      <div className="space-y-3.5">{children}</div>
    </section>
  );
}

type CategoryRow = {
  id: string;
  name: string;
  parentId?: string | null;
  parent?: { id: string; name: string } | null;
};

type BrandRow = { id: string; name: string };
type UnitRow = { code: string; name: string };

export function CatalogItemShopForm<T extends CatalogItemShopValues>({
  title,
  subtitle,
  cancelHref,
  form,
  setForm,
  extraFields,
  setExtraFields,
  fieldErrors,
  clearFieldError,
  barcodeError,
  productFormFields,
  customFieldsLoading,
  categories,
  brands,
  unitOptions,
  imagePickerRef,
  onGenerateSku,
  onGenerateBarcode,
  skuPending,
  barcodePending,
  onSave,
  savePending,
  photosExtra,
  stockReadOnly,
  stockOnHandDisplay,
  stockLocationName,
  defaultShowMore,
  categorySelectedLabel,
  brandSelectedLabel,
  unitPricing,
  onUnitPricingChange,
  commerceModes,
}: {
  title: string;
  subtitle: string;
  cancelHref: string;
  form: T;
  setForm: Dispatch<SetStateAction<T>>;
  extraFields: Record<string, string>;
  setExtraFields: Dispatch<SetStateAction<Record<string, string>>>;
  fieldErrors: Record<string, string>;
  clearFieldError: (key: string) => void;
  barcodeError: string | null;
  productFormFields: MetaFieldDef[];
  customFieldsLoading: boolean;
  categories: CategoryRow[];
  brands: BrandRow[];
  unitOptions: UnitRow[];
  imagePickerRef: Ref<ProductImagePickerHandle>;
  onGenerateSku: () => void;
  onGenerateBarcode: () => void;
  skuPending?: boolean;
  barcodePending?: boolean;
  onSave: () => void;
  savePending?: boolean;
  photosExtra?: ReactNode;
  /** Edit: show current SOH, do not write opening qty. */
  stockReadOnly?: boolean;
  stockOnHandDisplay?: string | null;
  /** Branch name where create Stock on Hand is applied */
  stockLocationName?: string;
  /** Open “More details” when editing items that already have optional fields filled */
  defaultShowMore?: boolean;
  /** Edit: category name when id is not yet in the categories list */
  categorySelectedLabel?: string | null;
  /** Edit: brand name when id is not yet in the brands list */
  brandSelectedLabel?: string | null;
  unitPricing?: UnitPricingValue;
  onUnitPricingChange?: (next: UnitPricingValue) => void;
  /** Enabled commerce modes — filters Type chips (sale/rental/service…) */
  commerceModes?: string[];
}) {
  const [showMore, setShowMore] = useState(Boolean(defaultShowMore));
  const foodTypeField = productFormFields.find((f) => f.key === "foodType");
  const showPackedContents = catalogNeedsPackedContents(
    form.kind,
    form.unitOfMeasure,
  );
  // Core form already has Brand / Name / Category — don’t duplicate as extras
  const CORE_EXTRA_SKIP = new Set([
    "foodType",
    "brand",
    "name",
    "category",
    "sku",
    "barcode",
    "unit",
    "price",
    // Shown as dedicated Duration control when Type = Service
    ...(form.kind === "service" ? (["durationMinutes"] as const) : []),
    ...(showPackedContents ? ["packSize"] : []),
  ]);
  const otherFormFields = productFormFields.filter(
    (f) => !CORE_EXTRA_SKIP.has(f.key),
  );
  const kindOptions = catalogKindsForModes(commerceModes);
  const qtyAllowsDecimal = allowsDecimalQty(form.unitOfMeasure || "pcs");
  const stockNotNeeded = catalogKindSkipsStock(form.kind);
  const showStockFields = form.trackInventory && !stockNotNeeded;
  const packedUnitLabel =
    unitOptions.find((u) => u.code === form.unitOfMeasure)?.name ||
    form.unitOfMeasure ||
    "box";
  const packedQtyNum = Number(form.multiUnitBaseQty);
  const packedContentsHint =
    Number.isFinite(packedQtyNum) && packedQtyNum > 0
      ? formatPackedContents(
          form.unitOfMeasure || "box",
          packedQtyNum,
          form.multiUnitBaseUnit || "pcs",
        )
      : null;
  const trackingFlags = [
    ["trackInventory", "Track inventory"],
    ["trackSerial", "Track serial numbers"],
    ["trackBatch", "Track batch / expiry"],
    ["canSell", "Can sell"],
    ["canPurchase", "Can purchase"],
    ["availableInPos", "Show on counter"],
  ] as const;

  useEffect(() => {
    if (defaultShowMore) setShowMore(true);
  }, [defaultShowMore]);

  // If current kind is hidden for this shop’s modes, snap to first allowed kind
  useEffect(() => {
    if (!kindOptions.length) return;
    if (kindOptions.some((k) => k.id === form.kind)) return;
    setForm((f) => applyCatalogKindDefaults(f, kindOptions[0].id));
  }, [kindOptions, form.kind, setForm]);

  return (
    <div
      className="mx-auto max-w-5xl pb-10"
      data-catalog-shop-form={title}
    >
      <div className="overflow-hidden rounded-xl border border-[#d9e0ea] bg-white shadow-[0_1px_2px_rgba(11,31,51,0.04)]">
        <header className="border-b border-[#eef1f4] px-4 py-4 sm:px-6">
          <p className="text-[0.7rem] font-semibold tracking-wide text-[#8b9bb0] uppercase">
            Inventory
          </p>
          <h1 className="mt-1 text-[1.25rem] font-semibold tracking-tight text-[#0b1f33]">
            {title}
          </h1>
          <p className="mt-1 max-w-2xl text-[0.8125rem] leading-relaxed text-[#5a6b7d]">
            {subtitle}
          </p>
          <p className="mt-1.5 text-[0.7rem] text-[#8b9bb0]">
            Universal catalog — same form for retail, grocery, salon, rental,
            restaurant, and more. Type chips follow your enabled commerce modes;
            extra boxes come from business setup &amp; custom fields.
          </p>
        </header>

        <div className="grid gap-0 pb-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="divide-y divide-[#eef1f4] px-4 py-5 sm:px-6">
            <ShopSection title="At the counter">
              <ShopField
                label="Barcode"
                hint={
                  barcodeError || fieldErrors.barcode ? (
                    <p className="mt-1 text-xs text-rose-600">
                      {barcodeError || fieldErrors.barcode}
                    </p>
                  ) : (
                    <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">
                      USB scanner works here. Leave empty to auto-assign on
                      save.
                    </p>
                  )
                }
              >
                <div className="flex gap-2">
                  <div className="min-w-0 flex-1">
                    <BarcodeScanInput
                      value={form.barcode}
                      onChange={(barcode) => {
                        clearFieldError("barcode");
                        setForm((f) => ({ ...f, barcode }));
                      }}
                      onScan={(barcode) => {
                        clearFieldError("barcode");
                        setForm((f) => ({ ...f, barcode }));
                        toast.success("Barcode captured");
                      }}
                      label=""
                      placeholder="Scan or type barcode"
                      autoSubmitWedge
                      showSubmitButton={false}
                      showHint={false}
                      className="space-y-0"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="shrink-0"
                    disabled={barcodePending}
                    onClick={onGenerateBarcode}
                  >
                    {barcodePending ? "…" : "Generate"}
                  </Button>
                </div>
              </ShopField>

              <ShopField
                label="Name"
                required
                htmlFor="catalog-item-name"
                hint={<FieldError message={fieldErrors.name} />}
              >
                <Input
                  id="catalog-item-name"
                  name="name"
                  autoFocus
                  placeholder="What you sell or rent — e.g. Blue cotton shirt"
                  value={form.name}
                  onChange={(e) => {
                    clearFieldError("name");
                    setForm((f) => ({ ...f, name: e.target.value }));
                  }}
                />
              </ShopField>

              <ShopField label="Type" required>
                <div className="flex flex-wrap gap-2">
                  {kindOptions.map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => {
                        setForm((f) =>
                          f.kind === k.id
                            ? f
                            : applyCatalogKindDefaults(f, k.id),
                        );
                        if (k.id === "service") {
                          setExtraFields((prev) =>
                            (prev.durationMinutes ?? "").trim()
                              ? prev
                              : {
                                  ...prev,
                                  durationMinutes: DEFAULT_SERVICE_DURATION_MINUTES,
                                },
                          );
                        }
                      }}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-sm font-medium transition",
                        form.kind === k.id
                          ? "border-[#1a56db] bg-[#e8eefb] text-[#1a56db]"
                          : "border-[#d9e0ea] bg-white text-[#5a6b7d]",
                      )}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
              </ShopField>

              {foodTypeField ? (
                <ShopField
                  label={foodTypeField.label || "Diet tag"}
                  hint={
                    <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">
                      {foodTypeField.hint ||
                        "Optional tag for F&B menus — leave None if not needed."}
                    </p>
                  }
                >
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExtraFields((prev) => {
                          const next = { ...prev };
                          delete next.foodType;
                          return next;
                        })
                      }
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-sm font-medium transition",
                        !(extraFields.foodType ?? "").trim()
                          ? "border-[#1a56db] bg-[#e8eefb] text-[#1a56db]"
                          : "border-[#d9e0ea] bg-white text-[#5a6b7d]",
                      )}
                    >
                      None
                    </button>
                    {FOOD_TYPE_OPTIONS.map((opt) => {
                      const selected =
                        (extraFields.foodType ?? "").trim() === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            setExtraFields((prev) => ({
                              ...prev,
                              foodType: opt.id,
                            }))
                          }
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition",
                            selected
                              ? "border-[#1a56db] bg-[#e8eefb] text-[#1a56db]"
                              : "border-[#d9e0ea] bg-white text-[#5a6b7d]",
                          )}
                        >
                          <FoodTypeBadge value={opt.id as FoodType} />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </ShopField>
              ) : null}

              <ShopField label="Category">
                <CategorySelectCombobox
                  value={form.categoryId}
                  onChange={(val) =>
                    setForm((f) => ({ ...f, categoryId: val }))
                  }
                  categories={categories}
                  selectedLabel={categorySelectedLabel}
                />
              </ShopField>

              <ShopField label="Brand">
                <BrandSelectCombobox
                  value={form.brandId}
                  onChange={(val) =>
                    setForm((f) => ({ ...f, brandId: val }))
                  }
                  brands={brands}
                  selectedLabel={brandSelectedLabel}
                />
              </ShopField>

              <ShopField label="Status">
                <Select
                  className={fieldSelect}
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      status: e.target.value,
                    }))
                  }
                >
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                  <option value="inactive">Inactive</option>
                  <option value="archived">Archived</option>
                </Select>
              </ShopField>

              <ShopField
                label="Unit"
                required
                hint={
                  fieldErrors.unitOfMeasure ? (
                    <FieldError message={fieldErrors.unitOfMeasure} />
                  ) : (
                    <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">
                      {form.kind === "service"
                        ? "Billing unit for the service (Service, Minute, Hour…). Appointment length is set in Duration below."
                        : "Stock & rate use this unit — pcs, kg, L, min, hour, day, and more (any business). "}
                      {form.kind === "service" ? " " : null}
                      <Link href="/settings/units" className="text-[#1a56db]">
                        Settings → Units
                      </Link>
                    </p>
                  )
                }
              >
                <Select
                  className={fieldSelect}
                  value={form.unitOfMeasure}
                  onChange={(e) => {
                    clearFieldError("unitOfMeasure");
                    clearFieldError("multiUnitBaseQty");
                    setForm((f) => applyCatalogUnitChange(f, e.target.value));
                  }}
                >
                  {unitOptions.some((u) => u.code === form.unitOfMeasure) ? null : (
                    <option value={form.unitOfMeasure}>
                      {form.unitOfMeasure}
                    </option>
                  )}
                  {unitOptions.map((u) => (
                    <option key={u.code} value={u.code}>
                      {u.name} ({u.code})
                    </option>
                  ))}
                </Select>
              </ShopField>

              {form.kind === "service" ? (
                <ShopField
                  label="Duration"
                  htmlFor="catalog-item-duration-minutes"
                  hint={
                    fieldErrors.durationMinutes ? (
                      <FieldError message={fieldErrors.durationMinutes} />
                    ) : (
                      <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">
                        How long this service usually takes — used for
                        appointments and scheduling (e.g. 30 min haircut).
                      </p>
                    )
                  }
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {SERVICE_DURATION_PRESETS.map((mins) => {
                        const selected =
                          String(extraFields.durationMinutes ?? "").trim() ===
                          String(mins);
                        return (
                          <button
                            key={mins}
                            type="button"
                            onClick={() => {
                              clearFieldError("durationMinutes");
                              setExtraFields((prev) => ({
                                ...prev,
                                durationMinutes: String(mins),
                              }));
                            }}
                            className={cn(
                              "rounded-md border px-2.5 py-1 text-[0.8125rem] font-medium transition",
                              selected
                                ? "border-[#1a56db] bg-[#e8eefb] text-[#1a56db]"
                                : "border-[#d9e0ea] bg-white text-[#5a6b7d] hover:border-[#c5d0e0]",
                            )}
                          >
                            {mins} min
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        id="catalog-item-duration-minutes"
                        name="durationMinutes"
                        type="number"
                        min={1}
                        max={24 * 60}
                        step={1}
                        inputMode="numeric"
                        placeholder="Custom"
                        className="max-w-[8rem]"
                        value={extraFields.durationMinutes ?? ""}
                        onChange={(e) => {
                          clearFieldError("durationMinutes");
                          const raw = e.target.value;
                          setExtraFields((prev) => ({
                            ...prev,
                            durationMinutes: raw,
                          }));
                        }}
                      />
                      <span className="text-sm text-[#5a6b7d]">minutes</span>
                    </div>
                  </div>
                </ShopField>
              ) : null}

              {unitPricing && onUnitPricingChange ? (
                <div className="sm:col-span-2">
                  <UnitPricingFields
                    value={unitPricing}
                    onChange={onUnitPricingChange}
                    onBaseUnitSymbol={(symbol) => {
                      clearFieldError("unitOfMeasure");
                      setForm((f) => applyCatalogUnitChange(f, symbol));
                    }}
                  />
                </div>
              ) : null}

              {showPackedContents ? (
                <ShopField
                  label={`Qty in 1 ${packedUnitLabel}`}
                  required
                  hint={
                    fieldErrors.multiUnitBaseQty ? (
                      <FieldError message={fieldErrors.multiUnitBaseQty} />
                    ) : (
                      <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">
                        How many {form.multiUnitBaseUnit || "pcs"} are inside
                        one {form.unitOfMeasure || "box"}. Stock is still
                        counted in {form.unitOfMeasure || "box"}
                        {packedContentsHint ? (
                          <>
                            {" "}
                            —{" "}
                            <span className="font-semibold text-[#0b1f33]">
                              {packedContentsHint}
                            </span>
                          </>
                        ) : (
                          "."
                        )}
                      </p>
                    )
                  }
                >
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0.001}
                      step={
                        allowsDecimalQty(form.multiUnitBaseUnit || "pcs")
                          ? "0.001"
                          : "1"
                      }
                      placeholder={
                        (form.unitOfMeasure || "").toLowerCase() === "dozen"
                          ? "12"
                          : "e.g. 12"
                      }
                      value={form.multiUnitBaseQty}
                      onChange={(e) => {
                        clearFieldError("multiUnitBaseQty");
                        setForm((f) => ({
                          ...f,
                          multiUnitBaseQty: e.target.value,
                        }));
                      }}
                    />
                    <Select
                      className={cn(fieldSelect, "w-28 shrink-0")}
                      value={form.multiUnitBaseUnit || "pcs"}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          multiUnitBaseUnit: e.target.value,
                        }))
                      }
                    >
                      <option value="pcs">pcs</option>
                      <option value="g">g</option>
                      <option value="ml">ml</option>
                      <option value="kg">kg</option>
                    </Select>
                  </div>
                </ShopField>
              ) : null}

              <ShopField
                label="Rate"
                required
                htmlFor="catalog-item-rate"
                hint={
                  fieldErrors.basePrice ? (
                    <FieldError message={fieldErrors.basePrice} />
                  ) : (
                    <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">
                      Selling price per {form.unitOfMeasure || "unit"}
                    </p>
                  )
                }
              >
                <Input
                  id="catalog-item-rate"
                  name="basePrice"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={form.basePrice}
                  onChange={(e) => {
                    clearFieldError("basePrice");
                    setForm((f) => ({ ...f, basePrice: e.target.value }));
                  }}
                />
              </ShopField>

              {showStockFields ? (
                <ShopField
                  label="Stock on Hand"
                  hint={
                    fieldErrors.openingQty ? (
                      <FieldError message={fieldErrors.openingQty} />
                    ) : stockReadOnly ? (
                      <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">
                        Current at {stockLocationName ?? "this branch"} — change
                        in{" "}
                        <Link href="/inventory" className="text-[#1a56db]">
                          Inventory
                        </Link>
                        {form.trackSerial
                          ? " (serial items: register serials or Stock In with serials)"
                          : ""}
                      </p>
                    ) : form.trackSerial ? (
                      <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">
                        Serial tracking is on — leave this at 0. After save,
                        register each unit on Serials (or Stock In). Each serial
                        adds 1 to Stock on Hand.
                      </p>
                    ) : (
                      <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">
                        Shown on Items as qty + unit — e.g.{" "}
                        <span className="font-semibold text-[#0b1f33]">
                          {formatQtyWithUnit(
                            form.openingQty.trim() !== "" &&
                              Number.isFinite(Number(form.openingQty))
                              ? Number(form.openingQty)
                              : 10,
                            form.unitOfMeasure || "pcs",
                          )}
                        </span>
                        {showPackedContents &&
                        Number.isFinite(packedQtyNum) &&
                        packedQtyNum > 0
                          ? ` (${formatQtyWithUnit(
                              (form.openingQty.trim() !== "" &&
                              Number.isFinite(Number(form.openingQty))
                                ? Number(form.openingQty)
                                : 10) * packedQtyNum,
                              form.multiUnitBaseUnit || "pcs",
                            )} inside)`
                          : null}
                      </p>
                    )
                  }
                >
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly={stockReadOnly || form.trackSerial}
                      className={
                        stockReadOnly || form.trackSerial
                          ? "bg-[#f4f6fa]"
                          : undefined
                      }
                      type={
                        stockReadOnly || form.trackSerial ? "text" : "number"
                      }
                      min={
                        stockReadOnly || form.trackSerial ? undefined : 0
                      }
                      step={
                        stockReadOnly || form.trackSerial
                          ? undefined
                          : qtyAllowsDecimal
                            ? "0.001"
                            : "1"
                      }
                      placeholder={
                        stockReadOnly || form.trackSerial
                          ? undefined
                          : qtyAllowsDecimal
                            ? "e.g. 12.5"
                            : "e.g. 50"
                      }
                      value={
                        stockReadOnly
                          ? (stockOnHandDisplay ?? "—")
                          : form.trackSerial
                            ? "0"
                            : form.openingQty
                      }
                      onChange={
                        stockReadOnly || form.trackSerial
                          ? undefined
                          : (e) => {
                              clearFieldError("openingQty");
                              setForm((f) => ({
                                ...f,
                                openingQty: e.target.value,
                              }));
                            }
                      }
                    />
                    <span className="shrink-0 rounded-md bg-[#f1f5f9] px-2.5 py-2 text-sm font-semibold text-[#5a6b7d]">
                      {form.unitOfMeasure || "pcs"}
                    </span>
                  </div>
                </ShopField>
              ) : (
                <ShopField
                  label="Stock on Hand"
                  hint={
                    <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">
                      {stockNotNeeded
                        ? form.kind === "bundle"
                          ? "Not used for combo packs — stock comes from items inside."
                          : form.kind === "service"
                            ? "Not used for services — nothing to count."
                            : "Not used for digital items — nothing to count."
                        : "Turn on “Track inventory” below to enter opening qty."}
                    </p>
                  }
                >
                  <div className="flex items-center gap-2">
                    <Input
                      disabled
                      readOnly
                      className="bg-[#f4f6fa] text-[#8b9bb0]"
                      value="Not counted"
                    />
                    <span className="shrink-0 rounded-md bg-[#f1f5f9] px-2.5 py-2 text-sm font-semibold text-[#8b9bb0]">
                      {form.unitOfMeasure || "pcs"}
                    </span>
                  </div>
                </ShopField>
              )}

              {showStockFields ? (
                <ShopField
                  label="Reorder Point"
                  hint={
                    fieldErrors.reorderPoint ? (
                      <FieldError message={fieldErrors.reorderPoint} />
                    ) : (
                      <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">
                        Alert when stock falls to this qty in{" "}
                        {form.unitOfMeasure || "pcs"} (optional)
                      </p>
                    )
                  }
                >
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      step={qtyAllowsDecimal ? "0.001" : "1"}
                      placeholder="e.g. 5"
                      value={form.reorderPoint}
                      onChange={(e) => {
                        clearFieldError("reorderPoint");
                        setForm((f) => ({
                          ...f,
                          reorderPoint: e.target.value,
                        }));
                      }}
                    />
                    <span className="shrink-0 rounded-md bg-[#f1f5f9] px-2.5 py-2 text-sm font-semibold text-[#5a6b7d]">
                      {form.unitOfMeasure || "pcs"}
                    </span>
                  </div>
                </ShopField>
              ) : null}
            </ShopSection>

            <ShopSection title="Pricing & tax">
              <ShopField
                label="Cost"
                htmlFor="catalog-item-cost"
                hint={<FieldError message={fieldErrors.costPrice} />}
              >
                <Input
                  id="catalog-item-cost"
                  name="costPrice"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="What you paid"
                  value={form.costPrice}
                  onChange={(e) => {
                    clearFieldError("costPrice");
                    setForm((f) => ({ ...f, costPrice: e.target.value }));
                  }}
                />
              </ShopField>
              <ShopField
                label="MRP"
                htmlFor="catalog-item-mrp"
                hint={<FieldError message={fieldErrors.mrp} />}
              >
                <Input
                  id="catalog-item-mrp"
                  name="mrp"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Printed price"
                  value={form.mrp}
                  onChange={(e) => {
                    clearFieldError("mrp");
                    setForm((f) => ({ ...f, mrp: e.target.value }));
                  }}
                />
              </ShopField>
              <ShopField
                label="Tax %"
                htmlFor="catalog-item-tax"
                hint={<FieldError message={fieldErrors.taxRatePercent} />}
              >
                <Input
                  id="catalog-item-tax"
                  name="taxRatePercent"
                  type="number"
                  min={0}
                  max={40}
                  step="0.01"
                  placeholder="5 or 18"
                  value={form.taxRatePercent}
                  onChange={(e) => {
                    clearFieldError("taxRatePercent");
                    setForm((f) => ({
                      ...f,
                      taxRatePercent: e.target.value,
                    }));
                  }}
                />
              </ShopField>
              <ShopField
                label="HSN / SAC"
                htmlFor="catalog-item-hsn"
                hint={<FieldError message={fieldErrors.taxCode} />}
              >
                <Input
                  id="catalog-item-hsn"
                  name="taxCode"
                  placeholder="e.g. GST18 or HSN"
                  value={form.taxCode}
                  onChange={(e) => {
                    clearFieldError("taxCode");
                    setForm((f) => ({ ...f, taxCode: e.target.value }));
                  }}
                />
              </ShopField>
            </ShopSection>

            <ShopSection title="SKU & labels">
              <ShopField
                label="SKU"
                htmlFor="catalog-item-sku"
                hint={<FieldError message={fieldErrors.skuCode} />}
              >
                <div className="flex">
                  <Input
                    id="catalog-item-sku"
                    name="skuCode"
                    className="rounded-r-none font-mono uppercase"
                    placeholder="Leave empty to auto-create"
                    value={form.skuCode}
                    onChange={(e) => {
                      clearFieldError("skuCode");
                      setForm((f) => ({ ...f, skuCode: e.target.value }));
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-10 shrink-0 rounded-l-none border-l-0"
                    disabled={skuPending}
                    onClick={onGenerateSku}
                  >
                    Generate
                  </Button>
                </div>
              </ShopField>
              {form.barcode ? (
                <ShopField label="Label">
                  <ProductBarcodePreview
                    className="max-w-xs"
                    value={form.barcode}
                    barcodeType={form.barcodeType}
                    productName={form.name || undefined}
                    sku={form.skuCode || undefined}
                    showPrint
                  />
                </ShopField>
              ) : null}
            </ShopSection>

            <ShopSection title="Inventory tracking">
              <div className="grid gap-2.5 sm:grid-cols-2">
                {trackingFlags.map(([key, label]) => {
                  const lockedOff = isTrackingFlagLocked(
                    key,
                    form.kind,
                    form.trackInventory,
                  );
                  return (
                    <div
                      key={key}
                      className={cn(
                        "flex items-center gap-2 text-sm text-[#0b1f33]",
                        lockedOff && "opacity-60",
                      )}
                    >
                      <label
                        className={cn(
                          "flex min-w-0 flex-1 items-center gap-2",
                          lockedOff ? "cursor-not-allowed" : "cursor-pointer",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="accent-[#1a56db] disabled:cursor-not-allowed"
                          checked={form[key]}
                          disabled={lockedOff}
                          onChange={(e) =>
                            setForm((f) =>
                              patchCatalogTrackingFlags(
                                f,
                                key,
                                e.target.checked,
                              ),
                            )
                          }
                        />
                        <span>{label}</span>
                      </label>
                      <FlagInfo text={trackingFlagHelp(key, form.kind)} />
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[0.75rem] text-[#5a6b7d]">
                {stockNotNeeded
                  ? form.kind === "bundle"
                    ? "Combo packs don’t keep their own stock — quantity comes from items inside. Track inventory stays off."
                    : form.kind === "service"
                      ? "Services don’t need stock. Track inventory is off and can’t be turned on for this type."
                      : "Digital items don’t need stock. Track inventory is off and can’t be turned on for this type."
                  : form.trackInventory
                    ? form.kind === "rental"
                      ? "Rental units are counted when you rent out or return stock."
                      : "Stock on Hand is counted when you sell or stock in."
                    : "Stock is not counted — Stock on Hand stays locked. You can still sell if “Can sell” is on."}
              </p>
            </ShopSection>

            {(customFieldsLoading || otherFormFields.length > 0) ? (
              <CustomFieldsSection
                title="Shop & custom fields"
                hint="From your business type (e.g. size/colour, pack size, diet tag) plus Settings → Custom fields. Core Item form stays the same for every shop."
                fields={otherFormFields}
                loading={customFieldsLoading}
                values={extraFields}
                errors={fieldErrors}
                onChange={(key, value) => {
                  clearFieldError(key);
                  setExtraFields((prev) => ({ ...prev, [key]: value }));
                }}
              />
            ) : null}

            <div className="pt-5">
              <button
                type="button"
                className="text-sm font-semibold text-[#1a56db] hover:underline"
                onClick={() => setShowMore((v) => !v)}
              >
                {showMore ? "Hide extra details" : "More details (optional)"}
              </button>
              {showMore ? (
                <div className="mt-4 space-y-3.5">
                  <ShopField
                    label="Short name"
                    htmlFor="catalog-item-short-name"
                    hint={<FieldError message={fieldErrors.shortName} />}
                  >
                    <Input
                      id="catalog-item-short-name"
                      name="shortName"
                      placeholder="Short name on receipt / ticket"
                      value={form.shortName}
                      onChange={(e) => {
                        clearFieldError("shortName");
                        setForm((f) => ({ ...f, shortName: e.target.value }));
                      }}
                    />
                  </ShopField>
                  <ShopField
                    label="Internal code"
                    htmlFor="catalog-item-internal-code"
                    hint={<FieldError message={fieldErrors.internalCode} />}
                  >
                    <Input
                      id="catalog-item-internal-code"
                      name="internalCode"
                      value={form.internalCode}
                      onChange={(e) => {
                        clearFieldError("internalCode");
                        setForm((f) => ({
                          ...f,
                          internalCode: e.target.value,
                        }));
                      }}
                    />
                  </ShopField>
                  <ShopField
                    label="Short description"
                    htmlFor="catalog-item-short-desc"
                    hint={
                      <FieldError message={fieldErrors.shortDescription} />
                    }
                  >
                    <Input
                      id="catalog-item-short-desc"
                      name="shortDescription"
                      value={form.shortDescription}
                      onChange={(e) => {
                        clearFieldError("shortDescription");
                        setForm((f) => ({
                          ...f,
                          shortDescription: e.target.value,
                        }));
                      }}
                    />
                  </ShopField>
                  <ShopField
                    label="Description"
                    htmlFor="catalog-item-description"
                    hint={<FieldError message={fieldErrors.description} />}
                  >
                    <textarea
                      id="catalog-item-description"
                      name="description"
                      className={textareaClass}
                      value={form.description}
                      onChange={(e) => {
                        clearFieldError("description");
                        setForm((f) => ({
                          ...f,
                          description: e.target.value,
                        }));
                      }}
                    />
                  </ShopField>
                </div>
              ) : null}
            </div>
          </div>

          <aside className="border-t border-[#eef1f4] bg-[#fafbfc] px-4 py-5 lg:border-t-0 lg:border-l">
            <p className="mb-3 text-[0.72rem] font-bold uppercase tracking-[0.08em] text-[#21263c]">
              Photos
            </p>
            {photosExtra}
            <ProductImagePicker
              ref={imagePickerRef}
              variant="item"
              label=""
              productName={form.name}
              productHint={form.shortDescription || form.description}
            />
          </aside>
        </div>

        <footer className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 border-t border-[#eef1f4] bg-white/95 px-4 py-3.5 backdrop-blur-sm sm:px-6">
          <Button variant="secondary" size="sm" asChild>
            <Link href={cancelHref}>Cancel</Link>
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={
              form.name.trim().length < 2 ||
              Boolean(barcodeError) ||
              savePending
            }
            onClick={onSave}
          >
            {savePending ? "Saving…" : "Save"}
          </Button>
        </footer>
      </div>
    </div>
  );
}
