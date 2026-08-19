"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { catalogApi, type CatalogProductKind } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { ApiError } from "@/lib/api/client";
import { useBootstrap } from "@/lib/bootstrap";
import { useBranchStore } from "@/lib/branch-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/form";
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

const UNITS = [
  "pcs",
  "pack",
  "kg",
  "g",
  "L",
  "ml",
  "m",
  "box",
  "hour",
  "day",
  "service",
];

const KINDS: { id: CatalogProductKind; label: string }[] = [
  { id: "physical", label: "Physical" },
  { id: "service", label: "Service" },
  { id: "digital", label: "Digital" },
  { id: "bundle", label: "Bundle / combo" },
  { id: "rental", label: "Rental" },
];

const fieldSelect =
  "mt-1 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-sm";
const textareaClass =
  "mt-1 min-h-[72px] w-full rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-sm";

export default function NewCatalogProductPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const imagePickerRef = useRef<ProductImagePickerHandle>(null);
  const { itemMetaFields, businessConfig, businessType, data: boot } =
    useBootstrap();
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

  /** Org custom / profile extras (from business config itemFields). */
  const [extraFields, setExtraFields] = useState<Record<string, string>>({});

  const profileLabel = useMemo(() => {
    return businessConfig?.label || businessType || "Shop";
  }, [businessConfig?.label, businessType]);

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
        extraFields: (() => {
          const out: Record<string, unknown> = {};
          const rate = Number(form.taxRatePercent);
          if (Number.isFinite(rate) && rate >= 0) {
            out.taxRatePercent = rate;
          }
          if (!itemMetaFields.length) {
            return Object.keys(out).length ? out : undefined;
          }
          for (const f of itemMetaFields) {
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

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="New Item"
        subtitle="Catalog definition - name, pricing, IDs, and inventory flags"
        action={
          <Button variant="ghost" asChild>
            <Link href="/catalog">Cancel</Link>
          </Button>
        }
      />

      <section className="space-y-5 rounded-2xl border border-[#e5e7eb] bg-white p-5">
        <div className="grid gap-5 lg:grid-cols-[1fr_220px]">
          <div className="space-y-3">
            <div>
              <Label>Name *</Label>
              <Input
                className="mt-1"
                value={form.name}
                onChange={(e) => {
                  clearFieldError("name");
                  setForm((f) => ({ ...f, name: e.target.value }));
                }}
                placeholder="Item name"
              />
              <FieldError message={fieldErrors.name} />
            </div>
            <div>
              <Label>Type *</Label>
              <select
                className={fieldSelect}
                value={form.kind}
                onChange={(e) =>
                  applyKindDefaults(e.target.value as CatalogProductKind)
                }
              >
                {KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Category</Label>
              <select
                className={fieldSelect}
                value={form.categoryId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, categoryId: e.target.value }))
                }
              >
                <option value="">Select a category</option>
                {(cats.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.parent ? `${c.parent.name} / ` : ""}
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Brand</Label>
              <select
                className={fieldSelect}
                value={form.brandId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, brandId: e.target.value }))
                }
              >
                <option value="">Select or add brand</option>
                {(brands.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Short name</Label>
              <Input
                className="mt-1"
                value={form.shortName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, shortName: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Status</Label>
              <select
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
              </select>
            </div>
          </div>
          <div>
            <ProductImagePicker
              ref={imagePickerRef}
              variant="item"
              label="Upload item photos"
            />
          </div>
        </div>

        <div>
          <Label>Short description</Label>
          <Input
            className="mt-1"
            value={form.shortDescription}
            onChange={(e) =>
              setForm((f) => ({ ...f, shortDescription: e.target.value }))
            }
          />
        </div>
        <div>
          <Label>Full description</Label>
          <textarea
            className={textareaClass}
            value={form.description}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Unit *</Label>
            <select
              className={fieldSelect}
              value={form.unitOfMeasure}
              onChange={(e) =>
                setForm((f) => ({ ...f, unitOfMeasure: e.target.value }))
              }
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>SKU</Label>
            <div className="mt-1 flex">
              <Input
                className="rounded-r-none"
                value={form.skuCode}
                onChange={(e) => {
                  clearFieldError("skuCode");
                  setForm((f) => ({ ...f, skuCode: e.target.value }));
                }}
                placeholder="Type or generate"
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
            <FieldError message={fieldErrors.skuCode} />
          </div>
          <div className="sm:col-span-2">
            <Label>Internal code</Label>
            <Input
              className="mt-1"
              value={form.internalCode}
              onChange={(e) =>
                setForm((f) => ({ ...f, internalCode: e.target.value }))
              }
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Barcode</Label>
            <div className="mt-1 flex gap-2">
              <div className="min-w-0 flex-1">
                <BarcodeScanInput
                  value={form.barcode}
                  onChange={(barcode) => setForm((f) => ({ ...f, barcode }))}
                  onScan={(barcode) => {
                    setForm((f) => ({ ...f, barcode }));
                    toast.success("Barcode captured");
                  }}
                  label=""
                  placeholder="Scan, type, or leave empty"
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
                {genBarcode.isPending ? "..." : "Generate"}
              </Button>
            </div>
            {barcodeError ? (
              <p className="mt-1 text-xs text-rose-600">{barcodeError}</p>
            ) : (
              <p className="mt-1 text-[0.7rem] leading-snug text-[#6b7280]">
                Code 128 Â· USB scanner works in this field Â· empty = auto on
                save
              </p>
            )}
            <ProductBarcodePreview
              className="mt-3 max-w-xs"
              value={form.barcode}
              barcodeType={form.barcodeType}
              productName={form.name || undefined}
              sku={form.skuCode || undefined}
              showPrint
            />
          </div>
          <div>
            <Label>Selling price (Rate)</Label>
            <Input
              className="mt-1"
              type="number"
              min={0}
              step="0.01"
              value={form.basePrice}
              onChange={(e) => {
                clearFieldError("basePrice");
                setForm((f) => ({ ...f, basePrice: e.target.value }));
              }}
            />
            <FieldError message={fieldErrors.basePrice} />
          </div>
          <div>
            <Label>Cost price</Label>
            <Input
              className="mt-1"
              type="number"
              min={0}
              step="0.01"
              value={form.costPrice}
              onChange={(e) => {
                clearFieldError("costPrice");
                setForm((f) => ({ ...f, costPrice: e.target.value }));
              }}
            />
            <FieldError message={fieldErrors.costPrice} />
          </div>
          <div>
            <Label>MRP / list price</Label>
            <Input
              className="mt-1"
              type="number"
              min={0}
              step="0.01"
              value={form.mrp}
              onChange={(e) => {
                clearFieldError("mrp");
                setForm((f) => ({ ...f, mrp: e.target.value }));
              }}
            />
            <FieldError message={fieldErrors.mrp} />
          </div>
          <div>
            <Label>Tax rate %</Label>
            <Input
              className="mt-1"
              type="number"
              min={0}
              max={40}
              step="0.01"
              value={form.taxRatePercent}
              onChange={(e) => {
                clearFieldError("taxRatePercent");
                setForm((f) => ({ ...f, taxRatePercent: e.target.value }));
              }}
              placeholder="e.g. 5 or 18"
            />
            <FieldError message={fieldErrors.taxRatePercent} />
          </div>
          <div>
            <Label>Tax code / HSN / SAC</Label>
            <Input
              className="mt-1"
              value={form.taxCode}
              onChange={(e) =>
                setForm((f) => ({ ...f, taxCode: e.target.value }))
              }
              placeholder="e.g. GST18 or HSN"
            />
          </div>
          {form.trackInventory ? (
            <div>
              <Label>Opening qty (default location)</Label>
              <Input
                className="mt-1"
                type="number"
                min={1}
                step={1}
                value={form.openingQty}
                onChange={(e) => {
                  clearFieldError("openingQty");
                  setForm((f) => ({ ...f, openingQty: e.target.value }));
                }}
              />
              <FieldError message={fieldErrors.openingQty} />
            </div>
          ) : null}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["trackInventory", "Track inventory"],
              ["trackSerial", "Serial number tracking"],
              ["trackBatch", "Batch & expiry"],
              ["canSell", "Can sell"],
              ["canPurchase", "Can purchase"],
              ["availableInPos", "Available in POS"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
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

        {itemMetaFields.length ? (
          <div className="space-y-3">
            <p className="text-xs text-[#6b7280]">
              Extra fields for{" "}
              <span className="font-medium text-[#0b1f33]">{profileLabel}</span>{" "}
              {" "}- set when the organization was created.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {itemMetaFields.map((field) => (
                <div
                  key={field.key}
                  className={
                    field.type === "text" || field.type === "textarea"
                      ? "sm:col-span-2"
                      : undefined
                  }
                >
                  <Label>
                    {field.label}
                    {field.required ? " *" : ""}
                  </Label>
                  {field.type === "select" && field.options?.length ? (
                    <select
                      className={fieldSelect}
                      value={extraFields[field.key] ?? ""}
                      onChange={(e) =>
                        setExtraFields((prev) => ({
                          ...prev,
                          [field.key]: e.target.value,
                        }))
                      }
                    >
                      <option value="">Select</option>
                      {field.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : field.type === "number" ? (
                    <Input
                      className="mt-1"
                      type="number"
                      value={extraFields[field.key] ?? ""}
                      onChange={(e) =>
                        setExtraFields((prev) => ({
                          ...prev,
                          [field.key]: e.target.value,
                        }))
                      }
                      placeholder={field.hint}
                    />
                  ) : field.type === "text" || field.type === "textarea" ? (
                    <textarea
                      className={textareaClass}
                      value={extraFields[field.key] ?? ""}
                      onChange={(e) =>
                        setExtraFields((prev) => ({
                          ...prev,
                          [field.key]: e.target.value,
                        }))
                      }
                      placeholder={field.hint}
                    />
                  ) : (
                    <Input
                      className="mt-1"
                      value={extraFields[field.key] ?? ""}
                      onChange={(e) =>
                        setExtraFields((prev) => ({
                          ...prev,
                          [field.key]: e.target.value,
                        }))
                      }
                      placeholder={field.hint}
                    />
                  )}
                  {field.hint &&
                  field.type !== "text" &&
                  field.type !== "textarea" ? (
                    <p className="mt-1 text-[0.7rem] leading-snug text-[#6b7280]">
                      {field.hint}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <Button
          disabled={!form.name.trim() || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving..." : "Save"}
        </Button>
      </section>
    </div>
  );
}
