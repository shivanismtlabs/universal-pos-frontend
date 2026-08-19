"use client";

import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  appointmentsApi,
  catalogApi,
  customersApi,
  resourcesApi,
  tenantsApi,
} from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import {
  createAppointmentSchema,
  type CreateAppointmentInput,
} from "@/lib/validations";
import {
  RENTAL_APPOINTMENT_TYPES,
  SERVICE_APPOINTMENT_TYPES,
  appointmentDisplayType,
  appointmentTypeLabel,
} from "@/lib/appointment-types";
import { useBootstrap } from "@/lib/bootstrap";
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
  const { hasMode } = useBootstrap();
  const isServiceBooking = hasMode("service");
  const isRentalBooking = hasMode("rental") && !isServiceBooking;
  const typeOptions = isServiceBooking
    ? SERVICE_APPOINTMENT_TYPES
    : RENTAL_APPOINTMENT_TYPES;
  const defaultAptType = isServiceBooking ? "service" : "fitting";

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
  const services = useQuery({
    queryKey: ["catalog", "services", "appointments"],
    queryFn: () =>
      catalogApi.listProducts({
        kind: "service",
        status: "active",
        availableInPos: true,
      }),
    enabled: isServiceBooking,
  });

  const serviceItems = useMemo(
    () => services.data?.items ?? [],
    [services.data?.items],
  );

  const form = useForm<CreateAppointmentInput>({
    resolver: zodResolver(createAppointmentSchema),
    defaultValues: {
      storeId,
      customerId: "",
      orderId: "",
      aptType: defaultAptType,
      serviceName: "",
      resourceId: "",
      startsAt: "",
      endsAt: "",
      fittingNotes: "",
    },
  });

  const watchedStoreId = form.watch("storeId");
  const activeLocationId = watchedStoreId || storeId;

  useEffect(() => {
    form.setValue("aptType", defaultAptType);
  }, [defaultAptType, form]);

  const resources = useQuery({
    queryKey: ["resources", "appointments", activeLocationId],
    queryFn: () =>
      resourcesApi.list({
        limit: 100,
        locationId: activeLocationId || undefined,
        status: "active",
      }),
    enabled: isServiceBooking && Boolean(activeLocationId),
  });

  const create = useMutation({
    mutationFn: (v: CreateAppointmentInput) => {
      if (isServiceBooking && v.aptType === "service" && !v.serviceName?.trim()) {
        throw new Error("Select a service");
      }
      return appointmentsApi.create({
        storeId: v.storeId,
        customerId: v.customerId,
        orderId: v.orderId || undefined,
        aptType: v.aptType,
        serviceName: v.serviceName?.trim() || undefined,
        resourceId: v.resourceId || undefined,
        startsAt: new Date(v.startsAt).toISOString(),
        endsAt: v.endsAt ? new Date(v.endsAt).toISOString() : undefined,
        fittingNotes: v.fittingNotes || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Appointment booked");
      form.reset({
        storeId: watchedStoreId || storeId,
        customerId: "",
        orderId: "",
        aptType: defaultAptType,
        serviceName: "",
        resourceId: "",
        startsAt: "",
        endsAt: "",
        fittingNotes: "",
      });
      void qc.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : e.message),
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

  const formTitle = isServiceBooking
    ? "Book appointment"
    : "Book fitting / pickup";

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
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-[#6b7280]">
              <tr>
                <th className="pb-3">When</th>
                <th className="pb-3">Customer</th>
                <th className="pb-3">{isServiceBooking ? "Service" : "Type"}</th>
                {isServiceBooking ? <th className="pb-3">Chair / room</th> : null}
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
                  <td className="py-3">
                    <span className="font-medium text-[#111827]">
                      {appointmentDisplayType({
                        aptType: a.aptType,
                        meta: a.meta,
                        notes: a.notes ?? a.fittingNotes,
                      })}
                    </span>
                    {isServiceBooking && a.aptType !== "service" ? (
                      <span className="mt-0.5 block text-xs text-[#6b7280]">
                        {appointmentTypeLabel(a.aptType)}
                      </span>
                    ) : null}
                  </td>
                  {isServiceBooking ? (
                    <td className="py-3 text-[#4b5563]">
                      {a.resource?.name ?? "—"}
                    </td>
                  ) : null}
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
          <h2 className="display text-2xl">{formTitle}</h2>
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
              {typeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {isServiceBooking ? (
            <>
              <div>
                <Label>Service</Label>
                <select
                  className="mt-2 select-field"
                  {...form.register("serviceName")}
                >
                  <option value="">Select service</option>
                  {serviceItems.map((item) => (
                    <option key={item.id} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>
                {!serviceItems.length && !services.isLoading ? (
                  <p className="mt-1.5 text-xs text-[#6b7280]">
                    Add services under Catalog first (item type: Service).
                  </p>
                ) : null}
              </div>
              <div>
                <Label>Chair / room</Label>
                <select
                  className="mt-2 select-field"
                  {...form.register("resourceId")}
                >
                  <option value="">Optional</option>
                  {(resources.data?.data ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.type ? ` · ${r.type}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : null}
          <div>
            <Label>Starts at</Label>
            <Input
              className="mt-2"
              type="datetime-local"
              {...form.register("startsAt")}
            />
            <FieldError message={form.formState.errors.startsAt?.message} />
          </div>
          {isServiceBooking ? (
            <div>
              <Label>Ends at</Label>
              <Input
                className="mt-2"
                type="datetime-local"
                {...form.register("endsAt")}
              />
              <p className="mt-1 text-xs text-[#6b7280]">
                Optional — used to block double-booking on the same chair.
              </p>
            </div>
          ) : null}
          <div>
            <Label>Notes</Label>
            <Input className="mt-2" {...form.register("fittingNotes")} />
          </div>
          {isRentalBooking ? (
            <p className="text-xs text-[#6b7280]">
              Link an order from Rentals if this visit is for pickup or return.
            </p>
          ) : null}
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
