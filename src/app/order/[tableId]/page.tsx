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
      toast.success(`Order ${r.orderNumber} sent. Staff will bill at the counter.`);
      setQty({});
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (menu.isError) {
    return (
      <div className="mx-auto max-w-lg p-6 text-sm text-[#5a6b7d]">
        This QR link is invalid or QR ordering is off.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
      <h1 className="text-xl font-semibold text-[#0b1f33]">
        {menu.data?.shop ?? "Menu"}
      </h1>
      <p className="text-sm text-[#5a6b7d]">Table {menu.data?.name}</p>
      <input
        className="h-10 w-full rounded-md border border-[#d9e0ea] px-3 text-sm"
        placeholder="Your name (optional)"
        value={guestName}
        onChange={(e) => setGuestName(e.target.value)}
      />
      <ul className="space-y-2">
        {(menu.data?.items ?? []).map((it) => (
          <li
            key={it.stockLevelId}
            className="flex items-center justify-between rounded-lg border border-[#e2e8f0] bg-white px-3 py-2"
          >
            <div>
              <p className="text-sm font-medium">{it.name}</p>
              <p className="text-xs tabular-nums text-[#5a6b7d]">{it.price.toFixed(2)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={() =>
                  setQty((p) => ({
                    ...p,
                    [it.stockLevelId]: Math.max(0, (p[it.stockLevelId] ?? 0) - 1),
                  }))
                }
              >
                −
              </Button>
              <span className="w-6 text-center tabular-nums">
                {qty[it.stockLevelId] ?? 0}
              </span>
              <Button
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
      <Button
        className="w-full"
        disabled={!cart.length || place.isPending}
        onClick={() => place.mutate()}
      >
        Place order
      </Button>
    </div>
  );
}
