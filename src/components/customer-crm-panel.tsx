"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { customersApi, notifyApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useBootstrap } from "@/lib/bootstrap";
import { useAuthStore } from "@/lib/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModalFrame } from "@/components/modal-frame";
import { cn, formatDate } from "@/lib/utils";

type CrmTab =
  | "overview"
  | "orders"
  | "dues"
  | "payments"
  | "membership"
  | "activity"
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
  const [modal, setModal] = useState<null | "message" | "feedback">(null);
  const [msgChannel, setMsgChannel] = useState<"sms" | "email" | "whatsapp">(
    "sms",
  );
  const [msgBody, setMsgBody] = useState("");
  const [feedbackBody, setFeedbackBody] = useState("");
  const canManageWallet = useAuthStore((s) =>
    (s.user?.roles ?? []).some((r) => r === "admin" || r === "manager"),
  );

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
  const payments = useQuery({
    queryKey: ["customer-payments", customerId],
    queryFn: () => customersApi.listPayments(customerId),
    enabled: tab === "payments",
  });
  const memberships = useQuery({
    queryKey: ["customer-memberships", customerId],
    queryFn: () => customersApi.listMemberships(customerId),
    enabled: tab === "membership" || tab === "overview",
  });
  const activity = useQuery({
    queryKey: ["customer-activity", customerId],
    queryFn: () => customersApi.listActivity(customerId),
    enabled: tab === "activity",
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

  const sendMessage = useMutation({
    mutationFn: () =>
      notifyApi.send({
        customerId,
        channel: msgChannel,
        templateKey: "custom",
        payload: { message: msgBody.trim() },
      }),
    onSuccess: () => {
      toast.success("Message queued");
      setMsgBody("");
      setModal(null);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const addFeedback = useMutation({
    mutationFn: () =>
      customersApi.addNote(customerId, `[Feedback] ${feedbackBody.trim()}`),
    onSuccess: () => {
      toast.success("Feedback saved");
      setFeedbackBody("");
      setModal(null);
      void qc.invalidateQueries({ queryKey: ["customer-notes", customerId] });
      void qc.invalidateQueries({ queryKey: ["customer-crm", customerId] });
      void qc.invalidateQueries({ queryKey: ["customer", customerId] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const s = detail.data?.summary;
  const tabs: { id: CrmTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "orders", label: "Purchases" },
    { id: "payments", label: "Payments" },
    { id: "dues", label: "Due" },
    { id: "membership", label: "Membership" },
    { id: "activity", label: "Activity" },
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
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
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
            <p className="mt-1 text-[0.75rem] text-[#8b9bb0]">
              Birthday:{" "}
              {detail.data.dateOfBirth
                ? formatDate(detail.data.dateOfBirth)
                : "—"}
              {" · Anniversary: "}
              {detail.data.eventDate ? formatDate(detail.data.eventDate) : "—"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setModal("message")}
            >
              Message
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setModal("feedback")}
            >
              Feedback
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link href={`/customers/${customerId}`}>Open durable URL</Link>
            </Button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
          <Kpi label="Total spent" value={money(s?.totalSpent ?? 0)} />
          <Kpi label="Orders" value={String(s?.orderCount ?? 0)} />
          <Kpi
            label="Visit freq."
            value={
              s?.visitEveryDays
                ? `Every ${s.visitEveryDays}d`
                : s?.lastVisitAt
                  ? "Once"
                  : "—"
            }
          />
          <Kpi
            label="Open due"
            value={money(s?.openDueTotal ?? 0)}
            warn={(s?.openDueTotal ?? 0) > 0}
          />
          <Kpi label="Loyalty pts" value={String(s?.loyaltyPoints ?? 0)} />
          <Kpi label="Wallet" value={money(s?.storeCreditBalance ?? 0)} />
          <Kpi
            label="Credit left"
            value={
              s?.availableCredit == null
                ? "Unlimited"
                : money(s.availableCredit)
            }
          />
        </div>
        <p className="mt-2 text-[0.75rem] text-[#8b9bb0]">
          Last visit:{" "}
          {s?.lastVisitAt
            ? `${formatDate(s.lastVisitAt)}${s.lastVisitOrder ? ` · ${s.lastVisitOrder}` : ""}`
            : "—"}
          {s?.firstVisitAt
            ? ` · First visit: ${formatDate(s.firstVisitAt)}`
            : ""}
          {s?.activeMembership
            ? ` · Member: ${s.activeMembership.planName}`
            : ""}
        </p>
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
                  Customer groups
                </p>
                <ul className="mt-1 space-y-1">
                  {detail.data.partyMemberships!.map((m) => (
                    <li key={m.party.id} className="text-[#0b1f33]">
                      <Link
                        href={`/parties?id=${m.party.id}`}
                        className="font-medium text-[#1a56db] hover:underline"
                      >
                        {m.party.name}
                      </Link>
                      {m.roleLabel ? ` · ${m.roleLabel}` : ""}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/parties"
                  className="mt-2 inline-block text-xs font-semibold text-[#1a56db] hover:underline"
                >
                  Manage parties →
                </Link>
              </div>
            ) : (
              <p className="text-xs text-[#8b9bb0]">
                No group membership.{" "}
                <Link href="/parties" className="text-[#1a56db] hover:underline">
                  Customer groups
                </Link>
                {" · "}
                <Link
                  href="/reports/customers"
                  className="text-[#1a56db] hover:underline"
                >
                  RFM / loyalty reports
                </Link>
              </p>
            )}
            {s?.activeMembership ? (
              <p className="rounded-lg border border-[#e4e9f0] bg-[#f8fafc] px-3 py-2 text-sm">
                Active membership:{" "}
                <span className="font-semibold">
                  {s.activeMembership.planName}
                </span>{" "}
                · renews{" "}
                {formatDate(s.activeMembership.currentPeriodEnd)}
              </p>
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
              {s?.creditLimit != null ? (
                <>
                  {" · "}Credit limit {money(s.creditLimit)} · Remaining{" "}
                  {money(s.availableCredit ?? 0)}
                </>
              ) : null}
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

        {tab === "payments" ? (
          <DenseTable
            empty="No payments yet"
            loading={payments.isLoading}
            headers={["When", "Type", "Method", "Amount", "Order"]}
            rows={(payments.data?.items ?? []).map((p) => [
              formatDate(p.createdAt),
              p.type,
              p.method,
              money(p.amount),
              <Link
                key="o"
                href={`/orders/view?id=${p.orderId}`}
                className="font-semibold text-[#1a56db] hover:underline"
              >
                {p.orderNumber}
              </Link>,
            ])}
          />
        ) : null}

        {tab === "membership" ? (
          <DenseTable
            empty="No memberships — enroll from Subscriptions"
            loading={memberships.isLoading}
            headers={["Plan", "Status", "Price", "Period end", ""]}
            rows={(memberships.data?.items ?? []).map((m) => [
              m.product.name,
              m.status,
              money(m.price),
              formatDate(m.currentPeriodEnd),
              <Link
                key="s"
                href="/subscriptions"
                className="text-[#1a56db] hover:underline"
              >
                Manage
              </Link>,
            ])}
          />
        ) : null}

        {tab === "activity" ? (
          <ul className="divide-y divide-[#eef2f8] text-sm">
            {(activity.data?.items ?? []).map((a) => (
              <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-[#0b1f33]">
                    {a.href ? (
                      <Link href={a.href} className="text-[#1a56db] hover:underline">
                        {a.title}
                      </Link>
                    ) : (
                      a.title
                    )}
                  </p>
                  {a.detail ? (
                    <p className="mt-0.5 line-clamp-2 text-[#5a6b7d]">{a.detail}</p>
                  ) : null}
                  <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">
                    {formatDate(a.createdAt)} · {a.kind}
                  </p>
                </div>
                {a.amount != null ? (
                  <span className="tabular-nums font-medium text-[#0b1f33]">
                    {a.kind.startsWith("loyalty")
                      ? `${a.amount} pts`
                      : money(a.amount)}
                  </span>
                ) : null}
              </li>
            ))}
            {activity.isLoading ? (
              <li className="py-8 text-center text-[#8b9bb0]">Loading…</li>
            ) : null}
            {!activity.isLoading && !activity.data?.items?.length ? (
              <li className="py-8 text-center text-[#8b9bb0]">No activity yet</li>
            ) : null}
          </ul>
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
              This is real shop money for this customer. Put money in with
              Credit. At the counter, tap Wallet to take it off this balance.
              Right now they have{" "}
              <span className="font-semibold text-[#0b1f33]">
                {money(s?.storeCreditBalance ?? 0)}
              </span>
              .
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
                  disabled={!canManageWallet}
                />
              </div>
              <div>
                <Label className="text-[0.7rem]">Note</Label>
                <Input
                  className="mt-1"
                  value={walletNote}
                  onChange={(e) => setWalletNote(e.target.value)}
                  placeholder="Top-up / adjustment"
                  disabled={!canManageWallet}
                />
              </div>
              <div className="flex items-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    !canManageWallet ||
                    adjustWallet.isPending ||
                    !Number(walletAmt)
                  }
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
                  disabled={
                    !canManageWallet ||
                    adjustWallet.isPending ||
                    !Number(walletAmt)
                  }
                  onClick={() =>
                    adjustWallet.mutate(-Math.abs(Number(walletAmt)))
                  }
                >
                  Debit
                </Button>
              </div>
            </div>
            {!canManageWallet ? (
              <p className="text-xs text-[#8b9bb0]">
                Wallet adjust requires manager or admin.
              </p>
            ) : null}
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
              <Button
                type="button"
                variant="secondary"
                onClick={() => setModal("feedback")}
              >
                Feedback
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

      {modal === "message" ? (
        <ModalFrame
          title="Message customer"
          subtitle="SMS, email, or WhatsApp using saved phone/email"
          onClose={() => setModal(null)}
          footer={
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setModal(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!msgBody.trim() || sendMessage.isPending}
                onClick={() => sendMessage.mutate()}
              >
                Send
              </Button>
            </div>
          }
        >
          <div className="space-y-3">
            <div>
              <Label>Channel</Label>
              <select
                className="mt-1.5 h-10 w-full rounded-lg border border-[#d9e0ea] bg-white px-3 text-sm text-[#0b1f33]"
                value={msgChannel}
                onChange={(e) =>
                  setMsgChannel(e.target.value as typeof msgChannel)
                }
              >
                <option value="sms">SMS</option>
                <option value="email">Email</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
            </div>
            <div>
              <Label>Message</Label>
              <textarea
                className="mt-1.5 min-h-[7rem] w-full rounded-lg border border-[#d9e0ea] px-3 py-2 text-sm text-[#0b1f33] outline-none focus:border-[#1a56db]"
                value={msgBody}
                onChange={(e) => setMsgBody(e.target.value)}
                placeholder="Write a short note to this customer…"
              />
            </div>
          </div>
        </ModalFrame>
      ) : null}

      {modal === "feedback" ? (
        <ModalFrame
          title="Customer feedback"
          subtitle="Saved on the profile Notes tab with a Feedback prefix"
          onClose={() => setModal(null)}
          footer={
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setModal(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!feedbackBody.trim() || addFeedback.isPending}
                onClick={() => addFeedback.mutate()}
              >
                Save
              </Button>
            </div>
          }
        >
          <div>
            <Label>Feedback</Label>
            <textarea
              className="mt-1.5 min-h-[7rem] w-full rounded-lg border border-[#d9e0ea] px-3 py-2 text-sm text-[#0b1f33] outline-none focus:border-[#1a56db]"
              value={feedbackBody}
              onChange={(e) => setFeedbackBody(e.target.value)}
              placeholder="What did they say?"
            />
          </div>
        </ModalFrame>
      ) : null}
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
