"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { catalogApi, restaurantApi, tenantsApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
      <div className="p-6 text-sm text-[#5a6b7d]">
        Wastage needs the Wastage capability.
      </div>
    );
  }

  const locations = locs.data ?? [];

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Wastage"
        subtitle="Spoilage, comps, and staff meals write off ingredient stock through the same ledger as inventory."
      />

      <section className="rounded-xl border border-[#e2e8f0] bg-white p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <Label>Location</Label>
          <select
            className="mt-1 h-9 w-full rounded-md border border-[#d9e0ea] px-2 text-sm"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
          >
            <option value="">Select…</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Item</Label>
          <select
            className="mt-1 h-9 w-full rounded-md border border-[#d9e0ea] px-2 text-sm"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">Select…</option>
            {(items.data?.items ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.skuCode})
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Qty</Label>
          <Input value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <div>
          <Label>Reason</Label>
          <select
            className="mt-1 h-9 w-full rounded-md border border-[#d9e0ea] px-2 text-sm"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            {REASONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
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
      </section>

      <section className="overflow-hidden rounded-xl border border-[#e2e8f0] bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#f7f9fc] text-[0.68rem] uppercase tracking-wide text-[#8b9bb0]">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">Qty</th>
              <th className="px-3 py-2">Reason</th>
              <th className="px-3 py-2">Staff</th>
            </tr>
          </thead>
          <tbody>
            {(rows.data ?? []).map((r) => (
              <tr key={r.id} className="border-t border-[#eef1f4]">
                <td className="px-3 py-2 text-[#5a6b7d]">
                  {new Date(r.createdAt).toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  {r.product.name ?? r.product.id}
                  {r.product.skuCode ? (
                    <span className="ml-1 font-mono text-xs text-[#8b9bb0]">
                      {r.product.skuCode}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {r.qty} {r.unit ?? ""}
                </td>
                <td className="px-3 py-2">{r.reason}</td>
                <td className="px-3 py-2">{r.actor?.name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.data?.length ? (
          <p className="px-3 py-6 text-sm text-[#5a6b7d]">No wastage recorded.</p>
        ) : null}
      </section>
    </div>
  );
}
