"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Minus, Pencil, Plus, Search } from "lucide-react";
import { posApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useBootstrap } from "@/lib/bootstrap";
import { canRefund, canWriteCatalog } from "@/lib/roles";
import { useAuthStore } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { FloorTabs } from "@/components/getting-started";
import { SaleReturnDialog } from "@/components/sale-return-dialog";
import RetailPosWorkstation from "@/app/(app)/pos/retail-pos-workstation";
import { PageHeader, EmptyState } from "@/components/page-header";
import { ModeBadge } from "@/components/mode-badge";

type MainTab = "inventory" | "pos" | "sales";

const AVATAR_COLORS = [
  "bg-[#e8eefb] text-[#1a56db]",
  "bg-[#eef2f7] text-[#5a6b7d]",
  "bg-[#ecfdf5] text-[#166534]",
  "bg-[#f3e8ff] text-[#6b21a8]",
  "bg-[#fff7ed] text-[#9a3412]",
  "bg-[#ecfeff] text-[#0e7490]",
];

function avatarClass(label: string) {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h + label.charCodeAt(i) * 17) % 97;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initials(label: string) {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts[0].match(/^\d/)) return parts[0].slice(0, 3);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function errMsg(e: unknown) {
  if (e instanceof ApiError) return e.messages.join(", ");
  if (e instanceof Error) return e.message;
  return "Failed";
}

