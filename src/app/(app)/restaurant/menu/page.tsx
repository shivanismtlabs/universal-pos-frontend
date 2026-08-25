"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { catalogApi, posApi, restaurantApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { useBranchStore } from "@/lib/branch-store";
import {
  DiningEmpty,
  DiningShell,
  diningSelectClass,
} from "@/components/dining-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ModalFrame } from "@/components/modal-frame";
import { ProductThumb } from "@/components/product-thumb";
import { FoodTypeBadge } from "@/components/food-type-badge";
import { productKindLabel } from "@/lib/product-kind";
import { cn } from "@/lib/utils";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

type SellingMenu = NonNullable<
  Awaited<ReturnType<typeof restaurantApi.config>>["sellingMenus"]
>[number];

export default function SellingMenusPage() {
  const qc = useQueryClient();
  const { hasCapability, data: boot } = useBootstrap();
  const locationId =
    useBranchStore((s) => s.currentLocationId) || boot?.locations?.[0]?.id;
  const allowed =
    hasCapability("TABLE") ||
    hasCapability("KOT") ||
    hasCapability("QR_ORDER") ||
    hasCapability("MODIFIERS");
  const [q, setQ] = useState("");
  const [menuFilter, setMenuFilter] = useState("all");
  const [modal, setModal] = useState<
    | { kind: "lists" }
    | { kind: "addons" }
    | { kind: "item"; id: string }
    | null
  >(null);

  const cfg = useQuery({
    queryKey: ["restaurant-config"],
    queryFn: () => restaurantApi.config(),
    enabled: allowed,
  });
  const categories = useQuery({
    queryKey: ["pos-sale-categories"],
    queryFn: () => posApi.listSaleCategories(),
    enabled: allowed,
  });
  const products = useQuery({
    queryKey: ["catalog-products", q],
    queryFn: () =>
      catalogApi.listProducts({
        q: q.trim() || undefined,
        status: "active",
        limit: 80,
      }),
    enabled: allowed,
  });
  const modifiers = useQuery({
    queryKey: ["restaurant-modifiers"],
    queryFn: () => restaurantApi.modifiers(),
    enabled: allowed && hasCapability("MODIFIERS"),
  });

  const menus = cfg.data?.sellingMenus ?? [];
  const activeMenu = menus.find((m) => m.id === menuFilter);
  const items = useMemo(() => {
    let list = products.data?.items ?? [];
    if (activeMenu?.categoryIds.length) {
      list = list.filter(
        (p) => p.category?.id && activeMenu.categoryIds.includes(p.category.id),
      );
    }
    return list;
  }, [products.data, activeMenu]);

  if (!allowed) {
    return (
      <DiningShell
        title="Menus"
        subtitle="Enable Tables, KOT, QR, or Add-ons to manage selling lists."
      >
        <DiningEmpty
          title="Selling lists are off"
          detail="Items still live in Catalog. This screen is only a selling overlay."
        />
      </DiningShell>
    );
  }

  return (
    <DiningShell
      title="Menus"
      subtitle="One catalog for every shop. These lists pick which items show on POS, QR, or an outlet — not a restaurant-only menu app."
      action={
        <div className="flex flex-wrap justify-end gap-2">
          <Button asChild variant="secondary">
            <Link href="/catalog?tab=categories">Categories</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/catalog/new">+ New item</Link>
          </Button>
          {hasCapability("MODIFIERS") ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModal({ kind: "addons" })}
            >
              Add-ons
            </Button>
          ) : null}
          <Button type="button" onClick={() => setModal({ kind: "lists" })}>
            Selling lists
          </Button>
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-9 max-w-xs"
          placeholder="Search items"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setMenuFilter("all")}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold ring-1",
            menuFilter === "all"
              ? "bg-[#1a56db] text-white ring-[#1a56db]"
              : "bg-white text-[#5a6b7d] ring-[#e2e8f0]",
          )}
        >
          All items
        </button>
        {menus.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMenuFilter(m.id)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold ring-1",
              menuFilter === m.id
                ? "bg-[#eff6ff] text-[#1a56db] ring-[#bfdbfe]"
                : "bg-white text-[#5a6b7d] ring-[#e2e8f0]",
            )}
          >
            {m.name}
            {!m.isActive ? " · off" : ""}
          </button>
        ))}
      </div>

      <p className="text-xs text-[#8b9bb0]">
        Combos, variants, tax, images, and price live on the item form. Area
        menus are on Tables → Edit floor. Packaging is on Setup. Aggregators are
        not in this pack.
      </p>

      {!items.length ? (
        <DiningEmpty
          title="No items in this list"
          detail="Add catalog items, or widen the selling list categories."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#e2e8f0] bg-white">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="text-[0.68rem] uppercase tracking-wide text-[#8b9bb0]">
              <tr className="border-b border-[#eef1f4]">
                <th className="px-3 py-2 font-semibold">Item</th>
                <th className="px-3 py-2 font-semibold">SKU</th>
                <th className="px-3 py-2 font-semibold">Category</th>
                <th className="px-3 py-2 font-semibold">Type</th>
                <th className="px-3 py-2 text-right font-semibold">Rate</th>
                <th className="px-3 py-2 font-semibold">POS</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef1f4]">
              {items.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <ProductThumb src={p.photoUrl} label={p.name} size="sm" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <FoodTypeBadge value={p.foodType} />
                          <span className="font-medium text-[#0b1f33]">
                            {p.name}
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-[#5a6b7d]">
                    {p.skuCode}
                  </td>
                  <td className="px-3 py-2 text-[#5a6b7d]">
                    {(() => {
                      const c = p.category;
                      if (!c) return "—";
                      const parent = (categories.data ?? []).find(
                        (x) => x.id === c.parentId,
                      );
                      return parent ? `${parent.name} / ${c.name}` : c.name;
                    })()}
                  </td>
                  <td className="px-3 py-2 text-[#5a6b7d]">
                    {productKindLabel(p.kind) || p.kind}
                    {p.counts?.variants ? ` · ${p.counts.variants} var.` : ""}
                    {p.kind === "bundle" && p.counts?.bundleLines
                      ? ` · ${p.counts.bundleLines} lines`
                      : ""}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {p.sellingPrice ?? p.basePrice}
                  </td>
                  <td className="px-3 py-2">
                    {p.availableInPos === false ? "Hidden" : "On"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="text-xs font-semibold text-[#1a56db]"
                      onClick={() => setModal({ kind: "item", id: p.id })}
                    >
                      Availability
                    </button>
                    <span className="mx-1.5 text-[#e2e8f0]">|</span>
                    <Link
                      href={`/catalog/new?id=${p.id}`}
                      className="text-xs font-semibold text-[#1a56db]"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal?.kind === "lists" ? (
        <ListsModal
          menus={menus}
          categories={categories.data ?? []}
          locations={boot?.locations ?? []}
          locationId={locationId}
          onClose={() => setModal(null)}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ["restaurant-config"] });
            setModal(null);
          }}
        />
      ) : null}
      {modal?.kind === "addons" ? (
        <AddonsModal
          groups={modifiers.data ?? []}
          onClose={() => setModal(null)}
          onChanged={() =>
            void qc.invalidateQueries({ queryKey: ["restaurant-modifiers"] })
          }
        />
      ) : null}
      {modal?.kind === "item" &&
      (products.data?.items ?? []).find((p) => p.id === modal.id) ? (
        <ItemAvailModal
          product={(products.data?.items ?? []).find((p) => p.id === modal.id)!}
          groups={modifiers.data ?? []}
          canAddons={hasCapability("MODIFIERS")}
          onClose={() => setModal(null)}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ["catalog-products"] });
            setModal(null);
          }}
        />
      ) : null}
    </DiningShell>
  );
}

