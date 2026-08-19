"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X } from "lucide-react";
import {
  catalogApi,
  type CatalogProductKind,
  type CatalogProductStatus,
} from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useBootstrap } from "@/lib/bootstrap";
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
import { ProductThumb } from "@/components/product-thumb";
import { ImageLightbox } from "@/components/image-lightbox";
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

const fieldControl =
  "h-9 w-full rounded-md border border-[#d9e0ea] bg-white px-2.5 text-sm text-[#0b1f33] outline-none focus:border-[#1a56db]";

function FieldRow({
  label,
  required,
  children,
  error,
  stacked,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
  error?: string;
  stacked?: boolean;
}) {
  return (
    <div
      className={
        stacked
          ? "space-y-1.5"
          : "grid grid-cols-[6.75rem_minmax(0,1fr)] items-center gap-x-4 gap-y-1"
      }
    >
      <label
        className={[
          "text-[0.8125rem] font-medium",
          required ? "text-[#c81e1e]" : "text-[#3d4f61]",
          stacked ? "" : "text-left",
        ].join(" ")}
      >
        {label}
        {required ? " *" : ""}
      </label>
      <div className="min-w-0">
        {children}
        {error ? (
          <p className="mt-1 text-[0.75rem] text-[#c81e1e]">{error}</p>
        ) : null}
      </div>
    </div>
  );
}

export default function EditCatalogProductRoute() {
  return (
    <Suspense
      fallback={<p className="p-8 text-sm text-[#5a6b7d]">Loading item…</p>}
    >
      <EditCatalogProductPage />
    </Suspense>
  );
}

function EditCatalogProductPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const search = useSearchParams();
  const id = search.get("id")?.trim() || "";
  const imagePickerRef = useRef<ProductImagePickerHandle>(null);
  const { itemMetaFields, businessConfig, businessType } = useBootstrap();
  const cats = useQuery({
    queryKey: ["catalog-categories"],
    queryFn: () => catalogApi.listCategories(),
  });
  const brands = useQuery({
    queryKey: ["catalog-brands"],
    queryFn: () => catalogApi.listBrands(),
  });
  const product = useQuery({
    queryKey: ["catalog-product", id],
    queryFn: () => catalogApi.getProduct(id),
    enabled: Boolean(id),
  });

  /** Org custom / profile extras (from business config itemFields). */
  const [extraFields, setExtraFields] = useState<Record<string, string>>({});
  const [hydrated, setHydrated] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const profileLabel = useMemo(() => {
    return businessConfig?.label || businessType || "Shop";
  }, [businessConfig?.label, businessType]);

  const [form, setForm] = useState({
    name: "",
    shortName: "",
    kind: "physical" as CatalogProductKind,
    status: "active" as CatalogProductStatus,
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
    photoUrl: "",
    trackInventory: true,
    trackSerial: false,
    trackBatch: false,
    canSell: true,
    canPurchase: true,
    availableInPos: true,
  });

  useEffect(() => {
    setHydrated(false);
    setExtraFields({});
    imagePickerRef.current?.clear();
  }, [id]);

  useEffect(() => {
    if (!product.data || hydrated) return;
    const p = product.data;
    const meta = p.meta;
    const rateFromMeta =
      meta && typeof meta.taxRatePercent === "number"
        ? String(meta.taxRatePercent)
        : p.taxCode?.match(/(\d+(?:\.\d+)?)/)?.[1] || "5";
    setForm({
      name: p.name ?? "",
      shortName: p.shortName ?? "",
      kind: p.kind,
      status: p.status === "archived" ? "inactive" : p.status,
      skuCode: p.skuCode ?? "",
      barcode: p.barcode ?? "",
      barcodeType: p.barcodeType || "code128",
      internalCode: p.internalCode ?? "",
      categoryId: p.category?.id ?? "",
      brandId: p.brand?.id ?? "",
      shortDescription: p.shortDescription ?? "",
      description: p.description ?? "",
      basePrice: String(p.basePrice ?? p.sellingPrice ?? 0),
      costPrice: p.costPrice != null ? String(p.costPrice) : "",
      mrp: p.mrp != null ? String(p.mrp) : "",
      taxCode: p.taxCode ?? "",
      taxRatePercent: rateFromMeta,
      unitOfMeasure: p.unitOfMeasure || "pcs",
      photoUrl: p.photoUrl ?? "",
      trackInventory: p.trackInventory !== false,
      trackSerial: !!p.trackSerial,
      trackBatch: !!p.trackBatch,
      canSell: p.canSell !== false,
      canPurchase: p.canPurchase !== false,
      availableInPos: p.availableInPos !== false,
    });
    if (itemMetaFields.length && meta) {
      const extras: Record<string, string> = {};
      for (const f of itemMetaFields) {
        const v = meta[f.key];
        if (v != null && f.key !== "taxRatePercent") extras[f.key] = String(v);
      }
      setExtraFields(extras);
    }
    setHydrated(true);
  }, [product.data, hydrated, itemMetaFields]);

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
    if (!code || !id) {
      setBarcodeError(null);
      return;
    }
    const t = window.setTimeout(() => {
      void catalogApi
        .checkBarcode(code, id)
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
  }, [form.barcode, id]);

  const save = useMutation({
    mutationFn: () => {
      if (!id) throw new Error("Missing product id");
      if (barcodeError) {
        throw new Error(barcodeError);
      }
      // No opening-stock field on edit — skip openingQty refine via trackInventory:false for schema only.
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
        trackInventory: false,
        openingQty: "",
      });
      if (!parsed.success) {
        setFieldErrors(zodFieldErrors(parsed.error));
        const msg = zodMessages(parsed.error)[0] ?? "Check the form";
        toast.error(msg);
        throw new Error(msg);
      }
      setFieldErrors({});
      const uploaded = imagePickerRef.current?.getUploadDataUrls() ?? [];
      const existingPhotos = product.data?.images?.length
        ? product.data.images
        : form.photoUrl.trim()
          ? [form.photoUrl.trim()]
          : [];
      const photos = [
        ...uploaded,
        ...existingPhotos.filter(Boolean),
      ];
      const uniquePhotos = [...new Set(photos)];
      return catalogApi.updateProduct(id, {
        name: form.name.trim(),
        shortName: form.shortName.trim() || undefined,
        kind: form.kind,
        status: form.status,
        skuCode: form.skuCode.trim() || undefined,
        barcode: form.barcode.trim() || null,
        barcodeType: form.barcode.trim()
          ? form.barcodeType || "code128"
          : null,
        internalCode: form.internalCode.trim() || undefined,
        categoryId: form.categoryId || null,
        brandId: form.brandId || null,
        shortDescription: form.shortDescription.trim() || undefined,
        description: form.description.trim() || undefined,
        basePrice: Number(form.basePrice) || 0,
        costPrice: form.costPrice ? Number(form.costPrice) : null,
        mrp: form.mrp ? Number(form.mrp) : null,
        taxCode: (() => {
          const rate = Number(form.taxRatePercent);
          if (Number.isFinite(rate) && rate > 0) {
            return form.taxCode.trim() || `GST${rate}`;
          }
          return form.taxCode.trim() || null;
        })(),
        unitOfMeasure: form.unitOfMeasure,
        photoUrl: uniquePhotos[0] || form.photoUrl.trim() || null,
        images: uniquePhotos.length ? uniquePhotos : undefined,
        trackInventory: form.trackInventory,
        trackSerial: form.trackSerial,
        trackBatch: form.trackBatch,
        canSell: form.canSell,
        canPurchase: form.canPurchase,
        availableInPos: form.availableInPos,
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
      void queryClient.invalidateQueries({ queryKey: ["catalog-products"] });
      void queryClient.invalidateQueries({ queryKey: ["catalog-product", id] });
      toast.success("Item updated");
      router.push(`/catalog/view?id=${id}`);
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : e.message || "Save failed"),
  });

  if (!id) {
    return (
      <p className="p-8 text-sm text-[#c81e1e]">
        Missing item id.{" "}
        <Link href="/catalog" className="text-[#1a56db]">
          Back to Items
        </Link>
      </p>
    );
  }

  if (product.isLoading || !hydrated) {
    return <p className="p-8 text-sm text-[#5a6b7d]">Loading item…</p>;
  }

  if (product.isError || !product.data) {
    return (
      <p className="p-8 text-sm text-[#c81e1e]">
        Item not found.{" "}
        <Link href="/catalog" className="text-[#1a56db]">
          Back to Items
        </Link>
      </p>
    );
  }

  return (
    <div className="pb-16">
      <header className="mb-5 flex items-center justify-between border-b border-[#e8edf4] pb-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#0b1f33]">
            Edit Item
          </h1>
          <p className="mt-0.5 font-mono text-xs text-[#5a6b7d]">
            {product.data.skuCode}
          </p>
        </div>
        <Link
          href={`/catalog/view?id=${id}`}
          className="grid h-8 w-8 place-items-center rounded-md text-[#5a6b7d] transition hover:bg-[#f4f6fa] hover:text-[#0b1f33]"
          aria-label="Close"
        >
          <X className="h-5 w-5" strokeWidth={1.75} />
        </Link>
      </header>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <div className="min-w-0 max-w-[36rem] flex-1 space-y-3.5">
          <FieldRow label="Name" required error={fieldErrors.name}>
            <Input
              className="h-9"
              value={form.name}
              onChange={(e) => {
                clearFieldError("name");
                setForm((f) => ({ ...f, name: e.target.value }));
              }}
            />
          </FieldRow>
          <FieldRow label="Type" required>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {KINDS.map((k) => (
                <label
                  key={k.id}
                  className="flex items-center gap-1.5 text-[0.8125rem] text-[#0b1f33]"
                >
                  <input
                    type="radio"
                    className="accent-[#1a56db]"
                    checked={form.kind === k.id}
                    onChange={() => applyKindDefaults(k.id)}
                  />
                  {k.label}
                </label>
              ))}
            </div>
          </FieldRow>
          <FieldRow label="Category">
            <select
              className={fieldControl}
              value={form.categoryId}
              onChange={(e) =>
                setForm((f) => ({ ...f, categoryId: e.target.value }))
              }
            >
              <option value="">Select a category</option>
              {(cats.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parent ? `${c.parent.name} › ` : ""}
                  {c.name}
                </option>
              ))}
            </select>
          </FieldRow>
          <FieldRow label="Brand">
            <select
              className={fieldControl}
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
          </FieldRow>
          <FieldRow label="Short name">
            <Input
              className="h-9"
              value={form.shortName}
              onChange={(e) =>
                setForm((f) => ({ ...f, shortName: e.target.value }))
              }
            />
          </FieldRow>
          <FieldRow label="Status">
            <select
              className={fieldControl}
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
          </FieldRow>
        </div>
        <div className="w-full shrink-0 space-y-3 lg:w-[22.5rem]">
          {(product.data.images?.length || form.photoUrl) ? (
            <div>
              <p className="mb-1.5 text-[0.75rem] font-medium text-[#3d4f61]">
                Current images
              </p>
              <div className="flex flex-wrap gap-2">
                {(product.data.images?.length
                  ? product.data.images
                  : [form.photoUrl]
                )
                  .filter(Boolean)
                  .slice(0, 8)
                  .map((src, i, arr) => (
                    <ProductThumb
                      key={src}
                      src={src}
                      label={form.name}
                      className="rounded border border-[#e4e9f0]"
                      count={i === 0 ? arr.length : undefined}
                      onClick={() => setLightboxIndex(i)}
                    />
                  ))}
              </div>
            </div>
          ) : null}
          <ProductImagePicker ref={imagePickerRef} variant="item" />
        </div>
      </div>

      <div className="mt-6 max-w-[36rem] space-y-3.5">
        <FieldRow label="Short description" stacked>
          <Input
            className="h-9"
            value={form.shortDescription}
            onChange={(e) =>
              setForm((f) => ({ ...f, shortDescription: e.target.value }))
            }
          />
        </FieldRow>
        <FieldRow label="Full description" stacked>
          <textarea
            className="min-h-[72px] w-full rounded-md border border-[#d9e0ea] px-2.5 py-1.5 text-sm"
            value={form.description}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
          />
        </FieldRow>
      </div>

      <section className="mt-7 max-w-[36rem] border-t border-[#e8edf4] pt-5">
        <h2 className="mb-4 text-[0.95rem] font-semibold text-[#0b1f33]">
          Item Details
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-[0.8125rem] font-medium text-[#c81e1e]">
              Unit *
            </label>
            <select
              className={`${fieldControl} mt-1.5`}
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
            <label className="text-[0.8125rem] font-medium text-[#3d4f61]">
              SKU
            </label>
            {fieldErrors.skuCode ? (
              <p className="mt-1 text-[0.75rem] text-[#c81e1e]">
                {fieldErrors.skuCode}
              </p>
            ) : null}
            <div className="mt-1.5 flex">
              <Input
                className="h-9 rounded-r-none"
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
                className="h-9 shrink-0 rounded-l-none border-l-0"
                onClick={() => genSku.mutate()}
              >
                Generate
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8 border-t border-[#e8edf4] pt-5">
        <h2 className="mb-4 text-[0.95rem] font-semibold text-[#0b1f33]">
          Identification
        </h2>
        <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Internal code</Label>
            <Input
              className="mt-1 max-w-sm"
              value={form.internalCode}
              onChange={(e) =>
                setForm((f) => ({ ...f, internalCode: e.target.value }))
              }
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Barcode</Label>
            <div className="mt-1 flex gap-1">
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
                  placeholder="Scan, type, or leave empty"
                  autoSubmitWedge
                  showSubmitButton={false}
                  showHint={false}
                  className="space-y-0"
                  inputClassName="h-10"
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
            {barcodeError ? (
              <p className="mt-1 text-xs text-rose-600">{barcodeError}</p>
            ) : (
              <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">
                Code 128 · USB scanner works in this field · empty = auto on
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
        </div>
      </section>

      <section className="mt-8 border-t border-[#e8edf4] pt-5">
        <h2 className="mb-4 text-[0.95rem] font-semibold text-[#0b1f33]">
          Pricing &amp; tax
        </h2>
        <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
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
            <p className="mt-1 text-[0.7rem] text-[#8a9bb0]">
              Applied at counter checkout (Settings can still mark prices
              tax-inclusive).
            </p>
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
        </div>
      </section>

      <section className="mt-8 border-t border-[#e8edf4] pt-5">
        <h2 className="mb-4 text-[0.95rem] font-semibold text-[#0b1f33]">
          Inventory tracking
        </h2>
        <div className="grid max-w-3xl gap-2 sm:grid-cols-2">
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
      </section>

      {itemMetaFields.length ? (
        <section className="mt-8 border-t border-[#e8edf4] pt-5">
          <h2 className="mb-2 text-[0.95rem] font-semibold text-[#0b1f33]">
            Shop extras
          </h2>
          <p className="text-[0.75rem] text-[#5a6b7d]">
            Extra fields for{" "}
            <span className="font-medium text-[#0b1f33]">{profileLabel}</span>
            {" — "}
            set when the organization was created (custom or profile defaults).
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
                    className="mt-1 h-9 w-full rounded-md border border-[#dce3ec] px-2 text-sm"
                    value={extraFields[field.key] ?? ""}
                    onChange={(e) =>
                      setExtraFields((prev) => ({
                        ...prev,
                        [field.key]: e.target.value,
                      }))
                    }
                  >
                    <option value="">— Select —</option>
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
                    className="mt-1 min-h-[72px] w-full rounded-md border border-[#dce3ec] px-2 py-1.5 text-sm"
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
                {field.hint && field.type !== "text" && field.type !== "textarea" ? (
                  <p className="mt-1 text-[0.7rem] text-[#8a9bb0]">{field.hint}</p>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="mt-8 flex gap-2">
        <Button
          disabled={!form.name.trim() || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        <Button variant="secondary" asChild>
          <Link href={`/catalog/view?id=${id}`}>Cancel</Link>
        </Button>
      </div>

      <ImageLightbox
        open={lightboxIndex != null}
        images={
          (product.data?.images?.length
            ? product.data.images
            : form.photoUrl
              ? [form.photoUrl]
              : []) as string[]
        }
        startIndex={lightboxIndex ?? 0}
        label={form.name}
        onClose={() => setLightboxIndex(null)}
      />
    </div>
  );
}