export default function CatalogPage() {
  const qc = useQueryClient();
  const { money } = useBootstrap();
  const roles = useAuthStore((s) => s.user?.roles);
  const canWrite = canWriteCatalog(roles);
  const allowReturn = canRefund(roles);

  const [tab, setTab] = useState<MainTab>("inventory");
  const [showAdd, setShowAdd] = useState(false);
  const [q, setQ] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [returnTarget, setReturnTarget] = useState<{
    id: string;
    orderNumber: string;
  } | null>(null);

  const [form, setForm] = useState({
    title: "",
    sku: "",
    price: "",
    qty: "10",
    categoryId: "",
    newCategory: "",
  });

  const categoriesQ = useQuery({
    queryKey: ["pos-sale-categories"],
    queryFn: () => posApi.listSaleCategories(),
  });

  const products = useQuery({
    queryKey: ["pos-sale-products", q, filterCat],
    queryFn: () =>
      posApi.listSaleProducts({
        q: q.trim() || undefined,
        categoryId: filterCat || undefined,
      }),
  });

  const recent = useQuery({
    queryKey: ["pos-sale-recent"],
    queryFn: () => posApi.listRecentSales(25),
    enabled: tab === "sales",
  });

  const categories = categoriesQ.data ?? [];
  const items = products.data?.items ?? [];

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["pos-sale-products"] });
    void qc.invalidateQueries({ queryKey: ["pos-sale-floor"] });
    void qc.invalidateQueries({ queryKey: ["pos-sale-catalog"] });
    void qc.invalidateQueries({ queryKey: ["pos-sale-categories"] });
  };

  const adjustStock = useMutation({
    mutationFn: ({ id, delta }: { id: string; delta: number }) =>
      posApi.adjustSaleStock(id, { delta }),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(errMsg(e)),
  });

  const addCat = useMutation({
    mutationFn: (name: string) => posApi.addSaleCategory({ name }),
    onSuccess: (row) => {
      toast.success(`Category “${row.name}” added`);
      setForm((f) => ({ ...f, categoryId: row.id, newCategory: "" }));
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const addProduct = useMutation({
    mutationFn: async () => {
      let categoryId = form.categoryId;
      if (!categoryId && form.newCategory.trim()) {
        const cat = await posApi.addSaleCategory({
          name: form.newCategory.trim(),
        });
        categoryId = cat.id;
      }
      if (!form.title.trim() || !form.sku.trim()) {
        throw new Error("Title and SKU required");
      }
      if (!categoryId) throw new Error("Select or create a category");
      return posApi.addSaleProduct({
        title: form.title.trim(),
        sku: form.sku.trim(),
        price: Number(form.price) || 0,
        qty: Math.max(0, Number(form.qty) || 0),
        categoryId,
      });
    },
    onSuccess: () => {
      toast.success("Product added");
      setForm({
        title: "",
        sku: "",
        price: "",
        qty: "10",
        categoryId: "",
        newCategory: "",
      });
      setShowAdd(false);
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const emptyHint = useMemo(() => {
    if (products.isLoading) return "Loading…";
    if (q || filterCat) return "No products match your search.";
    return "No products yet — add your first sale item.";
  }, [products.isLoading, q, filterCat]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        subtitle="Single place to manage what you sell, rent, or offer — these items show up on the counter."
        action={
          canWrite && tab === "inventory" ? (
            <Button
              type="button"
              onClick={() => {
                setShowAdd((v) => !v);
                setTab("inventory");
              }}
            >
              Add product
            </Button>
          ) : undefined
        }
      />
      <p className="flex flex-wrap items-center gap-2 text-caption text-[var(--muted)]">
        <span>Catalog mode</span>
        <ModeBadge mode="sale" />
        <span>— add more modes from Start here setup</span>
      </p>

      <FloorTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "inventory", label: "Inventory" },
          { id: "pos", label: "Point of Sale" },
          { id: "sales", label: "Sales History" },
        ]}
      />

      {tab === "inventory" ? (
        <div className="space-y-4">
          {showAdd && canWrite ? (
            <section className="rounded-xl border border-[#d9e0ea] bg-white p-4">
              <h2 className="text-[0.9375rem] font-semibold text-[#0b1f33]">
                New product
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Title</Label>
                  <Input
                    value={form.title}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, title: e.target.value }))
                    }
                    placeholder="Product name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>SKU</Label>
                  <Input
                    value={form.sku}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, sku: e.target.value }))
                    }
                    placeholder="SKU code"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select
                    value={form.categoryId}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, categoryId: e.target.value }))
                    }
                  >
                    <option value="">Select category…</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Or new category</Label>
                  <div className="flex gap-2">
                    <Input
                      value={form.newCategory}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, newCategory: e.target.value }))
                      }
                      placeholder="e.g. Swim Gear"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={
                        form.newCategory.trim().length < 2 || addCat.isPending
                      }
                      onClick={() => addCat.mutate(form.newCategory.trim())}
                    >
                      Add
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Price</Label>
                  <Input
                    type="number"
                    value={form.price}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, price: e.target.value }))
                    }
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Qty</Label>
                  <Input
                    type="number"
                    value={form.qty}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, qty: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
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
                  onClick={() => setShowAdd(false)}
                >
                  Cancel
                </Button>
              </div>
            </section>
          ) : null}

          <section className="overflow-hidden rounded-xl border border-[#d9e0ea] bg-white">
            <div className="flex flex-wrap items-center gap-2 border-b border-[#eef1f4] px-4 py-3">
              <div className="relative min-w-[14rem] flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#8b9bb0]" />
                <Input
                  className="pl-9"
                  placeholder="Search title or SKU..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <div className="w-full sm:w-52">
                <Select
                  value={filterCat}
                  onChange={(e) => setFilterCat(e.target.value)}
                >
                  <option value="">All categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="hidden grid-cols-[1fr_7rem_9rem_4rem] gap-3 border-b border-[#eef1f4] px-4 py-2 text-[0.7rem] font-semibold tracking-wide text-[#8b9bb0] uppercase sm:grid">
              <span>Product</span>
              <span className="text-right">Price</span>
              <span className="text-center">Inventory</span>
              <span className="text-right">Edit</span>
            </div>

            <ul className="divide-y divide-[#eef1f4]">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="grid grid-cols-1 items-center gap-3 px-4 py-3.5 sm:grid-cols-[1fr_7rem_9rem_4rem]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={cn(
                        "grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[0.7rem] font-bold",
                        avatarClass(item.title),
                      )}
                    >
                      {initials(item.title)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#0b1f33]">
                        {item.title}
                        {!item.isActive ? (
                          <span className="ml-2 text-[0.7rem] font-medium text-[#b45309]">
                            inactive
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-[0.75rem] text-[#5a6b7d]">
                        {item.sku}
                        {item.category ? ` · ${item.category.name}` : ""}
                      </p>
                    </div>
                  </div>

                  <p className="text-sm font-semibold tabular-nums text-[#0b1f33] sm:text-right">
                    {money(item.price)}
                  </p>

                  <div className="flex items-center justify-center gap-1.5">
                    <button
                      type="button"
                      disabled={!canWrite || adjustStock.isPending || item.qty < 1}
                      aria-label="Decrease stock"
                      className="grid h-8 w-8 place-items-center rounded-lg border border-[#d9e0ea] bg-white text-[#5a6b7d] transition hover:bg-[#f4f6fa] disabled:opacity-40"
                      onClick={() =>
                        adjustStock.mutate({ id: item.id, delta: -1 })
                      }
                    >
                      <Minus className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                    <span className="min-w-[2rem] text-center text-sm font-semibold tabular-nums text-[#0b1f33]">
                      {item.qty}
                    </span>
                    <button
                      type="button"
                      disabled={!canWrite || adjustStock.isPending}
                      aria-label="Increase stock"
                      className="grid h-8 w-8 place-items-center rounded-lg border border-[#d9e0ea] bg-white text-[#5a6b7d] transition hover:bg-[#f4f6fa] disabled:opacity-40"
                      onClick={() =>
                        adjustStock.mutate({ id: item.id, delta: 1 })
                      }
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="grid h-8 w-8 place-items-center rounded-lg text-[#8b9bb0] transition hover:bg-[#f4f6fa] hover:text-[#1a56db]"
                      title="Edit in list"
                      onClick={() =>
                        toast.message("Quick edit", {
                          description:
                            "Use + / − for stock. Full edit coming soon.",
                        })
                      }
                    >
                      <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                  </div>
                </li>
              ))}

              {!items.length ? (
                <li className="px-4 py-12 text-center text-sm text-[#5a6b7d]">
                  {emptyHint}
                </li>
              ) : null}
            </ul>
          </section>
        </div>
      ) : null}

      {tab === "pos" ? <RetailPosWorkstation compact /> : null}

      {tab === "sales" ? (
        <section className="rounded-xl border border-[#d9e0ea] bg-white">
          <div className="border-b border-[#eef1f4] px-4 py-3">
            <h2 className="text-[0.9375rem] font-semibold text-[#0b1f33]">
              Sales history
            </h2>
            <p className="mt-0.5 text-[0.75rem] text-[#5a6b7d]">
              Recent closed tickets
            </p>
          </div>
          <ul className="divide-y divide-[#eef1f4]">
            {(recent.data?.items ?? []).map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-[#0b1f33]">{o.orderNumber}</p>
                  <p className="text-[0.75rem] text-[#5a6b7d]">
                    {o.customerName} · {o.itemCount} item
                    {o.itemCount === 1 ? "" : "s"} ·{" "}
                    {new Date(o.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums text-[#0b1f33]">
                    {money(o.subtotal)}
                  </span>
                  {allowReturn ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        setReturnTarget({
                          id: o.id,
                          orderNumber: o.orderNumber,
                        })
                      }
                    >
                      Return
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
            {!recent.data?.items?.length && !recent.isLoading ? (
              <li className="px-4 py-10 text-center text-sm text-[#5a6b7d]">
                No sales yet.
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      {returnTarget ? (
        <SaleReturnDialog
          orderId={returnTarget.id}
          orderNumber={returnTarget.orderNumber}
          onClose={() => setReturnTarget(null)}
        />
      ) : null}
    </div>
  );
}
