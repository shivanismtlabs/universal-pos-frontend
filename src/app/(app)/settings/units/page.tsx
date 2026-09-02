"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { catalogApi, tenantsApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { useAuthStore } from "@/lib/auth-store";
import { canManageStaff } from "@/lib/roles";
import { unwrapUnits } from "@/lib/measure-units";
import { TablePager } from "@/components/table-pager";

const PAGE_SIZE = 15;

export default function UnitsSettingsPage() {
  const qc = useQueryClient();
  const roles = useAuthStore((s) => s.user?.roles);
  const canEdit = canManageStaff(roles);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [decimalQty, setDecimalQty] = useState(false);
  const [page, setPage] = useState(1);

  const unitsQ = useQuery({
    queryKey: ["measure-units"],
    queryFn: () => tenantsApi.listUnits(),
  });

  const suggestQ = useQuery({
    queryKey: ["uom-country-suggest"],
    queryFn: () => catalogApi.suggestTenantUomUnits(),
    retry: 1,
  });

  const rows = useMemo(() => unwrapUnits(unitsQ.data), [unitsQ.data]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paged = rows.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const createU = useMutation({
    mutationFn: () =>
      tenantsApi.createUnit({
        code: code.trim(),
        name: name.trim(),
        decimalQty,
      }),
    onSuccess: async () => {
      toast.success("Unit added");
      setCode("");
      setName("");
      setDecimalQty(false);
      await qc.invalidateQueries({ queryKey: ["measure-units"] });
    },
    onError: (e) => {
      toast.error(
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Could not add unit",
      );
    },
  });

  const patchU = useMutation({
    mutationFn: (body: {
      code: string;
      name?: string;
      decimalQty?: boolean;
      active?: boolean;
    }) => tenantsApi.updateUnit(body.code, body),
    onSuccess: async () => {
      toast.success("Unit updated");
      await qc.invalidateQueries({ queryKey: ["measure-units"] });
    },
    onError: (e) => {
      toast.error(
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Could not update",
      );
    },
  });

  const delU = useMutation({
    mutationFn: (unitCode: string) => tenantsApi.deleteUnit(unitCode),
    onSuccess: async () => {
      toast.success("Unit removed");
      await qc.invalidateQueries({ queryKey: ["measure-units"] });
    },
    onError: (e) => {
      toast.error(
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Could not remove",
      );
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Units"
        subtitle="Units of measure used on Items and POS (piece, kg, hour, bag…). Same list for every shop type."
      />

      {suggestQ.data?.suggestedUnits?.length ? (
        <section className="rounded-2xl border border-[#dbeafe] bg-[#eff6ff] px-4 py-3 text-sm text-[#1e3a8a]">
          <p className="font-medium">
            Suggested for {suggestQ.data.label} ({suggestQ.data.countryCode})
          </p>
          <p className="mt-1 text-[#1d4ed8]">
            Common units:{" "}
            {suggestQ.data.suggestedUnits
              .slice(0, 12)
              .map((u) => u.symbol)
              .join(", ")}
            . Configure base unit and conversions per item under{" "}
            <Link href="/catalog" className="font-medium underline">
              Items
            </Link>
            . Existing items keep working until you set advanced unit pricing.
          </p>
        </section>
      ) : null}

      {canEdit ? (
        <section className="space-y-4 rounded-2xl border border-[#e5e7eb] bg-white p-5">
          <h2 className="text-sm font-semibold text-[#111827]">New unit</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Name</Label>
              <Input
                className="mt-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Bag"
              />
            </div>
            <div>
              <Label>Symbol / code</Label>
              <Input
                className="mt-1"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. bag"
                maxLength={16}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-[#374151]">
            <input
              type="checkbox"
              checked={decimalQty}
              onChange={(e) => setDecimalQty(e.target.checked)}
            />
            Allow decimal quantity (kg, litre, hour)
          </label>
          <Button
            type="button"
            disabled={createU.isPending || !code.trim() || !name.trim()}
            onClick={() => createU.mutate()}
          >
            Save unit
          </Button>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
        {unitsQ.isLoading ? (
          <p className="px-5 py-8 text-center text-sm text-[#6b7280]">Loading…</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#e5e7eb] bg-[#f9fafb] text-xs uppercase tracking-wide text-[#6b7280]">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Code</th>
                <th className="px-4 py-2.5 font-medium">Quantity</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                {canEdit ? (
                  <th className="px-4 py-2.5 font-medium"> </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {paged.map((u) => (
                <tr key={u.code} className="border-b border-[#f3f4f6] last:border-0">
                  <td className="px-4 py-2.5 text-[#111827]">{u.name}</td>
                  <td className="px-4 py-2.5 font-mono text-[#4b5563]">{u.code}</td>
                  <td className="px-4 py-2.5 text-[#4b5563]">
                    {u.decimalQty ? "Decimal" : "Whole"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={
                        u.active
                          ? "rounded-full bg-[#d1fae5] px-2 py-0.5 text-xs text-[#065f46]"
                          : "rounded-full bg-[#f3f4f6] px-2 py-0.5 text-xs text-[#6b7280]"
                      }
                    >
                      {u.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  {canEdit ? (
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        className="mr-3 text-xs font-medium text-[#1a56db]"
                        onClick={() =>
                          patchU.mutate({
                            code: u.code,
                            active: !u.active,
                          })
                        }
                      >
                        {u.active ? "Deactivate" : "Activate"}
                      </button>
                      {!u.system ? (
                        <button
                          type="button"
                          className="text-xs font-medium text-[#b91c1c]"
                          onClick={() => delU.mutate(u.code)}
                        >
                          Delete
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <TablePager
          page={pageSafe}
          totalPages={totalPages}
          total={rows.length}
          pageSize={PAGE_SIZE}
          onPage={setPage}
        />
      </section>
      <p className="text-xs text-[#6b7280]">
        Item forms pick from active units.{" "}
        <Link href="/catalog/new" className="text-[#1a56db]">
          New Item
        </Link>
      </p>
    </div>
  );
}
