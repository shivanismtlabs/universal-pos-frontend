"use client";

import {
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
  FOOD_TYPE_OPTIONS,
  FoodTypeBadge,
  type FoodType,
} from "@/components/food-type-badge";

export const CATALOG_ITEM_KINDS: { id: CatalogProductKind; label: string }[] = [
  { id: "physical", label: "Goods" },
  { id: "service", label: "Service" },
  { id: "digital", label: "Digital" },
  { id: "bundle", label: "Combo" },
  { id: "rental", label: "Rental" },
];

const fieldSelect =
  "mt-0 h-10 w-full rounded-lg border border-[#d9e0ea] bg-white px-3 text-sm text-[#0b1f33] outline-none focus:border-[#1a56db] focus:shadow-[0_0_0_3px_rgba(26,86,219,0.12)]";
const textareaClass =
  "min-h-[72px] w-full rounded-lg border border-[#d9e0ea] bg-white px-3 py-2 text-sm outline-none focus:border-[#1a56db] focus:shadow-[0_0_0_3px_rgba(26,86,219,0.12)]";

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
};

export function applyCatalogKindDefaults<T extends CatalogItemShopValues>(
  prev: T,
  kind: CatalogProductKind,
): T {
  const nonStock =
    kind === "service" || kind === "digital" || kind === "bundle";
  return {
    ...prev,
    kind,
    trackInventory: nonStock ? false : true,
    trackSerial: nonStock ? false : prev.trackSerial,
    trackBatch: nonStock ? false : prev.trackBatch,
    canPurchase: kind === "service" || kind === "digital" ? false : true,
    unitOfMeasure:
      kind === "service"
        ? "service"
        : prev.unitOfMeasure === "service"
          ? "pcs"
          : prev.unitOfMeasure,
  };
}

/** Keep serial/batch flags consistent with inventory tracking. */
export function patchCatalogTrackingFlags<T extends CatalogItemShopValues>(
  prev: T,
  key: keyof CatalogItemShopValues,
  checked: boolean,
): T {
  if (key === "trackInventory") {
    if (!checked) {
      return {
        ...prev,
        trackInventory: false,
        trackSerial: false,
        trackBatch: false,
      };
    }
    return { ...prev, trackInventory: true };
  }
  if (key === "trackSerial") {
    if (checked) {
      return {
        ...prev,
        trackSerial: true,
        trackInventory: true,
        openingQty: "0",
      };
    }
    return { ...prev, trackSerial: false };
  }
  if (key === "trackBatch") {
    if (checked) {
      return {
        ...prev,
        trackBatch: true,
        trackInventory: true,
      };
    }
    return { ...prev, trackBatch: false };
  }
  return { ...prev, [key]: checked };
}

