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
  Barcode,
  ClipboardCopy,
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
import { FoodTypeBadge } from "@/components/food-type-badge";
import { ImageLightbox } from "@/components/image-lightbox";
import { catalogStockOnHandLabel, productKindLabel } from "@/lib/product-kind";
import { FieldError } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { useAuthStore } from "@/lib/auth-store";
import { useBranchStore } from "@/lib/branch-store";
import { useBootstrap } from "@/lib/bootstrap";
import { resolveOperatingLocationId } from "@/lib/operating-location";
import {
  createBrandSchema,
  createCategorySchema,
  zodFieldErrors,
  zodMessages,
} from "@/lib/validations";
import { ItemsImportDialog } from "@/components/items-import-dialog";
import { EntityRowActions } from "@/components/entity-row-actions";
import { TablePager } from "@/components/table-pager";
import { pagerFromMeta } from "@/lib/use-paged-list";
import {
  barcodeValueForProduct,
  copyBarcodeToClipboard,
  printBarcodeLabel,
} from "@/lib/print-barcode";

/** Row action buttons for catalog tables (explicit alias avoids Turbopack HMR misses). */
const CatalogRowActions = EntityRowActions;

const KINDS: { value: CatalogProductKind | ""; label: string }[] = [
  { value: "", label: "All types" },
  { value: "physical", label: "Goods" },
  { value: "service", label: "Service" },
  { value: "digital", label: "Digital" },
  { value: "bundle", label: "Combo pack" },
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
  const { hasMode, hasScreen, commerceModes } = useBootstrap();
  const showStockTab = hasMode("sale") && hasScreen("inventory");
  const [tab, setTab] = useState<Tab>(() => {
    const parsed = parseTab(search.get("tab"));
    if (parsed === "stock" && !showStockTab) return "products";
    return parsed;
  });

  useEffect(() => {
    const parsed = parseTab(search.get("tab"));
    if (parsed === "stock" && !showStockTab) {
      setTab("products");
      return;
    }
    setTab(parsed);
  }, [search, showStockTab]);

  function goTab(id: Tab) {
    if (id === "stock" && !showStockTab) return;
    setTab(id);
    const qs =
      id === "products" ? "/catalog" : `/catalog?tab=${id}`;
    router.replace(qs);
  }

  const catalogTabs: Array<[Tab, string]> = [
    ["products", "Items"],
    ["categories", "Categories"],
    ["brands", "Brands"],
  ];
  if (showStockTab) catalogTabs.push(["stock", "Stock levels"]);

  return (
    <div className="space-y-4 px-3 sm:px-4">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[#eef1f4] pb-3">
        <div className="min-w-0">
          <p className="eyebrow">Inventory</p>
          <h1 className="page-title mt-1">Product catalog</h1>
          <p className="page-subtitle mt-1.5">
            What you sell · rent · service — stock quantities live under Stock
            levels
          </p>
        </div>
        {commerceModes[0] ? <ModeBadge mode={commerceModes[0]} /> : null}
      </header>

      <div className="flex flex-wrap gap-1 border-b border-[#eef1f4]">
        {catalogTabs.map(([id, label]) => (
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
  const authStoreId = useAuthStore((s) => s.user?.storeId);
  const currentLocationId = useBranchStore((s) => s.currentLocationId);
  const { data: boot } = useBootstrap();
  const locationId = resolveOperatingLocationId({
    currentLocationId,
    locations: boot?.locations,
    authStoreId,
  });
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
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
  const [importOpen, setImportOpen] = useState(false);

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
      debouncedQ,
      kind,
      statusFilter,
      categoryId,
      brandId,
      page,
    ],
    queryFn: () =>
      catalogApi.listProducts({
        q: debouncedQ || undefined,
        kind: kind || undefined,
        status:
          statusFilter === "active" || statusFilter === "inactive"
            ? statusFilter
            : undefined,
        categoryId: categoryId || undefined,
        brandId: brandId || undefined,
        locationId: locationId || undefined,
        lowStock: statusFilter === "low" || undefined,
        page,
        limit: pageSize,
      }),
    enabled: Boolean(tenantId),
    refetchOnMount: "always",
  });

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedQ(q.trim());
      setPage(1);
    }, 280);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [kind, statusFilter, categoryId, brandId]);

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

  const unarchive = useMutation({
    mutationFn: (id: string) => catalogApi.setStatus(id, "active"),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["catalog-products"] });
      toast.success("Product unarchived (active)");
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Unarchive failed"),
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

  const items = list.data?.items ?? [];
  const meta = list.data?.meta;
  const categoryChips = useMemo(() => {
    const fromApi = (cats.data ?? []).filter((c) => c.isActive !== false);
    if (fromApi.length) {
      return fromApi.map((c) => ({
        id: c.id,
        name: c.parent?.name ? `${c.parent.name} › ${c.name}` : c.name,
      }));
    }
    const map = new Map<string, string>();
    for (const p of items) {
      if (p.category?.id) map.set(p.category.id, p.category.name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [cats.data, items]);

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
        <Select
          wrapperClassName="w-44 sm:w-52"
          className="h-9 rounded-md border border-[#dce3ec] bg-white px-2 text-sm"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">All Categories</option>
          {categoryChips.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
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
        <Select
          wrapperClassName="w-36"
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
        </Select>
        <Select
          wrapperClassName="w-36"
          className="h-9 rounded-md border border-[#dce3ec] bg-white px-2 text-sm"
          value={kind}
          onChange={(e) => setKind(e.target.value as CatalogProductKind | "")}
        >
          {KINDS.map((k) => (
            <option key={k.label} value={k.value}>
              {k.label}
            </option>
          ))}
        </Select>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setImportOpen(true)}
        >
          Import Excel / CSV
        </Button>
        <Button asChild>
          <Link href="/catalog/new">
            <Plus className="mr-1 size-4" />
            Add Product
          </Link>
        </Button>
      </div>

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
                      className="inline-flex items-center gap-1.5 font-medium text-[#0b1f33] hover:text-[#1a56db]"
                    >
                      <FoodTypeBadge value={p.foodType} />
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
                  <td className="px-3 py-2 text-[#5a6b7d]">
                    {productKindLabel(p.kind) || p.kind}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {Number(p.basePrice).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-[#0b1f33]">
                    {catalogStockOnHandLabel({
                      kind: p.kind,
                      trackInventory: p.trackInventory,
                      stockOnHand: p.stockOnHand,
                      unit: p.unitOfMeasure || p.sellUnit || "pcs",
                    })}
                  </td>
                  <td className="px-3 py-2 text-[#5a6b7d]">
                    {p.unitOfMeasure || p.sellUnit || "pcs"}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill status={p.status} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-0.5">
                      <CatalogRowActions
                        onEdit={() =>
                          router.push(`/catalog/new?id=${p.id}`)
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
                        onUnarchive={
                          p.status === "archived"
                            ? () => {
                                if (
                                  confirm(
                                    `Unarchive “${p.name}”? It will be restored to active.`,
                                  )
                                ) {
                                  unarchive.mutate(p.id);
                                }
                              }
                            : undefined
                        }
                        unarchiveTitle="Unarchive (restore to active)"
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
                          archive.isPending || unarchive.isPending || remove.isPending || dup.isPending
                        }
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 px-0 text-[#5a6b7d]"
                        title="Print barcode"
                        disabled={
                          archive.isPending ||
                          remove.isPending ||
                          dup.isPending ||
                          !barcodeValueForProduct(p)
                        }
                        onClick={() =>
                          printBarcodeLabel({
                            value: barcodeValueForProduct(p),
                            productName: p.name,
                            sku: p.skuCode,
                            format: p.barcodeType,
                          })
                        }
                      >
                        <Barcode className="size-3.5" />
                        <span className="sr-only">Print barcode</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 px-0 text-[#5a6b7d]"
                        title="Copy barcode / SKU"
                        disabled={
                          archive.isPending ||
                          remove.isPending ||
                          dup.isPending ||
                          !barcodeValueForProduct(p)
                        }
                        onClick={() =>
                          void copyBarcodeToClipboard(
                            barcodeValueForProduct(p),
                            p.barcode ? "Barcode" : "SKU",
                          )
                        }
                      >
                        <ClipboardCopy className="size-3.5" />
                        <span className="sr-only">Copy barcode</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 px-0 text-[#5a6b7d]"
                        title="Duplicate item"
                        onClick={() => dup.mutate(p.id)}
                      >
                        <Copy className="size-3.5" />
                        <span className="sr-only">Duplicate</span>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <TablePager
        {...pagerFromMeta(meta, page, pageSize, setPage, items.length)}
      />
      <ImageLightbox
        open={Boolean(lightbox)}
        images={lightbox?.images ?? []}
        startIndex={lightbox?.index ?? 0}
        label={lightbox?.label}
        onClose={() => setLightbox(null)}
      />
      <ItemsImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
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
  const reactivate = useMutation({
    mutationFn: (id: string) =>
      catalogApi.updateBrand(id, { isActive: true }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["catalog-brands"] });
      toast.success("Brand reactivated");
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
                  <CatalogRowActions
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
                    onUnarchive={
                      !b.isActive
                        ? () => {
                            if (confirm(`Reactivate brand “${b.name}”?`)) {
                              reactivate.mutate(b.id);
                            }
                          }
                        : undefined
                    }
                    unarchiveTitle="Reactivate"
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
  const reactivate = useMutation({
    mutationFn: (id: string) =>
      catalogApi.updateCategory(id, { isActive: true }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["catalog-categories"] });
      toast.success("Category reactivated");
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
                  <Select
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
                  </Select>
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
                  <CatalogRowActions
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
                    onUnarchive={
                      !c.isActive
                        ? () => {
                            if (confirm(`Reactivate category “${c.name}”?`)) {
                              reactivate.mutate(c.id);
                            }
                          }
                        : undefined
                    }
                    unarchiveTitle="Reactivate"
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
