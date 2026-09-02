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
import { Trash2, X } from "lucide-react";
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
import {
  activeUnitOptions,
  catalogNeedsPackedContents,
  parseMultiUnitMeta,
} from "@/lib/measure-units";
import {
  defaultUnitForCreate,
  findUnitInGroups,
  orderUnitsForCountry,
  type CatalogUnitGroupRow,
} from "@/lib/country-uom";
import {
  CUSTOM_FIELD_QUERY,
  mergeProductFormFields,
} from "@/lib/product-form-fields";
import {
  CatalogItemShopForm,
  DEFAULT_SERVICE_DURATION_MINUTES,
  defaultReturnableForKind,
  type CatalogItemShopValues,
} from "@/components/catalog-item-shop-form";
import type { UnitPricingValue } from "@/components/unit-pricing-fields";
import { formatQtyWithUnit, normalizeQty } from "@/lib/sell-units";
import type { MetaFieldDef } from "@/lib/business-config";
import {
  GETTING_STARTED_PATH,
  readReturnToParam,
  resolveSetupReturnTo,
} from "@/lib/setup-return";

function resolveReturnableFromMeta(
  meta: unknown,
  kind: CatalogProductKind,
): boolean {
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const v = (meta as Record<string, unknown>).returnable;
    if (typeof v === "boolean") return v;
  }
  return defaultReturnableForKind(kind);
}

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
    openingQty: "",
    reorderPoint: "",
    multiUnitBaseQty: "",
    multiUnitBaseUnit: "pcs",
    returnable: true,
  };
}

