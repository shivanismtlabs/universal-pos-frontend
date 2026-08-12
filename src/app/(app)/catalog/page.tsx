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
  Archive,
  Copy,
  Plus,
  Search,
  Tag,
  Layers,
} from "lucide-react";
import {
  catalogApi,
  type CatalogProductKind,
  type CatalogProductStatus,
} from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ModeBadge } from "@/components/mode-badge";
import { ProductThumb } from "@/components/product-thumb";

const KINDS: { value: CatalogProductKind | ""; label: string }[] = [
  { value: "", label: "All types" },
  { value: "physical", label: "Physical" },
  { value: "service", label: "Service" },
  { value: "digital", label: "Digital" },
  { value: "bundle", label: "Bundle" },
  { value: "rental", label: "Rental" },
];

const STATUSES: { value: CatalogProductStatus | ""; label: string }[] = [
  { value: "", label: "All status" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
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
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<CatalogProductKind | "">("");
  const [status, setStatus] = useState<CatalogProductStatus | "">("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");

  const cats = useQuery({
    queryKey: ["catalog-categories"],
    queryFn: () => catalogApi.listCategories(),
  });
  const brands = useQuery({
    queryKey: ["catalog-brands"],
    queryFn: () => catalogApi.listBrands(),
  });
  const list = useQuery({
    queryKey: ["catalog-products", q, kind, status, categoryId, brandId],
    queryFn: () =>
      catalogApi.listProducts({
        q: q || undefined,
        kind: kind || undefined,
        status: status || undefined,
        categoryId: categoryId || undefined,
        brandId: brandId || undefined,
      }),
  });

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

  const items = list.data?.items ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-[#8a9bb0]" />
          <Input
            className="pl-9"
            placeholder="Search name, SKU, barcode, brand…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          className="h-9 rounded-md border border-[#dce3ec] bg-white px-2 text-sm"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">All categories</option>
          {(cats.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.parent ? `${c.parent.name} › ` : ""}
              {c.name}
            </option>
          ))}
        </select>
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
        <select
          className="h-9 rounded-md border border-[#dce3ec] bg-white px-2 text-sm"
          value={status}
          onChange={(e) =>
            setStatus(e.target.value as CatalogProductStatus | "")
          }
        >
          {STATUSES.map((s) => (
            <option key={s.label} value={s.value}>
              {s.label}
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

      <div className="overflow-x-auto rounded-md border border-[#e4e9f0] bg-white">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-[#eef1f4] bg-[#f7f9fb] text-[0.7rem] font-semibold tracking-wide text-[#5a6b7d] uppercase">
            <tr>
              <th className="px-3 py-2.5">Image</th>
              <th className="px-3 py-2.5">Product</th>
              <th className="px-3 py-2.5">SKU</th>
              <th className="px-3 py-2.5">Category</th>
              <th className="px-3 py-2.5">Type</th>
              <th className="px-3 py-2.5 text-right">Price</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.isLoading ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-[#5a6b7d]">
                  Loading catalog…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-[#5a6b7d]">
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
                      size="sm"
                      className="rounded border border-[#eef1f4]"
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
                  <td className="px-3 py-2">
                    <StatusPill status={p.status} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => router.push(`/catalog/view?id=${p.id}`)}
                      >
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        title="Duplicate"
                        onClick={() => dup.mutate(p.id)}
                      >
                        <Copy className="size-3.5" />
                      </Button>
                      {p.status !== "archived" ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          title="Archive"
                          onClick={() => archive.mutate(p.id)}
                        >
                          <Archive className="size-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
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
  const brands = useQuery({
    queryKey: ["catalog-brands"],
    queryFn: () => catalogApi.listBrands(),
  });
  const create = useMutation({
    mutationFn: () => catalogApi.createBrand({ name: name.trim() }),
    onSuccess: () => {
      setName("");
      void qc.invalidateQueries({ queryKey: ["catalog-brands"] });
      toast.success("Brand created");
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Failed"),
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
        <Input value={name} onChange={(e) => setName(e.target.value)} />
        <Button
          disabled={!name.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          Save brand
        </Button>
      </div>
      <div className="overflow-hidden rounded-md border border-[#e4e9f0] bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-[#f7f9fb] text-[0.7rem] text-[#5a6b7d] uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Brand</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {(brands.data ?? []).map((b) => (
              <tr key={b.id} className="border-b border-[#f0f3f7]">
                <td className="px-3 py-2 font-medium">{b.name}</td>
                <td className="px-3 py-2">
                  {b.isActive ? "Active" : "Inactive"}
                </td>
              </tr>
            ))}
            {!brands.data?.length ? (
              <tr>
                <td colSpan={2} className="px-3 py-6 text-center text-[#5a6b7d]">
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
  const cats = useQuery({
    queryKey: ["catalog-categories"],
    queryFn: () => catalogApi.listCategories(),
  });
  const create = useMutation({
    mutationFn: () =>
      catalogApi.createCategory({
        name: name.trim(),
        parentId: parentId || undefined,
      }),
    onSuccess: () => {
      setName("");
      setParentId("");
      void qc.invalidateQueries({ queryKey: ["catalog-categories"] });
      toast.success("Category created");
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : "Failed"),
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
        <Input value={name} onChange={(e) => setName(e.target.value)} />
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
          disabled={!name.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          Save category
        </Button>
      </div>
      <div className="overflow-hidden rounded-md border border-[#e4e9f0] bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-[#f7f9fb] text-[0.7rem] text-[#5a6b7d] uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Category</th>
              <th className="px-3 py-2 text-left">Parent</th>
              <th className="px-3 py-2 text-right">Products</th>
            </tr>
          </thead>
          <tbody>
            {(cats.data ?? []).map((c) => (
              <tr key={c.id} className="border-b border-[#f0f3f7]">
                <td className="px-3 py-2 font-medium">{c.name}</td>
                <td className="px-3 py-2 text-[#5a6b7d]">
                  {c.parent?.name ?? "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {c._count?.products ?? 0}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
