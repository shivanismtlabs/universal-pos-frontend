"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { inventoryApi, tenantsApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatInr } from "@/lib/utils";
import { useAuthStore } from "@/lib/auth-store";

type Form = {
  storeId: string;
  productStyleId: string;
  sku: string;
  sellPrice: number;
  qtyOnHand: number;
};

export default function RetailPage() {
  const qc = useQueryClient();
  const storeId = useAuthStore((s) => s.user?.storeId) ?? "";

  const list = useQuery({
    queryKey: ["retail-skus"],
    queryFn: () => inventoryApi.listRetailSkus({ limit: 100 }),
  });
  const styles = useQuery({
    queryKey: ["styles"],
    queryFn: () => inventoryApi.listStyles(),
  });
  const stores = useQuery({
    queryKey: ["stores"],
    queryFn: () => tenantsApi.listStores(),
  });

  const form = useForm<Form>({
    defaultValues: {
      storeId: storeId || "",
      productStyleId: "",
      sku: "",
      sellPrice: 499,
      qtyOnHand: 10,
    },
  });

  const create = useMutation({
    mutationFn: (v: Form) =>
      inventoryApi.createRetailSku({
        storeId: v.storeId,
        productStyleId: v.productStyleId,
        sku: v.sku,
        sellPrice: Number(v.sellPrice),
        qtyOnHand: Number(v.qtyOnHand),
      }),
    onSuccess: () => {
      toast.success("Retail SKU created");
      form.reset({
        storeId: storeId || form.getValues("storeId"),
        productStyleId: "",
        sku: "",
        sellPrice: 499,
        qtyOnHand: 10,
      });
      void qc.invalidateQueries({ queryKey: ["retail-skus"] });
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
        <h1 className="display mt-1 text-3xl text-[#111827]">Retail stock</h1>
        <p className="mt-1 text-sm text-[#6b7280]">
          Accessories sold outright — qty decrements when added to an order
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.9fr]">
        <section className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
          <ul className="divide-y divide-[#f3f4f6]">
            {(list.data?.items ?? []).map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-mono text-sm font-semibold">{s.sku}</p>
                  <p className="truncate text-sm text-[#6b7280]">
                    {s.productStyle?.name ?? "—"}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold tabular-nums">
                    {formatInr(s.sellPrice)}
                  </p>
                  <p className="text-[#6b7280]">Qty {s.qtyOnHand}</p>
                </div>
              </li>
            ))}
          </ul>
          {!list.isLoading && !(list.data?.items ?? []).length ? (
            <p className="px-4 py-8 text-sm text-[#6b7280]">No retail SKUs yet</p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
          <h2 className="display text-xl">Add SKU</h2>
          <form
            className="mt-4 space-y-3"
            onSubmit={form.handleSubmit((v) => create.mutate(v))}
          >
            <div>
              <Label>Store</Label>
              <select className="mt-1.5 select-field" {...form.register("storeId")}>
                <option value="">Select</option>
                {(stores.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Style</Label>
              <select
                className="mt-1.5 select-field"
                {...form.register("productStyleId")}
              >
                <option value="">Select</option>
                {(styles.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>SKU</Label>
              <Input className="mt-1.5" {...form.register("sku", { required: true })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Sell ₹</Label>
                <Input
                  className="mt-1.5"
                  type="number"
                  {...form.register("sellPrice", { valueAsNumber: true })}
                />
              </div>
              <div>
                <Label>Qty</Label>
                <Input
                  className="mt-1.5"
                  type="number"
                  {...form.register("qtyOnHand", { valueAsNumber: true })}
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={create.isPending}>
              {create.isPending ? "Saving…" : "Add retail SKU"}
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}