function buildExtraFieldsPayload(
  form: CatalogItemShopValues,
  extraFields: Record<string, string>,
  productFormFields: { key: string }[],
  opts?: { clearEmpty?: boolean },
): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  out.returnable = form.returnable;
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
    if (f.key === "multiUnit") continue;
    const v = (extraFields[f.key] ?? "").trim();
    if (f.key === "foodType") {
      if (v) out.foodType = v;
      else if (opts?.clearEmpty) out.foodType = null;
      continue;
    }
    if (f.key === "durationMinutes") {
      const n = Number(v);
      if (v && Number.isFinite(n) && n > 0) {
        out.durationMinutes = Math.round(n);
      } else if (opts?.clearEmpty) {
        out.durationMinutes = null;
      }
      continue;
    }
    if (v) out[f.key] = v;
    else if (opts?.clearEmpty) out[f.key] = null;
  }
  // Service duration even if field list omitted it
  if (form.kind === "service" && out.durationMinutes === undefined) {
    const n = Number((extraFields.durationMinutes ?? "").trim());
    if (Number.isFinite(n) && n > 0) out.durationMinutes = Math.round(n);
    else if (opts?.clearEmpty) out.durationMinutes = null;
  }
  if (catalogNeedsPackedContents(form.kind, form.unitOfMeasure)) {
    const n = Number(form.multiUnitBaseQty);
    if (form.multiUnitBaseQty.trim() !== "" && Number.isFinite(n) && n > 0) {
      out.multiUnit = {
        baseQty: n,
        baseUnit: form.multiUnitBaseUnit.trim() || "pcs",
      };
    }
  } else if (opts?.clearEmpty) {
    out.multiUnit = null;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Opening stock is optional. Do not POST 0 — older APIs used `@Min(1)` and reject it. */
function createOpeningQtyPayload(
  trackInventory: boolean,
  trackSerial: boolean,
  raw: string,
  unit: string,
): number | undefined {
  if (!trackInventory || trackSerial) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const normalized = normalizeQty(n, unit || "pcs");
  if (!Number.isFinite(normalized) || normalized <= 0) return undefined;
  return normalized;
}

/** Wire baseUnitId + optional pack conversion so POS/inventory math works on create. */
function buildUnitPricingForCreate(
  form: CatalogItemShopValues,
  groups: CatalogUnitGroupRow[] | undefined,
  basePrice: string,
): UnitPricingValue {
  const empty: UnitPricingValue = {
    unitGroupId: "",
    baseUnitId: "",
    pricingUnitId: "",
    pricingStrategy: "converted",
    pricePerPricingUnit: basePrice || "",
    sellingUnits: [],
  };
  if (!groups?.length) return empty;

  const sellSymbol = form.unitOfMeasure.trim();
  const sellResolved = findUnitInGroups(groups, sellSymbol);
  if (!sellResolved) return empty;

  const packed = catalogNeedsPackedContents(form.kind, sellSymbol);
  const packQty = Number(form.multiUnitBaseQty);
  const innerSymbol = (form.multiUnitBaseUnit || "pcs").trim();

  if (packed && Number.isFinite(packQty) && packQty > 0) {
    const baseResolved = findUnitInGroups(groups, innerSymbol) ?? sellResolved;
    if (baseResolved.unitId === sellResolved.unitId) {
      return {
        unitGroupId: baseResolved.groupId,
        baseUnitId: baseResolved.unitId,
        pricingUnitId: baseResolved.unitId,
        pricingStrategy: "converted",
        pricePerPricingUnit: basePrice || "",
        sellingUnits: [],
      };
    }
    return {
      unitGroupId: baseResolved.groupId,
      baseUnitId: baseResolved.unitId,
      pricingUnitId: sellResolved.unitId,
      pricingStrategy: "converted",
      pricePerPricingUnit: basePrice || "",
      sellingUnits: [
        {
          unitId: sellResolved.unitId,
          conversionToBase: String(packQty),
          fixedPrice: "",
          isDefaultSellingUnit: true,
          isPurchaseUnit: true,
        },
      ],
    };
  }

  return {
    unitGroupId: sellResolved.groupId,
    baseUnitId: sellResolved.unitId,
    pricingUnitId: sellResolved.unitId,
    pricingStrategy: "converted",
    pricePerPricingUnit: basePrice || "",
    sellingUnits: [],
  };
}

/** Only attach unit-pricing keys when the shop actually configured them.
 * Live APIs that predate unit pricing reject pricingStrategy / pricePerPricingUnit / productUnits. */
function catalogUnitPricingPayload(
  unitPricing: UnitPricingValue,
  basePrice: string,
): Record<string, unknown> {
  const productUnits = unitPricing.sellingUnits
    .filter((r) => r.unitId && Number(r.conversionToBase) > 0)
    .map((r) => ({
      unitId: r.unitId,
      conversionToBase: Number(r.conversionToBase),
      fixedPrice:
        unitPricing.pricingStrategy === "fixed_tier"
          ? Number(r.fixedPrice) || 0
          : null,
      isDefaultSellingUnit: r.isDefaultSellingUnit,
      isPurchaseUnit: r.isPurchaseUnit,
    }));

  if (
    !unitPricing.baseUnitId &&
    !unitPricing.pricingUnitId &&
    productUnits.length === 0
  ) {
    return {};
  }

  return {
    ...(unitPricing.baseUnitId ? { baseUnitId: unitPricing.baseUnitId } : {}),
    ...(unitPricing.pricingUnitId
      ? { pricingUnitId: unitPricing.pricingUnitId }
      : {}),
    pricingStrategy: unitPricing.pricingStrategy,
    ...(unitPricing.pricingStrategy === "converted"
      ? {
          pricePerPricingUnit:
            Number(unitPricing.pricePerPricingUnit || basePrice) || undefined,
        }
      : {}),
    ...(productUnits.length ? { productUnits } : {}),
  };
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
  const { data: boot, itemMetaFields, businessType, commerceModes } =
    useBootstrap();
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
  const productFormFields = useMemo(() => {
    const merged = mergeProductFormFields(customFieldsQ.data, itemMetaFields);
    if (merged.some((f) => f.key === "durationMinutes")) return merged;
    const durationField: MetaFieldDef = {
      key: "durationMinutes",
      label: "Duration (minutes)",
      type: "number",
      required: false,
      entity: "item",
      hint: "Typical appointment / service length",
    };
    return [...merged, durationField];
  }, [customFieldsQ.data, itemMetaFields]);
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
  const suggestQ = useQuery({
    queryKey: ["uom-country-suggest"],
    queryFn: () => catalogApi.suggestTenantUomUnits(),
    retry: 1,
    staleTime: 60_000,
  });
  const unitGroupsQ = useQuery({
    queryKey: ["catalog-unit-groups"],
    queryFn: async () => {
      let rows = await catalogApi.listUnitGroups();
      if (!rows?.length) {
        await catalogApi.seedUnitGroups();
        rows = await catalogApi.listUnitGroups();
      }
      return rows;
    },
    enabled: !isEdit,
    retry: 1,
    staleTime: 60_000,
  });
  const unitOptions = useMemo(() => {
    const base = activeUnitOptions(unitsQ.data);
    return orderUnitsForCountry(base, suggestQ.data?.suggestedSymbols);
  }, [unitsQ.data, suggestQ.data?.suggestedSymbols]);
  const product = useQuery({
    queryKey: ["catalog-product", id],
    queryFn: () => catalogApi.getProduct(id),
    enabled: isEdit,
  });

  const [extraFields, setExtraFields] = useState<Record<string, string>>({});
  const [hydrated, setHydrated] = useState(!isEdit);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [existingPhotosList, setExistingPhotosList] = useState<string[]>([]);
  const [form, setForm] = useState<CatalogItemShopValues>(emptyCatalogItemForm);
  const [unitPricing, setUnitPricing] = useState<UnitPricingValue>({
    unitGroupId: "",
    baseUnitId: "",
    pricingUnitId: "",
    pricingStrategy: "converted",
    pricePerPricingUnit: "",
    sellingUnits: [],
  });
  const [photoUrl, setPhotoUrl] = useState("");
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const unitDefaultedRef = useRef(false);

  // New item: country + shop type default unit (India grocery → kg, US grocery → lb, etc.)
  useEffect(() => {
    if (isEdit || unitDefaultedRef.current) return;
    if (form.kind === "physical" && !suggestQ.isFetched && !businessType) return;
    const preferred = defaultUnitForCreate(
      suggestQ.data?.countryCode,
      businessType,
      form.kind,
    );
    unitDefaultedRef.current = true;
    setForm((prev) =>
      prev.unitOfMeasure === preferred
        ? prev
        : { ...prev, unitOfMeasure: preferred },
    );
  }, [
    isEdit,
    businessType,
    form.kind,
    suggestQ.data?.countryCode,
    suggestQ.isFetched,
  ]);

  // New item: link unit master (baseUnitId) so checkout/inventory calculations work
  useEffect(() => {
    if (isEdit || !unitGroupsQ.data?.length) return;
    const next = buildUnitPricingForCreate(
      form,
      unitGroupsQ.data,
      form.basePrice,
    );
    setUnitPricing((prev) => {
      if (
        prev.baseUnitId === next.baseUnitId &&
        prev.pricingUnitId === next.pricingUnitId &&
        prev.sellingUnits.length === next.sellingUnits.length &&
        (prev.sellingUnits[0]?.conversionToBase ?? "") ===
          (next.sellingUnits[0]?.conversionToBase ?? "")
      ) {
        return prev;
      }
      return next;
    });
  }, [
    isEdit,
    form.unitOfMeasure,
    form.multiUnitBaseQty,
    form.multiUnitBaseUnit,
    form.kind,
    form.basePrice,
    unitGroupsQ.data,
  ]);

  // New service: default duration 30 min when empty (salon / any service item)
  useEffect(() => {
    if (isEdit) return;
    if (form.kind !== "service") return;
    setExtraFields((prev) =>
      (prev.durationMinutes ?? "").trim()
        ? prev
        : { ...prev, durationMinutes: DEFAULT_SERVICE_DURATION_MINUTES },
    );
  }, [isEdit, form.kind]);

  useEffect(() => {
    if (!isEdit) unitDefaultedRef.current = false;
  }, [isEdit]);

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
    const locId = defaultLocationId || currentLocationId || "";
    const levelAtBranch = p.inventoryByLocation?.find(
      (l) => l.locationId === locId,
    );
    const reorderFromMeta =
      meta &&
      (typeof meta.reorderPoint === "number" ||
        typeof meta.reorderPoint === "string")
        ? String(meta.reorderPoint)
        : "";
    const reorderFromLevel =
      levelAtBranch?.reorderPoint != null
        ? String(levelAtBranch.reorderPoint)
        : "";
    const packed = parseMultiUnitMeta(meta);
    setForm({
      name: p.name ?? "",
      shortName: p.shortName ?? "",
      kind: p.kind,
      status: p.status || "active",
      skuCode: p.skuCode ?? "",
      barcode: p.barcode ?? "",
      barcodeType: p.barcodeType || "code128",
      internalCode: p.internalCode ?? "",
      categoryId: p.categoryId || p.category?.id || "",
      brandId: p.brandId || p.brand?.id || "",
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
      reorderPoint: reorderFromMeta || reorderFromLevel,
      multiUnitBaseQty: packed?.baseQty != null ? String(packed.baseQty) : "",
      multiUnitBaseUnit: packed?.baseUnit || "pcs",
      returnable: resolveReturnableFromMeta(meta, p.kind),
    });
    const existingImgs = (
      p.images?.length
        ? p.images
        : p.photoUrl
          ? [p.photoUrl]
          : []
    ).filter(Boolean) as string[];
    setExistingPhotosList(existingImgs);
    setPhotoUrl(p.photoUrl ?? "");
    setHydrated(true);
  }, [
    product.data,
    hydrated,
    isEdit,
    defaultLocationId,
    currentLocationId,
  ]);

  useEffect(() => {
    if (!isEdit || !product.data || !productFormFields.length) return;
    const meta = product.data.meta;
    const bag: Record<string, unknown> = {
      ...(typeof meta === "object" && meta && !Array.isArray(meta)
        ? (meta as Record<string, unknown>)
        : {}),
    };
    if (product.data.foodType && bag.foodType == null) {
      bag.foodType = product.data.foodType;
    }
    const extras: Record<string, string> = {};
    for (const f of productFormFields) {
      const v = bag[f.key];
      if (v != null && f.key !== "taxRatePercent" && f.key !== "reorderPoint" && f.key !== "multiUnit") {
        extras[f.key] = String(v);
      }
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

      // Serial / batch always imply inventory tracking; non-stock kinds never track
      const nonStock =
        form.kind === "service" ||
        form.kind === "digital" ||
        form.kind === "bundle";
      const trackInventory = nonStock
        ? false
        : form.trackInventory || form.trackSerial || form.trackBatch;
      const trackSerial = !nonStock && form.trackSerial && trackInventory;
      const trackBatch = !nonStock && form.trackBatch && trackInventory;
      const canPurchase =
        form.kind === "service" || form.kind === "digital"
          ? false
          : form.canPurchase;

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
        multiUnitBaseQty: form.multiUnitBaseQty,
        multiUnitBaseUnit: form.multiUnitBaseUnit,
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
      const existingPhotos = isEdit ? existingPhotosList : [];
      const uniquePhotos = [
        ...new Set([...uploaded, ...existingPhotos.filter(Boolean)]),
      ];

      const shared = {
        name: form.name.trim(),
        shortName: form.shortName.trim() || (isEdit ? null : undefined),
        kind: form.kind as CatalogProductKind,
        status: form.status as CatalogProductStatus,
        skuCode: form.skuCode.trim() || undefined,
        barcode: form.barcode.trim() || (isEdit ? null : undefined),
        barcodeType: form.barcode.trim()
          ? form.barcodeType || "code128"
          : isEdit
            ? null
            : undefined,
        internalCode: form.internalCode.trim() || (isEdit ? null : undefined),
        categoryId: form.categoryId || (isEdit ? null : undefined),
        brandId: form.brandId || (isEdit ? null : undefined),
        shortDescription:
          form.shortDescription.trim() || (isEdit ? null : undefined),
        description: form.description.trim() || (isEdit ? null : undefined),
        basePrice: Number(form.basePrice) || 0,
        costPrice: form.costPrice
          ? Number(form.costPrice)
          : isEdit
            ? null
            : undefined,
        mrp: form.mrp ? Number(form.mrp) : isEdit ? null : undefined,
        taxCode: taxCodeFromForm(form) ?? (isEdit ? null : undefined),
        unitOfMeasure: form.unitOfMeasure,
        ...catalogUnitPricingPayload(unitPricing, form.basePrice),
        photoUrl:
          uniquePhotos[0] || (isEdit ? null : undefined),
        images: isEdit ? uniquePhotos : uniquePhotos.length ? uniquePhotos : undefined,
        trackInventory,
        trackSerial,
        trackBatch,
        canSell: form.canSell,
        canPurchase,
        availableInPos: form.availableInPos,
        extraFields: buildExtraFieldsPayload(
          { ...form, trackInventory, trackSerial, trackBatch },
          extraFields,
          productFormFields,
          { clearEmpty: isEdit },
        ),
      };

      if (isEdit) {
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
        openingQty: createOpeningQtyPayload(
          trackInventory,
          form.trackSerial,
          form.openingQty,
          form.unitOfMeasure || "pcs",
        ),
        reorderPoint: (() => {
          if (!trackInventory) return undefined;
          const n = Number(form.reorderPoint);
          return form.reorderPoint.trim() !== "" && Number.isFinite(n)
            ? n
            : undefined;
        })(),
      });
    },
    onSuccess: async (saved) => {
      const pid = saved?.id || id;
      if (pid && unitPricing.sellingUnits.length) {
        for (const row of unitPricing.sellingUnits) {
          if (!row.unitId || !(Number(row.conversionToBase) > 0)) continue;
          try {
            await catalogApi.upsertProductUnit(pid, {
              unitId: row.unitId,
              conversionToBase: Number(row.conversionToBase),
              fixedPrice:
                unitPricing.pricingStrategy === "fixed_tier"
                  ? Number(row.fixedPrice) || 0
                  : null,
              isDefaultSellingUnit: row.isDefaultSellingUnit,
              isPurchaseUnit: row.isPurchaseUnit,
            });
          } catch {
            /* create already wrote units; edit upsert best-effort */
          }
        }
      }
      invalidateCatalogQueries(qc, pid);
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
              ? `Product created · Stock on Hand ${formatQtyWithUnit(Number(form.openingQty), form.unitOfMeasure || "pcs")}`
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
      toast.error(
        e instanceof ApiError
          ? e.messages?.join(", ") || e.message
          : e.message || "Save failed",
      ),
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

  const stockOnHand =
    product.data?.inventoryByLocation?.find(
      (l) => l.locationId === (defaultLocationId || currentLocationId),
    )?.qtyOnHand ??
    product.data?.stockOnHand ??
    null;

  const categoriesForForm = (() => {
    const list = cats.data ?? [];
    const c = product.data?.category;
    if (c?.id && !list.some((x) => x.id === c.id)) {
      return [
        {
          id: c.id,
          name: c.name,
          parentId: c.parentId ?? c.parent?.id ?? null,
          parent: c.parent ?? null,
        },
        ...list,
      ];
    }
    return list;
  })();

  const unitsForForm = (() => {
    const code = form.unitOfMeasure?.trim();
    if (!code) return unitOptions;
    if (unitOptions.some((u) => u.code === code)) return unitOptions;
    return [{ code, name: code }, ...unitOptions];
  })();

  const hasOptionalDetails = isEdit;

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
        categories={categoriesForForm}
        brands={(() => {
          const list = brands.data ?? [];
          const b = product.data?.brand;
          if (b?.id && !list.some((x) => x.id === b.id)) {
            return [{ id: b.id, name: b.name }, ...list];
          }
          return list;
        })()}
        unitOptions={unitsForForm}
        countryUnitHint={
          !isEdit && suggestQ.data
            ? `Suggested for ${suggestQ.data.label}: ${suggestQ.data.suggestedUnits
                .slice(0, 8)
                .map((u) => u.symbol)
                .join(", ")}. Default unit is set for correct stock & billing math.`
            : undefined
        }
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
          isEdit
            ? stockOnHand == null
              ? "—"
              : formatQtyWithUnit(
                  Number(stockOnHand),
                  form.unitOfMeasure || "pcs",
                )
            : undefined
        }
        defaultShowMore={hasOptionalDetails}
        categorySelectedLabel={
          product.data?.category
            ? product.data.category.parent
              ? `${product.data.category.parent.name} / ${product.data.category.name}`
              : product.data.category.name
            : null
        }
        brandSelectedLabel={product.data?.brand?.name ?? null}
        unitPricing={unitPricing}
        onUnitPricingChange={setUnitPricing}
        commerceModes={commerceModes}
        photosExtra={
          existingPhotosList.length ? (
            <div className="mb-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[0.7rem] font-semibold text-[#5a6b7d]">
                  Saved photos ({existingPhotosList.length})
                </p>
                <button
                  type="button"
                  className="text-[0.68rem] font-semibold text-rose-600 hover:text-rose-700 hover:underline inline-flex items-center gap-1"
                  onClick={() => setExistingPhotosList([])}
                >
                  <Trash2 className="size-3" />
                  Remove all
                </button>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {existingPhotosList.slice(0, 8).map((src, i) => (
                  <div key={src} className="group relative h-16 w-16">
                    <ProductThumb
                      src={src}
                      label={form.name}
                      className="h-16 w-16 rounded-lg border border-[#d9e0ea] object-cover"
                      onClick={() => setLightboxIndex(i)}
                    />
                    <button
                      type="button"
                      title="Remove saved photo"
                      aria-label="Remove photo"
                      className="absolute -top-1.5 -right-1.5 grid h-6 w-6 place-items-center rounded-full bg-rose-600 text-white shadow-md hover:bg-rose-700 transition"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExistingPhotosList((prev) => prev.filter((_, idx) => idx !== i));
                      }}
                    >
                      <X className="size-3.5 stroke-[2.5]" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null
        }
      />

      <ImageLightbox
        open={lightboxIndex != null}
        images={existingPhotosList}
        startIndex={lightboxIndex ?? 0}
        label={form.name}
        onClose={() => setLightboxIndex(null)}
      />
    </>
  );
}
