"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { posApi } from "@/lib/api";
import { ReceiptModal, type ReceiptData } from "@/components/receipt-modal";
import { useBootstrap } from "@/lib/bootstrap";
import { Button } from "@/components/ui/button";
import { FloorTabs } from "@/components/getting-started";
import { SaleReturnDialog } from "@/components/sale-return-dialog";
import RetailPosWorkstation from "@/app/(app)/counter/retail-pos-workstation";
import { canRefund } from "@/lib/roles";
import { useAuthStore } from "@/lib/auth-store";

type Tab = "stock" | "sell" | "recent";

/**
 * Sale floor: Catalog link / Sell / Sales.
 * Catalog editing lives under Inventory → Items (not duplicated on Home).
 */
export function SaleDashboard({ embed = false }: { embed?: boolean }) {
  const { productName, money } = useBootstrap();
  const userRoles = useAuthStore((s) => s.user?.roles);
  const allowReturn = canRefund(userRoles);
  const [tab, setTab] = useState<Tab>("sell");
  const [posKey, setPosKey] = useState(0);
  const [tabTouched, setTabTouched] = useState(false);
  const [returnTarget, setReturnTarget] = useState<{
    id: string;
    orderNumber: string;
  } | null>(null);
  const [reprint, setReprint] = useState<ReceiptData | null>(null);

  const floor = useQuery({
    queryKey: ["pos-sale-floor"],
    queryFn: () => posApi.saleFloor(),
  });

  const recent = useQuery({
    queryKey: ["pos-sale-recent"],
    queryFn: () => posApi.listRecentSales(25),
    enabled: tab === "recent",
  });

  const counts = floor.data?.counts;
  const hasProducts = (counts?.products ?? 0) > 0;
  const hasStock = (counts?.inStock ?? 0) > 0;

  useEffect(() => {
    if (tabTouched || floor.isLoading) return;
    setTab(hasStock || hasProducts ? "sell" : "stock");
  }, [tabTouched, floor.isLoading, hasStock, hasProducts]);

  function goTab(id: Tab) {
    setTabTouched(true);
    setTab(id);
  }

  const tabHint =
    tab === "stock"
      ? "Catalog is under Inventory → Items"
      : tab === "sell"
        ? "Process sales at the counter"
        : "Recent closed sales";

  return (
    <div className="space-y-4">
      {!embed ? (
        <header>
          <h1 className="text-xl font-bold tracking-tight text-[#0b1f33] sm:text-2xl">
            {productName}
          </h1>
          <p className="mt-1 text-sm text-[#5a6b7d]">{tabHint}</p>
        </header>
      ) : (
        <p className="text-sm text-[#5a6b7d]">{tabHint}</p>
      )}

      <FloorTabs
        value={tab}
        onChange={goTab}
        tabs={[
          { id: "stock", label: "Catalog" },
          { id: "sell", label: "Sell" },
          { id: "recent", label: "Sales" },
        ]}
      />

      {tab === "sell" ? (
        <RetailPosWorkstation key={posKey} compact />
      ) : null}

      {tab === "stock" ? (
        <div className="rounded-xl border border-[#d9e0ea] bg-white p-6">
          <h2 className="text-base font-semibold text-[#0b1f33]">
            Product catalog
          </h2>
          <p className="mt-1 max-w-xl text-sm text-[#5a6b7d]">
            Items, categories, and brands are managed once under Inventory —
            not repeated on Home. Use Sell to take payments.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/catalog">Open Items</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/catalog/new">New Item</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/catalog?tab=categories">Categories</Link>
            </Button>
            <Button
              type="button"
              variant="soft"
              onClick={() => {
                setPosKey((k) => k + 1);
                goTab("sell");
              }}
            >
              Go to Sell
            </Button>
          </div>
        </div>
      ) : null}

      {tab === "recent" ? (
        <section className="rounded-xl border border-[#d9e0ea] bg-white">
          <div className="border-b border-[#eef1f4] px-4 py-3">
            <h2 className="text-[0.9375rem] font-semibold text-[#0b1f33]">
              Recent sales
            </h2>
            <p className="mt-0.5 text-[0.75rem] text-[#5a6b7d]">
              {allowReturn
                ? "Return restocks and refunds the ticket."
                : "Ask a manager for returns."}
            </p>
          </div>
          <ul className="divide-y divide-[#eef1f4]">
            {(recent.data?.items ?? []).map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-semibold text-[#0b1f33]">{o.orderNumber}</p>
                  <p className="text-[0.75rem] text-[#5a6b7d]">
                    {money(o.total ?? o.subtotal)}
                    {" · "}
                    {o.customerName}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      try {
                        const data = await posApi.receipt(o.id);
                        setReprint(data as ReceiptData);
                      } catch (e) {
                        toast.error(
                          e instanceof Error ? e.message : "Could not load bill",
                        );
                      }
                    }}
                  >
                    Reprint
                  </Button>
                  {allowReturn ? (
                  <Button
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
            {!recent.data?.items?.length ? (
              <li className="px-4 py-8 text-center text-sm text-[#8b9bb0]">
                No recent sales
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
      {reprint ? (
        <ReceiptModal data={reprint} onClose={() => setReprint(null)} />
      ) : null}
    </div>
  );
}
