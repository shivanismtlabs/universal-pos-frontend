"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { posApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { canWriteCatalog } from "@/lib/roles";
import { useAuthStore } from "@/lib/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProductThumb } from "@/components/product-thumb";
import { DynamicCommerceForm } from "@/components/dynamic-commerce-form";
import {
  ProductImagePicker,
  type ProductImagePickerHandle,
} from "@/components/product-image-picker";
import { prepareProductImageDataUrl } from "@/lib/image-prepare";
import { cn } from "@/lib/utils";

const EMPTY = {
  title: "",
  description: "",
  categoryId: "",
  sku: "",
  rentalPrice: "",
  deposit: "",
  barcode: "",
  variant: "",
};

function errMsg(e: unknown) {
  if (e instanceof ApiError) return e.messages.join(", ");
  if (e instanceof Error) return e.message;
  return "Failed";
}

function invalidateRental(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["pos-rental-floor"] });
  void qc.invalidateQueries({ queryKey: ["pos-rental-units"] });
  void qc.invalidateQueries({ queryKey: ["pos-rental-products"] });
  void qc.invalidateQueries({ queryKey: ["pos-rental-categories"] });
  void qc.invalidateQueries({ queryKey: ["pos-rental-catalog"] });
  void qc.invalidateQueries({ queryKey: ["dashboard-catalog"] });
  void qc.invalidateQueries({ queryKey: ["categories"] });
}

/**
 * Universal rental catalog — any category, fixed keys.
 * title · description · category · sku · rentalPrice · deposit · barcode · variant
 */
