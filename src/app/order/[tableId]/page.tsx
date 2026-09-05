"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiRequest } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { ModalFrame } from "@/components/modal-frame";
import { cn } from "@/lib/utils";

type ModGroup = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  required: boolean;
  options: Array<{ id: string; name: string; priceDelta: number }>;
};

type MenuItem = {
  stockLevelId: string;
  name: string;
  price: number;
  photoUrl?: string | null;
  category: string;
  soldOut: boolean;
  modifierGroups: ModGroup[];
};

type Menu = {
  name: string;
  shop: string;
  payAtCounter?: boolean;
  items: MenuItem[];
};

type CartLine = {
  key: string;
  stockLevelId: string;
  name: string;
  unit: number;
  quantity: number;
  modifiers: string[];
};

export default function GuestQrOrderPage() {
  const qrToken = String(useParams().tableId ?? "");
  const [guestName, setGuestName] = useState("");
  const [cat, setCat] = useState("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [pick, setPick] = useState<MenuItem | null>(null);
  const [lastOrder, setLastOrder] = useState<string | null>(null);

  const menu = useQuery({
    queryKey: ["qr-menu", qrToken],
    queryFn: () => apiRequest<Menu>(`/public/dining/t/${qrToken}`),
    enabled: Boolean(qrToken),
  });

  const categories = useMemo(() => {
    const set = new Set((menu.data?.items ?? []).map((i) => i.category));
    return ["all", ...[...set].sort()];
  }, [menu.data?.items]);

  const visible = (menu.data?.items ?? []).filter(
    (i) => cat === "all" || i.category === cat,
  );

  const total = cart.reduce((s, l) => s + l.unit * l.quantity, 0);

  const place = useMutation({
    mutationFn: () =>
      apiRequest<{ orderNumber: string }>(
        `/public/dining/t/${qrToken}/order`,
        {
          method: "POST",
          body: {
            guestName: guestName.trim() || undefined,
            items: cart.map((l) => ({
              stockLevelId: l.stockLevelId,
              quantity: l.quantity,
              modifiers: l.modifiers,
            })),
          },
        },
      ),
    onSuccess: (r) => {
      toast.success(`${r.orderNumber} sent to kitchen`);
      setLastOrder(r.orderNumber);
      setCart([]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function addPlain(it: MenuItem) {
    if (it.soldOut) return;
    if (it.modifierGroups.length) {
      setPick(it);
      return;
    }
    setCart((cur) => {
      const hit = cur.find(
        (l) => l.stockLevelId === it.stockLevelId && !l.modifiers.length,
      );
      if (hit) {
        return cur.map((l) =>
          l.key === hit.key ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [
        ...cur,
        {
          key: `${it.stockLevelId}-${Date.now()}`,
          stockLevelId: it.stockLevelId,
          name: it.name,
          unit: it.price,
          quantity: 1,
          modifiers: [],
        },
      ];
    });
  }

  if (menu.isError) {
    return (
      <div className="min-h-dvh bg-[#f4f6f8] px-4 py-10">
        <div className="mx-auto max-w-md rounded-xl border border-[#e2e8f0] bg-white p-6 text-center">
          <p className="text-sm font-semibold text-[#0b1f33]">
            This QR is not valid
          </p>
          <p className="mt-1 text-sm text-[#5a6b7d]">
            Ask staff for a table QR, and check that QR ordering is on.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#f4f6f8]">
      <header className="border-b border-[#e2e8f0] bg-white px-4 py-4">
        <div className="mx-auto max-w-lg">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#1a56db]">
            Digital menu
          </p>
          <h1 className="mt-1 text-xl font-semibold text-[#0b1f33]">
            {menu.data?.shop ?? "Menu"}
          </h1>
          <p className="text-sm text-[#5a6b7d]">
            Table {menu.data?.name ?? "—"} · kitchen gets your order · pay at
            the counter
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-3 px-4 py-4 pb-28">
        {lastOrder ? (
          <p className="rounded-lg border border-[#bbf7d0] bg-[#ecfdf3] px-3 py-2 text-sm text-[#166534]">
            {lastOrder} is with the kitchen. Add more from this table anytime.
          </p>
        ) : null}
        <input
          className="h-10 w-full rounded-lg border border-[#d9e0ea] bg-white px-3 text-sm outline-none focus:border-[#1a56db]"
          placeholder="Your name (optional)"
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
        />
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold ring-1",
                cat === c
                  ? "bg-[#1a56db] text-white ring-[#1a56db]"
                  : "bg-white text-[#5a6b7d] ring-[#e2e8f0]",
              )}
            >
              {c === "all" ? "All" : c}
            </button>
          ))}
        </div>
        <ul className="overflow-hidden rounded-xl border border-[#e2e8f0] bg-white">
          {visible.map((it, i) => (
            <li
              key={it.stockLevelId}
              className={cn(
                "flex items-center gap-3 px-3 py-3",
                i > 0 ? "border-t border-[#eef1f4]" : "",
                it.soldOut ? "opacity-55" : "",
              )}
            >
              {it.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={it.photoUrl}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="h-12 w-12 shrink-0 rounded-lg bg-[#f1f5f9]" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[#0b1f33]">
                  {it.name}
                </p>
                <p className="text-xs tabular-nums text-[#5a6b7d]">
                  {it.soldOut
                    ? "Sold out"
                    : `${it.price.toFixed(2)}${it.modifierGroups.length ? " · add-ons" : ""}`}
                </p>
              </div>
              <Button
                className="h-8 shrink-0 px-3"
                disabled={it.soldOut}
                onClick={() => addPlain(it)}
              >
                Add
              </Button>
            </li>
          ))}
        </ul>
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t border-[#e2e8f0] bg-white px-4 py-3">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-[#8b9bb0]">
              {cart.length} item{cart.length === 1 ? "" : "s"} · pay at counter
            </p>
            <p className="text-base font-semibold tabular-nums text-[#0b1f33]">
              {total.toFixed(2)}
            </p>
          </div>
          <Button
            className="min-w-[9rem]"
            disabled={!cart.length || place.isPending}
            onClick={() => place.mutate()}
          >
            Send to kitchen
          </Button>
        </div>
      </div>

      {pick ? (
        <AddonModal
          item={pick}
          onClose={() => setPick(null)}
          onAdd={(line) => {
            setCart((cur) => [...cur, line]);
            setPick(null);
          }}
        />
      ) : null}
    </div>
  );
}

function AddonModal({
  item,
  onClose,
  onAdd,
}: {
  item: MenuItem;
  onClose: () => void;
  onAdd: (line: CartLine) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const extra = item.modifierGroups.reduce((s, g) => {
    return (
      s +
      g.options
        .filter((o) => picked.includes(o.name))
        .reduce((n, o) => n + o.priceDelta, 0)
    );
  }, 0);

  function toggle(g: ModGroup, name: string) {
    setPicked((cur) => {
      const inGroup = g.options.map((o) => o.name);
      const next = cur.filter((n) => !inGroup.includes(n) || n === name);
      if (cur.includes(name)) {
        return cur.filter((n) => n !== name);
      }
      const count = next.filter((n) => inGroup.includes(n)).length;
      if (g.maxSelect > 0 && count >= g.maxSelect) {
        const without = cur.filter((n) => !inGroup.includes(n));
        return [...without, name];
      }
      return [...cur, name];
    });
  }

  const missing = item.modifierGroups.some((g) => {
    const n = g.options.filter((o) => picked.includes(o.name)).length;
    return (g.required || g.minSelect > 0) && n < Math.max(g.minSelect, 1);
  });

  return (
    <ModalFrame
      title={item.name}
      subtitle="Choose add-ons, then add to your order"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={missing}
            onClick={() =>
              onAdd({
                key: `${item.stockLevelId}-${picked.join("|")}-${Date.now()}`,
                stockLevelId: item.stockLevelId,
                name: item.name,
                unit: item.price + extra,
                quantity: 1,
                modifiers: picked,
              })
            }
          >
            Add · {(item.price + extra).toFixed(2)}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {item.modifierGroups.map((g) => (
          <div key={g.id}>
            <p className="text-sm font-semibold text-[#0b1f33]">{g.name}</p>
            <p className="text-[0.7rem] text-[#8b9bb0]">
              {g.required ? "Required" : "Optional"}
            </p>
            <div className="mt-2 space-y-1.5">
              {g.options.map((o) => {
                const on = picked.includes(o.name);
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => toggle(g, o.name)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm",
                      on
                        ? "border-[#1a56db] bg-[#eff6ff] text-[#1a56db]"
                        : "border-[#e2e8f0] bg-white",
                    )}
                  >
                    <span>{o.name}</span>
                    <span className="tabular-nums">
                      {o.priceDelta ? `+${o.priceDelta.toFixed(2)}` : "—"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </ModalFrame>
  );
}
