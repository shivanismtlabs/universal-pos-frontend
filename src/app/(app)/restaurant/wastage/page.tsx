"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { catalogApi, restaurantApi, tenantsApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { DiningPanel, DiningShell, diningSelectClass } from "@/components/dining-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

const REASONS = [
  { id: "spoilage", label: "Spoilage" },
  { id: "overproduction", label: "Overproduction" },
  { id: "burnt", label: "Burnt" },
  { id: "damaged", label: "Damaged" },
  { id: "expired", label: "Expired" },
  { id: "complimentary", label: "Complimentary" },
  { id: "staff_meal", label: "Staff meal" },
  { id: "other", label: "Other" },
];

export default function WastagePage() {
  const qc = useQueryClient();
  const { hasCapability } = useBootstrap();
  const allowed = hasCapability("WASTAGE");
  const locs = useQuery({
    queryKey: ["locations"],
    queryFn: () => tenantsApi.listLocations(),
    enabled: allowed,
  });
  const items = useQuery({
    queryKey: ["catalog-products-all"],
    queryFn: () => catalogApi.listProducts({ limit: 200 }),
    enabled: allowed,
  });
  const rows = useQuery({
    queryKey: ["restaurant-wastage"],
    queryFn: () => restaurantApi.wastage(),
    enabled: allowed,
  });

  const [locationId, setLocationId] = useState("");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("spoilage");
  const [notes, setNotes] = useState("");

  const record = useMutation({
    mutationFn: () =>
      restaurantApi.recordWastage({
        locationId,
        productId,
        qty: Number(qty),
        reason,
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      setQty("1");
      setNotes("");
      void qc.invalidateQueries({ queryKey: ["restaurant-wastage"] });
      toast.success("Wastage posted to stock ledger");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!allowed) {
    return (
      <DiningShell title="Wastage" subtitle="Wastage needs the Wastage capability.">
        <p className="text-sm text-[#5a6b7d]">This shop does not have Wastage enabled.</p>
      </DiningShell>
    );
  }

  const locations = locs.data ?? [];

  return (
    <DiningShell
      title="Wastage"
      subtitle="Spoilage, comps, and staff meals write off ingredient stock through the same ledger as inventory."
    >
      <DiningPanel title="Record">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <Label>Location</Label>
          <Select
            className={`${diningSelectClass} mt-1`}
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
          >
            <option value="">Select…</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Item</Label>
            <Select
              className={`${diningSelectClass} mt-1`}
              value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">Select…</option>
            {(items.data?.items ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.skuCode})
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Qty</Label>
          <Input value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <div>
          <Label>Reason</Label>
            <Select
              className={`${diningSelectClass} mt-1`}
              value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            {REASONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="sm:col-span-2 lg:col-span-1">
          <Label>Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="flex items-end">
          <Button disabled={record.isPending} onClick={() => record.mutate()}>
            Record wastage
          </Button>
        </div>
        </div>
      </DiningPanel>

      <DiningPanel title="Ledger">
        <table className="w-full text-left text-sm">
          <thead className="text-[0.68rem] uppercase tracking-wide text-[#8b9bb0]">
            <tr>
              <th className="pb-2 font-semibold">When</th>
              <th className="pb-2 font-semibold">Item</th>
              <th className="pb-2 font-semibold">Qty</th>
              <th className="pb-2 font-semibold">Reason</th>
              <th className="pb-2 font-semibold">Staff</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eef1f4]">
            {(rows.data ?? []).map((r) => (
              <tr key={r.id}>
                <td className="py-2 text-[#5a6b7d]">
                  {new Date(r.createdAt).toLocaleString()}
                </td>
                <td className="py-2">
                  {r.product.name ?? r.product.id}
                  {r.product.skuCode ? (
                    <span className="ml-1 font-mono text-xs text-[#8b9bb0]">
                      {r.product.skuCode}
                    </span>
                  ) : null}
                </td>
                <td className="py-2 tabular-nums">
                  {r.qty} {r.unit ?? ""}
                </td>
                <td className="py-2 capitalize">{r.reason.replaceAll("_", " ")}</td>
                <td className="py-2">{r.actor?.name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.data?.length ? (
          <p className="py-4 text-sm text-[#5a6b7d]">No wastage recorded.</p>
        ) : null}
      </DiningPanel>
    </DiningShell>
  );
}
