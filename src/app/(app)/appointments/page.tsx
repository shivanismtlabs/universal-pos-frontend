"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { appointmentsApi, customersApi, tenantsApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import {
  createAppointmentSchema,
  type CreateAppointmentInput,
} from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/form";
import { useAuthStore } from "@/lib/auth-store";
import { formatDate } from "@/lib/utils";
import { RequireCommerceMode } from "@/components/require-commerce-mode";

function AppointmentsDesk() {
  const qc = useQueryClient();
  const storeId = useAuthStore((s) => s.user?.storeId) ?? "";

  const list = useQuery({
    queryKey: ["appointments"],
    queryFn: () => appointmentsApi.list({ limit: 50 }),
  });
  const customers = useQuery({
    queryKey: ["customers", "pick"],
    queryFn: () => customersApi.list({ limit: 100 }),
  });
  const stores = useQuery({
    queryKey: ["stores"],
    queryFn: () => tenantsApi.listStores(),
  });

  const form = useForm<CreateAppointmentInput>({
    resolver: zodResolver(createAppointmentSchema),
    defaultValues: {
      storeId,
      customerId: "",
      orderId: "",
      aptType: "fitting",
      startsAt: "",
      fittingNotes: "",
    },
  });

  const create = useMutation({
    mutationFn: (v: CreateAppointmentInput) =>
      appointmentsApi.create({
        storeId: v.storeId,
        customerId: v.customerId,
        orderId: v.orderId || undefined,
        aptType: v.aptType,
        startsAt: new Date(v.startsAt).toISOString(),
        fittingNotes: v.fittingNotes || undefined,
      }),
    onSuccess: () => {
      toast.success("Appointment booked");
      form.reset({
        storeId,
        customerId: "",
        orderId: "",
        aptType: "fitting",
        startsAt: "",
        fittingNotes: "",
      });
      void qc.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const markDone = useMutation({
    mutationFn: (id: string) =>
      appointmentsApi.update(id, { status: "completed" }),
    onSuccess: () => {
      toast.success("Marked completed");
      void qc.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => appointmentsApi.remove(id),
    onSuccess: () => {
      toast.success("Cancelled");
      void qc.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  return (
    <div className="space-y-6 sm:space-y-8">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-[#0b1f33]">
          Schedule
        </p>
        <h1 className="display mt-2 text-2xl sm:text-4xl">Appointments</h1>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel overflow-x-auto p-4 sm:p-5">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-[#6b7280]">
              <tr>
                <th className="pb-3">When</th>
                <th className="pb-3">Customer</th>
                <th className="pb-3">Type</th>
                <th className="pb-3">Status</th>
                <th className="pb-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e5e7eb]">
              {(list.data?.items ?? []).map((a) => (
                <tr key={a.id}>
                  <td className="py-3">
                    {formatDate(a.startsAt)}{" "}
                    <span className="text-[#6b7280]">
                      {new Date(a.startsAt).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </td>
                  <td className="py-3">{a.customer?.fullName ?? "—"}</td>
                  <td className="py-3">{a.aptType}</td>
                  <td className="py-3">{a.status}</td>
                  <td className="py-3 text-right">
                    {a.status === "scheduled" ? (
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => markDone.mutate(a.id)}
                        >
                          Done
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={() => cancel.mutate(a.id)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list.data?.items?.length && !list.isLoading ? (
            <p className="py-6 text-[#6b7280]">No appointments</p>
          ) : null}
        </section>

        <form
          className="panel space-y-4 p-5"
          onSubmit={form.handleSubmit((v) => create.mutate(v))}
          noValidate
        >
          <h2 className="display text-2xl">Book fitting / pickup</h2>
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
            <Label>Type</Label>
            <select className="mt-2 select-field" {...form.register("aptType")}>
              <option value="fitting">Fitting</option>
              <option value="pickup">Pickup</option>
              <option value="return">Return</option>
            </select>
          </div>
          <div>
            <Label>Starts at</Label>
            <Input
              className="mt-2"
              type="datetime-local"
              {...form.register("startsAt")}
            />
            <FieldError message={form.formState.errors.startsAt?.message} />
          </div>
          <div>
            <Label>Notes</Label>
            <Input className="mt-2" {...form.register("fittingNotes")} />
          </div>
          <Button type="submit" className="w-full" disabled={create.isPending}>
            {create.isPending ? "Booking…" : "Book appointment"}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function AppointmentsPage() {
  return (
    <RequireCommerceMode
      modes={["service", "rental"]}
      label="Appointments need service (or rental) mode"
    >
      <AppointmentsDesk />
    </RequireCommerceMode>
  );
}
