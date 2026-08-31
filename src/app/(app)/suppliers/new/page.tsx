"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { suppliersApi, type SupplierWriteBody } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useSetupReturn } from "@/lib/use-setup-return";
import { CountryStateFields } from "@/components/country-state-fields";
import { geoCountry } from "@/lib/geo";

const STATUSES = [
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
  { id: "on_hold", label: "On hold" },
  { id: "blocked", label: "Blocked" },
] as const;

const TYPES = [
  { id: "goods", label: "Goods" },
  { id: "services", label: "Services" },
  { id: "both", label: "Goods & services" },
  { id: "manufacturer", label: "Manufacturer" },
  { id: "wholesaler", label: "Wholesaler" },
  { id: "other", label: "Other" },
] as const;

const TERMS = [
  { id: "immediate", label: "Immediate", days: 0 },
  { id: "net_7", label: "Net 7", days: 7 },
  { id: "net_15", label: "Net 15", days: 15 },
  { id: "net_30", label: "Net 30", days: 30 },
  { id: "net_45", label: "Net 45", days: 45 },
  { id: "net_60", label: "Net 60", days: 60 },
  { id: "custom", label: "Custom", days: null },
] as const;

const emptyForm = (): SupplierWriteBody => ({
  name: "",
  code: "",
  legalName: "",
  supplierType: "goods",
  category: "",
  status: "active",
  contact: "",
  designation: "",
  phone: "",
  phoneAlt: "",
  email: "",
  website: "",
  notes: "",
  taxId: "",
  taxCategory: "",
  taxExempt: false,
  registrationNo: "",
  paymentTerm: "net_30",
  dueDays: 30,
  creditLimit: undefined,
  currencyCode: "",
  preferredPayMethod: "bank_transfer",
  bankName: "",
  bankAccountName: "",
  bankAccountNo: "",
  bankIdentifier: "",
  payHandle: "",
});

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#d9e0ea] bg-white p-5 shadow-[0_1px_2px_rgba(11,31,51,0.04)]">
      <div className="mb-4 border-b border-[#eef1f4] pb-3">
        <h2 className="section-title text-[0.95rem]">{title}</h2>
        {hint ? (
          <p className="mt-1 text-[0.8rem] font-medium text-[#64748b]">{hint}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function NewSupplierPageInner() {
  const qc = useQueryClient();
  const { fromSetupFlow, returnTo, redirectAfterSetupSave } = useSetupReturn();
  const [form, setForm] = useState<SupplierWriteBody>(emptyForm);
  const [addrLine, setAddrLine] = useState("");
  const [addrCity, setAddrCity] = useState("");
  const [addrPostal, setAddrPostal] = useState("");
  const [addrState, setAddrState] = useState("");
  const [addrCountry, setAddrCountry] = useState("IN");

  const set = (
    k: keyof SupplierWriteBody,
    v: string | number | boolean | undefined,
  ) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      const name = (form.name ?? "").trim();
      if (!name) throw new Error("Supplier name is required");
      const row = await suppliersApi.create({
        ...form,
        name,
        code: form.code?.trim() || undefined,
        dueDays:
          form.paymentTerm === "custom"
            ? Number(form.dueDays) || 0
            : (TERMS.find((t) => t.id === form.paymentTerm)?.days ??
              form.dueDays),
        creditLimit:
          form.creditLimit != null && String(form.creditLimit) !== ""
            ? Number(form.creditLimit)
            : undefined,
      });
      const line1 = addrLine.trim();
      if (row?.id && line1) {
        await suppliersApi.addAddress(row.id, {
          kind: "billing",
          line1,
          city: addrCity.trim() || undefined,
          state: addrState.trim() || undefined,
          postalCode: addrPostal.trim() || undefined,
          country:
            geoCountry(addrCountry)?.name ??
            (addrCountry.trim() || undefined),
          isDefault: true,
        });
      }
      return row;
    },
    onSuccess: (row) => {
      toast.success(
        fromSetupFlow
          ? "Supplier created — back to Getting Started"
          : "Supplier created",
      );
      void qc.invalidateQueries({ queryKey: ["suppliers"] });
      redirectAfterSetupSave(
        `/suppliers${row?.id ? `?highlight=${row.id}` : ""}`,
      );
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError
          ? e.messages.join(", ")
          : e instanceof Error
            ? e.message
            : "Could not create supplier",
      ),
  });

  return (
    <div className="space-y-5 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[#eef1f4] pb-3">
        <div className="min-w-0">
          <p className="eyebrow">Purchases</p>
          <h1 className="page-title mt-1">New supplier</h1>
          <p className="page-subtitle mt-1.5">
            Vendor profile for POs, GRN, and payables — any business type.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" asChild>
            <Link href={returnTo ?? "/suppliers"}>
              <ArrowLeft className="mr-1.5 size-4" />
              Cancel
            </Link>
          </Button>
          <Button
            type="button"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save supplier"}
          </Button>
        </div>
      </header>

      <Section title="Basic details" hint="Name and how you classify this vendor">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Supplier name *</Label>
            <Input
              className="mt-1.5"
              value={form.name ?? ""}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. AquaChem Distributors"
              autoFocus
            />
          </div>
          <div>
            <Label>Legal / business name</Label>
            <Input
              className="mt-1.5"
              value={form.legalName ?? ""}
              onChange={(e) => set("legalName", e.target.value)}
              placeholder="Registered company name"
            />
          </div>
          <div>
            <Label>Supplier code</Label>
            <Input
              className="mt-1.5 font-mono uppercase"
              value={form.code ?? ""}
              onChange={(e) => set("code", e.target.value)}
              placeholder="Auto SUP-000001"
            />
            <p className="mt-1 text-[0.7rem] text-[#94a3b8]">
              Leave blank to auto-generate
            </p>
          </div>
          <div>
            <Label>Type</Label>
            <Select
              className="mt-1.5"
              value={form.supplierType ?? "goods"}
              onChange={(e) => set("supplierType", e.target.value)}
            >
              {TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Category</Label>
            <Input
              className="mt-1.5"
              value={form.category ?? ""}
              onChange={(e) => set("category", e.target.value)}
              placeholder="e.g. Chemicals, Fabric, Parts"
            />
          </div>
          <div>
            <Label>Status</Label>
            <Select
              className="mt-1.5"
              value={form.status ?? "active"}
              onChange={(e) => set("status", e.target.value)}
            >
              {STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Section>

      <Section title="Primary contact" hint="Who you call for orders and issues">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Contact name</Label>
            <Input
              className="mt-1.5"
              value={form.contact ?? ""}
              onChange={(e) => set("contact", e.target.value)}
            />
          </div>
          <div>
            <Label>Designation</Label>
            <Input
              className="mt-1.5"
              value={form.designation ?? ""}
              onChange={(e) => set("designation", e.target.value)}
              placeholder="Sales manager"
            />
          </div>
          <div>
            <Label>Phone</Label>
            <Input
              className="mt-1.5"
              value={form.phone ?? ""}
              onChange={(e) => set("phone", e.target.value)}
            />
          </div>
          <div>
            <Label>Alternate phone</Label>
            <Input
              className="mt-1.5"
              value={form.phoneAlt ?? ""}
              onChange={(e) => set("phoneAlt", e.target.value)}
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              className="mt-1.5"
              type="email"
              value={form.email ?? ""}
              onChange={(e) => set("email", e.target.value)}
            />
          </div>
          <div>
            <Label>Website</Label>
            <Input
              className="mt-1.5"
              value={form.website ?? ""}
              onChange={(e) => set("website", e.target.value)}
              placeholder="https://"
            />
          </div>
        </div>
      </Section>

      <Section title="Tax identity" hint="GSTIN / VAT / EIN — country-agnostic">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Tax ID</Label>
            <Input
              className="mt-1.5 font-mono uppercase"
              value={form.taxId ?? ""}
              onChange={(e) => set("taxId", e.target.value)}
              placeholder="GSTIN / VAT / EIN"
            />
          </div>
          <div>
            <Label>Tax category</Label>
            <Input
              className="mt-1.5"
              value={form.taxCategory ?? ""}
              onChange={(e) => set("taxCategory", e.target.value)}
            />
          </div>
          <div>
            <Label>Registration no.</Label>
            <Input
              className="mt-1.5"
              value={form.registrationNo ?? ""}
              onChange={(e) => set("registrationNo", e.target.value)}
            />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[#334155]">
              <input
                type="checkbox"
                className="size-4 rounded border-[#cbd5e1]"
                checked={Boolean(form.taxExempt)}
                onChange={(e) => set("taxExempt", e.target.checked)}
              />
              Tax exempt
            </label>
          </div>
        </div>
      </Section>

      <Section title="Payment terms" hint="Defaults used on POs and invoices">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Payment term</Label>
            <Select
              className="mt-1.5"
              value={form.paymentTerm ?? "net_30"}
              onChange={(e) => {
                const id = e.target.value;
                const term = TERMS.find((t) => t.id === id);
                set("paymentTerm", id);
                if (term?.days != null) set("dueDays", term.days);
              }}
            >
              {TERMS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Due days</Label>
            <Input
              className="mt-1.5"
              type="number"
              min={0}
              value={form.dueDays ?? 30}
              onChange={(e) => set("dueDays", Number(e.target.value) || 0)}
              disabled={form.paymentTerm !== "custom"}
            />
          </div>
          <div>
            <Label>Credit limit</Label>
            <Input
              className="mt-1.5"
              type="number"
              min={0}
              step="0.01"
              value={form.creditLimit ?? ""}
              onChange={(e) =>
                set(
                  "creditLimit",
                  e.target.value === "" ? undefined : Number(e.target.value),
                )
              }
              placeholder="Optional"
            />
          </div>
          <div>
            <Label>Currency</Label>
            <Input
              className="mt-1.5 uppercase"
              maxLength={3}
              value={form.currencyCode ?? ""}
              onChange={(e) => set("currencyCode", e.target.value)}
              placeholder="Shop default"
            />
          </div>
        </div>
      </Section>

      <Section title="Bank / payout" hint="Optional — used for AP remittance">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Preferred pay method</Label>
            <Select
              className="mt-1.5"
              value={form.preferredPayMethod ?? "bank_transfer"}
              onChange={(e) => set("preferredPayMethod", e.target.value)}
            >
              <option value="bank_transfer">Bank transfer</option>
              <option value="upi">UPI</option>
              <option value="cheque">Cheque</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </Select>
          </div>
          <div>
            <Label>UPI / pay handle</Label>
            <Input
              className="mt-1.5"
              value={form.payHandle ?? ""}
              onChange={(e) => set("payHandle", e.target.value)}
            />
          </div>
          <div>
            <Label>Bank name</Label>
            <Input
              className="mt-1.5"
              value={form.bankName ?? ""}
              onChange={(e) => set("bankName", e.target.value)}
            />
          </div>
          <div>
            <Label>Account name</Label>
            <Input
              className="mt-1.5"
              value={form.bankAccountName ?? ""}
              onChange={(e) => set("bankAccountName", e.target.value)}
            />
          </div>
          <div>
            <Label>Account number</Label>
            <Input
              className="mt-1.5 font-mono"
              value={form.bankAccountNo ?? ""}
              onChange={(e) => set("bankAccountNo", e.target.value)}
            />
          </div>
          <div>
            <Label>IFSC / routing / SWIFT</Label>
            <Input
              className="mt-1.5 font-mono uppercase"
              value={form.bankIdentifier ?? ""}
              onChange={(e) => set("bankIdentifier", e.target.value)}
            />
          </div>
        </div>
      </Section>

      <Section
        title="Billing address"
        hint="Optional — used on POs and payables"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Address line</Label>
            <Input
              className="mt-1.5"
              value={addrLine}
              onChange={(e) => setAddrLine(e.target.value)}
              placeholder="Street, warehouse, building"
            />
          </div>
          <div>
            <Label>City</Label>
            <Input
              className="mt-1.5"
              value={addrCity}
              onChange={(e) => setAddrCity(e.target.value)}
            />
          </div>
          <div>
            <Label>Postal code</Label>
            <Input
              className="mt-1.5"
              value={addrPostal}
              onChange={(e) => setAddrPostal(e.target.value)}
            />
          </div>
          <CountryStateFields
            countryCode={addrCountry}
            state={addrState}
            onCountry={setAddrCountry}
            onState={setAddrState}
          />
        </div>
      </Section>

      <Section title="Internal notes">
        <textarea
          className={cn(
            "mt-0 min-h-[100px] w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm text-[#0b1f33]",
            "outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/15",
          )}
          value={form.notes ?? ""}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Delivery preferences, lead times, account manager notes…"
        />
      </Section>

      <div className="flex justify-end gap-2 border-t border-[#eef1f4] pt-4">
        <Button variant="secondary" asChild>
          <Link href={returnTo ?? "/suppliers"}>Cancel</Link>
        </Button>
        <Button
          type="button"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving…" : "Save supplier"}
        </Button>
      </div>
    </div>
  );
}

export default function NewSupplierPage() {
  return (
    <Suspense
      fallback={
        <p className="py-10 text-center text-sm text-[#6b7280]">Loading…</p>
      }
    >
      <NewSupplierPageInner />
    </Suspense>
  );
}
