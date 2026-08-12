"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { loyaltyApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useBootstrap } from "@/lib/bootstrap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PageHeader, EmptyState, PageSkeleton } from "@/components/page-header";
import { cn, formatDate } from "@/lib/utils";

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success("Code copied");
  } catch {
    toast.error("Could not copy");
  }
}

type Tab = "coupons" | "gift" | "points" | "redemptions";

export default function LoyaltyPage() {
  const { money } = useBootstrap();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("coupons");

  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "fixed">(
    "percent",
  );
  const [discountValue, setDiscountValue] = useState("10");
  const [minOrder, setMinOrder] = useState("");

  const [gcValue, setGcValue] = useState("1000");
  const [gcCode, setGcCode] = useState("");

  const [earn, setEarn] = useState("1");
  const [cpp, setCpp] = useState("0.01");
  const [ptsEnabled, setPtsEnabled] = useState(true);

  const list = useQuery({
    queryKey: ["loyalty-coupons"],
    queryFn: () => loyaltyApi.listCoupons(),
  });
  const cards = useQuery({
    queryKey: ["loyalty-gift-cards"],
    queryFn: () => loyaltyApi.listGiftCards(),
    enabled: tab === "gift",
  });
  const settings = useQuery({
    queryKey: ["loyalty-settings"],
    queryFn: () => loyaltyApi.getSettings(),
    enabled: tab === "points",
  });
  const ledger = useQuery({
    queryKey: ["loyalty-ledger-redeem"],
    queryFn: () => loyaltyApi.listLedger({ kind: "redeem", limit: 100 }),
    enabled: tab === "redemptions",
  });

  const create = useMutation({
    mutationFn: () =>
      loyaltyApi.createCoupon({
        code: code.trim(),
        description: description.trim() || undefined,
        discountType,
        discountValue: Number(discountValue),
        minOrderAmount: minOrder ? Number(minOrder) : undefined,
      }),
    onSuccess: () => {
      toast.success("Coupon created");
      setCode("");
      setDescription("");
      void qc.invalidateQueries({ queryKey: ["loyalty-coupons"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const patch = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      loyaltyApi.patchCoupon(id, { isActive }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["loyalty-coupons"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const issueCard = useMutation({
    mutationFn: async () => {
      const row = await loyaltyApi.issueGiftCard({
        initialValue: Number(gcValue),
        code: gcCode.trim() || undefined,
      });
      return row as { code?: string };
    },
    onSuccess: (row) => {
      const code = row?.code?.trim();
      toast.success(
        code ? `Gift card ${code} issued` : "Gift card issued",
        code
          ? {
              action: {
                label: "Copy",
                onClick: () => void copyText(code),
              },
            }
          : undefined,
      );
      setGcCode("");
      void qc.invalidateQueries({ queryKey: ["loyalty-gift-cards"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  const saveSettings = useMutation({
    mutationFn: () =>
      loyaltyApi.patchSettings({
        enabled: ptsEnabled,
        earnPerCurrency: Number(earn),
        currencyPerPoint: Number(cpp),
      }),
    onSuccess: () => {
      toast.success("Loyalty settings saved");
      void qc.invalidateQueries({ queryKey: ["loyalty-settings"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.messages.join(", ") : "Failed"),
  });

  if (list.isLoading) return <PageSkeleton rows={5} />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Loyalty"
        subtitle="Coupons, gift cards, points, and redemption history — usable at the sale counter."
      />

      <div className="flex gap-1 rounded-xl bg-[#eef2f8] p-1">
        {(
          [
            ["coupons", "Coupons"],
            ["gift", "Gift cards"],
            ["points", "Points"],
            ["redemptions", "Redemptions"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setTab(k);
              if (k === "points" && settings.data) {
                setEarn(String(settings.data.earnPerCurrency));
                setCpp(String(settings.data.currencyPerPoint));
                setPtsEnabled(settings.data.enabled);
              }
            }}
            className={cn(
              "flex-1 rounded-lg py-2 text-sm font-semibold",
              tab === k
                ? "bg-white text-[#0b1f33] shadow-sm"
                : "text-[#5a6b7d]",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "coupons" ? (
        <>
          <section className="rounded-xl border border-[#d9e0ea] bg-white p-4">
            <h2 className="text-sm font-semibold text-[#0b1f33]">
              Create coupon
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Code</Label>
                <Input
                  className="mt-1 uppercase"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="SAVE10"
                />
              </div>
              <div>
                <Label>Type</Label>
                <Select
                  className="mt-1"
                  value={discountType}
                  onChange={(e) =>
                    setDiscountType(e.target.value as "percent" | "fixed")
                  }
                >
                  <option value="percent">Percent off</option>
                  <option value="fixed">Fixed amount off</option>
                </Select>
              </div>
              <div>
                <Label>Value</Label>
                <Input
                  className="mt-1"
                  type="number"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                />
              </div>
              <div>
                <Label>Min order (optional)</Label>
                <Input
                  className="mt-1"
                  type="number"
                  value={minOrder}
                  onChange={(e) => setMinOrder(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Description</Label>
                <Input
                  className="mt-1"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>
            <Button
              className="mt-4"
              type="button"
              disabled={create.isPending || !code.trim()}
              onClick={() => create.mutate()}
            >
              {create.isPending ? "Saving…" : "Create coupon"}
            </Button>
          </section>

          <section className="rounded-xl border border-[#d9e0ea] bg-white p-4">
            <h2 className="text-sm font-semibold text-[#0b1f33]">Coupons</h2>
            {!list.data?.length ? (
              <EmptyState
                title="No coupons yet"
                detail="Create a code staff can enter at the counter."
              />
            ) : (
              <ul className="mt-3 divide-y divide-[#f0f3f7] text-sm">
                {list.data.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3"
                  >
                    <div>
                      <p className="font-mono font-semibold text-[#0b1f33]">
                        {c.code}
                        {!c.isActive ? (
                          <span className="ml-2 text-[0.65rem] text-[#991b1b]">
                            OFF
                          </span>
                        ) : null}
                      </p>
                      <p className="text-[0.75rem] text-[#5a6b7d]">
                        {c.discountType === "percent"
                          ? `${Number(c.discountValue)}% off`
                          : `${money(c.discountValue)} off`}
                        · used {c.redemptionCount}
                        {c.maxRedemptions != null
                          ? ` / ${c.maxRedemptions}`
                          : ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={patch.isPending}
                      onClick={() =>
                        patch.mutate({ id: c.id, isActive: !c.isActive })
                      }
                    >
                      {c.isActive ? "Disable" : "Enable"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}

      {tab === "gift" ? (
        <>
          <section className="rounded-xl border border-[#d9e0ea] bg-white p-4">
            <h2 className="text-sm font-semibold text-[#0b1f33]">
              Issue gift card
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Initial value</Label>
                <Input
                  className="mt-1"
                  type="number"
                  value={gcValue}
                  onChange={(e) => setGcValue(e.target.value)}
                />
              </div>
              <div>
                <Label>Code (optional)</Label>
                <Input
                  className="mt-1 uppercase"
                  value={gcCode}
                  onChange={(e) => setGcCode(e.target.value)}
                  placeholder="Auto-generated if blank"
                />
              </div>
            </div>
            <Button
              className="mt-4"
              type="button"
              disabled={issueCard.isPending || !Number(gcValue)}
              onClick={() => issueCard.mutate()}
            >
              {issueCard.isPending ? "Issuing…" : "Issue card"}
            </Button>
          </section>
          <section className="rounded-xl border border-[#d9e0ea] bg-white p-4">
            <h2 className="text-sm font-semibold text-[#0b1f33]">Gift cards</h2>
            {cards.isLoading ? (
              <p className="mt-2 text-sm text-[#5a6b7d]">Loading…</p>
            ) : !cards.data?.length ? (
              <EmptyState
                title="No gift cards"
                detail="Issue a card, then redeem the code at the counter (Gift pay method)."
              />
            ) : (
              <ul className="mt-3 divide-y divide-[#f0f3f7] text-sm">
                {cards.data.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="font-mono font-semibold text-[#0b1f33]">
                          {c.code}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 px-0 text-[#5a6b7d]"
                          title="Copy code"
                          onClick={() => void copyText(c.code)}
                        >
                          <Copy className="size-3.5" />
                        </Button>
                      </div>
                      <p className="text-[0.75rem] text-[#5a6b7d]">
                        Balance {money(c.balance)} · {c.status}
                        {c.customer ? ` · ${c.customer.fullName}` : ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        void loyaltyApi
                          .patchGiftCard(c.id, {
                            status:
                              c.status === "active" ? "disabled" : "active",
                          })
                          .then(() => {
                            void qc.invalidateQueries({
                              queryKey: ["loyalty-gift-cards"],
                            });
                          })
                      }
                    >
                      {c.status === "active" ? "Disable" : "Enable"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}

      {tab === "points" ? (
        <section className="rounded-xl border border-[#d9e0ea] bg-white p-4">
          <h2 className="text-sm font-semibold text-[#0b1f33]">
            Points settings
          </h2>
          <p className="mt-1 text-xs text-[#5a6b7d]">
            Earn on paid sales; redeem at counter when a customer is selected.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Points per currency paid</Label>
              <Input
                className="mt-1"
                type="number"
                value={earn}
                onChange={(e) => setEarn(e.target.value)}
              />
            </div>
            <div>
              <Label>Currency value per point</Label>
              <Input
                className="mt-1"
                type="number"
                step="0.01"
                value={cpp}
                onChange={(e) => setCpp(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#1a56db]"
                checked={ptsEnabled}
                onChange={(e) => setPtsEnabled(e.target.checked)}
              />
              Points program enabled
            </label>
          </div>
          <Button
            className="mt-4"
            type="button"
            disabled={saveSettings.isPending}
            onClick={() => {
              if (settings.data && earn === "1" && cpp === "0.01") {
                setEarn(String(settings.data.earnPerCurrency));
                setCpp(String(settings.data.currencyPerPoint));
                setPtsEnabled(settings.data.enabled);
              }
              saveSettings.mutate();
            }}
          >
            {saveSettings.isPending ? "Saving…" : "Save settings"}
          </Button>
          {settings.data ? (
            <p className="mt-2 text-xs text-[#8b9bb0]">
              Current: {settings.data.earnPerCurrency} pts / currency ·{" "}
              {settings.data.currencyPerPoint} currency / pt ·{" "}
              {settings.data.enabled ? "on" : "off"}
            </p>
          ) : null}
        </section>
      ) : null}

      {tab === "redemptions" ? (
        <section className="overflow-hidden rounded-xl border border-[#d9e0ea] bg-white">
          <div className="border-b border-[#eef2f8] px-4 py-3">
            <h2 className="text-sm font-semibold text-[#0b1f33]">
              Points redemptions
            </h2>
            <p className="mt-0.5 text-xs text-[#5a6b7d]">
              History from the counter when staff redeem customer points.
            </p>
          </div>
          {ledger.isLoading ? (
            <p className="px-4 py-8 text-center text-sm text-[#5a6b7d]">
              Loading…
            </p>
          ) : !ledger.data?.items?.length ? (
            <EmptyState
              title="No redemptions yet"
              detail="Select a customer at Counter, enter points, Quote, then Charge."
            />
          ) : (
            <div className="max-h-[min(60dvh,32rem)] overflow-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-[0.8125rem]">
                <thead className="sticky top-0 z-[1] bg-[#f8fafc] text-[0.65rem] font-semibold tracking-[0.06em] text-[#5a6b7d] uppercase">
                  <tr className="border-b border-[#e4e9f0]">
                    <th className="px-3 py-2.5">When</th>
                    <th className="px-3 py-2.5">Customer</th>
                    <th className="px-3 py-2.5 text-right">Points</th>
                    <th className="px-3 py-2.5 text-right">Balance after</th>
                    <th className="px-3 py-2.5">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.data.items.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-[#eef2f8] hover:bg-[#f8fafc]"
                    >
                      <td className="px-3 py-2 whitespace-nowrap text-[#5a6b7d]">
                        {formatDate(row.createdAt)}
                      </td>
                      <td className="px-3 py-2 font-medium text-[#0b1f33]">
                        {row.customer.fullName}
                        {row.customer.phone ? (
                          <span className="mt-0.5 block text-[0.7rem] font-normal text-[#8b9bb0]">
                            {row.customer.phone}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#b45309]">
                        {row.points}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#5a6b7d]">
                        {row.balanceAfter}
                      </td>
                      <td className="px-3 py-2 text-[#5a6b7d]">
                        {row.note ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
