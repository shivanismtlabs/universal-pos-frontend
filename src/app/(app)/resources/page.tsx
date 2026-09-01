"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import { resourcesApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { TablePager } from "@/components/table-pager";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

const TYPES = [
  { id: "", label: "All types" },
  { id: "table", label: "Table" },
  { id: "room", label: "Room" },
  { id: "vehicle", label: "Vehicle" },
  { id: "equipment", label: "Equipment" },
  { id: "desk", label: "Desk" },
  { id: "hall", label: "Hall" },
  { id: "court", label: "Court" },
  { id: "other", label: "Other" },
] as const;

const OPERATIONAL_STATUS = [
  { id: "AVAILABLE", label: "Available", dbStatus: "available", tone: "ok" },
  { id: "OCCUPIED", label: "Occupied", dbStatus: "occupied", tone: "busy" },
  { id: "RESERVED", label: "Reserved", dbStatus: "occupied", tone: "busy" },
  { id: "CLEANING", label: "Cleaning", dbStatus: "maintenance", tone: "warn" },
  { id: "OUT_OF_SERVICE", label: "Out of service", dbStatus: "inactive", tone: "off" },
] as const;

const TONE: Record<string, string> = {
  ok: "bg-[#d1fae5] text-[#065f46]",
  busy: "bg-[#dbeafe] text-[#1e40af]",
  warn: "bg-[#fef3c7] text-[#92400e]",
  off: "bg-[#f3f4f6] text-[#6b7280]",
};

function typeLabel(id: string) {
  return TYPES.find((t) => t.id === id)?.label ?? id;
}

function statusMeta(row: {
  status: string;
  meta?: Record<string, unknown> | null;
}) {
  const op = String(row.meta?.operationalStatus ?? "");
  const found = OPERATIONAL_STATUS.find((s) => s.id === op);
  if (found) return found;
  return (
    OPERATIONAL_STATUS.find((s) => s.dbStatus === row.status) ??
    OPERATIONAL_STATUS[0]
  );
}

