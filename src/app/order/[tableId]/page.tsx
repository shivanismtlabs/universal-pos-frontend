"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiRequest } from "@/lib/api/client";
import { Button } from "@/components/ui/button";

type Menu = {
  name: string;
  shop: string;
  items: Array<{
    stockLevelId: string;
    name: string;
    sku: string;
    price: number;
  }>;
};

export default function GuestQrOrderPage() {
  const qrToken = String(useParams().tableId ?? "");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [guestName, setGuestName] = useState("");

  const menu = useQuery({
    queryKey: ["qr-menu", qrToken],
    queryFn: () => apiRequest<Menu>(`/public/dining/t/${qrToken}`),
    enabled: Boolean(qrToken),
  });

  const cart = useMemo(
    () =>
      Object.entries(qty)
        .filter(([, n]) => n > 0)
        .map(([stockLevelId, quantity]) => ({ stockLevelId, quantity })),
    [qty],
  );

  const total = useMemo(() => {
    const items = menu.data?.items ?? [];
    return cart.reduce((sum, line) => {
      const it = items.find((i) => i.stockLevelId === line.stockLevelId);
      return sum + (it ? it.price * line.quantity : 0);
    }, 0);
  }, [cart, menu.data?.items]);

  const place = useMutation({
    mutationFn: () =>
      apiRequest<{ orderNumber: string; postedInventory: boolean }>(
        `/public/dining/t/${qrToken}/order`,
        {
          method: "POST",
          body: { items: cart, guestName: guestName.trim() || undefined },
        },
      ),
    onSuccess: (r) => {
      toast.success(
        `Order ${r.orderNumber} sent. Staff will bill at the counter.`,
      );
      setQty({});
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (menu.isError) {
    return (
      <div className="min-h-dvh bg-[#f4f6f8] px-4 py-10">
        <div className="mx-auto max-w-md rounded-xl border border-[#e2e8f0] bg-white p-6 text-center">
          <p className="text-sm font-semibold text-[#0b1f33]">
            This QR link is not valid
          </p>
          <p className="mt-1 text-sm text-[#5a6b7d]">
            Ask staff for a new table QR, or check that QR ordering is on.
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
            Universal POS
          </p>
          <h1 className="mt-1 text-xl font-semibold text-[#0b1f33]">
            {menu.data?.shop ?? "Menu"}
          </h1>
          <p className="text-sm text-[#5a6b7d]">
            Table {menu.data?.name ?? "—"} · order goes to the kitchen, billed at
            the counter
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-3 px-4 py-4 pb-28">
        <input
          className="h-10 w-full rounded-lg border border-[#d9e0ea] bg-white px-3 text-sm outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/15"
          placeholder="Your name (optional)"
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
        />
        <ul className="overflow-hidden rounded-xl border border-[#e2e8f0] bg-white">
          {(menu.data?.items ?? []).map((it, i) => (
            <li
              key={it.stockLevelId}
              className={
                i === 0
                  ? "flex items-center justify-between px-3 py-3"
                  : "flex items-center justify-between border-t border-[#eef1f4] px-3 py-3"
              }
            >
              <div className="min-w-0 pr-3">
                <p className="truncate text-sm font-medium text-[#0b1f33]">
                  {it.name}
                </p>
                <p className="text-xs tabular-nums text-[#5a6b7d]">
                  {it.price.toFixed(2)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  variant="secondary"
                  className="h-8 w-8 p-0"
                  onClick={() =>
                    setQty((p) => ({
                      ...p,
                      [it.stockLevelId]: Math.max(
                        0,
                        (p[it.stockLevelId] ?? 0) - 1,
                      ),
                    }))
                  }
                >
                  −
                </Button>
                <span className="w-6 text-center text-sm tabular-nums">
                  {qty[it.stockLevelId] ?? 0}
                </span>
                <Button
                  className="h-8 w-8 p-0"
                  onClick={() =>
                    setQty((p) => ({
                      ...p,
                      [it.stockLevelId]: (p[it.stockLevelId] ?? 0) + 1,
                    }))
                  }
                >
                  +
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t border-[#e2e8f0] bg-white px-4 py-3">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-[#8b9bb0]">{cart.length} items</p>
            <p className="text-base font-semibold tabular-nums text-[#0b1f33]">
              {total.toFixed(2)}
            </p>
          </div>
          <Button
            className="min-w-[9rem]"
            disabled={!cart.length || place.isPending}
            onClick={() => place.mutate()}
          >
            Place order
          </Button>
        </div>
      </div>
    </div>
  );
}
