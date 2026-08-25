"use client";

/**
 * Shared Create + Edit Item page — same form, same field mapping, same save rules.
 * Used by /catalog/new (create) and /catalog/new?id=… (edit). /catalog/edit redirects here.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  catalogApi,
  customFieldsApi,
  tenantsApi,
  type CatalogProductKind,
  type CatalogProductStatus,
} from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useBootstrap } from "@/lib/bootstrap";
import { useAuthStore } from "@/lib/auth-store";
import { useBranchStore } from "@/lib/branch-store";
import { resolveOperatingLocationId } from "@/lib/operating-location";
import {
  type ProductImagePickerHandle,
} from "@/components/product-image-picker";
import { ProductThumb } from "@/components/product-thumb";
import { ImageLightbox } from "@/components/image-lightbox";
import {
  createCatalogProductSchema,
  validateRequiredProductExtraFields,
  zodFieldErrors,
  zodMessages,
} from "@/lib/validations";
import { activeUnitOptions } from "@/lib/measure-units";
import {
  CUSTOM_FIELD_QUERY,
  mergeProductFormFields,
} from "@/lib/product-form-fields";
import {
  CatalogItemShopForm,
  type CatalogItemShopValues,
} from "@/components/catalog-item-shop-form";
import {
  GETTING_STARTED_PATH,
  readReturnToParam,
  resolveSetupReturnTo,
} from "@/lib/setup-return";

export function emptyCatalogItemForm(): CatalogItemShopValues {
  return {
    name: "",
    shortName: "",
    kind: "physical",
    status: "active",
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
    openingQty: "0",
    reorderPoint: "",
  };
}

function buildExtraFieldsPayload(
  form: CatalogItemShopValues,
  extraFields: Record<string, string>,
  productFormFields: { key: string }[],
  opts?: { clearEmpty?: boolean },
): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  const rate = Number(form.taxRatePercent);
  if (Number.isFinite(rate) && rate >= 0) {
    out.taxRatePercent = rate;
  }
  if (form.trackInventory) {
    const n = Number(form.reorderPoint);
    if (form.reorderPoint.trim() !== "" && Number.isFinite(n)) {
      out.reorderPoint = n;
    } else if (opts?.clearEmpty) {
      out.reorderPoint = null;
    }
  }
  for (const f of productFormFields) {
    const v = (extraFields[f.key] ?? "").trim();
    if (f.key === "foodType") {
      if (v) out.foodType = v;
      else if (opts?.clearEmpty) out.foodType = null;
      continue;
    }
    if (v) out[f.key] = v;
    else if (opts?.clearEmpty) out[f.key] = null;
  }
  return Object.keys(out).length ? out : undefined;
}

function taxCodeFromForm(form: CatalogItemShopValues): string | null {
  const rate = Number(form.taxRatePercent);
  if (Number.isFinite(rate) && rate > 0) {
    return form.taxCode.trim() || `GST${rate}`;
  }
  return form.taxCode.trim() || null;
}

function invalidateCatalogQueries(
  qc: ReturnType<typeof useQueryClient>,
  id?: string,
) {
  void qc.invalidateQueries({ queryKey: ["catalog-products"] });
  void qc.invalidateQueries({ queryKey: ["catalog-products-home"] });
  void qc.invalidateQueries({ queryKey: ["catalog-products-all"] });
  void qc.invalidateQueries({ queryKey: ["pos-sale-products"] });
  void qc.invalidateQueries({ queryKey: ["pos-sale-catalog"] });
  void qc.invalidateQueries({ queryKey: ["pos-sale-floor"] });
  void qc.invalidateQueries({ queryKey: ["dashboard-catalog"] });
  void qc.invalidateQueries({ queryKey: ["retail-skus"] });
  if (id) {
    void qc.invalidateQueries({ queryKey: ["catalog-product", id] });
  }
}

export function CatalogItemEditor() {
  const router = useRouter();
  const search = useSearchParams();
  const qc = useQueryClient();
  const id = search.get("id")?.trim() || "";
  const isEdit = Boolean(id);
  const returnTo = readReturnToParam(search);
  const afterSaveHref = resolveSetupReturnTo(returnTo, "/catalog");
  const cancelHref = isEdit
    ? `/catalog/view?id=${id}`
    : returnTo
      ? resolveSetupReturnTo(returnTo, GETTING_STARTED_PATH)
      : "/catalog";

  const imagePickerRef = useRef<ProductImagePickerHandle>(null);
  const { data: boot, itemMetaFields } = useBootstrap();
  const currentLocationId = useBranchStore((s) => s.currentLocationId);
  const authStoreId = useAuthStore((s) => s.user?.storeId);
  const defaultLocationId = resolveOperatingLocationId({
    currentLocationId,
    locations: boot?.locations,
    authStoreId,
  });
  const stockLocationName =
    boot?.locations?.find((l) => l.id === defaultLocationId)?.name ?? "this branch";

  const customFieldsQ = useQuery({
    queryKey: ["custom-fields", "product"],
    queryFn: () => customFieldsApi.listProductDefinitions(),
    ...CUSTOM_FIELD_QUERY,
  });
  const productFormFields = useMemo(
    () => mergeProductFormFields(customFieldsQ.data, itemMetaFields),
    [customFieldsQ.data, itemMetaFields],
  );
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
  const product = useQuery({
    queryKey: ["catalog-product", id],
    queryFn: () => catalogApi.getProduct(id),
    enabled: isEdit,
  });

  const [extraFields, setExtraFields] = useState<Record<string, string>>({});
  const [hydrated, setHydrated] = useState(!isEdit);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [form, setForm] = useState<CatalogItemShopValues>(emptyCatalogItemForm);
  const [photoUrl, setPhotoUrl] = useState("");
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

  useEffect(() => {
    if (!isEdit) {
      setHydrated(true);
      return;
    }
    setHydrated(false);
    setExtraFields({});
    setPhotoUrl("");
    imagePickerRef.current?.clear();
  }, [id, isEdit]);

  useEffect(() => {
    if (!isEdit || !product.data || hydrated) return;
    const p = product.data;
    const meta = p.meta;
    const rateFromMeta =
      meta && typeof meta.taxRatePercent === "number"
        ? String(meta.taxRatePercent)
        : p.taxCode?.match(/(\d+(?:\.\d+)?)/)?.[1] || "5";
    const reorderFromMeta =
      meta &&
      (typeof meta.reorderPoint === "number" ||
        typeof meta.reorderPoint === "string")
        ? String(meta.reorderPoint)
        : "";
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
      trackInventory: p.trackInventory !== false,
      trackSerial: !!p.trackSerial,
      trackBatch: !!p.trackBatch,
      canSell: p.canSell !== false,
      canPurchase: p.canPurchase !== false,
      availableInPos: p.availableInPos !== false,
      openingQty: "0",
      reorderPoint: reorderFromMeta,
    });
    setPhotoUrl(p.photoUrl ?? "");
    setHydrated(true);
  }, [product.data, hydrated, isEdit]);

  useEffect(() => {
    if (!isEdit || !product.data || !productFormFields.length) return;
    const meta = product.data.meta;
    const bag: Record<string, unknown> = {
      ...(typeof meta === "object" && meta && !Array.isArray(meta)
        ? (meta as Record<string, unknown>)
        : {}),
    };
    const extras: Record<string, string> = {};
    for (const f of productFormFields) {
      const v = bag[f.key];
      if (v != null && f.key !== "taxRatePercent") extras[f.key] = String(v);
    }
    setExtraFields(extras);
  }, [product.data, productFormFields, isEdit]);

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
        .checkBarcode(code, isEdit ? id : undefined)
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
  }, [form.barcode, id, isEdit]);

  const save = useMutation({
    mutationFn: async () => {
      if (barcodeError) throw new Error(barcodeError);

      // Serial / batch always imply inventory tracking
      const trackInventory =
        form.trackInventory || form.trackSerial || form.trackBatch;
      const trackSerial = form.trackSerial && trackInventory;
      const trackBatch = form.trackBatch && trackInventory;

      const parsed = createCatalogProductSchema.safeParse({
        name: form.name,
        shortName: form.shortName,
        kind: form.kind,
        status: form.status,
        skuCode: form.skuCode,
        barcode: form.barcode,
        internalCode: form.internalCode,
        shortDescription: form.shortDescription,
        description: form.description,
        taxCode: form.taxCode,
        basePrice: form.basePrice,
        costPrice: form.costPrice,
        mrp: form.mrp,
        taxRatePercent: form.taxRatePercent,
        unitOfMeasure: form.unitOfMeasure,
        trackInventory,
        openingQty: isEdit
          ? trackInventory
            ? "0"
            : ""
          : form.openingQty,
        reorderPoint: form.reorderPoint,
      });
      if (!parsed.success) {
        setFieldErrors(zodFieldErrors(parsed.error));
        const msg = zodMessages(parsed.error)[0] ?? "Check the form";
        toast.error(msg);
        throw new Error(msg);
      }
      const extraErrs = validateRequiredProductExtraFields(
        productFormFields,
        extraFields,
      );
      if (Object.keys(extraErrs).length) {
        setFieldErrors((prev) => ({ ...prev, ...extraErrs }));
        const msg =
          Object.values(extraErrs)[0] ?? "Fill required custom fields";
        toast.error(msg);
        throw new Error(msg);
      }
      setFieldErrors({});

      if (!isEdit && trackInventory && !defaultLocationId) {
        const msg =
          "No store location selected — pick a branch in the header, then save";
        toast.error(msg);
        throw new Error(msg);
      }

      const uploaded = imagePickerRef.current?.getUploadDataUrls() ?? [];
      const existingPhotos = isEdit
        ? product.data?.images?.length
          ? product.data.images
          : photoUrl.trim()
            ? [photoUrl.trim()]
            : []
        : [];
      const uniquePhotos = [
        ...new Set([...uploaded, ...existingPhotos.filter(Boolean)]),
      ];

      const shared = {
        name: form.name.trim(),
        shortName: form.shortName.trim() || undefined,
        kind: form.kind as CatalogProductKind,
        status: form.status as CatalogProductStatus,
        skuCode: form.skuCode.trim() || undefined,
        barcode: form.barcode.trim() || (isEdit ? null : undefined),
        barcodeType: form.barcode.trim()
          ? form.barcodeType || "code128"
          : isEdit
            ? null
            : undefined,
        internalCode: form.internalCode.trim() || undefined,
        categoryId: form.categoryId || (isEdit ? null : undefined),
        brandId: form.brandId || (isEdit ? null : undefined),
        shortDescription: form.shortDescription.trim() || undefined,
        description: form.description.trim() || undefined,
        basePrice: Number(form.basePrice) || 0,
        costPrice: form.costPrice
          ? Number(form.costPrice)
          : isEdit
            ? null
            : undefined,
        mrp: form.mrp ? Number(form.mrp) : isEdit ? null : undefined,
        taxCode: taxCodeFromForm(form) ?? (isEdit ? null : undefined),
        unitOfMeasure: form.unitOfMeasure,
        photoUrl: uniquePhotos[0] || (isEdit ? photoUrl.trim() || null : undefined),
        images: uniquePhotos.length ? uniquePhotos : undefined,
        trackInventory,
        trackSerial,
        trackBatch,
        canSell: form.canSell,
        canPurchase: form.canPurchase,
        availableInPos: form.availableInPos,
        extraFields: buildExtraFieldsPayload(
          { ...form, trackInventory, trackSerial, trackBatch },
          extraFields,
          productFormFields,
          { clearEmpty: isEdit },
        ),
      };

      if (isEdit) {
        // Live/older APIs may not whitelist top-level reorderPoint yet
        // ("property reorderPoint should not exist"). Meta is enough via extraFields.
        return catalogApi.updateProduct(id, shared);
      }

      return catalogApi.createProduct({
        ...shared,
        barcode: form.barcode.trim() || undefined,
        barcodeType: form.barcode.trim()
          ? form.barcodeType || "code128"
          : undefined,
        categoryId: form.categoryId || undefined,
        brandId: form.brandId || undefined,
        costPrice: form.costPrice ? Number(form.costPrice) : undefined,
        mrp: form.mrp ? Number(form.mrp) : undefined,
        taxCode: taxCodeFromForm(form) || undefined,
        photoUrl: uniquePhotos[0],
        locationId: defaultLocationId || undefined,
        openingQty: trackInventory
          ? form.trackSerial
            ? 0
            : Math.max(0, Number(form.openingQty) || 0)
          : undefined,
        reorderPoint: (() => {
          if (!trackInventory) return undefined;
          const n = Number(form.reorderPoint);
          return form.reorderPoint.trim() !== "" && Number.isFinite(n)
            ? n
            : undefined;
        })(),
      });
    },
    onSuccess: (saved) => {
      invalidateCatalogQueries(qc, saved?.id || id);
      if (isEdit) {
        toast.success("Item updated");
        router.push(`/catalog/view?id=${id}`);
        return;
      }
      toast.success(
        returnTo
          ? "Product created — back to Getting Started"
          : form.trackSerial
            ? "Product created — register serials to build Stock on Hand"
            : form.trackInventory && Number(form.openingQty) > 0
              ? `Product created · Stock on Hand ${Number(form.openingQty)}`
              : "Product created",
      );
      if (returnTo) {
        router.push(afterSaveHref);
        return;
      }
      const newId = saved?.id;
      if (newId && (form.trackSerial || form.trackBatch)) {
        router.push(
          `/catalog/view?id=${newId}&tab=${form.trackSerial ? "serials" : "batches"}`,
        );
        return;
      }
      if (newId) {
        router.push(`/catalog/view?id=${newId}`);
        return;
      }
      router.push(afterSaveHref);
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : e.message || "Save failed"),
  });

  if (isEdit && !id) {
    return (
      <p className="p-8 text-sm text-[#c81e1e]">
        Missing item id.{" "}
        <Link href="/catalog" className="text-[#1a56db]">
          Back to Items
        </Link>
      </p>
    );
  }

  if (isEdit && (product.isLoading || !hydrated)) {
    return <p className="p-8 text-sm text-[#5a6b7d]">Loading item…</p>;
  }

  if (isEdit && (product.isError || !product.data)) {
    return (
      <p className="p-8 text-sm text-[#c81e1e]">
        Item not found.{" "}
        <Link href="/catalog" className="text-[#1a56db]">
          Back to Items
        </Link>
      </p>
    );
  }

  const existingImages = (
    isEdit
      ? product.data?.images?.length
        ? product.data.images
        : photoUrl
          ? [photoUrl]
          : []
      : []
  ).filter(Boolean) as string[];

  const stockOnHand =
    product.data?.inventoryByLocation?.find(
      (l) => l.locationId === currentLocationId,
    )?.qtyOnHand ??
    product.data?.stockOnHand ??
    null;

  return (
    <>
      <CatalogItemShopForm
        title={isEdit ? "Edit Item" : "New Item"}
        subtitle={
          isEdit
            ? product.data?.skuCode
              ? `SKU ${product.data.skuCode}`
              : "Same form as New Item — all fields save on update."
            : "Scan a barcode, enter name and rate, then save — same form as Edit Item."
        }
        cancelHref={cancelHref}
        form={form}
        setForm={setForm}
        extraFields={extraFields}
        setExtraFields={setExtraFields}
        fieldErrors={fieldErrors}
        clearFieldError={clearFieldError}
        barcodeError={barcodeError}
        productFormFields={productFormFields}
        customFieldsLoading={customFieldsQ.isLoading}
        categories={cats.data ?? []}
        brands={brands.data ?? []}
        unitOptions={unitOptions}
        imagePickerRef={imagePickerRef}
        onGenerateSku={() => genSku.mutate()}
        onGenerateBarcode={() => genBarcode.mutate()}
        skuPending={genSku.isPending}
        barcodePending={genBarcode.isPending}
        onSave={() => save.mutate()}
        savePending={save.isPending}
        stockReadOnly={isEdit}
        stockLocationName={stockLocationName}
        stockOnHandDisplay={
          isEdit ? (stockOnHand == null ? "—" : String(stockOnHand)) : undefined
        }
        photosExtra={
          existingImages.length ? (
            <div className="mb-4 flex flex-wrap gap-2">
              {existingImages.slice(0, 8).map((src, i) => (
                <ProductThumb
                  key={src}
                  src={src}
                  label={form.name}
                  className="rounded-lg border border-[#d9e0ea]"
                  count={i === 0 ? existingImages.length : undefined}
                  onClick={() => setLightboxIndex(i)}
                />
              ))}
            </div>
          ) : null
        }
      />

      <ImageLightbox
        open={lightboxIndex != null}
        images={existingImages}
        startIndex={lightboxIndex ?? 0}
        label={form.name}
        onClose={() => setLightboxIndex(null)}
      />
    </>
  );
}
