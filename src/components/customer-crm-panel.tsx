"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { customersApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useBootstrap } from "@/lib/bootstrap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatDate } from "@/lib/utils";

type CrmTab =
  | "overview"
  | "orders"
  | "dues"
  | "loyalty"
  | "wallet"
  | "notes";

export function CustomerCrmPanel({ customerId }: { customerId: string }) {
  const { money } = useBootstrap();
  const qc = useQueryClient();
  const [tab, setTab] = useState<CrmTab>("overview");
  const [noteBody, setNoteBody] = useState("");
  const [walletAmt, setWalletAmt] = useState("100");
  const [walletNote, setWalletNote] = useState("");

  const detail = useQuery({
    queryKey: ["customer-crm", customerId],
    queryFn: () => customersApi.get(customerId),
  });

  const orders = useQuery({
    queryKey: ["customer-orders", customerId],
    queryFn: () => customersApi.listOrders(customerId),
    enabled: tab === "orders" || tab === "overview",
  });
  const dues = useQuery({
    queryKey: ["customer-dues", customerId],
    queryFn: () => customersApi.listDues(customerId),
    enabled: tab === "dues" || tab === "overview",
  });
  const loyalty = useQuery({
    queryKey: ["customer-loyalty", customerId],
    queryFn: () => customersApi.listLoyaltyLedger(customerId),
    enabled: tab === "loyalty",
  });
  const wallet = useQuery({
    queryKey: ["customer-wallet", customerId],
    queryFn: () => customersApi.listStoreCredit(customerId),
    enabled: tab === "wallet",
  });
  const notes = useQuery({
    queryKey: ["customer-notes", customerId],
    queryFn: () => customersApi.listNotes(customerId),
    enabled: tab === "notes" || tab === "overview",
  });

  const addNote = useMutation({
    mutationFn: () => customersApi.addNote(customerId, noteBody),
    onSuccess: () => {
      toast.success("Note added");
      setNoteBody("");
      void qc.invalidateQueries({ queryKey: ["customer-notes", customerId] });
      void qc.invalidateQueries({ queryKey: ["customer-crm", customerId] });
      void qc.invalidateQueries({ queryKey: ["customer", customerId] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const adjustWallet = useMutation({
    mutationFn: (amount: number) =>
      customersApi.adjustStoreCredit(customerId, {
        amount,
        note: walletNote.trim() || undefined,
      }),
    onSuccess: (r) => {
      toast.success(`Wallet balance ${money(r.storeCreditBalance)}`);
      setWalletNote("");
      void qc.invalidateQueries({ queryKey: ["customer-wallet", customerId] });
      void qc.invalidateQueries({ queryKey: ["customer-crm", customerId] });
      void qc.invalidateQueries({ queryKey: ["customer", customerId] });
      void qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const s = detail.data?.summary;
  const tabs: { id: CrmTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "orders", label: "Purchases" },
    { id: "dues", label: "Due" },
    { id: "loyalty", label: "Loyalty" },
    { id: "wallet", label: "Wallet" },
    { id: "notes", label: "Notes" },
  ];

  if (detail.isLoading) {
    return (
      <p className="rounded-2xl border border-[#e5e7eb] bg-white px-5 py-8 text-sm text-[#6b7280]">
        Loading profile…
      </p>
    );
  }

  if (!detail.data) {
    return (
      <p className="rounded-2xl border border-[#e5e7eb] bg-white px-5 py-8 text-sm text-[#6b7280]">
        Customer not found
      </p>
    );
  }

  return (
    <section className="rounded-2xl border border-[#e5e7eb] bg-white">
      <div className="border-b border-[#eef2f8] px-5 py-4">
        <p className="text-[0.65rem] font-bold tracking-[0.12em] text-[#1a56db] uppercase">
          Customer profile
        </p>
        <h2 className="mt-1 text-xl font-semibold text-[#0b1f33]">
          {detail.data.fullName}
        </h2>
        <p className="mt-0.5 text-sm text-[#5a6b7d]">
          {detail.data.phone}
          {detail.data.email ? ` · ${detail.data.email}` : ""}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Kpi label="Orders" value={String(s?.orderCount ?? 0)} />
          <Kpi
            label="Open due"
            value={money(s?.openDueTotal ?? 0)}
            warn={(s?.openDueTotal ?? 0) > 0}
          />
          <Kpi label="Loyalty pts" value={String(s?.loyaltyPoints ?? 0)} />
          <Kpi
            label="Wallet"
            value={money(s?.storeCreditBalance ?? 0)}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-[#eef2f8] px-3 pt-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "px-3 py-2 text-sm font-medium border-b-2 -mb-px",
              tab === t.id
                ? "border-[#1a56db] text-[#1a56db]"
                : "border-transparent text-[#5a6b7d]",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-4 sm:p-5">
        {tab === "overview" ? (
          <div className="space-y-4 text-sm">
            <p className="text-[#5a6b7d]">
              Latest note:{" "}
              <span className="text-[#0b1f33]">
                {detail.data.notes?.trim() || "—"}
              </span>
            </p>
            {(detail.data.partyMemberships?.length ?? 0) > 0 ? (
              <div>
                <p className="text-[0.7rem] font-semibold text-[#8b9bb0] uppercase">
                  Groups
                </p>
                <ul className="mt-1 space-y-1">
                  {detail.data.partyMemberships!.map((m) => (
                    <li key={m.party.id} className="text-[#0b1f33]">
                      {m.party.name}
                      {m.roleLabel ? ` · ${m.roleLabel}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <MiniList
                title="Recent purchases"
                empty="No orders yet"
                rows={(orders.data?.items ?? []).slice(0, 5).map((o) => ({
                  id: o.id,
                  left: o.orderNumber,
                  right: money(o.grandTotal),
                  href: `/orders/view?id=${o.id}`,
                }))}
              />
              <MiniList
                title="Open dues"
                empty="No open balances"
                rows={(dues.data?.items ?? []).slice(0, 5).map((o) => ({
                  id: o.id,
                  left: o.orderNumber,
                  right: money(o.balanceDue),
                  href: `/orders/view?id=${o.id}`,
                }))}
              />
            </div>
          </div>
        ) : null}

        {tab === "orders" ? (
          <DenseTable
            empty="No purchase history"
            loading={orders.isLoading}
            headers={["Order", "When", "Status", "Total", "Due"]}
            rows={(orders.data?.items ?? []).map((o) => [
              <Link
                key="n"
                href={`/orders/view?id=${o.id}`}
                className="font-semibold text-[#1a56db] hover:underline"
              >
                {o.orderNumber}
              </Link>,
              formatDate(o.createdAt),
              o.status,
              money(o.grandTotal),
              Number(o.balanceDue) > 0 ? money(o.balanceDue) : "—",
            ])}
          />
        ) : null}

        {tab === "dues" ? (
          <div className="space-y-3">
            <p className="text-sm text-[#5a6b7d]">
              Total open:{" "}
              <span className="font-semibold text-[#b45309]">
                {money(dues.data?.totalDue ?? 0)}
              </span>
            </p>
            <DenseTable
              empty="No due payments"
              loading={dues.isLoading}
              headers={["Order", "When", "Status", "Balance due"]}
              rows={(dues.data?.items ?? []).map((o) => [
                <Link
                  key="n"
                  href={`/orders/view?id=${o.id}`}
                  className="font-semibold text-[#1a56db] hover:underline"
                >
                  {o.orderNumber}
                </Link>,
                formatDate(o.createdAt),
                o.status,
                money(o.balanceDue),
              ])}
            />
          </div>
        ) : null}

        {tab === "loyalty" ? (
          <div className="space-y-3">
            <p className="text-sm text-[#5a6b7d]">
              Balance:{" "}
              <span className="font-semibold text-[#0b1f33]">
                {s?.loyaltyPoints ?? 0} pts
              </span>
              {" · "}
              Redeem at Counter when this customer is selected.
            </p>
            <DenseTable
              empty="No loyalty activity yet"
              loading={loyalty.isLoading}
              headers={["When", "Kind", "Points", "Balance", "Note"]}
              rows={(loyalty.data?.items ?? []).map((r) => [
                formatDate(r.createdAt),
                r.kind,
                String(r.points),
                String(r.balanceAfter),
                r.note ?? "—",
              ])}
            />
          </div>
        ) : null}

        {tab === "wallet" ? (
          <div className="space-y-4">
            <p className="text-sm text-[#5a6b7d]">
              Store credit balance:{" "}
              <span className="font-semibold text-[#0b1f33]">
                {money(s?.storeCreditBalance ?? 0)}
              </span>
            </p>
            <div className="grid max-w-lg gap-2 rounded-xl border border-[#e4e9f0] bg-[#f8fafc] p-3 sm:grid-cols-[1fr_1fr_auto]">
              <div>
                <Label className="text-[0.7rem]">Amount</Label>
                <Input
                  className="mt-1"
                  inputMode="decimal"
                  value={walletAmt}
                  onChange={(e) => setWalletAmt(e.target.value)}
                  placeholder="100"
                />
              </div>
              <div>
                <Label className="text-[0.7rem]">Note</Label>
                <Input
                  className="mt-1"
                  value={walletNote}
                  onChange={(e) => setWalletNote(e.target.value)}
                  placeholder="Top-up / adjustment"
                />
              </div>
              <div className="flex items-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={adjustWallet.isPending || !Number(walletAmt)}
                  onClick={() =>
                    adjustWallet.mutate(Math.abs(Number(walletAmt)))
                  }
                >
                  Credit
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={adjustWallet.isPending || !Number(walletAmt)}
                  onClick={() =>
                    adjustWallet.mutate(-Math.abs(Number(walletAmt)))
                  }
                >
                  Debit
                </Button>
              </div>
            </div>
            <DenseTable
              empty="No wallet movements yet"
              loading={wallet.isLoading}
              headers={["When", "Kind", "Amount", "Balance", "By", "Note"]}
              rows={(wallet.data?.items ?? []).map((r) => [
                formatDate(r.createdAt),
                r.kind,
                money(r.amount),
                money(r.balanceAfter),
                r.actorName ?? "—",
                r.note ?? "—",
              ])}
            />
          </div>
        ) : null}

        {tab === "notes" ? (
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                placeholder="Add a CRM note…"
              />
              <Button
                type="button"
                disabled={!noteBody.trim() || addNote.isPending}
                onClick={() => addNote.mutate()}
              >
                Add note
              </Button>
            </div>
            <ul className="divide-y divide-[#eef2f8] text-sm">
              {(notes.data?.items ?? []).map((n) => (
                <li key={n.id} className="py-3">
                  <p className="text-[#0b1f33]">{n.body}</p>
                  <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">
                    {formatDate(n.createdAt)}
                    {n.createdByName ? ` · ${n.createdByName}` : ""}
                  </p>
                </li>
              ))}
              {!notes.data?.items?.length ? (
                <li className="py-8 text-center text-[#8b9bb0]">No notes yet</li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Kpi({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[#e4e9f0] bg-[#f8fafc] px-3 py-2">
      <p className="text-[0.65rem] font-semibold tracking-wide text-[#8b9bb0] uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-sm font-semibold tabular-nums",
          warn ? "text-[#b45309]" : "text-[#0b1f33]",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function MiniList({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: Array<{ id: string; left: string; right: string; href: string }>;
}) {
  return (
    <div className="rounded-xl border border-[#e4e9f0] p-3">
      <p className="text-[0.7rem] font-semibold text-[#8b9bb0] uppercase">
        {title}
      </p>
      <ul className="mt-2 space-y-1.5 text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex justify-between gap-2">
            <Link href={r.href} className="text-[#1a56db] hover:underline">
              {r.left}
            </Link>
            <span className="tabular-nums text-[#0b1f33]">{r.right}</span>
          </li>
        ))}
        {!rows.length ? (
          <li className="py-4 text-center text-[#8b9bb0]">{empty}</li>
        ) : null}
      </ul>
    </div>
  );
}

function DenseTable({
  headers,
  rows,
  empty,
  loading,
}: {
  headers: string[];
  rows: React.ReactNode[][];
  empty: string;
  loading?: boolean;
}) {
  if (loading) {
    return <p className="py-6 text-center text-sm text-[#8b9bb0]">Loading…</p>;
  }
  return (
    <div className="max-h-[min(50dvh,28rem)] overflow-auto rounded-xl border border-[#e4e9f0]">
      <table className="w-full min-w-[520px] border-collapse text-left text-[0.8125rem]">
        <thead className="sticky top-0 bg-[#f8fafc] text-[0.65rem] font-semibold tracking-[0.06em] text-[#5a6b7d] uppercase">
          <tr className="border-b border-[#e4e9f0]">
            {headers.map((h) => (
              <th key={h} className="px-3 py-2.5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="border-b border-[#eef2f8]">
              {cells.map((c, j) => (
                <td key={j} className="px-3 py-2 text-[#0b1f33]">
                  {c}
                </td>
              ))}
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <td
                colSpan={headers.length}
                className="px-3 py-10 text-center text-[#8b9bb0]"
              >
                {empty}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
