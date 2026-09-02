"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import {
  suppliersApi,
  type SupplierWriteBody,
} from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { canFinance } from "@/lib/roles";
import { useAuthStore } from "@/lib/auth-store";
import { mediaUrl, cn } from "@/lib/utils";
import { prepareProductImageDataUrl } from "@/lib/image-prepare";
import { CountryStateFields } from "@/components/country-state-fields";
import { geoCountry } from "@/lib/geo";

const STATUSES = [
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
  { id: "on_hold", label: "On hold" },
  { id: "blocked", label: "Blocked" },
  { id: "archived", label: "Archived" },
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

function err(e: unknown) {
  return e instanceof ApiError ? e.messages.join(", ") : "Failed";
}

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

function EditSupplierPageInner() {
  const router = useRouter();
  const search = useSearchParams();
  const editId = search.get("id")?.trim() || "";
  const qc = useQueryClient();
  const roles = useAuthStore((s) => s.user?.roles);
  const finance = canFinance(roles);

  const [form, setForm] = useState<SupplierWriteBody>(emptyForm());
  const [hydrated, setHydrated] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [addrLine, setAddrLine] = useState("");
  const [addrCity, setAddrCity] = useState("");
  const [addrState, setAddrState] = useState("");
  const [addrPostal, setAddrPostal] = useState("");
  const [addrCountry, setAddrCountry] = useState("");
  const [addrKind, setAddrKind] = useState("billing");
  const [docType, setDocType] = useState("other");
  const [docExpiry, setDocExpiry] = useState("");

  const detail = useQuery({
    queryKey: ["supplier", editId],
    queryFn: () => suppliersApi.get(editId),
    enabled: Boolean(editId),
  });

  useEffect(() => {
    setHydrated(false);
    setForm(emptyForm());
  }, [editId]);

  useEffect(() => {
    const d = detail.data;
    if (!d || !editId || hydrated) return;
    const bank = d.bank ?? {};
    const masked = bank.masked === true;
    setForm({
      ...emptyForm(),
      name: d.name,
      code: d.code ?? "",
      legalName: d.legalName ?? "",
      supplierType: d.supplierType ?? "goods",
      category: d.category ?? "",
      status: d.status ?? "active",
      contact: d.contact ?? "",
      designation: d.designation ?? "",
      phone: d.phone ?? "",
      phoneAlt: d.phoneAlt ?? "",
      email: d.email ?? "",
      website: d.website ?? "",
      notes: d.notes ?? "",
      taxId: d.taxId ?? "",
      taxCategory: d.taxCategory ?? "",
      taxExempt: d.taxExempt === true,
      registrationNo: d.registrationNo ?? "",
      paymentTerm: d.paymentTerm ?? "net_30",
      dueDays: d.dueDays ?? 30,
      creditLimit:
        d.creditLimit != null && d.creditLimit !== ""
          ? Number(d.creditLimit)
          : undefined,
      currencyCode: d.currencyCode ?? "",
      preferredPayMethod: d.preferredPayMethod ?? "bank_transfer",
      ...(masked
        ? {}
        : {
            bankName: String(bank.bankName ?? ""),
            bankAccountName: String(bank.bankAccountName ?? ""),
            bankAccountNo: String(bank.bankAccountNo ?? ""),
            bankIdentifier: String(bank.bankIdentifier ?? ""),
            payHandle: String(bank.payHandle ?? ""),
          }),
    });
    setHydrated(true);
  }, [detail.data, editId, hydrated]);

  const set = (
    k: keyof SupplierWriteBody,
    v: string | number | boolean | undefined,
  ) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () => {
      if (!editId) throw new Error("Missing supplier id");
      if (!form.name?.trim() || form.name.trim().length < 2) {
        throw new Error("Supplier name is required");
      }
      return suppliersApi.update(editId, {
        ...form,
        name: form.name.trim(),
      });
    },
    onSuccess: async () => {
      toast.success("Supplier saved");
      await qc.invalidateQueries({ queryKey: ["suppliers"] });
      await qc.invalidateQueries({ queryKey: ["supplier", editId] });
      router.push("/suppliers");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : err(e)),
  });

  const addContact = useMutation({
    mutationFn: () =>
      suppliersApi.addContact(editId, {
        name: contactName.trim(),
        role: contactRole.trim() || undefined,
        phone: contactPhone.trim() || undefined,
        email: contactEmail.trim() || undefined,
        isPrimary: true,
      }),
    onSuccess: async () => {
      toast.success("Contact added");
      setContactName("");
      setContactRole("");
      setContactPhone("");
      setContactEmail("");
      await qc.invalidateQueries({ queryKey: ["supplier", editId] });
      await qc.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (e) => toast.error(err(e)),
  });

  const addAddr = useMutation({
    mutationFn: () =>
      suppliersApi.addAddress(editId, {
        kind: addrKind,
        line1: addrLine.trim(),
        city: addrCity.trim() || undefined,
        state: addrState.trim() || undefined,
        postalCode: addrPostal.trim() || undefined,
        country:
          geoCountry(addrCountry)?.name ??
          (addrCountry.trim() || undefined),
      }),
    onSuccess: async () => {
      toast.success("Address added");
      setAddrLine("");
      setAddrCity("");
      setAddrState("");
      setAddrPostal("");
      setAddrCountry("");
      await qc.invalidateQueries({ queryKey: ["supplier", editId] });
    },
    onError: (e) => toast.error(err(e)),
  });

  const addNote = useMutation({
    mutationFn: () => suppliersApi.addNote(editId, noteBody.trim()),
    onSuccess: async () => {
      toast.success("Note added");
      setNoteBody("");
      await qc.invalidateQueries({ queryKey: ["supplier", editId] });
    },
    onError: (e) => toast.error(err(e)),
  });

  const addDoc = useMutation({
    mutationFn: async (file: File) => {
      const imageBase64 = await prepareProductImageDataUrl(file);
      return suppliersApi.addDocument(editId, {
        docType,
        fileName: file.name,
        imageBase64,
        expiresAt: docExpiry || undefined,
      });
    },
    onSuccess: async () => {
      toast.success("Document added");
      setDocExpiry("");
      await qc.invalidateQueries({ queryKey: ["supplier", editId] });
    },
    onError: (e) => toast.error(err(e)),
  });

  if (!editId) {
    return (
      <div className="space-y-4 py-10 text-center">
        <p className="text-sm text-[#6b7280]">No supplier selected.</p>
        <Button asChild>
          <Link href="/suppliers">Back to suppliers</Link>
        </Button>
      </div>
    );
  }

  if (detail.isLoading && !hydrated) {
    return (
      <p className="py-10 text-center text-sm text-[#6b7280]">
        Loading supplier…
      </p>
    );
  }

  if (detail.isError) {
    return (
      <div className="space-y-4 py-10 text-center">
        <p className="text-sm text-red-600">
          {detail.error instanceof Error
            ? detail.error.message
            : "Could not load supplier"}
        </p>
        <Button asChild variant="secondary">
          <Link href="/suppliers">Back to suppliers</Link>
        </Button>
      </div>
    );
  }

  const field =
    "mt-1.5 h-10 w-full rounded-lg border border-[#d9e0ea] bg-white px-3 text-sm text-[#0b1f33] outline-none focus:border-[#1a56db] focus:shadow-[0_0_0_3px_rgba(26,86,219,0.12)]";

  return (
    <div className="space-y-5 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[#eef1f4] pb-3">
        <div className="min-w-0">
          <p className="eyebrow">Purchases</p>
          <h1 className="page-title mt-1">Edit supplier</h1>
          <p className="page-subtitle mt-1.5">
            {form.name?.trim() || detail.data?.name || "Vendor profile"}
            {form.code ? (
              <span className="ml-2 font-mono text-[0.75rem] text-[#8b9bb0]">
                {form.code}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" asChild>
            <Link href="/suppliers">
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
              autoFocus
            />
          </div>
          <div>
            <Label>Legal / business name</Label>
            <Input
              className="mt-1.5"
              value={form.legalName ?? ""}
              onChange={(e) => set("legalName", e.target.value)}
            />
          </div>
          <div>
            <Label>Code</Label>
            <Input
              className="mt-1.5 font-mono uppercase"
              value={form.code ?? ""}
              onChange={(e) => set("code", e.target.value)}
            />
          </div>
          <div>
            <Label>Type</Label>
            <Select
              className={field}
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
            />
          </div>
          <div>
            <Label>Status</Label>
            <Select
              className={field}
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
            <Label>Primary contact</Label>
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
                checked={form.taxExempt === true}
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
            <Label>Terms</Label>
            <Select
              className={field}
              value={form.paymentTerm ?? "net_30"}
              onChange={(e) => {
                const t = TERMS.find((x) => x.id === e.target.value);
                setForm((f) => ({
                  ...f,
                  paymentTerm: e.target.value,
                  dueDays: t?.days ?? f.dueDays,
                }));
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
              value={form.dueDays ?? ""}
              onChange={(e) => set("dueDays", Number(e.target.value))}
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
            />
          </div>
          <div>
            <Label>Preferred pay method</Label>
            <Select
              className={field}
              value={form.preferredPayMethod ?? "bank_transfer"}
              onChange={(e) => set("preferredPayMethod", e.target.value)}
            >
              <option value="bank_transfer">Bank transfer</option>
              <option value="upi">UPI / wallet</option>
              <option value="cash">Cash</option>
              <option value="cheque">Cheque</option>
              <option value="card">Card</option>
            </Select>
          </div>
        </div>
      </Section>

      {finance ? (
        <Section title="Bank / payout" hint="Visible to finance roles">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Bank name</Label>
              <Input
                className="mt-1.5"
                value={form.bankName ?? ""}
                onChange={(e) => set("bankName", e.target.value)}
              />
            </div>
            <div>
              <Label>Account holder</Label>
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
              <Label>IFSC / SWIFT / bank id</Label>
              <Input
                className="mt-1.5 font-mono uppercase"
                value={form.bankIdentifier ?? ""}
                onChange={(e) => set("bankIdentifier", e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>UPI / pay handle</Label>
              <Input
                className="mt-1.5"
                value={form.payHandle ?? ""}
                onChange={(e) => set("payHandle", e.target.value)}
              />
            </div>
          </div>
        </Section>
      ) : null}

      <Section title="Internal notes">
        <textarea
          className={cn(
            "mt-0 min-h-[100px] w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm text-[#0b1f33]",
            "outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/15",
          )}
          value={form.notes ?? ""}
          onChange={(e) => set("notes", e.target.value)}
        />
      </Section>

      <Section title="Extra contacts" hint="Additional people at this vendor">
        <ul className="mb-3 space-y-1 text-sm text-[#4b5563]">
          {(detail.data?.contacts ?? []).map((c) => (
            <li key={c.id}>
              {c.name}
              {c.role ? ` · ${c.role}` : ""}
              {c.phone ? ` · ${c.phone}` : ""}
              {c.isPrimary ? " · primary" : ""}
            </li>
          ))}
          {!detail.data?.contacts?.length ? (
            <li className="text-[#94a3b8]">No extra contacts yet</li>
          ) : null}
        </ul>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            placeholder="Name"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
          />
          <Input
            placeholder="Role (sales, accounts…)"
            value={contactRole}
            onChange={(e) => setContactRole(e.target.value)}
          />
          <Input
            placeholder="Phone"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
          />
          <Input
            placeholder="Email"
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="mt-3"
          disabled={!contactName.trim() || addContact.isPending}
          onClick={() => addContact.mutate()}
        >
          Add contact
        </Button>
      </Section>

      <Section title="Addresses">
        <ul className="mb-3 space-y-1 text-sm text-[#4b5563]">
          {(detail.data?.addresses ?? []).map((a) => (
            <li key={a.id}>
              {a.kind}: {a.line1}
              {a.city ? `, ${a.city}` : ""}
            </li>
          ))}
          {!detail.data?.addresses?.length ? (
            <li className="text-[#94a3b8]">No addresses yet</li>
          ) : null}
        </ul>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Select
            value={addrKind}
            onChange={(e) => setAddrKind(e.target.value)}
          >
            <option value="billing">Billing</option>
            <option value="shipping">Shipping</option>
            <option value="other">Other</option>
          </Select>
          <Input
            placeholder="Line 1"
            value={addrLine}
            onChange={(e) => setAddrLine(e.target.value)}
          />
          <Input
            placeholder="City"
            value={addrCity}
            onChange={(e) => setAddrCity(e.target.value)}
          />
          <div className="sm:col-span-2 lg:col-span-3 grid gap-2 sm:grid-cols-2">
            <CountryStateFields
              countryCode={addrCountry}
              state={addrState}
              onCountry={setAddrCountry}
              onState={setAddrState}
            />
          </div>
          <Input
            placeholder="Postal code"
            value={addrPostal}
            onChange={(e) => setAddrPostal(e.target.value)}
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="mt-3"
          disabled={!addrLine.trim() || addAddr.isPending}
          onClick={() => addAddr.mutate()}
        >
          Add address
        </Button>
      </Section>

      {finance ? (
        <Section title="Documents" hint="Tax certificates, contracts, and more">
          <ul className="mb-3 space-y-1 text-sm text-[#4b5563]">
            {(detail.data?.documents ?? []).map((d) => (
              <li key={d.id}>
                <a
                  className="text-[#1a56db] hover:underline"
                  href={mediaUrl(d.fileUrl) || d.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {d.docType}
                </a>
                {d.fileName ? ` · ${d.fileName}` : ""}
                {d.expiresAt
                  ? ` · exp ${String(d.expiresAt).slice(0, 10)}`
                  : ""}
              </li>
            ))}
            {!detail.data?.documents?.length ? (
              <li className="text-[#94a3b8]">No documents yet</li>
            ) : null}
          </ul>
          <div className="grid gap-2 sm:grid-cols-3">
            <Select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
            >
              <option value="tax_certificate">Tax certificate</option>
              <option value="registration">Registration</option>
              <option value="contract">Contract</option>
              <option value="agreement">Agreement</option>
              <option value="bank">Bank document</option>
              <option value="price_list">Price list</option>
              <option value="license">License</option>
              <option value="other">Other</option>
            </Select>
            <Input
              type="date"
              value={docExpiry}
              onChange={(e) => setDocExpiry(e.target.value)}
            />
            <Input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) addDoc.mutate(f);
              }}
            />
          </div>
        </Section>
      ) : null}

      <Section title="Activity">
        <ul className="mb-3 max-h-40 overflow-auto text-sm text-[#4b5563]">
          {(detail.data?.notesFeed ?? []).map((n) => (
            <li key={n.id} className="border-b border-[#f3f4f6] py-1.5">
              {n.body}
            </li>
          ))}
          {!detail.data?.notesFeed?.length ? (
            <li className="text-[#94a3b8]">No notes yet</li>
          ) : null}
        </ul>
        <div className="flex gap-2">
          <Input
            placeholder="Add a note"
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!noteBody.trim() || addNote.isPending}
            onClick={() => addNote.mutate()}
          >
            Add
          </Button>
        </div>
      </Section>

      <div className="flex justify-end gap-2 border-t border-[#eef1f4] pt-4">
        <Button variant="secondary" asChild>
          <Link href="/suppliers">Cancel</Link>
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

export default function EditSupplierPage() {
  return (
    <Suspense
      fallback={
        <p className="py-10 text-center text-sm text-[#6b7280]">Loading…</p>
      }
    >
      <EditSupplierPageInner />
    </Suspense>
  );
}
