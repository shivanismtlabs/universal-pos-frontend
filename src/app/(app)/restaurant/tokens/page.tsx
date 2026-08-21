"use client";

import { useQuery } from "@tanstack/react-query";
import { restaurantApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import {
  DiningEmpty,
  DiningPanel,
  DiningShell,
  DiningStatusBadge,
} from "@/components/dining-chrome";

export default function TokensPage() {
  const { hasCapability } = useBootstrap();
  const allowed = hasCapability("TOKEN");
  const q = useQuery({
    queryKey: ["dining-tokens"],
    queryFn: () => restaurantApi.tokens(),
    enabled: allowed,
    refetchInterval: 8_000,
  });

  if (!allowed) {
    return (
      <DiningShell
        title="Tokens"
        subtitle="Enable Token / QSR in Capabilities, then turn on token management in Setup."
      >
        <DiningEmpty title="Tokens are off for this shop" />
      </DiningShell>
    );
  }

  const list = q.data ?? [];

  return (
    <DiningShell
      title="Tokens"
      subtitle="Takeaway and pickup tokens for today. Assigned when the dining order is opened — not at KOT."
    >
      <DiningPanel title="Today">
        {!list.length ? (
          <DiningEmpty
            title="No tokens yet"
            detail="Open a takeaway or pickup order with token management on."
          />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-[0.68rem] uppercase tracking-wide text-[#8b9bb0]">
              <tr>
                <th className="pb-2 font-semibold">Token</th>
                <th className="pb-2 font-semibold">Order</th>
                <th className="pb-2 font-semibold">Mode</th>
                <th className="pb-2 font-semibold">Guest</th>
                <th className="pb-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef1f4]">
              {list.map((r) => (
                <tr key={r.orderId}>
                  <td className="py-2.5 text-xl font-semibold tabular-nums text-[#0b1f33]">
                    {r.tokenNumber}
                  </td>
                  <td className="py-2.5 font-mono text-xs text-[#1a56db]">
                    {r.orderNumber}
                  </td>
                  <td className="py-2.5 capitalize text-[#5a6b7d]">
                    {r.diningMode.replaceAll("_", " ")}
                  </td>
                  <td className="py-2.5 text-[#0b1f33]">
                    {r.guestName ?? r.tableName ?? "—"}
                  </td>
                  <td className="py-2.5">
                    <DiningStatusBadge value={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DiningPanel>
    </DiningShell>
  );
}
