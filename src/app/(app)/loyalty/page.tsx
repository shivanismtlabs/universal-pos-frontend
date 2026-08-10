"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { loyaltyApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useBootstrap } from "@/lib/bootstrap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PageHeader, EmptyState, PageSkeleton } from "@/components/page-header";

/** Phase 2 loyalty path: discount coupons (one program). */
export default function LoyaltyPage() {
  const { money } = useBootstrap();
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "fixed">(
    "percent",
  );
  const [discountValue, setDiscountValue] = useState("10");
  const [minOrder, setMinOrder] = useState("");

  const list = useQuery({
    queryKey: ["loyalty-coupons"],
    queryFn: () => loyaltyApi.listCoupons(),
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

  if (list.isLoading) return <PageSkeleton rows={5} />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Loyalty · Coupons"
        subtitle="One loyalty path for Phase 2: discount codes (% or fixed) usable at checkout. Points and gift cards can come later."
      />

      <section className="rounded-xl border border-[#d9e0ea] bg-white p-4">
        <h2 className="text-sm font-semibold text-[#0b1f33]">Create coupon</h2>
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
              <option value="fixed">Fixed ₹ off</option>
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
            detail="Create a code staff can enter at the counter for % or fixed discounts."
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
                    {c.description ? ` · ${c.description}` : ""}
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
    </div>
  );
}
