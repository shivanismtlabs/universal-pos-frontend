"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { resourcesApi } from "@/lib/api";
import { useBootstrap } from "@/lib/bootstrap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const TYPES = ["table", "room", "vehicle", "equipment", "desk", "hall", "court", "other"];

export default function ResourcesPage() {
  const { hasCapability, hasModule } = useBootstrap();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState("table");
  const [capacity, setCapacity] = useState("1");

  const allowed =
    hasCapability("RESOURCE") ||
    hasCapability("TABLE") ||
    hasModule("resources");

  const list = useQuery({
    queryKey: ["resources"],
    queryFn: () => resourcesApi.list({ limit: 100 }),
    enabled: allowed,
  });

  const create = useMutation({
    mutationFn: () =>
      resourcesApi.create({
        name: name.trim(),
        type,
        capacity: Number(capacity) || 1,
      }),
    onSuccess: () => {
      toast.success("Resource created");
      setName("");
      void qc.invalidateQueries({ queryKey: ["resources"] });
    },
    onError: (e: Error) => toast.error(e.message || "Failed"),
  });

  if (!allowed) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Resources</h1>
        <p className="mt-2 text-sm text-slate-600">
          Enable the RESOURCE capability in business setup to manage tables,
          rooms, vehicles, and halls.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-[#0b1f33]">Resources</h1>
        <p className="mt-1 text-sm text-slate-600">
          Generic bookable resources — not industry-specific tables or rooms.
        </p>
      </div>

      <form
        className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          create.mutate();
        }}
      >
        <label className="space-y-1 text-sm">
          <span className="text-slate-600">Name</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Table 5" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-600">Type</span>
          <select
            className="h-9 rounded-md border border-slate-200 px-2 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-600">Capacity</span>
          <Input
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            className="w-20"
          />
        </label>
        <Button type="submit" disabled={create.isPending}>
          Add resource
        </Button>
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Capacity</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {(list.data?.data ?? []).map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2">{r.type}</td>
                <td className="px-3 py-2">{r.capacity}</td>
                <td className="px-3 py-2">{r.status}</td>
              </tr>
            ))}
            {!list.isLoading && !(list.data?.data?.length) ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                  No resources yet
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
