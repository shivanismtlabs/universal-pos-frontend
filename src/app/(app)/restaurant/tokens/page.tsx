"use client";

import { useQuery } from "@tanstack/react-query";
import { restaurantApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { PageHeader } from "@/components/page-header";

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
      <div className="p-6 text-sm text-[#5a6b7d]">
        Enable Token / QSR in Capabilities, then turn on token management in Dining setup.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Tokens"
        subtitle="Takeaway / pickup tokens for today. Assigned when the dining order is opened — not at KOT."
      />
      <table className="w-full text-left text-sm">
        <thead className="bg-[#f7f9fc] text-[0.68rem] uppercase text-[#8b9bb0]">
          <tr>
            <th className="px-3 py-2">Token</th>
            <th className="px-3 py-2">Order</th>
            <th className="px-3 py-2">Mode</th>
            <th className="px-3 py-2">Guest</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {(q.data ?? []).map((r) => (
            <tr key={r.orderId} className="border-t border-[#eef1f4]">
              <td className="px-3 py-2 text-lg font-semibold tabular-nums">
                {r.tokenNumber}
              </td>
              <td className="px-3 py-2 font-mono text-xs">{r.orderNumber}</td>
              <td className="px-3 py-2">{r.diningMode}</td>
              <td className="px-3 py-2">{r.guestName ?? r.tableName ?? "—"}</td>
              <td className="px-3 py-2">{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!q.data?.length ? (
        <p className="text-sm text-[#5a6b7d]">No tokens yet today.</p>
      ) : null}
    </div>
  );
}
