"use client";

/**
 * Product Catalog — master definitions (not location stock).
 * Universal: physical · service · digital · bundle · rental.
 */
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Copy,
  Plus,
  Search,
  Tag,
  Layers,
} from "lucide-react";
import {
  catalogApi,
  type CatalogProductKind,
} from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ModeBadge } from "@/components/mode-badge";
import { ProductThumb } from "@/components/product-thumb";
import { ImageLightbox } from "@/components/image-lightbox";
import { FieldError } from "@/components/ui/form";
import { useAuthStore } from "@/lib/auth-store";
import { useBranchStore } from "@/lib/branch-store";
import {
  createBrandSchema,
  createCategorySchema,
  zodFieldErrors,
  zodMessages,
} from "@/lib/validations";
import { EntityRowActions } from "@/components/entity-row-actions";

const KINDS: { value: CatalogProductKind | ""; label: string }[] = [
  { value: "", label: "All types" },
  { value: "physical", label: "Physical" },
  { value: "service", label: "Service" },
  { value: "digital", label: "Digital" },
  { value: "bundle", label: "Bundle" },
  { value: "rental", label: "Rental" },
];

type Tab = "products" | "brands" | "categories" | "stock";

function parseTab(raw: string | null): Tab {
  if (raw === "brands" || raw === "categories" || raw === "stock") return raw;
  return "products";
}

export default function CatalogPage() {
  return (
    <Suspense
      fallback={<p className="p-6 text-sm text-[#5a6b7d]">Loading catalog…</p>}
    >
      <CatalogPageInner />
    </Suspense>
  );
}

