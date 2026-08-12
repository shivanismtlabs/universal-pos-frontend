"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { catalogApi, type CatalogProductKind } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useBootstrap } from "@/lib/bootstrap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarcodeScanInput } from "@/components/barcode-scan-input";
import { ProductBarcodePreview } from "@/components/product-barcode-preview";
import {
  ProductImagePicker,
  type ProductImagePickerHandle,
} from "@/components/product-image-picker";

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

export default function NewCatalogProductPage() {
  const router = useRouter();
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
    photoUrl: "",
    trackInventory: true,
    trackSerial: false,
    trackBatch: false,
    canSell: true,
    canPurchase: true,
    availableInPos: true,
    openingQty: "0",
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

  const genSku = useMutation({
    mutationFn: () =>
      catalogApi.generateSku({ name: form.name, kind: form.kind }),
    onSuccess: (r) => {
      setForm((f) => ({ ...f, skuCode: r.sku }));
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
      const uploaded = imagePickerRef.current?.getUploadDataUrls() ?? [];
      const photos = [
        ...uploaded,
        ...(form.photoUrl.trim() ? [form.photoUrl.trim()] : []),
      ];
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
        openingQty: form.trackInventory ? Number(form.openingQty) || 0 : undefined,
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
    onSuccess: (p) => {
      toast.success("Product created");
      router.push(p?.id ? `/catalog/view?id=${p.id}` : "/catalog");
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Save failed"),
  });

  const section =
    "space-y-3 rounded-md border border-[#e4e9f0] bg-white p-4";

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eef1f4] pb-3">
        <div>
          <p className="text-[0.65rem] font-bold tracking-wide text-[#1a56db] uppercase">
            Catalog
          </p>
          <h1 className="text-xl font-semibold text-[#0b1f33]">New Item</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" asChild>
            <Link href="/catalog">Cancel</Link>
          </Button>
          <Button
            disabled={!form.name.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            Save
          </Button>
        </div>
      </header>

      <section className={section}>
        <h2 className="text-sm font-semibold text-[#0b1f33]">Basic information</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Product name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <Label>Product type *</Label>
            <select
              className="h-9 w-full rounded-md border border-[#dce3ec] px-2 text-sm"
              value={form.kind}
              onChange={(e) =>
                applyKindDefaults(e.target.value as CatalogProductKind)
              }
            >
              <option value="physical">Physical</option>
              <option value="service">Service</option>
              <option value="digital">Digital</option>
              <option value="bundle">Bundle / combo</option>
              <option value="rental">Rental</option>
            </select>
          </div>
          <div>
            <Label>Status</Label>
            <select
              className="h-9 w-full rounded-md border border-[#dce3ec] px-2 text-sm"
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
          <div>
            <Label>Short name</Label>
            <Input
              value={form.shortName}
              onChange={(e) =>
                setForm((f) => ({ ...f, shortName: e.target.value }))
              }
            />
          </div>
          <div>
            <Label>Image URL (optional)</Label>
            <Input
              value={form.photoUrl}
              onChange={(e) =>
                setForm((f) => ({ ...f, photoUrl: e.target.value }))
              }
              placeholder="https://… or leave blank and upload below"
            />
          </div>
          <div className="sm:col-span-2">
            <ProductImagePicker ref={imagePickerRef} />
          </div>
          <div className="sm:col-span-2">
            <Label>Short description</Label>
            <Input
              value={form.shortDescription}
              onChange={(e) =>
                setForm((f) => ({ ...f, shortDescription: e.target.value }))
              }
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Full description</Label>
            <textarea
              className="min-h-[72px] w-full rounded-md border border-[#dce3ec] px-2 py-1.5 text-sm"
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </div>
        </div>
      </section>

      <section className={section}>
        <h2 className="text-sm font-semibold">Classification</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Category</Label>
            <select
              className="h-9 w-full rounded-md border border-[#dce3ec] px-2 text-sm"
              value={form.categoryId}
              onChange={(e) =>
                setForm((f) => ({ ...f, categoryId: e.target.value }))
              }
            >
              <option value="">— None —</option>
              {(cats.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parent ? `${c.parent.name} › ` : ""}
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Brand (optional)</Label>
            <select
              className="h-9 w-full rounded-md border border-[#dce3ec] px-2 text-sm"
              value={form.brandId}
              onChange={(e) =>
                setForm((f) => ({ ...f, brandId: e.target.value }))
              }
            >
              <option value="">— None —</option>
              {(brands.data ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className={section}>
        <h2 className="text-sm font-semibold">Identification</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>SKU</Label>
            <div className="flex gap-1">
              <Input
                value={form.skuCode}
                onChange={(e) =>
                  setForm((f) => ({ ...f, skuCode: e.target.value }))
                }
                placeholder="Auto if empty"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => genSku.mutate()}
              >
                Generate
              </Button>
            </div>
          </div>
          <div>
            <Label>Internal code</Label>
            <Input
              value={form.internalCode}
              onChange={(e) =>
                setForm((f) => ({ ...f, internalCode: e.target.value }))
              }
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Barcode</Label>
            <div className="flex gap-1">
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

      <section className={section}>
        <h2 className="text-sm font-semibold">Pricing & unit</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Selling price</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.basePrice}
              onChange={(e) =>
                setForm((f) => ({ ...f, basePrice: e.target.value }))
              }
            />
          </div>
          <div>
            <Label>Cost price</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.costPrice}
              onChange={(e) =>
                setForm((f) => ({ ...f, costPrice: e.target.value }))
              }
            />
          </div>
          <div>
            <Label>MRP / list price</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.mrp}
              onChange={(e) => setForm((f) => ({ ...f, mrp: e.target.value }))}
            />
          </div>
          <div>
            <Label>Tax rate %</Label>
            <Input
              type="number"
              min={0}
              max={40}
              step="0.01"
              value={form.taxRatePercent}
              onChange={(e) =>
                setForm((f) => ({ ...f, taxRatePercent: e.target.value }))
              }
              placeholder="e.g. 5 or 18"
            />
            <p className="mt-1 text-[0.7rem] text-[#8a9bb0]">
              Applied at counter checkout (Settings can still mark prices
              tax-inclusive).
            </p>
          </div>
          <div>
            <Label>Tax code / HSN ref (optional)</Label>
            <Input
              value={form.taxCode}
              onChange={(e) =>
                setForm((f) => ({ ...f, taxCode: e.target.value }))
              }
              placeholder="e.g. GST18 or HSN"
            />
          </div>
          <div>
            <Label>Unit of measure</Label>
            <select
              className="h-9 w-full rounded-md border border-[#dce3ec] px-2 text-sm"
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
          {form.trackInventory ? (
            <div>
              <Label>Opening qty (default location)</Label>
              <Input
                type="number"
                min={0}
                value={form.openingQty}
                onChange={(e) =>
                  setForm((f) => ({ ...f, openingQty: e.target.value }))
                }
              />
            </div>
          ) : null}
        </div>
      </section>

      <section className={section}>
        <h2 className="text-sm font-semibold">Behavior</h2>
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
        <section className={section}>
          <h2 className="text-sm font-semibold text-[#0b1f33]">
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
    </div>
  );
}
