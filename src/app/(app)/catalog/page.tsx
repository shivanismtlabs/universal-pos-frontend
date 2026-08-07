"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { posApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { canRefund } from "@/lib/roles";
import { useAuthStore } from "@/lib/auth-store";
import { Button } from "@/components/ui/button";
import { FloorTabs } from "@/components/getting-started";
import { SaleReturnDialog } from "@/components/sale-return-dialog";
import RetailPosWorkstation from "@/app/(app)/pos/retail-pos-workstation";
import { SaleStockPanel } from "@/app/(app)/dashboard/sale-stock-panel";
import { PageHeader } from "@/components/page-header";
import { ModeBadge } from "@/components/mode-badge";

type MainTab = "inventory" | "pos" | "sales";

/**
 * Products hub — inventory uses full SaleStockPanel (photos, multi-image, edit).
 */
export default function CatalogPage() {
  const { money } = useBootstrap();
  const roles = useAuthStore((s) => s.user?.roles);
  const allowReturn = canRefund(roles);

  const [tab, setTab] = useState<MainTab>("inventory");
  const [posKey, setPosKey] = useState(0);
  const [returnTarget, setReturnTarget] = useState<{
    id: string;
    orderNumber: string;
  } | null>(null);

  const recent = useQuery({
    queryKey: ["pos-sale-recent"],
    queryFn: () => posApi.listRecentSales(25),
    enabled: tab === "sales",
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Products"
        description="Single place to manage what you sell — these items show up on the counter."
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
        <SaleStockPanel
          onAdded={() => {
            setPosKey((k) => k + 1);
          }}
        />
      ) : null}

      {tab === "pos" ? <RetailPosWorkstation key={posKey} compact /> : null}

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
              <li className="px-4 py-12 text-center text-sm text-[#5a6b7d]">
                No sales yet — charge from Point of Sale.
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