function CatalogPageInner() {
  const search = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(() => parseTab(search.get("tab")));

  useEffect(() => {
    setTab(parseTab(search.get("tab")));
  }, [search]);

  function goTab(id: Tab) {
    setTab(id);
    const qs =
      id === "products" ? "/catalog" : `/catalog?tab=${id}`;
    router.replace(qs);
  }

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[#eef1f4] pb-3">
        <div className="min-w-0">
          <p className="text-[0.65rem] font-bold tracking-[0.12em] text-[#1a56db] uppercase">
            Inventory
          </p>
          <h1 className="mt-0.5 text-[1.4rem] font-semibold tracking-tight text-[#0b1f33]">
            Product catalog
        </h1>
          <p className="mt-0.5 text-[0.8rem] text-[#5a6b7d]">
            What you sell · rent · service — stock quantities live under Stock
            levels
          </p>
        </div>
        <ModeBadge mode="sale" />
      </header>

      <div className="flex flex-wrap gap-1 border-b border-[#eef1f4]">
        {(
          [
            ["products", "Items"],
            ["categories", "Categories"],
            ["brands", "Brands"],
            ["stock", "Stock levels"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => goTab(id)}
            className={cn(
              "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === id
                ? "border-[#1a56db] text-[#1a56db]"
                : "border-transparent text-[#5a6b7d] hover:text-[#0b1f33]",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "products" ? <ProductsPanel /> : null}
      {tab === "brands" ? <BrandsPanel /> : null}
      {tab === "categories" ? <CategoriesPanel /> : null}
      {tab === "stock" ? (
        <div className="rounded-xl border border-[#d9e0ea] bg-white p-6">
          <h2 className="text-base font-semibold text-[#0b1f33]">
            Location stock
          </h2>
          <p className="mt-1 text-sm text-[#5a6b7d]">
            Quantities, transfers, and adjustments are managed in Inventory —
            not on the product master.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/inventory">Open stock levels</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/adjustments">Adjustments</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/transfers">Stock transfer</Link>
            </Button>
          </div>
        </div>
              ) : null}
    </div>
  );
}

function ProductsPanel() {
  const router = useRouter();
  const qc = useQueryClient();
  const tenantId = useAuthStore((s) => s.user?.tenantId);
  const locationId = useBranchStore((s) => s.currentLocationId);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<CatalogProductKind | "">("");
  const [statusFilter, setStatusFilter] = useState<
    "" | "active" | "inactive" | "low"
  >("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");

  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [lightbox, setLightbox] = useState<{
    images: string[];
    index: number;
    label: string;
  } | null>(null);

  const cats = useQuery({
    queryKey: ["catalog-categories", tenantId],
    queryFn: () => catalogApi.listCategories(),
  });
  const brands = useQuery({
    queryKey: ["catalog-brands", tenantId],
    queryFn: () => catalogApi.listBrands(),
  });
  const list = useQuery({
    queryKey: [
      "catalog-products",
      tenantId,
      locationId,
      q,
      kind,
      statusFilter,
      categoryId,
      brandId,
    ],
    queryFn: () =>
      catalogApi.listProducts({
        q: q || undefined,
        kind: kind || undefined,
        status:
          statusFilter === "active" || statusFilter === "inactive"
            ? statusFilter
            : undefined,
        categoryId: categoryId || undefined,
        brandId: brandId || undefined,
        locationId: locationId || undefined,
      }),
    refetchOnMount: "always",
  });

  useEffect(() => {
    setPage(1);
  }, [q, kind, statusFilter, categoryId, brandId]);

  const dup = useMutation({
    mutationFn: (id: string) => catalogApi.duplicate(id),
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: ["catalog-products"] });
      toast.success("Product duplicated as draft");
      if (p?.id) router.push(`/catalog/view?id=${p.id}`);
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Duplicate failed"),
  });

  const archive = useMutation({
    mutationFn: (id: string) => catalogApi.setStatus(id, "archived"),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["catalog-products"] });
      toast.success("Product archived");
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Archive failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => catalogApi.remove(id),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["catalog-products"] });
      toast.success(
        res.softDeleted
          ? "Item is in use — archived instead"
          : "Item deleted",
      );
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Delete failed"),
  });

  const allItems = Array.isArray(list.data)
    ? list.data
    : (list.data?.items ?? []);
  const categoryChips = useMemo(() => {
    const fromApi = (cats.data ?? []).filter((c) => c.isActive !== false);
    if (fromApi.length) {
      return fromApi.map((c) => ({
        id: c.id,
        name: c.parent?.name ? `${c.parent.name} › ${c.name}` : c.name,
      }));
    }
    const map = new Map<string, string>();
    for (const p of allItems) {
      if (p.category?.id) map.set(p.category.id, p.category.name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [cats.data, allItems]);

  const filteredItems =
    statusFilter === "low"
      ? allItems.filter(
          (p) =>
            p.trackInventory !== false &&
            p.stockOnHand != null &&
            p.stockOnHand <= 5 &&
            p.stockOnHand > 0,
        )
      : allItems;
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const items = filteredItems.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-[#8a9bb0]" />
          <Input
            className="pl-9"
            placeholder="Search name, SKU, barcode, brand…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div
          role="tablist"
          aria-label="Status filter"
          className="inline-flex flex-wrap gap-0.5 rounded-md border border-[#e2e8f0] bg-[#f1f5f9] p-0.5"
        >
          {(
            [
              { id: "", label: "All" },
              { id: "active", label: "Active" },
              { id: "inactive", label: "Inactive" },
              { id: "low", label: "Low stock" },
            ] as const
          ).map((t) => {
            const on = statusFilter === t.id;
                    return (
                      <button
                key={t.label}
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
        <select
          className="h-9 rounded-md border border-[#dce3ec] bg-white px-2 text-sm"
          value={brandId}
          onChange={(e) => setBrandId(e.target.value)}
        >
          <option value="">All brands</option>
          {(brands.data ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border border-[#dce3ec] bg-white px-2 text-sm"
          value={kind}
          onChange={(e) => setKind(e.target.value as CatalogProductKind | "")}
        >
          {KINDS.map((k) => (
            <option key={k.label} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <Button asChild>
          <Link href="/catalog/new">
            <Plus className="mr-1 size-4" />
            Add Product
          </Link>
              </Button>
      </div>

      {categoryChips.length ? (
        <div className="flex min-w-0 gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setCategoryId("")}
            className={cn(
              "shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition",
              !categoryId
                ? "bg-[#1a56db] text-white shadow-sm"
                : "bg-white text-[#5a6b7d] ring-1 ring-[#d9e0ea] hover:text-[#0b1f33]",
            )}
          >
            All
          </button>
          {categoryChips.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryId(c.id)}
              className={cn(
                "max-w-[12rem] shrink-0 truncate rounded-lg px-3 py-2 text-xs font-semibold transition",
                categoryId === c.id
                  ? "bg-[#1a56db] text-white shadow-sm"
                  : "bg-white text-[#5a6b7d] ring-1 ring-[#d9e0ea] hover:text-[#0b1f33]",
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-md border border-[#e4e9f0] bg-white">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-[#eef1f4] bg-[#f7f9fb] text-[0.7rem] font-semibold tracking-wide text-[#5a6b7d] uppercase">
            <tr>
              <th className="px-3 py-2.5">Image</th>
              <th className="px-3 py-2.5">Product</th>
              <th className="px-3 py-2.5">SKU</th>
              <th className="px-3 py-2.5">Category</th>
              <th className="px-3 py-2.5">Type</th>
              <th className="px-3 py-2.5 text-right">Rate</th>
              <th className="px-3 py-2.5 text-right">Stock on Hand</th>
              <th className="px-3 py-2.5">Unit</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.isLoading ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-[#5a6b7d]">
                  Loading catalog…
                </td>
              </tr>
            ) : list.isError ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-[#c81e1e]">
                  Could not load items.{" "}
                  <button
                    type="button"
                    className="font-semibold underline"
                    onClick={() => void list.refetch()}
                  >
                    Retry
                  </button>
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-[#5a6b7d]">
                  No products yet. Add your first item.
                </td>
              </tr>
            ) : (
              items.map((p) => (
                <tr
                key={p.id}
                  className="border-b border-[#f0f3f7] hover:bg-[#fafcfe]"
                >
                  <td className="px-3 py-2">
                    <ProductThumb
                      src={p.photoUrl || p.images?.[0]}
                      label={p.name}
                      size="md"
                      className="rounded-lg"
                      count={p.images?.length}
                      onClick={
                        (p.images?.length || p.photoUrl)
                          ? () =>
                              setLightbox({
                                images:
                                  p.images?.length
                                    ? p.images
                                    : [p.photoUrl!],
                                index: 0,
                                label: p.name,
                              })
                          : undefined
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/catalog/view?id=${p.id}`}
                      className="font-medium text-[#0b1f33] hover:text-[#1a56db]"
                    >
                      {p.name}
                    </Link>
                    {p.brand?.name ? (
                      <p className="text-[0.7rem] text-[#8a9bb0]">
                        {p.brand.name}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 font-mono text-[0.8rem]">
                    {p.skuCode}
                  </td>
                  <td className="px-3 py-2 text-[#5a6b7d]">
                    {p.category?.name ?? "—"}
                  </td>
                  <td className="px-3 py-2 capitalize text-[#5a6b7d]">
                    {p.kind}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {Number(p.basePrice).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[#5a6b7d]">
                    {p.trackInventory === false
                      ? "—"
                      : p.stockOnHand == null
                        ? "—"
                        : p.stockOnHand}
                  </td>
                  <td className="px-3 py-2 text-[#5a6b7d]">
                    {p.sellUnit || p.unitOfMeasure || "pcs"}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill status={p.status} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-0.5">
                      <EntityRowActions
                        onEdit={() =>
                          router.push(`/catalog/edit?id=${p.id}`)
                        }
                        editTitle="Edit"
                        onSoftDelete={
                          p.status !== "archived"
                            ? () => {
                                if (
                                  confirm(
                                    `Archive “${p.name}”? It will leave active sales.`,
                                  )
                                ) {
                                  archive.mutate(p.id);
                                }
                              }
                            : undefined
                        }
                        softDeleteTitle="Archive (soft delete)"
                        onDelete={() => {
                          if (
                            confirm(
                              `Delete “${p.name}”? Unused items are removed; items used in orders are archived.`,
                            )
                          ) {
                            remove.mutate(p.id);
                          }
                        }}
                        deleteTitle="Delete"
                        disabled={
                          archive.isPending || remove.isPending || dup.isPending
                        }
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 px-0 text-[#5a6b7d]"
                        title="Duplicate"
                        onClick={() => dup.mutate(p.id)}
                      >
                        <Copy className="size-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {allItems.length > pageSize ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[0.75rem] text-[#5a6b7d]">
            Showing {(page - 1) * pageSize + 1}–
            {Math.min(page * pageSize, allItems.length)} of {allItems.length}
          </p>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
                  </div>
                </div>
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

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-800",
    inactive: "bg-slate-100 text-slate-600",
    draft: "bg-amber-50 text-amber-800",
    archived: "bg-rose-50 text-rose-800",
  };
  return (
    <span
                  className={cn(
        "inline-flex rounded px-1.5 py-0.5 text-[0.7rem] font-medium capitalize",
        styles[status] ?? "bg-slate-100 text-slate-600",
      )}
    >
      {status}
    </span>
  );
}

function BrandsPanel() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const brands = useQuery({
    queryKey: ["catalog-brands"],
    queryFn: () => catalogApi.listBrands(),
  });
  const create = useMutation({
    mutationFn: () => {
      const parsed = createBrandSchema.safeParse({ name });
      if (!parsed.success) {
        setFieldErrors(zodFieldErrors(parsed.error));
        toast.error(zodMessages(parsed.error)[0] ?? "Check the form");
        throw new Error(zodMessages(parsed.error)[0] ?? "Invalid brand");
      }
      setFieldErrors({});
      return catalogApi.createBrand({ name: parsed.data.name });
    },
    onSuccess: () => {
      setName("");
      setFieldErrors({});
      void qc.invalidateQueries({ queryKey: ["catalog-brands"] });
      toast.success("Brand created");
    },
    onError: (e: Error) => {
      if (e instanceof ApiError) toast.error(e.message);
    },
  });
  const update = useMutation({
    mutationFn: () => {
      const parsed = createBrandSchema.safeParse({ name: editName });
      if (!parsed.success) {
        setEditErrors(zodFieldErrors(parsed.error));
        toast.error(zodMessages(parsed.error)[0] ?? "Check the form");
        throw new Error(zodMessages(parsed.error)[0] ?? "Invalid brand");
      }
      setEditErrors({});
      return catalogApi.updateBrand(editId!, { name: parsed.data.name });
    },
    onSuccess: () => {
      setEditId(null);
      setEditErrors({});
      void qc.invalidateQueries({ queryKey: ["catalog-brands"] });
      toast.success("Brand updated");
    },
    onError: (e: Error) => {
      if (e instanceof ApiError) toast.error(e.message);
    },
  });
  const soft = useMutation({
    mutationFn: (id: string) =>
      catalogApi.updateBrand(id, { isActive: false }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["catalog-brands"] });
      toast.success("Brand deactivated");
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Failed"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => catalogApi.removeBrand(id),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["catalog-brands"] });
      toast.success(
        res.softDeleted
          ? "Brand in use — deactivated instead"
          : "Brand deleted",
      );
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Delete failed"),
  });

                        return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
      <div className="space-y-2 rounded-md border border-[#e4e9f0] bg-white p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#0b1f33]">
          <Tag className="size-4 text-[#1a56db]" />
          New brand
        </div>
        <p className="text-[0.75rem] text-[#5a6b7d]">
          Optional on products — services often have no brand.
        </p>
        <Label>Name</Label>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setFieldErrors((f) => ({ ...f, name: "" }));
          }}
        />
        <FieldError message={fieldErrors.name} />
        <Button
          disabled={create.isPending}
          onClick={() => create.mutate()}
        >
          Save brand
        </Button>
      </div>
      <div className="overflow-hidden rounded-md border border-[#e4e9f0] bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-[#eef1f4] bg-[#f7f9fb] text-[0.7rem] text-[#5a6b7d] uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Brand</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(brands.data ?? []).map((b) => (
              <tr key={b.id} className="border-b border-[#f0f3f7]">
                <td className="px-3 py-2 font-medium">
                  {editId === b.id ? (
                    <div className="flex max-w-xs flex-col gap-1">
                      <div className="flex gap-2">
                        <Input
                          value={editName}
                          onChange={(e) => {
                            setEditName(e.target.value);
                            setEditErrors((f) => ({ ...f, name: "" }));
                          }}
                        />
                        <Button
                          size="sm"
                          disabled={update.isPending}
                          onClick={() => update.mutate()}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                            onClick={() => {
                            setEditId(null);
                            setEditErrors({});
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                      <FieldError message={editErrors.name} />
                    </div>
                  ) : (
                    b.name
                  )}
                </td>
                <td className="px-3 py-2">
                  {b.isActive ? "Active" : "Inactive"}
                </td>
                <td className="px-3 py-2 text-right">
                  <EntityRowActions
                    onEdit={() => {
                      setEditId(b.id);
                      setEditName(b.name);
                    }}
                    onSoftDelete={
                      b.isActive
                        ? () => {
                            if (confirm(`Deactivate brand “${b.name}”?`)) {
                              soft.mutate(b.id);
                            }
                          }
                        : undefined
                    }
                    softDeleteTitle="Deactivate (soft delete)"
                    onDelete={() => {
                      if (
                        confirm(
                          `Delete brand “${b.name}”? Unused brands are removed; in-use brands are deactivated.`,
                        )
                      ) {
                        remove.mutate(b.id);
                      }
                    }}
                  />
                </td>
              </tr>
            ))}
            {!brands.data?.length ? (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-[#5a6b7d]">
                  No brands yet
                </td>
              </tr>
                  ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CategoriesPanel() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const cats = useQuery({
    queryKey: ["catalog-categories"],
    queryFn: () => catalogApi.listCategories(),
  });
  const create = useMutation({
    mutationFn: () => {
      const parsed = createCategorySchema.safeParse({ name });
      if (!parsed.success) {
        setFieldErrors(zodFieldErrors(parsed.error));
        toast.error(zodMessages(parsed.error)[0] ?? "Check the form");
        throw new Error(zodMessages(parsed.error)[0] ?? "Invalid category");
      }
      setFieldErrors({});
      return catalogApi.createCategory({
        name: parsed.data.name,
        parentId: parentId || undefined,
      });
    },
    onSuccess: () => {
      setName("");
      setParentId("");
      setFieldErrors({});
      void qc.invalidateQueries({ queryKey: ["catalog-categories"] });
      toast.success("Category created");
    },
    onError: (e: Error) => {
      if (e instanceof ApiError) toast.error(e.message);
    },
  });
  const update = useMutation({
    mutationFn: () => {
      const parsed = createCategorySchema.safeParse({ name: editName });
      if (!parsed.success) {
        setEditErrors(zodFieldErrors(parsed.error));
        toast.error(zodMessages(parsed.error)[0] ?? "Check the form");
        throw new Error(zodMessages(parsed.error)[0] ?? "Invalid category");
      }
      setEditErrors({});
      return catalogApi.updateCategory(editId!, { name: parsed.data.name });
    },
    onSuccess: () => {
      setEditId(null);
      setEditErrors({});
      void qc.invalidateQueries({ queryKey: ["catalog-categories"] });
      toast.success("Category updated");
    },
    onError: (e: Error) => {
      if (e instanceof ApiError) toast.error(e.message);
    },
  });
  const soft = useMutation({
    mutationFn: (id: string) =>
      catalogApi.updateCategory(id, { isActive: false }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["catalog-categories"] });
      toast.success("Category deactivated");
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Failed"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => catalogApi.removeCategory(id),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["catalog-categories"] });
      toast.success(
        res.softDeleted
          ? "Category in use — deactivated instead"
          : "Category deleted",
      );
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Delete failed"),
  });

  const roots = useMemo(
    () => (cats.data ?? []).filter((c) => !c.parentId),
    [cats.data],
  );

  return (
    <div className="grid gap-4 md:grid-cols-[300px_1fr]">
      <div className="space-y-2 rounded-md border border-[#e4e9f0] bg-white p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Layers className="size-4 text-[#1a56db]" />
          Category / subcategory
        </div>
        <p className="text-[0.75rem] text-[#5a6b7d]">
          Nested via parent — no separate subcategory table.
        </p>
        <Label>Name</Label>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setFieldErrors((f) => ({ ...f, name: "" }));
          }}
        />
        <FieldError message={fieldErrors.name} />
        <Label>Parent (optional)</Label>
                  <select
          className="h-9 w-full rounded-md border border-[#dce3ec] px-2 text-sm"
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
        >
          <option value="">— Top level —</option>
          {roots.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
        <Button
          disabled={create.isPending}
          onClick={() => create.mutate()}
        >
          Save category
        </Button>
      </div>
      <div className="overflow-hidden rounded-md border border-[#e4e9f0] bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-[#eef1f4] bg-[#f7f9fb] text-[0.7rem] text-[#5a6b7d] uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Category</th>
              <th className="px-3 py-2 text-left">Parent</th>
              <th className="px-3 py-2 text-right">Products</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(cats.data ?? []).map((c) => (
              <tr key={c.id} className="border-b border-[#f0f3f7]">
                <td className="px-3 py-2 font-medium">
                  {editId === c.id ? (
                    <div className="flex max-w-xs flex-col gap-1">
                  <div className="flex gap-2">
                    <Input
                          value={editName}
                          onChange={(e) => {
                            setEditName(e.target.value);
                            setEditErrors((f) => ({ ...f, name: "" }));
                      }}
                    />
                    <Button
                          size="sm"
                          disabled={update.isPending}
                          onClick={() => update.mutate()}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditId(null);
                            setEditErrors({});
                          }}
                        >
                          Cancel
                    </Button>
                  </div>
                      <FieldError message={editErrors.name} />
                </div>
                  ) : (
                    <>
                      {c.name}
                      {!c.isActive ? (
                        <span className="ml-2 text-[0.7rem] text-[#8a9bb0]">
                          Inactive
                        </span>
                      ) : null}
                    </>
                  )}
                </td>
                <td className="px-3 py-2 text-[#5a6b7d]">
                  {c.parent?.name ?? "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {c._count?.products ?? 0}
                </td>
                <td className="px-3 py-2 text-right">
                  <EntityRowActions
                    onEdit={() => {
                      setEditId(c.id);
                      setEditName(c.name);
                    }}
                    onSoftDelete={
                      c.isActive
                        ? () => {
                            if (confirm(`Deactivate category “${c.name}”?`)) {
                              soft.mutate(c.id);
                            }
                          }
                        : undefined
                    }
                    softDeleteTitle="Deactivate (soft delete)"
                    onDelete={() => {
                      if (
                        confirm(
                          `Delete category “${c.name}”? Unused categories are removed; ones with products/children are deactivated.`,
                        )
                      ) {
                        remove.mutate(c.id);
                      }
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
    </div>
  );
}
