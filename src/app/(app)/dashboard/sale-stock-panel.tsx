"use client";

import { useMemo, useState } from "react";
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
import { readFileAsDataUrl } from "@/lib/utils";
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
  imagePreviews: [] as string[],
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

  const fields = floor.data?.schema.fields ?? [];
  const categories = categoriesQ.data ?? floor.data?.categories ?? [];

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
      for (const dataUrl of form.imagePreviews.slice(0, MAX_IMAGES)) {
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
      if (file.size > 4 * 1024 * 1024) {
        toast.error(`${file.name} is over 4 MB`);
        continue;
      }
      try {
        urls.push(await readFileAsDataUrl(file));
      } catch {
        toast.error(`Could not read ${file.name}`);
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
        Ask an owner or inventory staff to manage products. You can still sell
        on the Sell tab.
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
          <section className="rounded-xl border border-[#d9e0ea] bg-white p-4">
            <h2 className="text-[0.9375rem] font-semibold text-[#0b1f33]">
              Add product
            </h2>
            <p className="mt-0.5 text-[0.75rem] text-[#5a6b7d]">
              Pick sell unit (kg, pcs…) — qty rules follow the unit.
            </p>

            <div className="mt-5">
              <DynamicCommerceForm
                schema={fields}
                values={form}
                categories={categoryOptions}
                fieldErrors={formErrors}
                onChange={(key, value) => {
                  setFormErrors((e) => {
                    if (!e[key]) return e;
                    const next = { ...e };
                    delete next[key];
                    return next;
                  });
                  setForm((f) => ({ ...f, [key]: value }));
                }}
              />
            </div>

            <Button
              className="mt-6 w-full"
              disabled={addProduct.isPending}
              onClick={() => addProduct.mutate()}
            >
              {addProduct.isPending ? "Saving…" : "Save product"}
            </Button>
          </section>

          <section className="rounded-xl border border-[#d9e0ea] bg-white p-4">
            <h3 className="text-[0.875rem] font-semibold text-[#0b1f33]">
              Category first?
            </h3>
            <p className="mt-0.5 text-[0.75rem] text-[#5a6b7d]">
              Create a category name for your products.
            </p>
            <div className="mt-3 flex gap-2">
              <Input
                placeholder="e.g. Accessories"
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
                Edit price, stock, or add new items.
              </p>
            </div>
            <Button size="sm" onClick={() => setPanel("add")}>
              Add product
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Input
              className="max-w-xs"
              placeholder="Search title or SKU…"
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
              return (
                <li key={item.id} className="py-3.5">
                  {!isEdit ? (
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 gap-2.5">
                        <div className="flex shrink-0 flex-col gap-1.5">
                          <div className="flex flex-wrap gap-1.5">
                            {images.length ? (
                              images.map((src, idx) => (
                                <div key={`${src}-${idx}`} className="relative">
                                  <ProductThumb
                                    src={src}
                                    label={item.title}
                                    size="lg"
                                    count={idx === 0 ? images.length : undefined}
                                    onClick={() =>
                                      setLightbox({
                                        images,
                                        index: idx,
                                        label: item.title,
                                      })
                                    }
                                  />
                                  {canWrite ? (
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
                                  ) : null}
                                </div>
                              ))
                            ) : (
                              <ProductThumb
                                src={null}
                                label={item.title}
                                size="lg"
                              />
                            )}
                          </div>
                          {canWrite && images.length < MAX_IMAGES ? (
                            <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-[#cfd8e6] px-2 py-1 text-[0.7rem] font-semibold text-[#1a56db] hover:bg-[#e8eefb]">
                              + Add photos
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/gif"
                                multiple
                                className="sr-only"
                                onChange={(e) => {
                                  const remaining = MAX_IMAGES - images.length;
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
                        <div className="min-w-0">
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
                            setDraft({
                              title: item.title,
                              description: item.description ?? "",
                              categoryId: item.category?.id ?? "",
                              sellUnit: normalizeSellUnit(item.sellUnit),
                              price: String(Number(item.price)),
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
                No products yet — add one with any category you create.
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
            Name groups for your products (you choose the names).
          </p>

          <div className="mt-4 flex max-w-md gap-2">
            <Input
              placeholder="New category name"
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
                No categories — add one above, then attach products.
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