export default function ResourcesPage() {
  const { hasCapability, hasModule, hasMode } = useBootstrap();
  const hasRental = hasMode("rental");
  const hasSale = hasMode("sale");
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("table");
  const [capacity, setCapacity] = useState("1");
  const [operationalStatus, setOperationalStatus] =
    useState<(typeof OPERATIONAL_STATUS)[number]["id"]>("AVAILABLE");

  const allowed =
    hasCapability("RESOURCE") ||
    hasCapability("TABLE") ||
    hasModule("resources");

  const list = useQuery({
    queryKey: ["resources", page, q, typeFilter],
    queryFn: () =>
      resourcesApi.list({
        page,
        limit: PAGE_SIZE,
        q: q.trim() || undefined,
        type: typeFilter || undefined,
      }),
    enabled: allowed,
  });

  const rows = useMemo(() => list.data?.data ?? [], [list.data]);
  const meta = list.data?.meta;
  const total = meta?.total ?? rows.length;
  const totalPages = Math.max(
    1,
    meta?.totalPages ?? (Math.ceil(total / PAGE_SIZE) || 1),
  );

  const create = useMutation({
    mutationFn: () =>
      resourcesApi.create({
        name: name.trim(),
        type,
        capacity: Number(capacity) || 1,
        status:
          OPERATIONAL_STATUS.find((s) => s.id === operationalStatus)?.dbStatus ??
          "available",
        meta: { operationalStatus },
      }),
    onSuccess: () => {
      toast.success("Resource added");
      setName("");
      setOperationalStatus("AVAILABLE");
      setShowAdd(false);
      setPage(1);
      void qc.invalidateQueries({ queryKey: ["resources"] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not add resource"),
  });

  const updateStatus = useMutation({
    mutationFn: ({
      id,
      next,
    }: {
      id: string;
      next: (typeof OPERATIONAL_STATUS)[number]["id"];
    }) => {
      const picked = OPERATIONAL_STATUS.find((s) => s.id === next);
      return resourcesApi.update(id, {
        status: picked?.dbStatus ?? "available",
        meta: { operationalStatus: next },
      });
    },
    onSuccess: () => {
      toast.success("Status updated");
      void qc.invalidateQueries({ queryKey: ["resources"] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not update"),
  });

  if (!allowed) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <PageHeader
          title="Resources"
          subtitle="Tables, rooms, vehicles, desks, and halls — one list for any shop."
        />
        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-5 text-sm text-[#4b5563]">
          Enable the Resource feature in Settings → Commerce modes & features to
          manage bookable units here.
        </section>
      </div>
    );
  }

  const fieldSelect =
    "h-9 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm";

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        title="Resources"
        subtitle="Bookable units for appointments and jobs"
        action={
          <Button
            type="button"
            size="sm"
            onClick={() => setShowAdd((v) => !v)}
          >
            <Plus className="size-3.5" />
            {showAdd ? "Close" : "New resource"}
          </Button>
        }
      />

      {hasRental && hasSale ? (
        <div className="rounded-xl border border-[#fef3c7] bg-[#fffbeb] px-4 py-3 text-sm text-[#92400e]">
          Clothes and sized outfits use{" "}
          <strong className="font-semibold">Rental desk → Stock</strong> (barcode
          per size), not Resources. Resources are for rooms, tables, vehicles,
          and similar bookable assets.
        </div>
      ) : hasRental && !hasSale ? (
        <div className="rounded-xl border border-[#e5e7eb] bg-[#f8fafc] px-4 py-3 text-sm text-[#4b5563]">
          Optional for venue rental (rooms, halls, vehicles). For clothing sizes
          and barcodes, use{" "}
          <Link href="/rental" className="font-medium text-[#1a56db] underline">
            Rental desk → Stock
          </Link>
          .
        </div>
      ) : null}

      {showAdd ? (
        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
          <form
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              create.mutate();
            }}
          >
            <div className="lg:col-span-2">
              <Label>Name</Label>
              <Input
                className="mt-1 h-9"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Chair 3, Bay A…"
                autoFocus
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select
                className={cn("mt-1", fieldSelect)}
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                {TYPES.filter((t) => t.id).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Capacity</Label>
              <Input
                className="mt-1 h-9"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                inputMode="numeric"
              />
            </div>
            <div className="flex items-end">
              <Button
                type="submit"
                className="w-full"
                disabled={create.isPending || !name.trim()}
              >
                Add
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-[#e5e7eb] px-3 py-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#9ca3af]" />
            <Input
              className="h-9 pl-8"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search name or type"
            />
          </div>
          <Select
            className={cn("w-[10rem]", fieldSelect)}
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
          >
            {TYPES.map((t) => (
              <option key={t.id || "all"} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>

        {list.isLoading ? (
          <p className="px-4 py-8 text-center text-sm text-[#6b7280]">
            Loading…
          </p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[#6b7280]">
            No resources on this page. Add one or clear filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[#e5e7eb] bg-[#f9fafb] text-xs uppercase tracking-wide text-[#6b7280]">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Capacity</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Change</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const st = statusMeta(r);
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-[#f3f4f6] last:border-0"
                    >
                      <td className="px-3 py-2 font-medium text-[#111827]">
                        {r.name}
                      </td>
                      <td className="px-3 py-2 text-[#4b5563]">
                        {typeLabel(r.type)}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-[#4b5563]">
                        {r.capacity}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            TONE[st.tone],
                          )}
                        >
                          {st.label}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          className="h-8 max-w-[11rem] rounded-lg border border-[#e5e7eb] bg-white px-2 text-xs"
                          value={st.id}
                          disabled={updateStatus.isPending}
                          onChange={(e) =>
                            updateStatus.mutate({
                              id: r.id,
                              next: e.target
                                .value as (typeof OPERATIONAL_STATUS)[number]["id"],
                            })
                          }
                        >
                          {OPERATIONAL_STATUS.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label}
                            </option>
                          ))}
                        </Select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <TablePager
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={PAGE_SIZE}
          onPage={setPage}
        />
      </section>
    </div>
  );
}