export function RentalStockPanel() {
  const qc = useQueryClient();
  const roles = useAuthStore((s) => s.user?.roles);
  const canWrite = canWriteCatalog(roles);
  const [panel, setPanel] = useState<"units" | "add" | "categories">("units");
  const [form, setForm] = useState(EMPTY);
  const imagePickerRef = useRef<ProductImagePickerHandle>(null);
  const [catName, setCatName] = useState("");
  const [q, setQ] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [extraUnit, setExtraUnit] = useState({
    productId: "",
    barcode: "",
    variant: "",
  });
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");

  const floor = useQuery({
    queryKey: ["pos-rental-floor"],
    queryFn: () => posApi.rentalFloor(),
  });

  const units = useQuery({
    queryKey: ["pos-rental-units", q, filterCat],
    queryFn: () =>
      posApi.listRentalUnits({
        q: q.trim() || undefined,
        categoryId: filterCat || undefined,
        locationId: floor.data?.locationId,
      }),
  });

  const products = useQuery({
    queryKey: ["pos-rental-products"],
    queryFn: () => posApi.listRentalProducts(),
  });

  const categoriesQ = useQuery({
    queryKey: ["pos-rental-categories"],
    queryFn: () => posApi.listRentalCategories(),
  });

  const fields = floor.data?.schema.fields ?? [];
  const categoryExamples = floor.data?.schema.categoryExamples ?? [];
  const categories = categoriesQ.data ?? floor.data?.categories ?? [];

  const addCat = useMutation({
    mutationFn: (name: string = "") => {
      const n = (name || catName).trim();
      if (!n) throw new Error("Category name required");
      return posApi.addRentalCategory({ name: n });
    },
    onSuccess: (row) => {
      toast.success(`Category “${row.name}” added`);
      setCatName("");
      setForm((f) => ({ ...f, categoryId: row.id }));
      invalidateRental(qc);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const renameCat = useMutation({
    mutationFn: () =>
      posApi.renameRentalCategory(renameId!, { name: renameVal.trim() }),
    onSuccess: (row) => {
      toast.success(`Renamed to “${row.name}”`);
      setRenameId(null);
      invalidateRental(qc);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const addProduct = useMutation({
    mutationFn: async () => {
      if (!form.title.trim() || !form.sku.trim() || !form.barcode.trim()) {
        throw new Error("Title, SKU and barcode are required");
      }
      if (!form.categoryId) throw new Error("Category is required");
      const res = await posApi.addRentalProduct({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        categoryId: form.categoryId,
        sku: form.sku.trim(),
        rentalPrice: Number(form.rentalPrice) || 0,
        deposit: form.deposit ? Number(form.deposit) : undefined,
        barcode: form.barcode.trim(),
        variant: form.variant.trim() || undefined,
        locationId: floor.data?.locationId,
      });
      for (const dataUrl of imagePickerRef.current?.getUploadDataUrls() ?? []) {
        await posApi.uploadRentalProductImage(res.product.id, dataUrl);
      }
      return res;
    },
    onSuccess: (res) => {
      toast.success(`${res.product.title} ready to rent`);
      setForm((f) => ({ ...EMPTY, categoryId: f.categoryId }));
      imagePickerRef.current?.clear();
      invalidateRental(qc);
      setPanel("units");
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const uploadImage = useMutation({
    mutationFn: ({
      productId,
      imageBase64,
    }: {
      productId: string;
      imageBase64: string;
    }) => posApi.uploadRentalProductImage(productId, imageBase64),
    onSuccess: () => {
      toast.success("Image saved");
      invalidateRental(qc);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const addUnit = useMutation({
    mutationFn: () => {
      if (!extraUnit.productId || !extraUnit.barcode.trim()) {
        throw new Error("Product and barcode required");
      }
      return posApi.addRentalUnit({
        productId: extraUnit.productId,
        barcode: extraUnit.barcode.trim(),
        variant: extraUnit.variant.trim() || undefined,
        locationId: floor.data?.locationId,
      });
    },
    onSuccess: () => {
      toast.success("Unit added");
      setExtraUnit({ productId: "", barcode: "", variant: "" });
      invalidateRental(qc);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (!canWrite) {
    return (
      <p className="rounded-2xl border border-[#e5e7eb] bg-white p-6 text-sm text-[#6b7280]">
        Ask an owner or inventory staff to manage rental units. You can still
        rent and return on the other tabs.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "units" as const, label: "All units" },
            { id: "add" as const, label: "Add product / unit" },
            { id: "categories" as const, label: "Categories" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setPanel(t.id)}
            className={cn(
              "rounded-xl border px-3 py-1.5 text-sm font-semibold transition",
              panel === t.id
                ? "border-[#0b1f33] bg-[#ecfdf5] text-[#0b1f33]"
                : "border-[#e5e7eb] bg-white text-[#374151]",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {panel === "add" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm">
            <p className="text-[0.65rem] font-semibold tracking-[0.16em] text-[#0b1f33] uppercase">
              Universal rental keys
            </p>
            <h2 className="display mt-1 text-xl">Add product + first unit</h2>
            <p className="mt-1 text-sm text-[#6b7280]">
              {floor.data?.schema.description ??
                "Same keys for every rental type — category comes from the API."}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {categoryExamples.map((name) => {
                const exists = categories.some(
                  (c) => c.name.toLowerCase() === name.toLowerCase(),
                );
                return (
                  <button
                    key={name}
                    type="button"
                    disabled={exists || addCat.isPending}
                    onClick={() => addCat.mutate(name)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold transition",
                      exists
                        ? "border-[#d1d5db] bg-[#f3f4f6] text-[#9ca3af]"
                        : "border-[#8b9bb0] bg-[#e8eefb] text-[#0b1f33] hover:bg-[#d1fae5]",
                    )}
                  >
                    {exists ? `✓ ${name}` : `+ ${name}`}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 space-y-4">
              <DynamicCommerceForm
                schema={fields}
                values={form}
                categories={categories}
                onChange={(key, value) => {
                  if (typeof value !== "string") return;
                  const k =
                    key === "variant" || key === "size" ? "variant" : key;
                  setForm((f) => ({ ...f, [k]: value }));
                }}
              />
              <ProductImagePicker ref={imagePickerRef} />
            </div>
            <Button
              className="mt-5 w-full"
              disabled={addProduct.isPending}
              onClick={() => addProduct.mutate()}
            >
              {addProduct.isPending ? "Saving…" : "Add to rental stock"}
            </Button>
          </section>

          <section className="space-y-4">
            <div className="rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold">Add another unit</h3>
              <p className="mt-1 text-xs text-[#6b7280]">
                Same product, new barcode (second bike, second camera…).
              </p>
              <div className="mt-3 space-y-2">
                <select
                  className="w-full rounded-xl border border-[#e5e7eb] px-3 py-2.5 text-sm"
                  value={extraUnit.productId}
                  onChange={(e) =>
                    setExtraUnit((u) => ({ ...u, productId: e.target.value }))
                  }
                >
                  <option value="">Select product…</option>
                  {(products.data?.items ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} ({p.sku})
                    </option>
                  ))}
                </select>
                <Input
                  placeholder="Barcode"
                  value={extraUnit.barcode}
                  onChange={(e) =>
                    setExtraUnit((u) => ({ ...u, barcode: e.target.value }))
                  }
                />
                <Input
                  placeholder="Variant (optional)"
                  value={extraUnit.variant}
                  onChange={(e) =>
                    setExtraUnit((u) => ({ ...u, variant: e.target.value }))
                  }
                />
                <Button
                  variant="secondary"
                  disabled={addUnit.isPending}
                  onClick={() => addUnit.mutate()}
                >
                  Add unit
                </Button>
              </div>
            </div>
            <div className="rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold">Quick category</h3>
              <div className="mt-3 flex gap-2">
                <Input
                  placeholder="e.g. Cameras"
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                />
                <Button
                  variant="secondary"
                  disabled={addCat.isPending || !catName.trim()}
                  onClick={() => addCat.mutate("")}
                >
                  Add
                </Button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {panel === "units" ? (
        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="display text-xl">Rental units</h2>
              <p className="mt-1 text-sm text-[#6b7280]">
                Every physical item you rent — status drives POS, return, exchange.
              </p>
            </div>
            <Button variant="secondary" onClick={() => setPanel("add")}>
              + Add
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Input
              className="max-w-xs"
              placeholder="Search title, SKU, barcode…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select
              className="rounded-xl border border-[#e5e7eb] px-3 py-2 text-sm"
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value)}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <ul className="mt-4 divide-y divide-[#f3f4f6]">
            {(units.data?.items ?? []).map((u) => (
              <li
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="relative shrink-0">
                    <ProductThumb
                      src={u.image ?? u.photoUrl}
                      label={u.title}
                      size="sm"
                    />
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="absolute inset-0 cursor-pointer opacity-0"
                      title="Change image"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file || !u.productId) return;
                        void prepareProductImageDataUrl(file)
                          .then((dataUrl) =>
                            uploadImage.mutate({
                              productId: u.productId,
                              imageBase64: dataUrl,
                            }),
                          )
                          .catch((e) =>
                            toast.error(
                              e instanceof Error
                                ? e.message
                                : "Could not read image",
                            ),
                          );
                      }}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold">{u.title}</p>
                    <p className="font-mono text-[0.7rem] text-[#6b7280]">
                      {u.barcodeSku}
                      {u.variant ? ` · ${u.variant}` : ""}
                      {u.category ? ` · ${u.category.name}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[#0b1f33] font-semibold">
                    ₹{Number(u.rentalPrice).toLocaleString("en-IN")}
                  </span>
                  <span className="rounded-lg bg-[#f3f4f6] px-2 py-1 text-xs font-medium capitalize">
                    {u.status.replace("_", " ")}
                  </span>
                </div>
              </li>
            ))}
            {!units.data?.items?.length && !units.isLoading ? (
              <li className="py-10 text-center text-sm text-[#6b7280]">
                No units yet — add any category, then products.
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      {panel === "categories" ? (
        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm">
          <h2 className="display text-xl">Categories</h2>
          <p className="mt-1 text-sm text-[#6b7280]">
            Add any category your shop rents. Optional idea chips below are
            examples only — not a fixed industry list.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {categoryExamples.map((name) => {
              const exists = (categoriesQ.data ?? []).some(
                (c) => c.name.toLowerCase() === name.toLowerCase(),
              );
              return (
                <button
                  key={name}
                  type="button"
                  disabled={exists || addCat.isPending}
                  onClick={() => addCat.mutate(name)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold transition",
                    exists
                      ? "border-[#d1d5db] bg-[#f3f4f6] text-[#9ca3af]"
                      : "border-[#8b9bb0] bg-[#e8eefb] text-[#0b1f33] hover:bg-[#d1fae5]",
                  )}
                >
                  {exists ? `✓ ${name}` : `+ ${name}`}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex max-w-md gap-2">
            <Input
              placeholder="Or type any category name"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
            />
            <Button
              disabled={addCat.isPending || !catName.trim()}
              onClick={() => addCat.mutate("")}
            >
              Add
            </Button>
          </div>
          <ul className="mt-4 divide-y divide-[#f3f4f6]">
            {(categoriesQ.data ?? []).map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                {renameId === c.id ? (
                  <div className="flex flex-1 flex-wrap gap-2">
                    <Input
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
                      onClick={() => setRenameId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="font-semibold">{c.name}</p>
                      <p className="text-xs text-[#6b7280]">
                        {c.productCount} product
                        {c.productCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
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
          </ul>
        </section>
      ) : null}
    </div>
  );
}
