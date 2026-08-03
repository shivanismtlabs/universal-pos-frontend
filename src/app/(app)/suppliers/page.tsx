"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { suppliersApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/utils";

export default function SuppliersPage() {
  const qc = useQueryClient();
  const suppliers = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => suppliersApi.list(),
  });
  const pos = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: () => suppliersApi.listPos(),
  });

  const supplierForm = useForm({
    defaultValues: { name: "", contact: "", phone: "" },
  });
  const poForm = useForm({
    defaultValues: {
      supplierId: "",
      poType: "sub_rental",
      expectedDelivery: "",
    },
  });

  const createSupplier = useMutation({
    mutationFn: (v: { name: string; contact: string; phone: string }) =>
      suppliersApi.create({
        name: v.name,
        contact: v.contact || undefined,
        phone: v.phone || undefined,
      }),
    onSuccess: () => {
      toast.success("Supplier added");
      supplierForm.reset();
      void qc.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const createPo = useMutation({
    mutationFn: (v: {
      supplierId: string;
      poType: string;
      expectedDelivery: string;
    }) =>
      suppliersApi.createPo({
        supplierId: v.supplierId,
        poType: v.poType,
        expectedDelivery: v.expectedDelivery || undefined,
      }),
    onSuccess: () => {
      toast.success("PO created");
      poForm.reset({ supplierId: "", poType: "sub_rental", expectedDelivery: "" });
      void qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const updatePo = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      suppliersApi.updatePo(id, { status }),
    onSuccess: () => {
      toast.success("PO updated");
      void qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <p className="text-sm tracking-[0.18em] text-[#0f766e] uppercase">
          Catalog
        </p>
        <h1 className="display mt-1 text-3xl text-[#111827]">
          Suppliers &amp; POs
        </h1>
        <p className="mt-1 text-sm text-[#6b7280]">
          Sub-rental and special orders from external suppliers
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
          <h2 className="text-sm font-semibold">Suppliers</h2>
          <ul className="mt-2 max-h-48 divide-y divide-[#f3f4f6] overflow-y-auto text-sm">
            {(suppliers.data ?? []).map((s) => (
              <li key={s.id} className="py-2">
                <p className="font-medium">{s.name}</p>
                <p className="text-xs text-[#6b7280]">
                  {[s.contact, s.phone].filter(Boolean).join(" · ") || "—"}
                </p>
              </li>
            ))}
          </ul>
          <form
            className="mt-3 space-y-2 border-t border-[#e5e7eb] pt-3"
            onSubmit={supplierForm.handleSubmit((v) => createSupplier.mutate(v))}
          >
            <Input placeholder="Name" {...supplierForm.register("name", { required: true })} />
            <Input placeholder="Contact" {...supplierForm.register("contact")} />
            <Input placeholder="Phone" {...supplierForm.register("phone")} />
            <Button type="submit" size="sm" disabled={createSupplier.isPending}>
              Add supplier
            </Button>
          </form>
        </section>

        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
          <h2 className="text-sm font-semibold">New purchase order</h2>
          <form
            className="mt-3 space-y-2"
            onSubmit={poForm.handleSubmit((v) => createPo.mutate(v))}
          >
            <div>
              <Label>Supplier</Label>
              <select
                className="mt-1.5 select-field"
                {...poForm.register("supplierId", { required: true })}
              >
                <option value="">Select</option>
                {(suppliers.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Type</Label>
              <select className="mt-1.5 select-field" {...poForm.register("poType")}>
                <option value="purchase">Purchase</option>
                <option value="sub_rental">Sub-rental</option>
                <option value="special">Special</option>
              </select>
            </div>
            <div>
              <Label>Expected delivery</Label>
              <Input
                className="mt-1.5"
                type="date"
                {...poForm.register("expectedDelivery")}
              />
            </div>
            <Button type="submit" size="sm" disabled={createPo.isPending}>
              Create PO
            </Button>
          </form>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
        <div className="border-b border-[#e5e7eb] px-4 py-3">
          <h2 className="text-sm font-semibold">Purchase orders</h2>
        </div>
        <ul className="divide-y divide-[#f3f4f6]">
          {(pos.data ?? []).map((po) => (
            <li
              key={po.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium">
                  {po.supplier?.name ?? "—"} · {po.poType.replaceAll("_", " ")}
                </p>
                <p className="text-xs text-[#6b7280]">
                  {po.status}
                  {po.expectedDelivery
                    ? ` · due ${formatDate(po.expectedDelivery)}`
                    : ""}
                </p>
              </div>
              <div className="flex gap-1">
                {["ordered", "received", "cancelled"].map((s) => (
                  <Button
                    key={s}
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={updatePo.isPending || po.status === s}
                    onClick={() => updatePo.mutate({ id: po.id, status: s })}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </li>
          ))}
          {!pos.data?.length ? (
            <li className="px-4 py-8 text-sm text-[#6b7280]">No POs yet</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
