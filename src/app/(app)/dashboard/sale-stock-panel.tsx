"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { posApi } from "@/lib/api";
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
import { ItemsImportDialog } from "@/components/items-import-dialog";
import { AddCategoryModal } from "@/components/add-category-modal";
import {
  formatQtyWithUnit,
  normalizeSellUnit,
  priceUnitLabel,
  qtyStep,
  type SellUnit,
} from "@/lib/sell-units";

const EMPTY = {
  title: "",
  description: "",
  categoryId: "",
  sku: "",
  sellUnit: "pcs",
  price: "",
  qty: "0",
  manufacturer: "",
  barcode: "",
  costPrice: "",
  reorderPoint: "",
  hsnOrSac: "",
  trackInventory: true,
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
  });

  const categoriesQ = useQuery({
    queryKey: ["pos-sale-categories"],
    queryFn: () => posApi.listSaleCategories(),
  });

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
      const parsed = addSaleProductSchema.safeParse({
        title: form.title,
        description: form.description,
        categoryId: form.categoryId,
        sku: form.sku,
        sellUnit: form.sellUnit || "pcs",
        price: form.price,
        qty: form.trackInventory ? form.qty : "0",
        manufacturer: form.manufacturer,
        barcode: form.barcode,
        ...(rawCost !== "" ? { costPrice: Number(rawCost) } : {}),
        ...(rawReorder !== "" ? { reorderPoint: Number(rawReorder) } : {}),
        hsnOrSac: form.hsnOrSac,
        trackInventory: form.trackInventory,
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
      const res = await posApi.addSaleProduct({
        title: parsed.data.title,
        description: parsed.data.description || undefined,
        categoryId: parsed.data.categoryId,
        sku: parsed.data.sku,
        sellUnit: parsed.data.sellUnit,
        price: parsed.data.price,
        qty: parsed.data.qty,
        locationId: floor.data?.locationId,
        manufacturer: parsed.data.manufacturer || undefined,
        barcode: parsed.data.barcode || undefined,
        costPrice: parsed.data.costPrice,
        reorderPoint: parsed.data.reorderPoint,
        hsnOrSac: parsed.data.hsnOrSac || undefined,
        trackInventory: parsed.data.trackInventory,
      });
      for (const dataUrl of imagePickerRef.current?.getUploadDataUrls() ?? []) {
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
      }));
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
      list = list.filter((i) => !i.isActive);
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
        <div className="overflow-hidden rounded-xl border border-[#d9e0ea] bg-white shadow-[0_1px_2px_rgba(11,31,51,0.04)]">
          {/* Zoho-style page header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef1f4] bg-[#fafbfc] px-4 py-3.5 sm:px-5">
            <div>
              <p className="text-[0.65rem] font-bold tracking-[0.12em] text-[#1a56db] uppercase">
                Inventory · Items
              </p>
              <h2 className="mt-0.5 text-lg font-semibold text-[#0b1f33]">
                New product
              </h2>
              <p className="mt-0.5 text-[0.75rem] text-[#5a6b7d]">
                Create an item with pricing, stock, and barcode — same flow as
                modern retail POS product creation.
              </p>
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
                disabled={addProduct.isPending}
                onClick={() => addProduct.mutate()}
              >
                {addProduct.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>

          {!categories.length ? (
            <div className="mx-4 mt-4 rounded-xl border border-[#fde68a] bg-[#fffbeb] px-3 py-2.5 text-sm text-[#92400e] sm:mx-5">
              Create a category first (right panel / Categories tab), then assign
              it below. Category is required for every item.
            </div>
          ) : null}

          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-0 divide-y divide-[#eef1f4] p-4 sm:p-5">
              {/* Basic details */}
              <section className="pb-6">
                <h3 className="text-[0.8rem] font-semibold tracking-wide text-[#0b1f33]">
                  Primary information
                </h3>
                <p className="mt-0.5 text-[0.72rem] text-[#8b9bb0]">
                  Name, category, SKU / barcode, and unit — shown at the
                  counter.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label>Name *</Label>
                    <Input
                      className="mt-1"
                      placeholder="e.g. Organic Almond Milk 1L"
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
                  <div>
                    <Label>Category *</Label>
                    <Select
                      className="mt-1"
                      value={form.categoryId}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, categoryId: e.target.value }))
                      }
                    >
                      <option value="">Select category</option>
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
                  <div>
                    <Label>Unit *</Label>
                    <Select
                      className="mt-1"
                      value={form.sellUnit}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          sellUnit: e.target.value as SellUnit,
                        }))
                      }
                    >
                      <option value="pcs">Piece (pcs)</option>
                      <option value="pack">Pack / box</option>
                      <option value="kg">Kilogram (kg)</option>
                      <option value="g">Gram (g)</option>
                      <option value="L">Litre (L)</option>
                      <option value="ml">Millilitre (ml)</option>
                    </Select>
                  </div>
                  <div>
                    <Label>SKU *</Label>
                    <Input
                      className="mt-1 font-mono uppercase"
                      placeholder="e.g. ALM-MILK-1L"
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
                        2–18 characters · unique stock code
                      </p>
                    )}
                  </div>
                  <div>
                    <Label>Barcode (UPC / EAN)</Label>
                    <Input
                      className="mt-1 font-mono"
                      placeholder="Scan or type barcode"
                      value={form.barcode}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, barcode: e.target.value }))
                      }
                      maxLength={32}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Manufacturer / brand</Label>
                    <Input
                      className="mt-1"
                      placeholder="Optional"
                      value={form.manufacturer}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          manufacturer: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Description / sales notes</Label>
                    <textarea
                      className={textareaClass}
                      rows={3}
                      placeholder="Optional product details for staff"
                      value={form.description}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          description: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              </section>

              {/* Pricing */}
              <section className="py-6">
                <h3 className="text-[0.8rem] font-semibold tracking-wide text-[#0b1f33]">
                  Pricing
                </h3>
                <p className="mt-0.5 text-[0.72rem] text-[#8b9bb0]">
                  Selling price is charged at checkout. Cost is for margin
                  reports.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Selling price *</Label>
                    <Input
                      className="mt-1"
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
                        Per {priceUnitLabel(normalizeSellUnit(form.sellUnit))}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label>Cost price</Label>
                    <Input
                      className="mt-1"
                      inputMode="decimal"
                      placeholder="Optional"
                      value={form.costPrice}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          costPrice: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label>HSN / SAC</Label>
                    <Input
                      className="mt-1 font-mono"
                      placeholder="Tax classification (India)"
                      value={form.hsnOrSac}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, hsnOrSac: e.target.value }))
                      }
                      maxLength={16}
                    />
                  </div>
                </div>
              </section>

              {/* Inventory */}
              <section className="py-6">
                <h3 className="text-[0.8rem] font-semibold tracking-wide text-[#0b1f33]">
                  Inventory tracking
                </h3>
                <p className="mt-0.5 text-[0.72rem] text-[#8b9bb0]">
                  When tracking is on, stock decreases with each sale.
                </p>
                <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-[#e8edf4] bg-[#f8fafc] px-3 py-3">
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
                  <span>
                    <span className="block text-sm font-semibold text-[#0b1f33]">
                      Track inventory for this item
                    </span>
                    <span className="mt-0.5 block text-[0.72rem] text-[#5a6b7d]">
                      Opening stock and low-stock reorder alerts apply when
                      enabled.
                    </span>
                  </span>
                </label>
                {form.trackInventory ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>Opening stock *</Label>
                      <Input
                        className="mt-1"
                        inputMode="decimal"
                        value={form.qty}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, qty: e.target.value }))
                        }
                      />
                      {formErrors.qty ? (
                        <p className="mt-1 text-xs text-[#c81e1e]">
                          {formErrors.qty}
                        </p>
                      ) : (
                        <p className="mt-1 text-[0.65rem] text-[#8b9bb0]">
                          {qtyStep(normalizeSellUnit(form.sellUnit)) < 1
                            ? "Decimals allowed (e.g. 2.500)"
                            : "Whole units preferred"}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label>Reorder point</Label>
                      <Input
                        className="mt-1"
                        inputMode="decimal"
                        placeholder="Low-stock alert"
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
              </section>

              {/* Images */}
              <section className="pt-6">
                <h3 className="text-[0.8rem] font-semibold tracking-wide text-[#0b1f33]">
                  Product images
                </h3>
                <p className="mt-0.5 text-[0.72rem] text-[#8b9bb0]">
                  First image is the cover on the counter and catalog.
                </p>
                <div className="mt-4">
                  <ProductImagePicker ref={imagePickerRef} />
                </div>
              </section>

              <div className="flex flex-wrap gap-2 border-t border-[#eef1f4] pt-5">
                <Button
                  type="button"
                  disabled={addProduct.isPending}
                  onClick={() => addProduct.mutate()}
                >
                  {addProduct.isPending ? "Saving…" : "Save product"}
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

            {/* Sticky category rail like Zoho sidebar context */}
            <aside className="border-t border-[#eef1f4] bg-[#fafbfc] p-4 lg:border-t-0 lg:border-l">
              <h3 className="text-[0.8rem] font-semibold text-[#0b1f33]">
                Categories
              </h3>
              <p className="mt-0.5 text-[0.72rem] text-[#5a6b7d]">
                Create a group, then select it on the form.
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
              <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto text-sm">
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
            </aside>
          </div>
        </div>
      ) : null}

      {panel === "products" ? (
        <section className="overflow-hidden rounded-xl border border-[#d9e0ea] bg-white shadow-[0_1px_2px_rgba(11,31,51,0.04)]">
          {/* Single module chrome — actions only, no second tab row */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef1f4] px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <p className="text-[0.8rem] font-medium text-[#5a6b7d]">
                {items.length} item{items.length === 1 ? "" : "s"}
                {products.isLoading ? " · loading…" : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPanel("categories")}
              >
                Categories
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setImportOpen(true)}
              >
                Import
              </Button>
              <Button size="sm" onClick={() => setPanel("add")}>
                + New
              </Button>
            </div>
          </div>

          {/* Filter toolbar — horizontal chips + compact fields */}
          <div className="flex flex-col gap-2.5 border-b border-[#eef1f4] px-4 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 sm:px-5">
            <div
              role="tablist"
              aria-label="Item status"
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
                className="h-9 pl-8 text-[0.8125rem]"
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
                <tr className="border-b border-[#eef1f4] bg-[#f8fafc] text-[0.7rem] font-semibold tracking-wide text-[#5a6b7d] uppercase">
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
                                <option value="pcs">Piece (pcs)</option>
                                <option value="pack">Pack / box</option>
                                <option value="kg">Kilogram (kg)</option>
                                <option value="g">Gram (g)</option>
                                <option value="L">Litre (L)</option>
                                <option value="ml">Millilitre (ml)</option>
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
                                step={
                                  draft?.sellUnit === "kg" ||
                                  draft?.sellUnit === "L"
                                    ? "0.001"
                                    : "1"
                                }
                                min="0"
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
