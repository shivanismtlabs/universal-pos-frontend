"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { catalogApi, customFieldsApi, posApi, tenantsApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { canWriteCatalog } from "@/lib/roles";
import { useAuthStore } from "@/lib/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ProductThumb } from "@/components/product-thumb";
import { ImageLightbox } from "@/components/image-lightbox";
import {
  ProductImagePicker,
  type ProductImagePickerHandle,
} from "@/components/product-image-picker";
import { prepareProductImageDataUrl } from "@/lib/image-prepare";
import { Search, X } from "lucide-react";
import {
  addSaleProductSchema,
  updateSaleProductSchema,
} from "@/lib/validations";
import {
  StockAdjustDialog,
  type StockAdjustTarget,
} from "@/components/stock-adjust-dialog";
import { useBootstrap } from "@/lib/bootstrap";
import {
  CUSTOM_FIELD_QUERY,
  mergeProductFormFields,
} from "@/lib/product-form-fields";
import { CustomFieldsSection } from "@/components/custom-field-inputs";
import { ItemsImportDialog } from "@/components/items-import-dialog";
import { AddCategoryModal } from "@/components/add-category-modal";
import {
  formatQtyWithUnit,
  normalizeSellUnit,
  priceUnitLabel,
  qtyStep,
  type SellUnit,
} from "@/lib/sell-units";
import { cn } from "@/lib/utils";
import { activeUnitOptions, catalogNeedsPackedContents, defaultPackedContentsQty } from "@/lib/measure-units";

const EMPTY = {
  title: "",
  description: "",
  categoryId: "",
  sku: "",
  sellUnit: "pcs" as SellUnit | string,
  price: "",
  qty: "1",
  manufacturer: "",
  brand: "",
  barcode: "",
  upc: "",
  ean: "",
  mpn: "",
  isbn: "",
  costPrice: "",
  reorderPoint: "",
  hsnOrSac: "",
  trackInventory: true,
  itemType: "goods" as "goods" | "service",
  itemStructure: "single" as "single" | "variants",
  taxPreference: "taxable" as "taxable" | "non_taxable",
  taxRatePercent: "5",
  openingStockValue: "",
  returnable: true,
  batchTracking: false,
  serialTracking: false,
  dimLength: "",
  dimWidth: "",
  dimHeight: "",
  dimUnit: "cm",
  weight: "",
  weightUnit: "kg",
  isComposite: false,
  multiUnitBaseQty: "",
  multiUnitBaseUnit: "pcs",
  loyaltyPoints: "",
  perishable: false,
  expiryAutoDiscountDays: "",
  expiryAutoDiscountPercent: "",
  modifiersText: "",
};

const MAX_IMAGES = 8;

function galleryOf(item: {
  images?: string[] | null;
  image?: string | null;
  photoUrl?: string | null;
}) {
  const list = item.images?.length
    ? item.images
    : [item.image ?? item.photoUrl].filter(Boolean);
  return list as string[];
}

type EditDraft = {
  title: string;
  description: string;
  categoryId: string;
  sellUnit: SellUnit;
  price: string;
  qty: string;
};

const textareaClass =
  "mt-0 min-h-[72px] w-full rounded-lg border border-[#d9e0ea] bg-white px-3 py-2 text-[0.875rem] leading-snug text-[#0b1f33] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#94a3b8] hover:border-[#c5d0e0] focus:border-[#1a56db] focus:shadow-[0_0_0_3px_rgba(26,86,219,0.12)]";

function errMsg(e: unknown) {
  if (e instanceof ApiError) return e.messages.join(", ");
  if (e instanceof Error) return e.message;
  return "Failed";
}

function invalidateSale(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["pos-sale-floor"] });
  void qc.invalidateQueries({ queryKey: ["pos-sale-products"] });
  void qc.invalidateQueries({ queryKey: ["pos-sale-categories"] });
  void qc.invalidateQueries({ queryKey: ["pos-sale-catalog"] });
  void qc.invalidateQueries({ queryKey: ["dashboard-catalog"] });
  void qc.invalidateQueries({ queryKey: ["retail-skus"] });
  void qc.invalidateQueries({ queryKey: ["categories"] });
  void qc.invalidateQueries({ queryKey: ["catalog-products"] });
  void qc.invalidateQueries({ queryKey: ["catalog-products-home"] });
}

/**
 * Universal product manager — any user-named category,
 * fixed keys: title · description · category · sku · price · qty · image
 */
