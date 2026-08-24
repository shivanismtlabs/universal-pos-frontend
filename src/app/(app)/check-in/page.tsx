"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CustomerPicker } from "@/components/customer-picker";
import { PageHeader } from "@/components/page-header";
import { useBootstrap } from "@/lib/bootstrap";
import { subscriptionsApi } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

export default function CheckInPage() {
  const qc = useQueryClient();
  const { hasCapability, money } = useBootstrap();
  const [customerId, setCustomerId] = useState("");
  const [note, setNote] = useState("");

  const allowed = hasCapability("CHECK_IN");

  const subs = useQuery({
    queryKey: ["check-in-subscriptions", customerId],
    queryFn: () =>
      subscriptionsApi.list({
        status: "active",
        ...(customerId ? { customerId } : {}),
        limit: 100,
      }),
    enabled: allowed,
  });

  const rows = useMemo(() => subs.data?.items ?? [], [subs.data]);

  const [selectedId, setSelectedId] = useState("");
  const statusQ = useQuery({
    queryKey: ["check-in-status", selectedId],
    queryFn: () => subscriptionsApi.checkInStatus(selectedId),
    enabled: Boolean(selectedId),
  });

  const checkIn = useMutation({
    mutationFn: () => subscriptionsApi.checkIn(selectedId, { note: note.trim() || undefined }),
    onSuccess: () => {
      toast.success("Checked in");
      setNote("");
      void qc.invalidateQueries({ queryKey: ["check-in-status", selectedId] });
      void qc.invalidateQueries({ queryKey: ["check-in-subscriptions", customerId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Check-in failed"),
  });

  const checkOut = useMutation({
    mutationFn: () => subscriptionsApi.checkOut(selectedId, { note: note.trim() || undefined }),
    onSuccess: () => {
      toast.success("Checked out");
      setNote("");
      void qc.invalidateQueries({ queryKey: ["check-in-status", selectedId] });
      void qc.invalidateQueries({ queryKey: ["check-in-subscriptions", customerId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Check-out failed"),
  });

  if (!allowed) {
    return (
      <div className="p-6">
        <PageHeader
          title="Check-in"
          subtitle="Enable Membership check-in in Commerce modes & features to use this desk."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Check-in"
        subtitle="Generic front-desk access flow for gyms, coworking, clubs, classes, and any membership business."
      />

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4 rounded-2xl border border-[#e5e7eb] bg-white p-5">
          <div>
            <p className="text-sm font-semibold text-[#0b1f33]">Find member</p>
            <p className="mt-1 text-xs text-[#6b7280]">
              Search the customer book, then choose an active membership.
            </p>
          </div>

          <CustomerPicker
            value={customerId}
            onChange={(id) => {
              setCustomerId(id);
              setSelectedId("");
            }}
            allowWalkIn={false}
            placeholder="Search customer…"
            showBalances
            money={money}
          />

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#8b9bb0]">
              Active membership
            </label>
            <Select
              className="flex h-10 w-full rounded-md border border-[#d9e0ea] bg-white px-3 text-sm text-[#0b1f33]"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value="">Select membership</option>
              {rows.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.plan.title} · ends {new Date(r.currentPeriodEnd).toLocaleDateString()}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#8b9bb0]">
              Note
            </label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Visit note, guest count, remarks…"
            />
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              disabled={!selectedId || checkIn.isPending}
              onClick={() => checkIn.mutate()}
            >
              Check in
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!selectedId || checkOut.isPending}
              onClick={() => checkOut.mutate()}
            >
              Check out
            </Button>
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-[#e5e7eb] bg-white p-5">
          <p className="text-sm font-semibold text-[#0b1f33]">Membership status</p>
          {!selectedId ? (
            <p className="text-sm text-[#6b7280]">Select a membership to view status.</p>
          ) : statusQ.isLoading ? (
            <p className="text-sm text-[#6b7280]">Loading…</p>
          ) : statusQ.data ? (
            <>
              <div className="space-y-1 text-sm">
                <p className="font-semibold text-[#0b1f33]">
                  {statusQ.data.customer.fullName}
                </p>
                <p className="text-[#5a6b7d]">{statusQ.data.plan.title}</p>
                <p className="text-[#5a6b7d]">
                  Active until {new Date(statusQ.data.currentPeriodEnd).toLocaleDateString()}
                </p>
                <p className="text-[#5a6b7d]">
                  Current status:{" "}
                  <strong className="text-[#0b1f33]">
                    {statusQ.data.isCheckedIn ? "Checked in" : "Not checked in"}
                  </strong>
                </p>
                {statusQ.data.currentSessionStartedAt ? (
                  <p className="text-[#5a6b7d]">
                    Session started{" "}
                    {new Date(statusQ.data.currentSessionStartedAt).toLocaleString()}
                  </p>
                ) : null}
                {statusQ.data.lastVisitAt ? (
                  <p className="text-[#5a6b7d]">
                    Last visit {new Date(statusQ.data.lastVisitAt).toLocaleString()}
                  </p>
                ) : null}
              </div>

              <div className="rounded-xl bg-[#f8fafc] p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8b9bb0]">
                  Check-in history
                </p>
                <ul className="mt-2 space-y-2 text-sm">
                  {statusQ.data.history.map((h) => (
                    <li key={h.id} className="rounded-lg border border-[#eef2f8] bg-white px-3 py-2">
                      <p className="font-medium text-[#0b1f33]">{h.action.replace("membership.", "").replaceAll("_", " ")}</p>
                      <p className="text-[0.75rem] text-[#5a6b7d]">
                        {new Date(h.at).toLocaleString()}
                        {h.note ? ` · ${h.note}` : ""}
                      </p>
                    </li>
                  ))}
                  {!statusQ.data.history.length ? (
                    <li className="text-[#6b7280]">No visits yet.</li>
                  ) : null}
                </ul>
              </div>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