function ListsModal({
  menus,
  categories,
  locations,
  locationId,
  onClose,
  onSaved,
}: {
  menus: SellingMenu[];
  categories: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; name: string }>;
  locationId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<SellingMenu[]>(menus);
  const [edit, setEdit] = useState<SellingMenu | "new" | null>(null);
  const save = useMutation({
    mutationFn: () => restaurantApi.saveConfig({ sellingMenus: rows }),
    onSuccess: () => {
      toast.success("Selling lists saved");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function upsert(next: SellingMenu) {
    setRows((list) => {
      const i = list.findIndex((m) => m.id === next.id);
      if (i >= 0) return list.map((m) => (m.id === next.id ? next : m));
      return [...list, next];
    });
    setEdit(null);
  }

  return (
    <ModalFrame
      title="Selling lists"
      subtitle="POS, QR, or a branch. Empty categories = all items. Dining areas still have their own menu on Tables."
      onClose={onClose}
      className="max-w-lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
            Save lists
          </Button>
        </div>
      }
    >
      {edit ? (
        <MenuForm
          initial={
            edit === "new"
              ? {
                  id: crypto.randomUUID(),
                  name: "POS list",
                  categoryIds: [],
                  locationId: locationId ?? null,
                  channel: "all",
                  isActive: true,
                  days: [],
                  startTime: null,
                  endTime: null,
                }
              : edit
          }
          categories={categories}
          locations={locations}
          onCancel={() => setEdit(null)}
          onSave={upsert}
        />
      ) : (
        <div className="space-y-2">
          {rows.map((m) => (
            <button
              key={m.id}
              type="button"
              className="flex w-full items-center justify-between rounded-lg border border-[#e2e8f0] px-3 py-2 text-left text-sm hover:bg-[#f8fafc]"
              onClick={() => setEdit(m)}
            >
              <span>
                <span className="font-medium text-[#0b1f33]">{m.name}</span>
                <span className="ml-2 text-xs text-[#8b9bb0]">
                  {m.channel} · {m.categoryIds.length || "all"} cats
                  {m.days.length ? ` · ${m.days.length} days` : ""}
                </span>
              </span>
              <span className="text-xs text-[#5a6b7d]">
                {m.isActive ? "On" : "Off"}
              </span>
            </button>
          ))}
          <Button type="button" variant="secondary" onClick={() => setEdit("new")}>
            + New list
          </Button>
        </div>
      )}
    </ModalFrame>
  );
}

function MenuForm({
  initial,
  categories,
  locations,
  onCancel,
  onSave,
}: {
  initial: SellingMenu;
  categories: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; name: string }>;
  onCancel: () => void;
  onSave: (m: SellingMenu) => void;
}) {
  const [m, setM] = useState(initial);
  return (
    <div className="grid gap-3">
      <div>
        <Label>Name</Label>
        <Input
          className="mt-1"
          value={m.name}
          onChange={(e) => setM({ ...m, name: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Channel</Label>
          <Select
            className={cn(diningSelectClass, "mt-1")}
            value={m.channel}
            onChange={(e) =>
              setM({ ...m, channel: e.target.value as SellingMenu["channel"] })
            }
          >
            <option value="all">POS + QR</option>
            <option value="pos">POS only</option>
            <option value="qr">QR / online only</option>
          </Select>
        </div>
        <div>
          <Label>Outlet</Label>
          <Select
            className={cn(diningSelectClass, "mt-1")}
            value={m.locationId ?? ""}
            onChange={(e) => setM({ ...m, locationId: e.target.value || null })}
          >
            <option value="">All outlets</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={m.isActive}
          onChange={(e) => setM({ ...m, isActive: e.target.checked })}
        />
        Active
      </label>
      <div>
        <Label>Schedule (optional)</Label>
        <div className="mt-1 flex flex-wrap gap-1">
          {DAYS.map((d, i) => (
            <button
              key={d}
              type="button"
              onClick={() =>
                setM({
                  ...m,
                  days: m.days.includes(i)
                    ? m.days.filter((x) => x !== i)
                    : [...m.days, i],
                })
              }
              className={cn(
                "rounded-md px-2 py-1 text-[0.7rem] font-semibold ring-1",
                m.days.includes(i)
                  ? "bg-[#1a56db] text-white ring-[#1a56db]"
                  : "bg-white text-[#5a6b7d] ring-[#e2e8f0]",
              )}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Input
            type="time"
            value={m.startTime ?? ""}
            onChange={(e) => setM({ ...m, startTime: e.target.value || null })}
          />
          <Input
            type="time"
            value={m.endTime ?? ""}
            onChange={(e) => setM({ ...m, endTime: e.target.value || null })}
          />
        </div>
      </div>
      <div>
        <Label>Categories on this list</Label>
        <div className="mt-1 max-h-36 space-y-1 overflow-y-auto rounded-lg border border-[#e2e8f0] p-2">
          {categories.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={m.categoryIds.includes(c.id)}
                onChange={(e) =>
                  setM({
                    ...m,
                    categoryIds: e.target.checked
                      ? [...m.categoryIds, c.id]
                      : m.categoryIds.filter((id) => id !== c.id),
                  })
                }
              />
              {c.name}
            </label>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Back
        </Button>
        <Button
          type="button"
          disabled={!m.name.trim()}
          onClick={() => onSave({ ...m, name: m.name.trim() })}
        >
          Add to lists
        </Button>
      </div>
    </div>
  );
}

function AddonsModal({
  groups,
  onClose,
  onChanged,
}: {
  groups: Awaited<ReturnType<typeof restaurantApi.modifiers>>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState("Toppings");
  const [optionName, setOptionName] = useState("");
  const [optionPrice, setOptionPrice] = useState("0");
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const create = useMutation({
    mutationFn: () => restaurantApi.createModifierGroup({ name: name.trim() }),
    onSuccess: () => {
      toast.success("Add-on group created");
      setName("");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const addOpt = useMutation({
    mutationFn: () =>
      restaurantApi.addModifierOption(groupId, {
        name: optionName.trim(),
        priceDelta: Number(optionPrice) || 0,
      }),
    onSuccess: () => {
      toast.success("Option added");
      setOptionName("");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <ModalFrame
      title="Add-ons / modifiers"
      subtitle="Toppings, extras, and size choices. Attach them to an item from Availability."
      onClose={onClose}
      className="max-w-lg"
    >
      <div className="grid gap-4">
        <div className="flex gap-2">
          <Input
            placeholder="Group name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            type="button"
            disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            Add group
          </Button>
        </div>
        <ul className="max-h-40 space-y-2 overflow-y-auto text-sm">
          {groups.map((g) => (
            <li key={g.id} className="rounded-lg border border-[#eef1f4] p-2">
              <p className="font-medium text-[#0b1f33]">{g.name}</p>
              <p className="text-xs text-[#8b9bb0]">
                {g.options.map((o) => o.name).join(", ") || "No options yet"}
              </p>
            </li>
          ))}
        </ul>
        {groups.length ? (
          <div className="grid gap-2">
            <Label>New option</Label>
            <Select
              className={diningSelectClass}
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
            <div className="flex gap-2">
              <Input
                placeholder="Name"
                value={optionName}
                onChange={(e) => setOptionName(e.target.value)}
              />
              <Input
                className="w-24"
                placeholder="Price"
                value={optionPrice}
                onChange={(e) => setOptionPrice(e.target.value)}
              />
              <Button
                type="button"
                disabled={!groupId || !optionName.trim() || addOpt.isPending}
                onClick={() => addOpt.mutate()}
              >
                Add
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </ModalFrame>
  );
}

function ItemAvailModal({
  product,
  groups,
  canAddons,
  onClose,
  onSaved,
}: {
  product: NonNullable<
    Awaited<ReturnType<typeof catalogApi.listProducts>>["items"]
  >[number];
  groups: Awaited<ReturnType<typeof restaurantApi.modifiers>>;
  canAddons: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pos, setPos] = useState(product.availableInPos !== false);
  const [rate, setRate] = useState(
    String(product.sellingPrice ?? product.basePrice ?? ""),
  );
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const save = useMutation({
    mutationFn: () =>
      catalogApi.updateProduct(product.id, {
        availableInPos: pos,
        ...(Number.isFinite(Number(rate)) && rate.trim() !== ""
          ? { basePrice: Number(rate) }
          : {}),
      }),
    onSuccess: () => {
      toast.success("Availability saved");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const attach = useMutation({
    mutationFn: () => restaurantApi.attachModifier(product.id, groupId),
    onSuccess: () => toast.success("Add-on group attached"),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <ModalFrame
      title={product.name}
      subtitle="POS/QR availability and rate. Images, tax, variants, combos, and description stay on Edit item."
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </div>
      }
    >
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={pos}
          onChange={(e) => setPos(e.target.checked)}
        />
        Available on POS (and QR when that capability is on)
      </label>
      <div className="mt-4">
        <Label>Rate</Label>
        <Input
          className="mt-1"
          inputMode="decimal"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
        />
      </div>
      {canAddons && groups.length ? (
        <div className="mt-4 grid gap-2">
          <Label>Attach add-on group</Label>
          <div className="flex gap-2">
            <Select
              className={cn(diningSelectClass, "flex-1")}
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              variant="secondary"
              disabled={!groupId || attach.isPending}
              onClick={() => attach.mutate()}
            >
              Attach
            </Button>
          </div>
        </div>
      ) : null}
      <p className="mt-3 text-xs text-[#8b9bb0]">
        <Link href={`/catalog/new?id=${product.id}`} className="text-[#1a56db]">
          Open full item
        </Link>{" "}
        for description, tax, packaging is shop-level on Setup, combo lines, and
        variants.
      </p>
    </ModalFrame>
  );
}
