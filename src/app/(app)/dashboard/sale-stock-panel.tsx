"use client";

import { useMemo, useRef, useState } from "react";
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
import { DynamicCommerceForm } from "@/components/dynamic-commerce-form";
import {
  ProductImagePicker,
  type ProductImagePickerHandle,
} from "@/components/product-image-picker";
import { prepareProductImageDataUrl } from "@/lib/image-prepare";
import { X } from "lucide-react";
import {
  addSaleProductSchema,
  updateSaleProductSchema,
} from "@/lib/validations";
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
  qty: "10",
};

/** Used when /pos/sale/floor has no schema (old API / load error) so the form never goes blank. */
const FALLBACK_SALE_FIELDS: Array<{
  key: string;
  label: string;
  required: boolean;
  type: string;
  hint?: string;
  options?: Array<{ value: string; label: string }>;
}> = [
  {
    key: "title",
    label: "Product name",
    required: true,
    type: "string",
    hint: "Display name shown on the counter and receipts",
  },
  {
    key: "description",
    label: "Description",
    required: false,
    type: "text",
    hint: "Optional details for staff",
  },
  {
    key: "categoryId",
    label: "Category",
    required: true,
    type: "category",
    hint: "Group this item with similar products",
  },
  {
    key: "sku",
    label: "SKU",
    required: true,
    type: "string",
    hint: "15–18 characters · letters, numbers, and . _ - /",
  },
  {
    key: "sellUnit",
    label: "Unit of measure",
    required: true,
    type: "select",
    hint: "Use pcs/pack for countable items · kg, g, L, or ml for measured goods",
  },
  {
    key: "price",
    label: "Selling price",
    required: true,
    type: "number",
    hint: "Price charged per unit of measure",
  },
  {
    key: "qty",
    label: "Quantity on hand",
    required: true,
    type: "number",
    hint: "Whole numbers for pcs/pack · up to three decimals for kg/L",
  },
  {
    key: "image",
    label: "Product images",
    required: false,
    type: "image",
    hint: "Optional · up to eight photos · first image is the cover",
  },
];

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
export function SaleStockPanel({ onAdded }: { onAdded?: () => void }) {
  const qc = useQueryClient();
  const roles = useAuthStore((s) => s.user?.roles);
  const canWrite = canWriteCatalog(roles);

  const [panel, setPanel] = useState<"add" | "products" | "categories">(
    "products",
  );
  const [form, setForm] = useState(EMPTY);
  const [formErrors, setFormErrors] = useState<
    Partial<Record<string, string>>
  >({});
  const imagePickerRef = useRef<ProductImagePickerHandle>(null);
  const [catName, setCatName] = useState("");
  const [q, setQ] = useState("");
  const [filterCat, setFilterCat] = useState("");
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

  const fields =
    floor.data?.schema?.fields?.length
      ? floor.data.schema.fields
      : FALLBACK_SALE_FIELDS;
  const categories = categoriesQ.data ?? floor.data?.categories ?? [];
  const schemaLoading = floor.isLoading;

  const addCat = useMutation({
    mutationFn: () => posApi.addSaleCategory({ name: catName.trim() }),
    onSuccess: (row) => {
      toast.success(`Category “${row.name}” added`);
      setCatName("");
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
      const parsed = addSaleProductSchema.safeParse({
        title: form.title,
        description: form.description,
        categoryId: form.categoryId,
        sku: form.sku,
        sellUnit: form.sellUnit || "pcs",
        price: form.price,
        qty: form.qty,
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
        qty: "10",
      }));
      imagePickerRef.current?.clear();
      setFormErrors({});
      invalidateSale(qc);
      onAdded?.();
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
    mutationFn: ({ id, delta }: { id: string; delta: number }) =>
      posApi.adjustSaleStock(id, { delta }),
    onSuccess: (res) => {
      toast.success(
        `Stock → ${formatQtyWithUnit(Number(res.qty), res.sellUnit)}`,
      );
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

  const items = products.data?.items ?? [];

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
      <div className="seg-control inline-grid max-w-full grid-cols-3 sm:w-auto sm:min-w-[22rem]">
        {(
          [
            { id: "products" as const, label: "All products" },
            { id: "add" as const, label: "Add product" },
            { id: "categories" as const, label: "Categories" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            data-active={panel === t.id ? "true" : "false"}
            onClick={() => setPanel(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {panel === "add" ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_0.85fr]">
          <section className="relative rounded-xl border border-[#d9e0ea] bg-white p-4 pb-24">
            <h2 className="text-[0.9375rem] font-semibold text-[#0b1f33]">
              Add product
            </h2>
            <p className="mt-0.5 text-[0.75rem] text-[#5a6b7d]">
              Enter product details below, then save. Scroll if required fields
              or Save are not visible.
            </p>

            {!categories.length ? (
              <div className="mt-4 rounded-xl border border-[#fde68a] bg-[#fffbeb] px-3 py-2.5 text-sm text-[#92400e]">
                No categories yet. Create one in the panel on the right (or
                below on mobile), then select it here. A category is required for
                every product.
              </div>
            ) : null}

            {schemaLoading ? (
              <p className="mt-6 text-sm text-[#5a6b7d]">Loading form…</p>
            ) : (
              <div className="mt-5 space-y-4">
                <DynamicCommerceForm
                  schema={fields}
                  values={form}
                  categories={categoryOptions}
                  fieldErrors={formErrors}
                  onChange={(key, value) => {
                    if (typeof value !== "string") return;
                    setFormErrors((e) => {
                      if (!e[key]) return e;
                      const next = { ...e };
                      delete next[key];
                      return next;
                    });
                    setForm((f) => ({ ...f, [key]: value }));
                  }}
                />
                <ProductImagePicker ref={imagePickerRef} />
              </div>
            )}

            {/* Always visible action bar — avoids “missing Save” when form is long */}
            <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-[#eef1f4] bg-white/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/90">
              <Button
                className="w-full"
                disabled={addProduct.isPending || schemaLoading}
                onClick={() => addProduct.mutate()}
              >
                {addProduct.isPending ? "Saving…" : "Save product"}
              </Button>
              <p className="mt-1.5 text-center text-[0.7rem] text-[#8b9bb0]">
                Required: name, category, SKU (15–18), unit, price, and quantity
              </p>
            </div>
          </section>

          <section className="rounded-xl border border-[#d9e0ea] bg-white p-4 lg:sticky lg:top-4 lg:self-start">
            <h3 className="text-[0.875rem] font-semibold text-[#0b1f33]">
              Categories
            </h3>
            <p className="mt-0.5 text-[0.75rem] text-[#5a6b7d]">
              Create a category before adding products, then assign each item to
              a group.
            </p>
            <div className="mt-3 flex gap-2">
              <Input
                placeholder="Category name"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
              />
              <Button
                variant="secondary"
                disabled={addCat.isPending || catName.trim().length < 1}
                onClick={() => addCat.mutate()}
              >
                Add
              </Button>
            </div>
            {categories.length ? (
              <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-sm text-[#5a6b7d]">
                {categories.map((c) => (
                  <li key={c.id}>· {c.name}</li>
                ))}
              </ul>
            ) : null}
          </section>
        </div>
      ) : null}

      {panel === "products" ? (
        <section className="rounded-xl border border-[#d9e0ea] bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[0.9375rem] font-semibold text-[#0b1f33]">
                Products
              </h2>
              <p className="mt-0.5 text-[0.75rem] text-[#5a6b7d]">
                Search, edit prices, adjust stock, and manage product images.
              </p>
            </div>
            <Button size="sm" onClick={() => setPanel("add")}>
              Add product
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Input
              className="max-w-xs"
              placeholder="Search by name or SKU"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="min-w-[12rem] max-w-xs flex-1">
              <Select
                value={filterCat}
                onChange={(e) => setFilterCat(e.target.value)}
              >
                <option value="">All categories</option>
                {categoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <ul className="mt-4 divide-y divide-[#eef2f8]">
            {items.map((item) => {
              const isEdit = editingId === item.id;
              const images = galleryOf(item);
              const photosOpen = photosOpenId === item.id;
              const cover = images[0] ?? null;
              return (
                <li key={item.id} className="py-3.5">
                  {!isEdit ? (
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-1 gap-3">
                          {/* Cover only — never stack all photos in the list row */}
                          <div className="relative shrink-0">
                            <ProductThumb
                              src={cover}
                              label={item.title}
                              size="lg"
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
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-[#0b1f33]">
                              {item.title}
                              {!item.isActive ? (
                                <span className="ml-2 text-xs font-medium text-[#b45309]">
                                  inactive
                                </span>
                              ) : null}
                            </p>
                            <p className="font-mono text-[0.7rem] text-[#5a6b7d]">
                              {item.sku}
                              {item.category ? ` · ${item.category.name}` : ""}
                            </p>
                            {item.description ? (
                              <p className="mt-0.5 line-clamp-2 text-xs text-[#8b9bb0]">
                                {item.description}
                              </p>
                            ) : null}
                            {canWrite ? (
                              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  className="text-[0.75rem] font-semibold text-[#1a56db] hover:underline"
                                  onClick={() =>
                                    setPhotosOpenId((id) =>
                                      id === item.id ? null : item.id,
                                    )
                                  }
                                >
                                  {images.length
                                    ? `${images.length} photo${images.length === 1 ? "" : "s"} · manage`
                                    : "Add photos"}
                                </button>
                                {images.length > 1 ? (
                                  <button
                                    type="button"
                                    className="text-[0.75rem] font-medium text-[#5a6b7d] hover:text-[#1a56db]"
                                    onClick={() =>
                                      setLightbox({
                                        images,
                                        index: 0,
                                        label: item.title,
                                      })
                                    }
                                  >
                                    View gallery
                                  </button>
                                ) : null}
                              </div>
                            ) : images.length > 1 ? (
                              <button
                                type="button"
                                className="mt-1.5 text-[0.75rem] font-medium text-[#1a56db] hover:underline"
                                onClick={() =>
                                  setLightbox({
                                    images,
                                    index: 0,
                                    label: item.title,
                                  })
                                }
                              >
                                {images.length} photos · view
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-[#0b1f33]">
                          ₹{Number(item.price).toLocaleString("en-IN")}{" "}
                          <span className="text-xs font-medium text-[#5a6b7d]">
                            {priceUnitLabel(item.sellUnit)}
                          </span>
                        </span>
                        <span className="rounded-lg bg-[#e8eefb] px-2.5 py-1 text-xs font-semibold text-[#1341a8]">
                          {formatQtyWithUnit(Number(item.qty), item.sellUnit)}
                        </span>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={adjustStock.isPending}
                          onClick={() =>
                            adjustStock.mutate({
                              id: item.id,
                              delta: qtyStep(
                                normalizeSellUnit(item.sellUnit),
                              ),
                            })
                          }
                        >
                          +{qtyStep(normalizeSellUnit(item.sellUnit))}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={adjustStock.isPending || item.qty <= 0}
                          onClick={() =>
                            adjustStock.mutate({
                              id: item.id,
                              delta: -qtyStep(
                                normalizeSellUnit(item.sellUnit),
                              ),
                            })
                          }
                        >
                          −{qtyStep(normalizeSellUnit(item.sellUnit))}
                        </Button>
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
                          variant="ghost"
                          disabled={toggleActive.isPending}
                          onClick={() =>
                            toggleActive.mutate({
                              id: item.id,
                              isActive: !item.isActive,
                            })
                          }
                        >
                          {item.isActive ? "Deactivate" : "Activate"}
                        </Button>
                        </div>
                      </div>

                      {/* Compact gallery manager — max-width strip, scroll if many */}
                      {canWrite && photosOpen ? (
                        <div className="ml-0 rounded-xl border border-[#e8edf4] bg-[#f7f9fc] px-3 py-2.5 sm:ml-[3.75rem]">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-[0.75rem] font-semibold text-[#0b1f33]">
                              Photos ({images.length}/{MAX_IMAGES})
                            </p>
                            <p className="text-[0.7rem] text-[#8b9bb0]">
                              Cover = first · tap thumbnail to enlarge
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
                              d ? { ...d, categoryId: e.target.value } : d,
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
                              d ? { ...d, description: e.target.value } : d,
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
                          Price ({priceUnitLabel(draft?.sellUnit)})
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
                        <Label>Qty ({draft?.sellUnit ?? "pcs"})</Label>
                        <Input
                          type="number"
                          step={
                            draft?.sellUnit === "kg" || draft?.sellUnit === "L"
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
                </li>
              );
            })}
            {!items.length && !products.isLoading ? (
              <li className="py-10 text-center text-sm text-[#5a6b7d]">
                No products match this filter. Clear search or add a product in
                this category.
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      {panel === "categories" ? (
        <section className="rounded-xl border border-[#d9e0ea] bg-white p-4">
          <h2 className="text-[0.9375rem] font-semibold text-[#0b1f33]">
            Categories
          </h2>
          <p className="mt-0.5 text-[0.75rem] text-[#5a6b7d]">
            Organize products into groups. Counts include sale items only.
          </p>

          <div className="mt-4 flex max-w-md gap-2">
            <Input
              placeholder="Category name"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
            />
            <Button
              disabled={addCat.isPending || catName.trim().length < 1}
              onClick={() => addCat.mutate()}
            >
              Add
            </Button>
          </div>

          <ul className="mt-4 divide-y divide-[#eef2f8]">
            {(categoriesQ.data ?? []).map((c) => (
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
            ))}
            {!categoriesQ.data?.length && !categoriesQ.isLoading ? (
              <li className="py-8 text-center text-sm text-[#5a6b7d]">
                No categories yet. Create a category above, then add products to
                it.
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      <ImageLightbox
        open={Boolean(lightbox)}
        images={lightbox?.images ?? []}
        startIndex={lightbox?.index ?? 0}
        label={lightbox?.label}
        onClose={() => setLightbox(null)}
      />
    </div>
  );
}