export function SaleStockPanel({
  onAdded,
  initialPanel,
}: {
  onAdded?: () => void;
  initialPanel?: "add" | "products" | "categories";
}) {
  const qc = useQueryClient();
  const roles = useAuthStore((s) => s.user?.roles);
  const canWrite = canWriteCatalog(roles);
  const { businessConfig, businessType, itemMetaFields } = useBootstrap();
  const customFieldsQ = useQuery({
    queryKey: ["custom-fields", "product"],
    queryFn: () => customFieldsApi.listProductDefinitions(),
    ...CUSTOM_FIELD_QUERY,
  });
  const productFormFields = useMemo(
    () => mergeProductFormFields(customFieldsQ.data, itemMetaFields),
    [customFieldsQ.data, itemMetaFields],
  );

  const [panel, setPanel] = useState<"add" | "products" | "categories">(
    initialPanel ?? "products",
  );
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search).get("panel");
    if (p === "add" || p === "categories" || p === "products") {
      setPanel(p);
    }
  }, []);
  const [form, setForm] = useState(EMPTY);
  /** Values for Settings → Custom fields (Product). */
  const [extraFields, setExtraFields] = useState<Record<string, string>>({});
  const [formErrors, setFormErrors] = useState<
    Partial<Record<string, string>>
  >({});
  const imagePickerRef = useRef<ProductImagePickerHandle>(null);
  const [addCatOpen, setAddCatOpen] = useState(false);
  const [q, setQ] = useState("");
  const [filterCat, setFilterCat] = useState("");
  /** Zoho Items list filter — Status.All / Active / Inactive / Low stock */
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive" | "low"
  >("all");
  const [sortBy, setSortBy] = useState<"name" | "sku" | "price" | "qty">(
    "name",
  );
  const [sortAsc, setSortAsc] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [lightbox, setLightbox] = useState<{
    images: string[];
    index: number;
    label: string;
  } | null>(null);
  /** Which product row has the photo manager strip open */
  const [photosOpenId, setPhotosOpenId] = useState<string | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<StockAdjustTarget | null>(
    null,
  );

  const floor = useQuery({
    queryKey: ["pos-sale-floor"],
    queryFn: () => posApi.saleFloor(),
  });

  const products = useQuery({
    queryKey: ["pos-sale-products", q, filterCat, floor.data?.locationId],
    queryFn: () =>
      posApi.listSaleProducts({
        q: q.trim() || undefined,
        categoryId: filterCat || undefined,
        locationId: floor.data?.locationId,
      }),
    refetchOnMount: "always",
  });

  const categoriesQ = useQuery({
    queryKey: ["pos-sale-categories"],
    queryFn: () => posApi.listSaleCategories(),
  });
  const unitsQ = useQuery({
    queryKey: ["measure-units"],
    queryFn: () => tenantsApi.listUnits(),
  });
  const unitOptions = useMemo(
    () => activeUnitOptions(unitsQ.data),
    [unitsQ.data],
  );

  const categories = categoriesQ.data ?? floor.data?.categories ?? [];

  const addCat = useMutation({
    mutationFn: (payload: { name: string; parentId?: string }) =>
      posApi.addSaleCategory(payload),
    onSuccess: (row) => {
      toast.success(`Category “${row.name}” added`);
      setAddCatOpen(false);
      setForm((f) => ({ ...f, categoryId: row.id }));
      invalidateSale(qc);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const renameCat = useMutation({
    mutationFn: () =>
      posApi.renameSaleCategory(renameId!, { name: renameVal.trim() }),
    onSuccess: (row) => {
      toast.success(`Renamed to “${row.name}”`);
      setRenameId(null);
      setRenameVal("");
      invalidateSale(qc);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const addProduct = useMutation({
    mutationFn: async () => {
      const rawCost = form.costPrice.trim();
      const rawReorder = form.reorderPoint.trim();
      const isService = form.itemType === "service";
      const trackInventory = isService ? false : form.trackInventory;
      const parsed = addSaleProductSchema.safeParse({
        title: form.title,
        description: form.description,
        categoryId: form.categoryId,
        sku: form.sku,
        sellUnit: form.sellUnit || "pcs",
        price: form.price,
        qty: trackInventory ? form.qty : "0",
        manufacturer: form.manufacturer,
        barcode: form.barcode || form.upc,
        ...(rawCost !== "" ? { costPrice: Number(rawCost) } : {}),
        ...(rawReorder !== "" ? { reorderPoint: Number(rawReorder) } : {}),
        hsnOrSac: form.hsnOrSac,
        trackInventory,
      });
      if (!parsed.success) {
        const next: Partial<Record<string, string>> = {};
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0] ?? "title");
          if (!next[key]) next[key] = issue.message;
        }
        setFormErrors(next);
        throw new Error(parsed.error.issues[0]?.message ?? "Check the form");
      }
      setFormErrors({});

      const num = (s: string) => {
        const t = s.trim();
        if (!t) return undefined;
        const n = Number(t);
        return Number.isFinite(n) ? n : undefined;
      };

      const modifiers = form.modifiersText
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      const photos = imagePickerRef.current?.getUploadDataUrls() ?? [];

      const res = await posApi.addSaleProduct({
        title: parsed.data.title,
        description: parsed.data.description || undefined,
        categoryId: parsed.data.categoryId,
        sku: parsed.data.sku,
        sellUnit: parsed.data.sellUnit,
        price: parsed.data.price,
        qty: parsed.data.qty,
        locationId: floor.data?.locationId,
        image: photos[0],
        manufacturer: parsed.data.manufacturer || undefined,
        barcode: parsed.data.barcode || undefined,
        costPrice: parsed.data.costPrice,
        reorderPoint: parsed.data.reorderPoint,
        hsnOrSac: parsed.data.hsnOrSac || undefined,
        trackInventory: parsed.data.trackInventory,
        itemType: form.itemType,
        itemStructure: form.itemStructure,
        brand: form.brand.trim() || undefined,
        upc: form.upc.trim() || undefined,
        ean: form.ean.trim() || undefined,
        mpn: form.mpn.trim() || undefined,
        isbn: form.isbn.trim() || undefined,
        taxPreference: form.taxPreference,
        taxRatePercent: num(form.taxRatePercent),
        openingStockValue: num(form.openingStockValue),
        returnable: form.returnable,
        batchTracking: form.batchTracking && !isService,
        serialTracking: form.serialTracking && !isService,
        dimLength: num(form.dimLength),
        dimWidth: num(form.dimWidth),
        dimHeight: num(form.dimHeight),
        dimUnit: form.dimUnit || undefined,
        weight: num(form.weight),
        weightUnit: form.weightUnit || undefined,
        isComposite: form.isComposite,
        multiUnitBaseQty: num(form.multiUnitBaseQty),
        multiUnitBaseUnit: form.multiUnitBaseUnit || undefined,
        loyaltyPoints: num(form.loyaltyPoints),
        perishable: form.perishable,
        expiryAutoDiscountDays: num(form.expiryAutoDiscountDays),
        expiryAutoDiscountPercent: num(form.expiryAutoDiscountPercent),
        modifiers: modifiers.length ? modifiers : undefined,
        extraFields: (() => {
          const out: Record<string, unknown> = {};
          for (const [k, raw] of Object.entries(extraFields)) {
            if (raw === "" || raw == null) continue;
            const def = productFormFields.find((f) => f.key === k);
            if (def?.type === "boolean") {
              out[k] = raw === "true" || raw === "1";
            } else if (def?.type === "number") {
              const n = Number(raw);
              if (Number.isFinite(n)) out[k] = n;
            } else {
              out[k] = String(raw).trim();
            }
          }
          return out;
        })(),
      });
      for (const dataUrl of photos.slice(1)) {
        await posApi.uploadSaleProductImage(res.stockLevel.id, dataUrl);
      }
      return res;
    },
    onSuccess: (res) => {
      toast.success(`${res.product.title} ready to sell`);
      setForm((f) => ({
        ...EMPTY,
        categoryId: f.categoryId,
        sellUnit: f.sellUnit,
        trackInventory: f.trackInventory,
        itemType: f.itemType,
      }));
      setExtraFields({});
      imagePickerRef.current?.clear();
      setFormErrors({});
      invalidateSale(qc);
      onAdded?.();
      setPanel("products");
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const uploadImage = useMutation({
    mutationFn: async ({
      id,
      dataUrls,
    }: {
      id: string;
      dataUrls: string[];
    }) => {
      for (const dataUrl of dataUrls) {
        await posApi.uploadSaleProductImage(id, dataUrl);
      }
    },
    onSuccess: () => {
      toast.success("Image(s) added");
      invalidateSale(qc);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const removeImage = useMutation({
    mutationFn: ({ id, imageUrl }: { id: string; imageUrl: string }) =>
      posApi.removeSaleProductImage(id, imageUrl),
    onSuccess: () => {
      toast.success("Image removed");
      invalidateSale(qc);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  async function pickFiles(
    fileList: FileList | null,
    onDataUrls: (urls: string[]) => void,
  ) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    const urls: string[] = [];
    for (const file of files) {
      try {
        urls.push(await prepareProductImageDataUrl(file));
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : `Could not read ${file.name}`,
        );
      }
    }
    if (urls.length) onDataUrls(urls);
  }

  const updateProduct = useMutation({
    mutationFn: () => {
      if (!editingId || !draft) throw new Error("Nothing to save");
      const parsed = updateSaleProductSchema.safeParse({
        title: draft.title,
        description: draft.description,
        categoryId: draft.categoryId,
        sellUnit: draft.sellUnit,
        price: draft.price,
        qty: draft.qty,
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "Invalid values");
      }
      return posApi.updateSaleProduct(editingId, {
        title: parsed.data.title,
        description: parsed.data.description || "",
        categoryId: parsed.data.categoryId || undefined,
        sellUnit: parsed.data.sellUnit,
        price: parsed.data.price,
        qty: parsed.data.qty,
      });
    },
    onSuccess: () => {
      toast.success("Product updated");
      setEditingId(null);
      setDraft(null);
      invalidateSale(qc);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const adjustStock = useMutation({
    mutationFn: ({
      id,
      delta,
      reason,
    }: {
      id: string;
      delta: number;
      reason?: string;
    }) => posApi.adjustSaleStock(id, { delta, reason }),
    onSuccess: (res) => {
      toast.success(
        `Stock → ${formatQtyWithUnit(Number(res.qty), res.sellUnit)}`,
      );
      setAdjustTarget(null);
      invalidateSale(qc);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      posApi.updateSaleProduct(id, { isActive }),
    onSuccess: (_, vars) => {
      toast.success(vars.isActive ? "Product activated" : "Product deactivated");
      invalidateSale(qc);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const rawItems = products.data?.items ?? [];

  const items = useMemo(() => {
    let list = [...rawItems];
    if (statusFilter === "active") {
      list = list.filter((i) => i.isActive);
    } else if (statusFilter === "inactive") {
      list = list.filter(
        (i) => !i.isActive || i.status === "inactive" || i.status === "archived",
      );
    } else if (statusFilter === "low") {
      list = list.filter((i) => i.isActive && Number(i.qty) <= 5);
    }
    const dir = sortAsc ? 1 : -1;
    list.sort((a, b) => {
      if (sortBy === "name") {
        return dir * a.title.localeCompare(b.title, undefined, {
          sensitivity: "base",
        });
      }
      if (sortBy === "sku") {
        return dir * a.sku.localeCompare(b.sku, undefined, {
          sensitivity: "base",
        });
      }
      if (sortBy === "price") {
        return dir * (Number(a.price) - Number(b.price));
      }
      return dir * (Number(a.qty) - Number(b.qty));
    });
    return list;
  }, [rawItems, statusFilter, sortBy, sortAsc]);

  function toggleSort(col: typeof sortBy) {
    if (sortBy === col) setSortAsc((v) => !v);
    else {
      setSortBy(col);
      setSortAsc(true);
    }
  }

  const categoryOptions = useMemo(
    () =>
      (categories as Array<{ id: string; name: string }>).map((c) => ({
        id: c.id,
        name: c.name,
      })),
    [categories],
  );

  if (!canWrite) {
    return (
      <p className="rounded-2xl border border-[#e5e7eb] bg-white p-6 text-sm text-[#6b7280]">
        You do not have permission to manage products. An owner or inventory
        manager can update the catalog. You can still process sales on the
        counter.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {panel === "add" ? (
        <div className="overflow-hidden rounded-md border border-[#d9e0ea] bg-white shadow-[0_1px_2px_rgba(11,31,51,0.04)]">
          {/* Zoho product-creation header: New Item · Cancel / Save */}
          <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-[#eef1f4] bg-white px-4 py-3 sm:px-6">
            <div className="min-w-0">
              <h2 className="text-[1.15rem] font-semibold tracking-tight text-[#21263c]">
                New Item
              </h2>
              {businessConfig?.label || businessType ? (
                <p className="mt-0.5 text-[0.72rem] text-[#6b7c93]">
                  {businessConfig?.label ?? businessType}
                  {productFormFields.length
                    ? ` · ${productFormFields.length} extra field${productFormFields.length === 1 ? "" : "s"}`
                    : null}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setPanel("products");
                  setFormErrors({});
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={addProduct.isPending || !categories.length}
                onClick={() => addProduct.mutate()}
              >
                {addProduct.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>

          {!categories.length ? (
            <div className="mx-4 mt-4 rounded-md border border-[#fde68a] bg-[#fffbeb] px-3 py-2.5 text-sm text-[#92400e] sm:mx-6">
              Add a category first (rail on the right or Categories tab). Category
              is required on every item.
            </div>
          ) : null}

          {/* Zoho: main form left · images / categories right */}
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-0 divide-y divide-[#eef1f4] px-4 py-5 sm:px-6">
              {/* —— 1. Primary details —— */}
              <section className="pb-7">
                <h3 className="text-[0.78rem] font-bold tracking-[0.04em] text-[#21263c] uppercase">
                  Primary details
                </h3>
                <div className="mt-4 space-y-3.5">
                  <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
                    <Label className="sm:pt-1">Type *</Label>
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          ["goods", "Goods"],
                          ["service", "Service"],
          ] as const
                      ).map(([id, label]) => (
          <button
                          key={id}
            type="button"
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              itemType: id,
                              trackInventory:
                                id === "service" ? false : f.trackInventory,
                            }))
                          }
                          className={cn(
                            "rounded-md border px-3 py-1.5 text-sm font-medium transition",
                            form.itemType === id
                              ? "border-[#1a56db] bg-[#e8eefb] text-[#1a56db]"
                              : "border-[#d9e0ea] bg-white text-[#5a6b7d]",
                          )}
                        >
                          {label}
          </button>
        ))}
                    </div>
      </div>

                  <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
                    <Label className="sm:pt-2.5">Name *</Label>
                    <div>
                      <Input
                        placeholder="Item name"
                        value={form.title}
                        onChange={(e) => {
                          setForm((f) => ({ ...f, title: e.target.value }));
                          setFormErrors((er) => {
                            if (!er.title) return er;
                            const n = { ...er };
                            delete n.title;
                            return n;
                          });
                        }}
                      />
                      {formErrors.title ? (
                        <p className="mt-1 text-xs text-[#c81e1e]">
                          {formErrors.title}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
                    <Label className="sm:pt-2.5">SKU *</Label>
                    <div>
                      <Input
                        className="font-mono uppercase"
                        placeholder="SKU"
                        value={form.sku}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, sku: e.target.value }))
                        }
                        maxLength={18}
                      />
                      {formErrors.sku ? (
                        <p className="mt-1 text-xs text-[#c81e1e]">
                          {formErrors.sku}
                        </p>
                      ) : (
                        <p className="mt-1 text-[0.65rem] text-[#8b9bb0]">
                          Unique stock keeping unit (2–18 characters)
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
                    <Label className="sm:pt-2.5">Unit / UOM *</Label>
                    <Select
                      value={form.sellUnit}
                      onChange={(e) => {
                        const next = e.target.value as SellUnit;
                        setForm((f) => {
                          const kind =
                            f.itemType === "service" ? "service" : "physical";
                          const nextPacked = catalogNeedsPackedContents(
                            kind,
                            next,
                          );
                          const prevPacked = catalogNeedsPackedContents(
                            kind,
                            f.sellUnit,
                          );
                          let qty = f.multiUnitBaseQty;
                          let base = f.multiUnitBaseUnit || "pcs";
                          if (!nextPacked) {
                            qty = "";
                            base = "pcs";
                          } else if (!prevPacked || !qty.trim()) {
                            qty = defaultPackedContentsQty(next);
                            if (String(next).toLowerCase() === "dozen") {
                              base = "pcs";
                            }
                          }
                          return {
                            ...f,
                            sellUnit: next,
                            multiUnitBaseQty: qty,
                            multiUnitBaseUnit: base,
                          };
                        });
                      }}
                    >
                      {unitOptions.map((u) => (
                        <option key={u.code} value={u.code}>
                          {u.name} ({u.code})
                        </option>
                      ))}
                    </Select>
                  </div>

                  {catalogNeedsPackedContents(
                    form.itemType === "service" ? "service" : "physical",
                    form.sellUnit,
                  ) && (
                    <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
                      <Label className="sm:pt-2.5">
                        Qty in 1 {form.sellUnit || "box"}
                      </Label>
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          className="w-24"
                          type="number"
                          min={0.001}
                          inputMode="decimal"
                          placeholder={
                            String(form.sellUnit).toLowerCase() === "dozen"
                              ? "12"
                              : "e.g. 12"
                          }
                          value={form.multiUnitBaseQty}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              multiUnitBaseQty: e.target.value,
                            }))
                          }
                        />
                        <Select
                          className="w-28"
                          value={form.multiUnitBaseUnit}
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
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
                    <Label className="sm:pt-2.5">Category *</Label>
                    <div>
                      <Select
                        value={form.categoryId}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            categoryId: e.target.value,
                          }))
                        }
                      >
                        <option value="">Select a category</option>
                        {categoryOptions.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                      {formErrors.categoryId ? (
                        <p className="mt-1 text-xs text-[#c81e1e]">
                          {formErrors.categoryId}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
                    <Label className="sm:pt-1">Item structure</Label>
                    <div>
                      <div className="flex flex-wrap gap-2">
                        {(
                          [
                            ["single", "Single item"],
                            ["variants", "Contains variants"],
                          ] as const
                        ).map(([id, label]) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() =>
                              setForm((f) => ({ ...f, itemStructure: id }))
                            }
                            className={cn(
                              "rounded-md border px-3 py-1.5 text-sm font-medium transition",
                              form.itemStructure === id
                                ? "border-[#1a56db] bg-[#e8eefb] text-[#1a56db]"
                                : "border-[#d9e0ea] bg-white text-[#5a6b7d]",
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      {form.itemStructure === "variants" ? (
                        <p className="mt-1 text-[0.65rem] text-[#8b9bb0]">
                          Parent flag saved — full size/colour matrix ships in
                          the variants pack.
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </section>

              {/* —— 2. Identification & codes —— */}
              <section className="py-7">
                <h3 className="text-[0.78rem] font-bold tracking-[0.04em] text-[#21263c] uppercase">
                  Identification &amp; codes
                </h3>
                <div className="mt-4 space-y-3.5">
                  <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
                    <Label className="sm:pt-2.5">HSN / SAC</Label>
                    <Input
                      className="font-mono"
                      placeholder="e.g. 1001"
                      value={form.hsnOrSac}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, hsnOrSac: e.target.value }))
                      }
                      maxLength={16}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
                    <Label className="sm:pt-2.5">Barcode</Label>
                    <div className="flex gap-1">
                      <Input
                        className="font-mono"
                        placeholder="Auto if empty · or Generate"
                        value={form.barcode}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, barcode: e.target.value }))
                        }
                        maxLength={32}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        className="shrink-0"
                        onClick={() => {
                          void catalogApi
                            .generateBarcode()
                            .then((r) => {
                              setForm((f) => ({ ...f, barcode: r.barcode }));
                              toast.success("Barcode generated");
                            })
                            .catch((e) =>
                              toast.error(
                                e instanceof ApiError
                                  ? e.message
                                  : "Barcode failed",
                              ),
                            );
                        }}
                      >
                        Generate
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
                    <Label className="sm:pt-2.5">UPC</Label>
                    <Input
                      className="font-mono"
                      value={form.upc}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, upc: e.target.value }))
                      }
                      maxLength={32}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
                    <Label className="sm:pt-2.5">EAN</Label>
                    <Input
                      className="font-mono"
                      value={form.ean}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, ean: e.target.value }))
                      }
                      maxLength={32}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
                    <Label className="sm:pt-2.5">MPN</Label>
                    <Input
                      value={form.mpn}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, mpn: e.target.value }))
                      }
                      maxLength={64}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
                    <Label className="sm:pt-2.5">ISBN</Label>
                    <Input
                      value={form.isbn}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, isbn: e.target.value }))
                      }
                      maxLength={32}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
                    <Label className="sm:pt-2.5">Brand</Label>
                    <Input
                      value={form.brand}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, brand: e.target.value }))
                      }
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
                    <Label className="sm:pt-2.5">Manufacturer</Label>
                    <Input
                      value={form.manufacturer}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                          manufacturer: e.target.value,
                          }))
                        }
                      />
                    </div>
                </div>
              </section>

              {/* —— 3. Pricing —— */}
              <section className="py-7">
                <h3 className="text-[0.78rem] font-bold tracking-[0.04em] text-[#21263c] uppercase">
                  Pricing
                </h3>
                <div className="mt-4 space-y-3.5">
                  <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
                    <Label className="sm:pt-2.5">Selling Price *</Label>
                    <div>
                      <Input
                        inputMode="decimal"
                        placeholder="0.00"
                        value={form.price}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, price: e.target.value }))
                        }
                      />
                      {formErrors.price ? (
                        <p className="mt-1 text-xs text-[#c81e1e]">
                          {formErrors.price}
                        </p>
                      ) : (
                        <p className="mt-1 text-[0.65rem] text-[#8b9bb0]">
                          Rate per{" "}
                          {priceUnitLabel(normalizeSellUnit(form.sellUnit))}
                        </p>
                          )}
                        </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
                    <Label className="sm:pt-2.5">Cost Price</Label>
                          <Input
                      inputMode="decimal"
                      placeholder="0.00"
                      value={form.costPrice}
                      onChange={(e) =>
                                  setForm((f) => ({
                                    ...f,
                          costPrice: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
                    <Label className="sm:pt-1">Tax preference</Label>
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          ["taxable", "Taxable"],
                          ["non_taxable", "Non-taxable"],
                        ] as const
                      ).map(([id, label]) => (
                        <button
                          key={id}
                              type="button"
                              onClick={() =>
                            setForm((f) => ({ ...f, taxPreference: id }))
                          }
                          className={cn(
                            "rounded-md border px-3 py-1.5 text-sm font-medium",
                            form.taxPreference === id
                              ? "border-[#1a56db] bg-[#e8eefb] text-[#1a56db]"
                              : "border-[#d9e0ea] text-[#5a6b7d]",
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {form.taxPreference === "taxable" ? (
                    <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
                      <Label className="sm:pt-2.5">Tax rate %</Label>
                      <Input
                        inputMode="decimal"
                        placeholder="e.g. 5 or 18"
                        value={form.taxRatePercent}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            taxRatePercent: e.target.value,
                          }))
                        }
                      />
                    </div>
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
                    <Label className="sm:pt-2.5">Sales Description</Label>
                    <textarea
                      className={textareaClass}
                      rows={3}
                      placeholder="Shown on catalog / receipts"
                      value={form.description}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          description: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
                    <Label className="sm:pt-2.5">Loyalty points</Label>
                    <Input
                      inputMode="decimal"
                      placeholder="Optional points weight"
                      value={form.loyaltyPoints}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          loyaltyPoints: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              </section>

              {/* —— 4. Stock & tracking —— */}
              <section className="py-7">
                <h3 className="text-[0.78rem] font-bold tracking-[0.04em] text-[#21263c] uppercase">
                  Stock &amp; tracking
                </h3>
                {form.itemType === "service" ? (
                  <p className="mt-3 text-sm text-[#6b7c93]">
                    Service items do not track inventory (like Zoho service
                    items).
                  </p>
                ) : (
                  <>
                    <label className="mt-4 flex max-w-xl cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 accent-[#1a56db]"
                        checked={form.trackInventory}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            trackInventory: e.target.checked,
                          }))
                        }
                      />
                      <span className="text-sm text-[#21263c]">
                        Track Inventory for this item
                      </span>
                    </label>
                    {form.trackInventory ? (
                      <div className="mt-4 space-y-3.5">
                        <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
                          <Label className="sm:pt-2.5">Opening Stock *</Label>
                          <div>
                            <Input
                              type="number"
                              inputMode="numeric"
                              min={1}
                              step={1}
                              value={form.qty}
                              onChange={(e) =>
                                setForm((f) => ({
                                  ...f,
                                  qty: e.target.value,
                                }))
                              }
                            />
                            {formErrors.qty ? (
                              <p className="mt-1 text-xs text-[#c81e1e]">
                                {formErrors.qty}
                              </p>
                            ) : (
                              <p className="mt-1 text-[0.65rem] text-[#8b9bb0]">
                                Minimum 1 — 0 / 0.1 / 0.2 not allowed
                            </p>
                          )}
                        </div>
                      </div>
                        <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
                          <Label className="sm:pt-2.5">
                            Opening stock value
                          </Label>
                          <Input
                            inputMode="decimal"
                            placeholder="Optional total value"
                            value={form.openingStockValue}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                openingStockValue: e.target.value,
                              }))
                            }
                          />
                    </div>
                        <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
                          <Label className="sm:pt-2.5">Reorder Point</Label>
                          <Input
                            inputMode="decimal"
                            placeholder="Low stock alert qty"
                            value={form.reorderPoint}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                reorderPoint: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
                <div className="mt-4 space-y-2">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[#1a56db]"
                      checked={form.returnable}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          returnable: e.target.checked,
                        }))
                      }
                    />
                    Returnable item
                  </label>
                  {form.itemType === "goods" ? (
                    <>
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[#1a56db]"
                          checked={form.batchTracking}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              batchTracking: e.target.checked,
                            }))
                          }
                        />
                        Batch tracking
                        <span className="text-[0.65rem] text-[#8b9bb0]">
                          (flag saved · full batches pack later)
                        </span>
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[#1a56db]"
                          checked={form.serialTracking}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              serialTracking: e.target.checked,
                            }))
                          }
                        />
                        Serial tracking
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[#1a56db]"
                          checked={form.isComposite}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              isComposite: e.target.checked,
                            }))
                          }
                        />
                        Composite item (kit / bundle)
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[#1a56db]"
                          checked={form.perishable}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              perishable: e.target.checked,
                            }))
                          }
                        />
                        Perishable
                      </label>
                      {form.perishable ? (
                        <div className="ml-6 grid max-w-md gap-2 sm:grid-cols-2">
                          <div>
                            <Label className="text-[0.7rem]">
                              Auto-discount days before expiry
                    </Label>
                    <Input
                              className="mt-1"
                              inputMode="numeric"
                              value={form.expiryAutoDiscountDays}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                                  expiryAutoDiscountDays: e.target.value,
                        }))
                      }
                    />
                  </div>
                          <div>
                            <Label className="text-[0.7rem]">Discount %</Label>
                            <Input
                              className="mt-1"
                              inputMode="decimal"
                              value={form.expiryAutoDiscountPercent}
                              onChange={(e) =>
                                setForm((f) => ({
                                  ...f,
                                  expiryAutoDiscountPercent: e.target.value,
                                }))
                              }
                            />
            </div>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </section>

              {/* —— 5. Physical details —— */}
              {form.itemType === "goods" ? (
                <section className="py-7">
                  <h3 className="text-[0.78rem] font-bold tracking-[0.04em] text-[#21263c] uppercase">
                    Physical details
                  </h3>
                  <div className="mt-4 space-y-3.5">
                    <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
                      <Label className="sm:pt-2.5">Dimensions (L×W×H)</Label>
                      <div className="flex flex-wrap gap-2">
                        <Input
                          className="w-20"
                          placeholder="L"
                          inputMode="decimal"
                          value={form.dimLength}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              dimLength: e.target.value,
                            }))
                          }
                        />
                        <Input
                          className="w-20"
                          placeholder="W"
                          inputMode="decimal"
                          value={form.dimWidth}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              dimWidth: e.target.value,
                            }))
                          }
                        />
                        <Input
                          className="w-20"
                          placeholder="H"
                          inputMode="decimal"
                          value={form.dimHeight}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              dimHeight: e.target.value,
                            }))
                          }
                        />
                        <Select
                          className="w-24"
                          value={form.dimUnit}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              dimUnit: e.target.value,
                            }))
                          }
                        >
                          <option value="cm">cm</option>
                          <option value="in">in</option>
                          <option value="mm">mm</option>
                        </Select>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
                      <Label className="sm:pt-2.5">Weight</Label>
                      <div className="flex flex-wrap gap-2">
                        <Input
                          className="w-28"
                          inputMode="decimal"
                          value={form.weight}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              weight: e.target.value,
                            }))
                          }
                        />
                        <Select
                          className="w-24"
                          value={form.weightUnit}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              weightUnit: e.target.value,
                            }))
                          }
                        >
                          <option value="kg">kg</option>
                          <option value="g">g</option>
                          <option value="lb">lb</option>
                        </Select>
                      </div>
                    </div>
                  </div>
          </section>
              ) : null}

              {/* —— 6. Modifiers (restaurant / café style) —— */}
              <section className="py-7">
                <h3 className="text-[0.78rem] font-bold tracking-[0.04em] text-[#21263c] uppercase">
                  Modifiers / add-ons
            </h3>
                <p className="mt-1 text-[0.72rem] text-[#6b7c93]">
                  Optional labels (e.g. Extra cheese, No onion). Full modifier
                  pricing pack later — saved on item for now.
                </p>
                <textarea
                  className={`${textareaClass} mt-3`}
                  rows={2}
                  placeholder="Comma or line-separated"
                  value={form.modifiersText}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      modifiersText: e.target.value,
                    }))
                  }
                />
              </section>

              <section className="py-7">
                <CustomFieldsSection
                  hint="These boxes come from Settings → Custom fields (choose Product). They save with the item."
                  fields={productFormFields}
                  loading={customFieldsQ.isLoading}
                  values={extraFields}
                  onChange={(key, value) =>
                    setExtraFields((prev) => ({ ...prev, [key]: value }))
                  }
                />
              </section>

              <div className="flex flex-wrap gap-2 pt-6">
              <Button
                  type="button"
                  disabled={addProduct.isPending || !categories.length}
                  onClick={() => addProduct.mutate()}
                >
                  {addProduct.isPending ? "Saving…" : "Save"}
                </Button>
                <Button
                  type="button"
                variant="secondary"
                  onClick={() => setPanel("products")}
              >
                  Cancel
              </Button>
            </div>
            </div>

            {/* Right: images + categories (Zoho layout) */}
            <aside className="space-y-6 border-t border-[#eef1f4] bg-[#fafbfc] p-4 lg:border-t-0 lg:border-l sm:p-5">
              <div>
                <h3 className="text-[0.78rem] font-bold tracking-[0.04em] text-[#21263c] uppercase">
                  Images
                </h3>
                <p className="mt-1 text-[0.72rem] text-[#6b7c93]">
                  First image is used as the item thumbnail.
                </p>
                <div className="mt-3">
                  <ProductImagePicker
                    ref={imagePickerRef}
                    productName={form.title}
                    productHint={form.description}
                  />
                </div>
              </div>

              <div>
                <h3 className="text-[0.78rem] font-bold tracking-[0.04em] text-[#21263c] uppercase">
                  Categories
                </h3>
                <p className="mt-1 text-[0.72rem] text-[#6b7c93]">
                  Select on the form or tap a name below.
                </p>
                {canWrite ? (
                  <Button
                    type="button"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() => setAddCatOpen(true)}
                  >
                    + Add Category
                  </Button>
                ) : null}
                <ul className="mt-3 max-h-56 space-y-0.5 overflow-y-auto text-sm">
                  {categories.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className={`w-full rounded-md px-2 py-1.5 text-left transition ${
                          form.categoryId === c.id
                            ? "bg-[#e8eefb] font-semibold text-[#1a56db]"
                            : "text-[#5a6b7d] hover:bg-white"
                        }`}
                        onClick={() =>
                          setForm((f) => ({ ...f, categoryId: c.id }))
                        }
                      >
                        {c.name}
                      </button>
                    </li>
                  ))}
                  {!categories.length ? (
                    <li className="px-2 py-2 text-xs text-[#8b9bb0]">
                      No categories yet
                    </li>
                  ) : null}
                </ul>
              </div>
            </aside>
          </div>
        </div>
      ) : null}

      {panel === "products" ? (
        <section className="overflow-hidden rounded-md border border-[#d9e0ea] bg-white shadow-[0_1px_2px_rgba(11,31,51,0.04)]">
          {/* Zoho-style module bar: count left · Import Items + New Item right */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef1f4] px-4 py-2.5 sm:px-5">
            <div className="min-w-0">
              <p className="text-[0.8rem] font-medium text-[#0b1f33]">
                {items.length} item{items.length === 1 ? "" : "s"}
                {products.isLoading ? (
                  <span className="font-normal text-[#8b9bb0]"> · loading…</span>
                ) : null}
              </p>
              <p className="text-[0.7rem] text-[#8b9bb0]">
                Filter: Status.
                {statusFilter === "all"
                  ? "All"
                  : statusFilter === "low"
                    ? "Low stock"
                    : statusFilter === "active"
                      ? "Active"
                      : "Inactive"}
                {filterCat
                  ? ` · Category · ${
                      categoryOptions.find((c) => c.id === filterCat)?.name ??
                      "—"
                    }`
                  : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canWrite ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setImportOpen(true)}
                  >
                    Import Items
            </Button>
                  <Button size="sm" onClick={() => setPanel("add")}>
                    + New Item
                  </Button>
                </>
              ) : null}
            </div>
          </div>

          {/* Status chips · category · search (Zoho filter_by=Status.*) */}
          <div className="flex flex-col gap-2.5 border-b border-[#eef1f4] bg-[#fafbfc] px-4 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 sm:px-5">
            <div
              role="tablist"
              aria-label="Status filter"
              className="inline-flex flex-wrap gap-0.5 rounded-md border border-[#e2e8f0] bg-[#f1f5f9] p-0.5"
            >
              {(
                [
                  { id: "all" as const, label: "All" },
                  { id: "active" as const, label: "Active" },
                  { id: "inactive" as const, label: "Inactive" },
                  { id: "low" as const, label: "Low stock" },
                ] as const
              ).map((t) => {
                const on = statusFilter === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setStatusFilter(t.id)}
                    className={
                      on
                        ? "rounded-[5px] bg-white px-2.5 py-1.5 text-[0.75rem] font-semibold text-[#0b1f33] shadow-sm"
                        : "rounded-[5px] px-2.5 py-1.5 text-[0.75rem] font-medium text-[#5a6b7d] hover:text-[#0b1f33]"
                    }
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

              <Select
              wrapperClassName="w-full sm:w-[11.5rem] shrink-0"
                value={filterCat}
                onChange={(e) => setFilterCat(e.target.value)}
              aria-label="Category"
              >
                <option value="">All categories</option>
                {categoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>

            <div className="relative min-w-0 w-full flex-1 sm:max-w-xs">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[#8b9bb0]"
                strokeWidth={2}
              />
              <Input
                className="h-9 bg-white pl-8 text-[0.8125rem]"
                placeholder="Search name or SKU"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Search items"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-left text-[0.8125rem]">
              <thead>
                <tr className="border-b border-[#e2e8f0] bg-[#f4f6fa] text-[0.68rem] font-semibold tracking-wide text-[#5a6b7d] uppercase">
                  <th className="px-4 py-2.5 font-semibold sm:px-5">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-[#1a56db]"
                      onClick={() => toggleSort("name")}
                    >
                      Name
                      {sortBy === "name" ? (sortAsc ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                  <th className="px-3 py-2.5 font-semibold">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-[#1a56db]"
                      onClick={() => toggleSort("sku")}
                    >
                      SKU
                      {sortBy === "sku" ? (sortAsc ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                  <th className="px-3 py-2.5 font-semibold">Category</th>
                  <th className="px-3 py-2.5 text-right font-semibold">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-[#1a56db]"
                      onClick={() => toggleSort("price")}
                    >
                      Rate
                      {sortBy === "price" ? (sortAsc ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-[#1a56db]"
                      onClick={() => toggleSort("qty")}
                    >
                      Stock on Hand
                      {sortBy === "qty" ? (sortAsc ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                  <th className="px-3 py-2.5 font-semibold">Unit</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-right font-semibold sm:px-5">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eef1f4]">
            {items.map((item) => {
              const isEdit = editingId === item.id;
                  const images = galleryOf(item);
                  const photosOpen = photosOpenId === item.id;
                  const cover = images[0] ?? null;
                  const low = item.isActive && Number(item.qty) <= 5;
              return (
                    <tr key={item.id} className="align-top hover:bg-[#fafbfc]">
                      <td className="px-4 py-3 sm:px-5" colSpan={isEdit ? 8 : 1}>
                  {!isEdit ? (
                          <div className="flex min-w-0 items-center gap-3">
                          <ProductThumb
                              src={cover}
                            label={item.title}
                            size="md"
                              count={images.length}
                              onClick={
                                images.length
                                  ? () =>
                                      setLightbox({
                                        images,
                                        index: 0,
                                        label: item.title,
                                      })
                                  : undefined
                              }
                            />
                        <div className="min-w-0">
                              <p className="truncate font-semibold text-[#0b1f33]">
                            {item.title}
                              </p>
                              {canWrite ? (
                                <button
                                  type="button"
                                  className="mt-0.5 text-[0.72rem] font-medium text-[#1a56db] hover:underline"
                          onClick={() =>
                                    setPhotosOpenId((id) =>
                                      id === item.id ? null : item.id,
                                    )
                                  }
                                >
                                  {images.length
                                    ? `${images.length} photo${images.length === 1 ? "" : "s"}`
                                    : "Add photos"}
                                </button>
                              ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-3 rounded-xl border border-[#e8edf4] bg-[#f7f9fc] p-3 sm:grid-cols-2">
                      <div className="field-shell">
                        <Label>Title</Label>
                        <Input
                          value={draft?.title ?? ""}
                          onChange={(e) =>
                            setDraft((d) =>
                              d ? { ...d, title: e.target.value } : d,
                            )
                          }
                        />
                      </div>
                      <div className="field-shell">
                        <Label>Category</Label>
                        <Select
                          value={draft?.categoryId ?? ""}
                          onChange={(e) =>
                            setDraft((d) =>
                                    d
                                      ? { ...d, categoryId: e.target.value }
                                      : d,
                            )
                          }
                        >
                          {categoryOptions.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="field-shell sm:col-span-2">
                        <Label>Description</Label>
                        <textarea
                          className={textareaClass}
                          value={draft?.description ?? ""}
                          onChange={(e) =>
                            setDraft((d) =>
                                    d
                                      ? { ...d, description: e.target.value }
                                      : d,
                            )
                          }
                        />
                      </div>
                      <div className="field-shell">
                              <Label>Sell unit</Label>
                              <Select
                                value={draft?.sellUnit ?? "pcs"}
                                onChange={(e) =>
                                  setDraft((d) =>
                                    d
                                      ? {
                                          ...d,
                                          sellUnit: normalizeSellUnit(
                                            e.target.value,
                                          ),
                                        }
                                      : d,
                                  )
                                }
                              >
                                {unitOptions.map((u) => (
                                  <option key={u.code} value={u.code}>
                                    {u.name} ({u.code})
                                  </option>
                                ))}
                              </Select>
                            </div>
                            <div className="field-shell">
                              <Label>
                                Rate ({priceUnitLabel(draft?.sellUnit)})
                              </Label>
                        <Input
                          type="number"
                                step="0.01"
                                min="0"
                          value={draft?.price ?? ""}
                          onChange={(e) =>
                            setDraft((d) =>
                              d ? { ...d, price: e.target.value } : d,
                            )
                          }
                        />
                      </div>
                      <div className="field-shell">
                              <Label>Stock on hand</Label>
                        <Input
                          type="number"
                                min={0}
                                step={
                                  draft?.sellUnit === "kg" ||
                                  draft?.sellUnit === "L"
                                    ? "0.001"
                                    : "1"
                                }
                          value={draft?.qty ?? ""}
                          onChange={(e) =>
                            setDraft((d) =>
                              d ? { ...d, qty: e.target.value } : d,
                            )
                          }
                        />
                      </div>
                      <div className="flex gap-2 sm:col-span-2">
                        <Button
                          disabled={updateProduct.isPending}
                          onClick={() => updateProduct.mutate()}
                        >
                          Save
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setEditingId(null);
                            setDraft(null);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                        {canWrite && photosOpen && !isEdit ? (
                          <div className="mt-2 rounded-xl border border-[#e8edf4] bg-[#f7f9fc] px-3 py-2.5">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <p className="text-[0.75rem] font-semibold text-[#0b1f33]">
                                Photos ({images.length}/{MAX_IMAGES})
                              </p>
                            </div>
                            <div className="flex max-w-full items-center gap-2 overflow-x-auto pb-1">
                              {images.map((src, idx) => (
                                <div
                                  key={`${item.id}-ph-${idx}`}
                                  className="relative shrink-0"
                                >
                                  <ProductThumb
                                    src={src}
                                    label={item.title}
                                    size="md"
                                    onClick={() =>
                                      setLightbox({
                                        images,
                                        index: idx,
                                        label: item.title,
                                      })
                                    }
                                  />
                                  {idx === 0 ? (
                                    <span className="absolute bottom-0.5 left-0.5 rounded bg-[#1a56db] px-1 text-[0.5rem] font-bold text-white">
                                      cover
                                    </span>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-[#c81e1e] text-white shadow"
                                    title="Remove image"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeImage.mutate({
                                        id: item.id,
                                        imageUrl: src,
                                      });
                                    }}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                              {images.length < MAX_IMAGES ? (
                                <label className="inline-flex h-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-dashed border-[#cfd8e6] bg-white px-3 text-[0.7rem] font-semibold text-[#1a56db] hover:bg-[#e8eefb]">
                                  + Add
                                  <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp,image/gif"
                                    multiple
                                    className="sr-only"
                                    onChange={(e) => {
                                      const remaining =
                                        MAX_IMAGES - images.length;
                                      void pickFiles(e.target.files, (urls) =>
                                        uploadImage.mutate({
                                          id: item.id,
                                          dataUrls: urls.slice(0, remaining),
                                        }),
                                      );
                                      e.target.value = "";
                                    }}
                                  />
                                </label>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </td>
                      {!isEdit ? (
                        <>
                          <td className="px-3 py-3 font-mono text-[0.75rem] text-[#5a6b7d]">
                            {item.sku}
                          </td>
                          <td className="px-3 py-3 text-[#5a6b7d]">
                            {item.category?.name ?? "—"}
                          </td>
                          <td className="px-3 py-3 text-right font-semibold tabular-nums text-[#0b1f33]">
                            ₹
                            {Number(item.price).toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <span
                              className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ${
                                low
                                  ? "bg-[#fff7ed] text-[#9a3412]"
                                  : "bg-[#e8eefb] text-[#1341a8]"
                              }`}
                            >
                              {formatQtyWithUnit(
                                Number(item.qty),
                                item.sellUnit,
                              )}
                            </span>
                          </td>
                          <td className="px-3 py-3 uppercase text-[#5a6b7d]">
                            {normalizeSellUnit(item.sellUnit)}
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${
                                item.isActive
                                  ? "bg-[#ecfdf5] text-[#047857]"
                                  : "bg-[#f1f5f9] text-[#64748b]"
                              }`}
                            >
                              {item.isActive ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right sm:px-5">
                            <div className="flex flex-wrap justify-end gap-1">
                              <Button
                                size="sm"
                                variant="soft"
                                onClick={() => {
                                  setEditingId(item.id);
                                  setPhotosOpenId(null);
                                  setDraft({
                                    title: item.title,
                                    description: item.description ?? "",
                                    categoryId: item.category?.id ?? "",
                                    sellUnit: normalizeSellUnit(item.sellUnit),
                                    price: String(item.price),
                                    qty: String(item.qty),
                                  });
                                }}
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={adjustStock.isPending}
                                onClick={() =>
                                  setAdjustTarget({
                                    id: item.id,
                                    name: item.title || item.sku,
                                    sku: item.sku,
                                    qty: Number(item.qty),
                                    sellUnit: item.sellUnit,
                                    trackSerial: Boolean(item.trackSerial ?? item.requiresSerial),
                                    requiresSerial: Boolean(item.requiresSerial ?? item.trackSerial),
                                  })
                                }
                              >
                                Adjust
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={toggleActive.isPending}
                                onClick={() =>
                                  toggleActive.mutate({
                                    id: item.id,
                                    isActive: !item.isActive,
                                  })
                                }
                              >
                                {item.isActive ? "Mark inactive" : "Activate"}
                              </Button>
                            </div>
                          </td>
                        </>
                      ) : null}
                    </tr>
              );
            })}
            {!items.length && !products.isLoading ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-14 text-center text-sm text-[#5a6b7d]"
                    >
                      No items match this view.{" "}
                      <button
                        type="button"
                        className="font-semibold text-[#1a56db] hover:underline"
                        onClick={() => setPanel("add")}
                      >
                        + New item
                      </button>
                    </td>
                  </tr>
            ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {panel === "categories" ? (
        <section className="overflow-hidden rounded-xl border border-[#d9e0ea] bg-white shadow-[0_1px_2px_rgba(11,31,51,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef1f4] px-4 py-3 sm:px-5">
            <div>
              <h2 className="text-[1rem] font-semibold text-[#0b1f33]">
                Categories
              </h2>
              <p className="mt-0.5 text-[0.75rem] text-[#5a6b7d]">
                Group items for the counter and reports.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canWrite ? (
                <Button size="sm" onClick={() => setAddCatOpen(true)}>
                  + Add Category
                </Button>
              ) : null}
            <Button
                size="sm"
                variant="secondary"
                onClick={() => setPanel("products")}
            >
                ← Back to items
            </Button>
          </div>
          </div>
          <div className="p-4 sm:p-5">
          <ul className="divide-y divide-[#eef2f8]">
            {(categoriesQ.data ?? []).map((c) => {
              const parentName =
                c.parentId &&
                (categoriesQ.data ?? []).find((p) => p.id === c.parentId)
                  ?.name;
              return (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3.5"
              >
                {renameId === c.id ? (
                  <div className="flex flex-1 flex-wrap gap-2">
                    <Input
                      className="max-w-xs"
                      value={renameVal}
                      onChange={(e) => setRenameVal(e.target.value)}
                    />
                    <Button
                      size="sm"
                      disabled={renameCat.isPending}
                      onClick={() => renameCat.mutate()}
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setRenameId(null);
                        setRenameVal("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="font-semibold text-[#0b1f33]">{c.name}</p>
                      <p className="text-xs text-[#5a6b7d]">
                        {parentName ? (
                          <>
                            Parent: {parentName}
                            {" · "}
                          </>
                        ) : null}
                        {c.productCount} product
                        {c.productCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="soft"
                      onClick={() => {
                        setRenameId(c.id);
                        setRenameVal(c.name);
                      }}
                    >
                      Rename
                    </Button>
                  </>
                )}
              </li>
              );
            })}
            {!categoriesQ.data?.length && !categoriesQ.isLoading ? (
              <li className="py-8 text-center text-sm text-[#5a6b7d]">
                No categories yet. Click{" "}
                <span className="font-medium text-[#0b1f33]">+ Add Category</span>{" "}
                to create one (Zoho-style), then add products.
              </li>
            ) : null}
          </ul>
          </div>
        </section>
      ) : null}

      <AddCategoryModal
        open={addCatOpen}
        onClose={() => setAddCatOpen(false)}
        categories={(categoriesQ.data ?? categories).map((c) => ({
          id: c.id,
          name: c.name,
        }))}
        saving={addCat.isPending}
        onSave={async ({ name, parentId }) => {
          await addCat.mutateAsync({ name, parentId });
        }}
      />

      <ImageLightbox
        open={Boolean(lightbox)}
        images={lightbox?.images ?? []}
        startIndex={lightbox?.index ?? 0}
        label={lightbox?.label}
        onClose={() => setLightbox(null)}
      />
      <StockAdjustDialog
        target={adjustTarget}
        busy={adjustStock.isPending}
        onClose={() => setAdjustTarget(null)}
        onSubmit={(args) => adjustStock.mutate(args)}
      />
      <ItemsImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          invalidateSale(qc);
          onAdded?.();
        }}
      />
    </div>
  );
}
