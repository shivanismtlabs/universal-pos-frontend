"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { customersApi, ordersApi, tenantsApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { createOrderSchema, type CreateOrderInput } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/form";
import { formatInr } from "@/lib/utils";
import { useAuthStore } from "@/lib/auth-store";

export default function OrdersPage() {
  const qc = useQueryClient();
  const storeId = useAuthStore((s) => s.user?.storeId) ?? "";

  const orders = useQuery({
    queryKey: ["orders"],
    queryFn: () => ordersApi.list({ limit: 50 }),
  });
  const customers = useQuery({
    queryKey: ["customers", "pick"],
    queryFn: () => customersApi.list({ limit: 100 }),
  });
  const parties = useQuery({
    queryKey: ["parties"],
    queryFn: () => customersApi.listParties(),
  });
  const stores = useQuery({
    queryKey: ["stores"],
    queryFn: () => tenantsApi.listStores(),
  });

  const form = useForm<CreateOrderInput>({
    resolver: zodResolver(createOrderSchema),
    defaultValues: {
      storeId,
      customerId: "",
      partyId: "",
      eventDate: "",
      pickupDate: "",
      returnDueDate: "",
    },
  });

  const create = useMutation({
    mutationFn: (v: CreateOrderInput) =>
      ordersApi.create({
        storeId: v.storeId,
        customerId: v.customerId,
        partyId: v.partyId || undefined,
        eventDate: v.eventDate || undefined,
        pickupDate: v.pickupDate || undefined,
        returnDueDate: v.returnDueDate || undefined,
      }),
    onSuccess: (data) => {
      toast.success(`Order ${data.orderNumber} created`);
      void qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  return (
    <div className="space-y-6 sm:space-y-8">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-[#0f766e]">
          Orders
        </p>
        <h1 className="display mt-2 text-2xl sm:text-4xl">Rental orders</h1>
      </header>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="panel overflow-x-auto p-4 sm:p-5">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-[#6b7280]">
              <tr>
                <th className="pb-3">Order</th>
                <th className="pb-3">Customer</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e5e7eb]">
              {(orders.data?.items ?? []).map((o) => (
                <tr key={o.id} className="hover:bg-[#f9fafb]">
                  <td className="py-3 font-medium">
                    <Link
                      href={`/orders/${o.id}`}
                      className="text-[#0f766e] hover:underline"
                    >
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td className="py-3 text-[#374151]">
                    {o.customer?.fullName ?? "—"}
                  </td>
                  <td className="py-3">{o.status}</td>
                  <td className="py-3">{formatInr(o.balanceDue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!orders.data?.items?.length && !orders.isLoading ? (
            <p className="py-6 text-[#6b7280]">No orders yet</p>
          ) : null}
        </section>

        <form
          className="panel space-y-4 p-5"
          onSubmit={form.handleSubmit((v) => create.mutate(v))}
          noValidate
        >
          <h2 className="display text-2xl">New quote</h2>
          <div>
            <Label>Store</Label>
            <select className="mt-2 select-field" {...form.register("storeId")}>
              <option value="">Select</option>
              {(stores.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <FieldError message={form.formState.errors.storeId?.message} />
          </div>
          <div>
            <Label>Customer</Label>
            <select
              className="mt-2 select-field"
              {...form.register("customerId")}
            >
              <option value="">Select</option>
              {(customers.data?.items ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName} ({c.phone})
                </option>
              ))}
            </select>
            <FieldError message={form.formState.errors.customerId?.message} />
          </div>
          <div>
            <Label>Party (optional)</Label>
            <select className="mt-2 select-field" {...form.register("partyId")}>
              <option value="">None</option>
              {(parties.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Pickup</Label>
              <Input
                className="mt-2"
                type="date"
                {...form.register("pickupDate")}
              />
            </div>
            <div>
              <Label>Return due</Label>
              <Input
                className="mt-2"
                type="date"
                {...form.register("returnDueDate")}
              />
            </div>
          </div>
          <div>
            <Label>Event date</Label>
            <Input
              className="mt-2"
              type="date"
              {...form.register("eventDate")}
            />
          </div>
          <Button type="submit" className="w-full" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create order"}
          </Button>
        </form>
      </div>
    </div>
  );
}
