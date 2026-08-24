"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { catalogApi, customFieldsApi, tenantsApi, type CatalogProductKind } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useBootstrap } from "@/lib/bootstrap";
import { useBranchStore } from "@/lib/branch-store";
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
import {
  createCatalogProductSchema,
  zodFieldErrors,
  zodMessages,
} from "@/lib/validations";

import { activeUnitOptions } from "@/lib/measure-units";
import {
  CUSTOM_FIELD_QUERY,
  mergeProductFormFields,
} from "@/lib/product-form-fields";
import { CustomFieldsSection } from "@/components/custom-field-inputs";
import { cn } from "@/lib/utils";

const KINDS: { id: CatalogProductKind; label: string }[] = [
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

export default function NewCatalogProductPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const imagePickerRef = useRef<ProductImagePickerHandle>(null);
  const { data: boot, itemMetaFields } = useBootstrap();
  const customFieldsQ = useQuery({
    queryKey: ["custom-fields", "product"],
    queryFn: () => customFieldsApi.listProductDefinitions(),
    ...CUSTOM_FIELD_QUERY,
  });
  const productFormFields = useMemo(
    () => mergeProductFormFields(customFieldsQ.data, itemMetaFields),
    [customFieldsQ.data, itemMetaFields],
  );
  const currentLocationId = useBranchStore((s) => s.currentLocationId);
  const defaultLocationId =
    currentLocationId || boot?.locations?.[0]?.id;
  const cats = useQuery({
    queryKey: ["catalog-categories"],
    queryFn: () => catalogApi.listCategories(),
  });
  const brands = useQuery({
    queryKey: ["catalog-brands"],
    queryFn: () => catalogApi.listBrands(),
  });
  const unitsQ = useQuery({
    queryKey: ["measure-units"],
    queryFn: () => tenantsApi.listUnits(),
  });
  const unitOptions = useMemo(
    () => activeUnitOptions(unitsQ.data),
    [unitsQ.data],
  );

  /** Values for Settings → Custom fields (Product). */
  const [extraFields, setExtraFields] = useState<Record<string, string>>({});
  const [showMore, setShowMore] = useState(false);

  const [form, setForm] = useState({
    name: "",
    shortName: "",
    kind: "physical" as CatalogProductKind,
    status: "active" as const,
    skuCode: "",
    barcode: "",
    barcodeType: "code128",
    internalCode: "",
    categoryId: "",
    brandId: "",
    shortDescription: "",
    description: "",
    basePrice: "0",
    costPrice: "",
    mrp: "",
    taxCode: "",
    taxRatePercent: "5",
    unitOfMeasure: "pcs",
    trackInventory: true,
    trackSerial: false,
    trackBatch: false,
    canSell: true,
    canPurchase: true,
    availableInPos: true,
    openingQty: "1",
    reorderPoint: "",
  });

  const applyKindDefaults = (kind: CatalogProductKind) => {
    const nonStock = kind === "service" || kind === "digital" || kind === "bundle";
    setForm((f) => ({
      ...f,
      kind,
      trackInventory: nonStock ? false : true,
      canPurchase: kind === "service" || kind === "digital" ? false : true,
      unitOfMeasure:
        kind === "service" ? "service" : f.unitOfMeasure === "service" ? "pcs" : f.unitOfMeasure,
    }));
  };

  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const clearFieldError = (key: string) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const genSku = useMutation({
    mutationFn: () =>
      catalogApi.generateSku({ name: form.name, kind: form.kind }),
    onSuccess: (r) => {
      setForm((f) => ({ ...f, skuCode: r.sku }));
      clearFieldError("skuCode");
      toast.success("SKU generated");
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "SKU failed"),
  });

  const genBarcode = useMutation({
    mutationFn: () => catalogApi.generateBarcode(),
    onSuccess: (r) => {
      setForm((f) => ({
        ...f,
        barcode: r.barcode,
        barcodeType: r.barcodeType || "code128",
      }));
      setBarcodeError(null);
      toast.success("Code 128 barcode generated");
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Barcode failed"),
  });

  useEffect(() => {
    const code = form.barcode.trim();
    if (!code) {
      setBarcodeError(null);
      return;
    }
    const t = window.setTimeout(() => {
      void catalogApi
        .checkBarcode(code)
        .then((r) => {
          if (!r.available) {
            setBarcodeError(
              r.reason === "duplicate"
                ? "Barcode already exists"
                : "Invalid barcode",
            );
          } else {
            setBarcodeError(null);
            setForm((f) =>
              f.barcodeType === r.barcodeType
                ? f
                : { ...f, barcodeType: r.barcodeType },
            );
          }
        })
        .catch(() => {
          /* ignore transient */
        });
    }, 400);
    return () => window.clearTimeout(t);
  }, [form.barcode]);

  const save = useMutation({
    mutationFn: () => {
      if (barcodeError) {
        throw new Error(barcodeError);
      }
      const parsed = createCatalogProductSchema.safeParse({
        name: form.name,
        kind: form.kind,
        status: form.status,
        skuCode: form.skuCode,
        barcode: form.barcode,
        basePrice: form.basePrice,
        costPrice: form.costPrice,
        mrp: form.mrp,
        taxRatePercent: form.taxRatePercent,
        unitOfMeasure: form.unitOfMeasure,
        trackInventory: form.trackInventory,
        openingQty: form.openingQty,
      });
      if (!parsed.success) {
        setFieldErrors(zodFieldErrors(parsed.error));
        const msg = zodMessages(parsed.error)[0] ?? "Check the form";
        toast.error(msg);
        throw new Error(msg);
      }
      setFieldErrors({});
      const photos = imagePickerRef.current?.getUploadDataUrls() ?? [];
      return catalogApi.createProduct({
        name: form.name.trim(),
        shortName: form.shortName.trim() || undefined,
        kind: form.kind,
        status: form.status,
        skuCode: form.skuCode.trim() || undefined,
        barcode: form.barcode.trim() || undefined,
        barcodeType: form.barcode.trim()
          ? form.barcodeType || "code128"
          : undefined,
        internalCode: form.internalCode.trim() || undefined,
        categoryId: form.categoryId || undefined,
        brandId: form.brandId || undefined,
        shortDescription: form.shortDescription.trim() || undefined,
        description: form.description.trim() || undefined,
        basePrice: Number(form.basePrice) || 0,
        costPrice: form.costPrice ? Number(form.costPrice) : undefined,
        mrp: form.mrp ? Number(form.mrp) : undefined,
        taxCode: (() => {
          const rate = Number(form.taxRatePercent);
          if (Number.isFinite(rate) && rate > 0) {
            return form.taxCode.trim() || `GST${rate}`;
          }
          return form.taxCode.trim() || undefined;
        })(),
        unitOfMeasure: form.unitOfMeasure,
        photoUrl: photos[0],
        images: photos.length ? photos : undefined,
        trackInventory: form.trackInventory,
        trackSerial: form.trackSerial,
        trackBatch: form.trackBatch,
        canSell: form.canSell,
        canPurchase: form.canPurchase,
        availableInPos: form.availableInPos,
        locationId: defaultLocationId || undefined,
        openingQty: form.trackInventory
          ? Number(form.openingQty)
          : undefined,
        reorderPoint: (() => {
          if (!form.trackInventory) return undefined;
          const n = Number(form.reorderPoint);
          return form.reorderPoint.trim() !== "" && Number.isFinite(n)
            ? n
            : undefined;
        })(),
        extraFields: (() => {
          const out: Record<string, unknown> = {};
          const rate = Number(form.taxRatePercent);
          if (Number.isFinite(rate) && rate >= 0) {
            out.taxRatePercent = rate;
          }
          if (!productFormFields.length) {
            return Object.keys(out).length ? out : undefined;
          }
          for (const f of productFormFields) {
            const v = (extraFields[f.key] ?? "").trim();
            if (v) out[f.key] = v;
          }
          return Object.keys(out).length ? out : undefined;
        })(),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["catalog-products"] });
      void qc.invalidateQueries({ queryKey: ["catalog-products-home"] });
      void qc.invalidateQueries({ queryKey: ["catalog-products-all"] });
      void qc.invalidateQueries({ queryKey: ["pos-sale-products"] });
      void qc.invalidateQueries({ queryKey: ["pos-sale-catalog"] });
      void qc.invalidateQueries({ queryKey: ["pos-sale-floor"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-catalog"] });
      void qc.invalidateQueries({ queryKey: ["retail-skus"] });
      toast.success("Product created");
      router.push("/catalog");
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : e.message || "Save failed"),
  });

  const unitSelect = (
    <Select
      className={fieldSelect}
      value={form.unitOfMeasure}
      onChange={(e) =>
        setForm((f) => ({ ...f, unitOfMeasure: e.target.value }))
      }
    >
      {unitOptions.some((u) => u.code === form.unitOfMeasure) ? null : (
        <option value={form.unitOfMeasure}>{form.unitOfMeasure}</option>
      )}
      {unitOptions.map((u) => (
        <option key={u.code} value={u.code}>
          {u.name} ({u.code})
        </option>
      ))}
    </Select>
  );

  return (
    <div className="mx-auto max-w-5xl pb-10">
      <div className="overflow-hidden rounded-md border border-[#d9e0ea] bg-white shadow-[0_1px_2px_rgba(11,31,51,0.04)]">
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-[#eef1f4] bg-white px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h1 className="text-[1.15rem] font-semibold tracking-tight text-[#21263c]">
              New Item
            </h1>
            <p className="mt-0.5 text-[0.75rem] text-[#6b7c93]">
              Scan a barcode, enter name and rate, then save — same flow as the
              shop counter.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" asChild>
              <Link href="/catalog">Cancel</Link>
            </Button>
            <Button
              size="sm"
              disabled={!form.name.trim() || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>

        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="divide-y divide-[#eef1f4] px-4 py-5 sm:px-6">
            <ShopSection title="At the counter">
              <ShopField
                label="Barcode"
                hint={
                  barcodeError ? (
                    <p className="mt-1 text-xs text-rose-600">{barcodeError}</p>
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
                      onChange={(barcode) =>
                        setForm((f) => ({ ...f, barcode }))
                      }
                      onScan={(barcode) => {
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
                    disabled={genBarcode.isPending}
                    onClick={() => genBarcode.mutate()}
                  >
                    {genBarcode.isPending ? "…" : "Generate"}
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
                  {KINDS.map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => applyKindDefaults(k.id)}
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

              <ShopField label="Category">
                <CategorySelectCombobox
                  value={form.categoryId}
                  onChange={(val) => setForm((f) => ({ ...f, categoryId: val }))}
                  categories={cats.data ?? []}
                />
              </ShopField>

              <ShopField
                label="Unit"
                required
                hint={
                  <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">
                    pcs, kg, litre…{" "}
                    <Link href="/settings/units" className="text-[#1a56db]">
                      Settings → Units
                    </Link>
                  </p>
                }
              >
                {unitSelect}
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
                    ) : (
                      <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">
                        Opening qty at this location
                      </p>
                    )
                  }
                >
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={form.openingQty}
                    onChange={(e) => {
                      clearFieldError("openingQty");
                      setForm((f) => ({ ...f, openingQty: e.target.value }));
                    }}
                  />
                </ShopField>
              ) : null}

              {form.trackInventory ? (
                <ShopField
                  label="Reorder Point"
                  hint={
                    <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">
                      Alert when stock falls to this qty (optional)
                    </p>
                  }
                >
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="e.g. 5"
                    value={form.reorderPoint}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, reorderPoint: e.target.value }))
                    }
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
              <ShopField label="HSN / SAC">
                <Input
                  placeholder="e.g. GST18 or HSN"
                  value={form.taxCode}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, taxCode: e.target.value }))
                  }
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
                    onClick={() => genSku.mutate()}
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
                        setForm((f) => ({ ...f, [key]: e.target.checked }))
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </ShopSection>

            <CustomFieldsSection
              hint="These boxes come from Settings → Custom fields (choose Product). They save with the item."
              fields={productFormFields}
              loading={customFieldsQ.isLoading}
              values={extraFields}
              onChange={(key, value) =>
                setExtraFields((prev) => ({ ...prev, [key]: value }))
              }
            />

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
                      {(brands.data ?? []).map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </Select>
                  </ShopField>
                  <ShopField label="Short name">
                    <Input
                      placeholder="Receipt / KOT short name"
                      value={form.shortName}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, shortName: e.target.value }))
                      }
                    />
                  </ShopField>
                  <ShopField label="Internal code">
                    <Input
                      value={form.internalCode}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          internalCode: e.target.value,
                        }))
                      }
                    />
                  </ShopField>
                  <ShopField label="Status">
                    <Select
                      className={fieldSelect}
                      value={form.status}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          status: e.target.value as typeof f.status,
                        }))
                      }
                    >
                      <option value="active">Active</option>
                      <option value="draft">Draft</option>
                      <option value="inactive">Inactive</option>
                    </Select>
                  </ShopField>
                  <ShopField label="Short description">
                    <Input
                      value={form.shortDescription}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          shortDescription: e.target.value,
                        }))
                      }
                    />
                  </ShopField>
                  <ShopField label="Description">
                    <textarea
                      className={textareaClass}
                      value={form.description}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          description: e.target.value,
                        }))
                      }
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
            <ProductImagePicker
              ref={imagePickerRef}
              variant="item"
              label=""
              productName={form.name}
              productHint={form.shortDescription || form.description}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}