function ShopField({
  label,
  required,
  children,
  hint,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[148px_minmax(0,1fr)] sm:items-start">
      <Label className="sm:pt-2.5">
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
}) {
  const [showMore, setShowMore] = useState(false);
  const foodTypeField = productFormFields.find((f) => f.key === "foodType");
  const otherFormFields = productFormFields.filter((f) => f.key !== "foodType");

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
        </header>

        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
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
                hint={<FieldError message={fieldErrors.name} />}
              >
                <Input
                  autoFocus
                  placeholder="What you sell — e.g. Dairy milk 55g"
                  value={form.name}
                  onChange={(e) => {
                    clearFieldError("name");
                    setForm((f) => ({ ...f, name: e.target.value }));
                  }}
                />
              </ShopField>

              <ShopField label="Type" required>
                <div className="flex flex-wrap gap-2">
                  {CATALOG_ITEM_KINDS.map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() =>
                        setForm((f) => applyCatalogKindDefaults(f, k.id))
                      }
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
                        "Shows on menus for restaurant & café only — not used for retail/salon."}
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
                />
              </ShopField>

              <ShopField
                label="Unit"
                required
                hint={
                  fieldErrors.unitOfMeasure ? (
                    <FieldError message={fieldErrors.unitOfMeasure} />
                  ) : (
                    <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">
                      pcs, kg, litre…{" "}
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
                    setForm((f) => ({
                      ...f,
                      unitOfMeasure: e.target.value,
                    }));
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

              <ShopField
                label="Rate"
                required
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

              {form.trackInventory ? (
                <ShopField
                  label="Stock on Hand"
                  hint={
                    fieldErrors.openingQty ? (
                      <FieldError message={fieldErrors.openingQty} />
                    ) : stockReadOnly ? (
                      <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">
                        Current qty at {stockLocationName ?? "this branch"} —
                        change in{" "}
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
                        Quantity at {stockLocationName ?? "this branch"} — same
                        value appears on the Items list.
                      </p>
                    )
                  }
                >
                  <Input
                    readOnly={stockReadOnly || form.trackSerial}
                    className={
                      stockReadOnly || form.trackSerial
                        ? "bg-[#f4f6fa]"
                        : undefined
                    }
                    type={stockReadOnly || form.trackSerial ? "text" : "number"}
                    min={stockReadOnly || form.trackSerial ? undefined : 0}
                    step={stockReadOnly || form.trackSerial ? undefined : "any"}
                    placeholder={
                      stockReadOnly || form.trackSerial ? undefined : "e.g. 50"
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
                </ShopField>
              ) : null}

              {form.trackInventory ? (
                <ShopField
                  label="Reorder Point"
                  hint={
                    fieldErrors.reorderPoint ? (
                      <FieldError message={fieldErrors.reorderPoint} />
                    ) : (
                      <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">
                        Alert when stock falls to this qty (optional)
                      </p>
                    )
                  }
                >
                  <Input
                    type="number"
                    min={0}
                    step={1}
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
                </ShopField>
              ) : null}
            </ShopSection>

            <ShopSection title="Pricing & tax">
              <ShopField
                label="Cost"
                hint={<FieldError message={fieldErrors.costPrice} />}
              >
                <Input
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
                hint={<FieldError message={fieldErrors.mrp} />}
              >
                <Input
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
                hint={<FieldError message={fieldErrors.taxRatePercent} />}
              >
                <Input
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
                hint={<FieldError message={fieldErrors.taxCode} />}
              >
                <Input
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
                hint={<FieldError message={fieldErrors.skuCode} />}
              >
                <div className="flex">
                  <Input
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
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["trackInventory", "Track inventory"],
                    ["trackSerial", "Serial numbers"],
                    ["trackBatch", "Batch & expiry"],
                    ["canSell", "Can sell"],
                    ["canPurchase", "Can purchase"],
                    ["availableInPos", "Show on counter"],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 text-sm text-[#0b1f33]"
                  >
                    <input
                      type="checkbox"
                      className="accent-[#1a56db]"
                      checked={form[key]}
                      onChange={(e) =>
                        setForm((f) =>
                          patchCatalogTrackingFlags(f, key, e.target.checked),
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
              {form.trackSerial ? (
                <p className="mt-2 text-[0.75rem] text-[#5a6b7d]">
                  After save, register each unit on the item’s{" "}
                  <strong className="font-semibold text-[#0b1f33]">
                    Serials
                  </strong>{" "}
                  tab (or use Inventory → Stock In with serials).{" "}
                  <strong className="font-semibold text-[#0b1f33]">
                    Each serial adds 1 to Stock on Hand
                  </strong>
                  — do not type a free stock number while serial tracking is on.
                </p>
              ) : null}
            </ShopSection>

            {(customFieldsLoading || otherFormFields.length > 0) ? (
              <CustomFieldsSection
                hint="These boxes come from Settings → Custom fields (choose Product). They save with the item."
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
                  <ShopField label="Brand">
                    <Select
                      className={fieldSelect}
                      value={form.brandId}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, brandId: e.target.value }))
                      }
                    >
                      <option value="">None</option>
                      {brands.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </Select>
                  </ShopField>
                  <ShopField
                    label="Short name"
                    hint={<FieldError message={fieldErrors.shortName} />}
                  >
                    <Input
                      placeholder="Receipt / KOT short name"
                      value={form.shortName}
                      onChange={(e) => {
                        clearFieldError("shortName");
                        setForm((f) => ({ ...f, shortName: e.target.value }));
                      }}
                    />
                  </ShopField>
                  <ShopField
                    label="Internal code"
                    hint={<FieldError message={fieldErrors.internalCode} />}
                  >
                    <Input
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
                    label="Short description"
                    hint={
                      <FieldError message={fieldErrors.shortDescription} />
                    }
                  >
                    <Input
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
                    hint={<FieldError message={fieldErrors.description} />}
                  >
                    <textarea
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
