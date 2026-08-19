"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  suppliersApi,
  type SupplierRow,
  type SupplierWriteBody,
} from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { TablePager } from "@/components/table-pager";
import { canFinance } from "@/lib/roles";
import { useAuthStore } from "@/lib/auth-store";
import { mediaUrl } from "@/lib/utils";
import { prepareProductImageDataUrl } from "@/lib/image-prepare";

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

export function SupplierMasterPanel() {
  const qc = useQueryClient();
  const roles = useAuthStore((s) => s.user?.roles);
  const finance = canFinance(roles);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<SupplierWriteBody>(emptyForm());
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

  const list = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => suppliersApi.list(),
  });
  const detail = useQuery({
    queryKey: ["supplier", editId],
    queryFn: () => suppliersApi.get(editId!),
    enabled: Boolean(editId),
  });

  useEffect(() => {
    const d = detail.data;
    if (!d || !editId) return;
    const bank = d.bank ?? {};
    const masked = bank.masked === true;
    setForm((f) => ({
      ...f,
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
    }));
  }, [detail.data, editId]);

  const rows = useMemo(() => {
    const all = (list.data ?? []) as SupplierRow[];
    const q = filter.trim().toLowerCase();
    return all.filter((s) => {
      if (statusFilter !== "all" && (s.status ?? "active") !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return [s.name, s.code, s.phone, s.contact, s.category]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [list.data, filter, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [filter, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const save = useMutation({
    mutationFn: () => {
      if (!form.name?.trim() || form.name.trim().length < 2) {
        throw new Error("Supplier name is required");
      }
      const body = { ...form, name: form.name.trim() };
      return editId
        ? suppliersApi.update(editId, body)
        : suppliersApi.create(body);
    },
    onSuccess: async (row) => {
      toast.success(editId ? "Supplier saved" : "Supplier created");
      await qc.invalidateQueries({ queryKey: ["suppliers"] });
      const id = (row as SupplierRow)?.id;
      if (id) {
        setEditId(id);
        await qc.invalidateQueries({ queryKey: ["supplier", id] });
      } else {
        setOpen(false);
        setForm(emptyForm());
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : err(e)),
  });

  const addContact = useMutation({
    mutationFn: () =>
      suppliersApi.addContact(editId!, {
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
      suppliersApi.addAddress(editId!, {
        kind: addrKind,
        line1: addrLine.trim(),
        city: addrCity.trim() || undefined,
        state: addrState.trim() || undefined,
        postalCode: addrPostal.trim() || undefined,
        country: addrCountry.trim() || undefined,
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
    mutationFn: () => suppliersApi.addNote(editId!, noteBody.trim()),
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
      return suppliersApi.addDocument(editId!, {
        docType: docType.trim() || "other",
        imageBase64,
        fileName: file.name,
        expiresAt: docExpiry || undefined,
      });
    },
    onSuccess: async () => {
      toast.success("Document uploaded");
      setDocExpiry("");
      await qc.invalidateQueries({ queryKey: ["supplier", editId] });
    },
    onError: (e) => toast.error(err(e)),
  });

  function startNew() {
    setEditId(null);
    setForm(emptyForm());
    setOpen(true);
  }

  function startEdit(s: SupplierRow) {
    setEditId(s.id);
    setForm({
      ...emptyForm(),
      name: s.name,
      code: s.code ?? "",
      legalName: s.legalName ?? "",
      supplierType: s.supplierType ?? "goods",
      category: s.category ?? "",
      status: s.status ?? "active",
      contact: s.contact ?? "",
      phone: s.phone ?? "",
      email: s.email ?? "",
      paymentTerm: s.paymentTerm ?? "net_30",
      dueDays: s.dueDays ?? 30,
    });
    setOpen(true);
  }

  const set = (k: keyof SupplierWriteBody, v: string | number | boolean | undefined) =>
    setForm((f) => ({ ...f, [k]: v }));

  const field = "mt-1 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-sm";

  return (
    <section className="rounded-2xl border border-[#e5e7eb] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e5e7eb] px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-[#111827]">Suppliers</h2>
          <p className="text-xs text-[#6b7280]">
            One master list for any shop — goods, services, or both.
          </p>
        </div>
        <Button type="button" size="sm" onClick={startNew}>
          + New supplier
        </Button>
      </div>
      <div className="flex flex-wrap gap-2 px-4 py-2">
        <Input
          className="min-w-[12rem] flex-1"
          placeholder="Search name, code, phone…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <Select
          className="w-40"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#f9fafb] text-xs uppercase tracking-wide text-[#6b7280]">
            <tr>
              <th className="px-4 py-2 font-medium">Code</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Terms</th>
              <th className="px-4 py-2 font-medium"> </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((s) => (
              <tr key={s.id} className="border-t border-[#f3f4f6]">
                <td className="px-4 py-2 font-mono text-xs">{s.code ?? "—"}</td>
                <td className="px-4 py-2">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-[#6b7280]">
                    {[s.contact, s.phone].filter(Boolean).join(" · ") || "—"}
                  </p>
                </td>
                <td className="px-4 py-2 capitalize">
                  {(s.status ?? "active").replaceAll("_", " ")}
                </td>
                <td className="px-4 py-2 text-xs text-[#6b7280]">
                  {(s.paymentTerm ?? "—").replaceAll("_", " ")}
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    className="text-xs font-medium text-[#1a56db]"
                    onClick={() => startEdit(s)}
                  >
                    Open
                  </button>
                </td>
              </tr>
            ))}
            {!pageRows.length ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-[#6b7280]">
                  No suppliers yet
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <TablePager
        page={page}
        totalPages={pageCount}
        total={rows.length}
        pageSize={PAGE_SIZE}
        onPage={setPage}
      />

      {open ? (
        <div className="space-y-4 border-t border-[#e5e7eb] p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              {editId ? "Edit supplier" : "New supplier"}
            </h3>
            <button
              type="button"
              className="text-xs text-[#6b7280]"
              onClick={() => {
                setOpen(false);
                setEditId(null);
              }}
            >
              Close
            </button>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
              Basic
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Supplier name *</Label>
                <Input className="mt-1" value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} />
              </div>
              <div>
                <Label>Legal / business name</Label>
                <Input className="mt-1" value={form.legalName ?? ""} onChange={(e) => set("legalName", e.target.value)} />
              </div>
              <div>
                <Label>Code</Label>
                <Input className="mt-1" placeholder="Auto SUP-000001" value={form.code ?? ""} onChange={(e) => set("code", e.target.value)} />
              </div>
              <div>
                <Label>Type</Label>
                <Select className={field} value={form.supplierType ?? "goods"} onChange={(e) => set("supplierType", e.target.value)}>
                  {TYPES.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Category</Label>
                <Input className="mt-1" placeholder="e.g. Chemicals, Fabric, Parts" value={form.category ?? ""} onChange={(e) => set("category", e.target.value)} />
              </div>
              <div>
                <Label>Status</Label>
                <Select className={field} value={form.status ?? "active"} onChange={(e) => set("status", e.target.value)}>
                  {STATUSES.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </Select>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
              Contact
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Primary contact</Label>
                <Input className="mt-1" value={form.contact ?? ""} onChange={(e) => set("contact", e.target.value)} />
              </div>
              <div>
                <Label>Designation</Label>
                <Input className="mt-1" value={form.designation ?? ""} onChange={(e) => set("designation", e.target.value)} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input className="mt-1" value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
              </div>
              <div>
                <Label>Alternate phone</Label>
                <Input className="mt-1" value={form.phoneAlt ?? ""} onChange={(e) => set("phoneAlt", e.target.value)} />
              </div>
              <div>
                <Label>Email</Label>
                <Input className="mt-1" type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
              </div>
              <div>
                <Label>Website</Label>
                <Input className="mt-1" value={form.website ?? ""} onChange={(e) => set("website", e.target.value)} />
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
              Tax identity
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Tax ID (GSTIN / VAT / EIN)</Label>
                <Input className="mt-1" value={form.taxId ?? ""} onChange={(e) => set("taxId", e.target.value)} />
              </div>
              <div>
                <Label>Tax category</Label>
                <Input className="mt-1" value={form.taxCategory ?? ""} onChange={(e) => set("taxCategory", e.target.value)} />
              </div>
              <div>
                <Label>Registration no.</Label>
                <Input className="mt-1" value={form.registrationNo ?? ""} onChange={(e) => set("registrationNo", e.target.value)} />
              </div>
              <label className="flex items-center gap-2 pt-6 text-sm">
                <input
                  type="checkbox"
                  checked={form.taxExempt === true}
                  onChange={(e) => set("taxExempt", e.target.checked)}
                />
                Tax exempt
              </label>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
              Payment terms
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
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
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Due days</Label>
                <Input className="mt-1" type="number" min={0} value={form.dueDays ?? ""} onChange={(e) => set("dueDays", Number(e.target.value))} />
              </div>
              <div>
                <Label>Credit limit</Label>
                <Input className="mt-1" type="number" min={0} step="0.01" value={form.creditLimit ?? ""} onChange={(e) => set("creditLimit", e.target.value === "" ? undefined : Number(e.target.value))} />
              </div>
              <div>
                <Label>Preferred pay method</Label>
                <Select className={field} value={form.preferredPayMethod ?? "bank_transfer"} onChange={(e) => set("preferredPayMethod", e.target.value)}>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="upi">UPI / wallet</option>
                  <option value="cash">Cash</option>
                  <option value="cheque">Cheque</option>
                  <option value="card">Card</option>
                </Select>
              </div>
            </div>
          </div>

          {finance ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                Bank / payout (finance roles)
              </p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Bank name</Label>
                  <Input className="mt-1" value={form.bankName ?? ""} onChange={(e) => set("bankName", e.target.value)} />
                </div>
                <div>
                  <Label>Account holder</Label>
                  <Input className="mt-1" value={form.bankAccountName ?? ""} onChange={(e) => set("bankAccountName", e.target.value)} />
                </div>
                <div>
                  <Label>Account number</Label>
                  <Input className="mt-1" value={form.bankAccountNo ?? ""} onChange={(e) => set("bankAccountNo", e.target.value)} />
                </div>
                <div>
                  <Label>IFSC / SWIFT / bank id</Label>
                  <Input className="mt-1" value={form.bankIdentifier ?? ""} onChange={(e) => set("bankIdentifier", e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <Label>UPI / pay handle</Label>
                  <Input className="mt-1" value={form.payHandle ?? ""} onChange={(e) => set("payHandle", e.target.value)} />
                </div>
              </div>
            </div>
          ) : null}

          <div>
            <Label>Internal notes</Label>
            <textarea
              className="mt-1 min-h-[64px] w-full rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm"
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>

          <Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
            {editId ? "Save supplier" : "Create supplier"}
          </Button>

          {editId ? (
            <div className="space-y-3 border-t border-[#e5e7eb] pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                Extra contacts
              </p>
              <ul className="text-xs text-[#4b5563]">
                {(detail.data?.contacts ?? []).map((c) => (
                  <li key={c.id}>
                    {c.name}
                    {c.role ? ` · ${c.role}` : ""}
                    {c.phone ? ` · ${c.phone}` : ""}
                    {c.isPrimary ? " · primary" : ""}
                  </li>
                ))}
              </ul>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Input placeholder="Name" value={contactName} onChange={(e) => setContactName(e.target.value)} />
                <Input placeholder="Role (sales, accounts…)" value={contactRole} onChange={(e) => setContactRole(e.target.value)} />
                <Input placeholder="Phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
                <Input placeholder="Email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
              </div>
              <Button type="button" size="sm" variant="secondary" disabled={!contactName.trim() || addContact.isPending} onClick={() => addContact.mutate()}>
                Add contact
              </Button>

              <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                Addresses
              </p>
              <ul className="text-xs text-[#4b5563]">
                {(detail.data?.addresses ?? []).map((a) => (
                  <li key={a.id}>
                    {a.kind}: {a.line1}
                    {a.city ? `, ${a.city}` : ""}
                  </li>
                ))}
              </ul>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <Select value={addrKind} onChange={(e) => setAddrKind(e.target.value)}>
                  <option value="billing">Billing</option>
                  <option value="shipping">Shipping</option>
                  <option value="other">Other</option>
                </Select>
                <Input placeholder="Line 1" value={addrLine} onChange={(e) => setAddrLine(e.target.value)} />
                <Input placeholder="City" value={addrCity} onChange={(e) => setAddrCity(e.target.value)} />
                <Input placeholder="State / region" value={addrState} onChange={(e) => setAddrState(e.target.value)} />
                <Input placeholder="Postal code" value={addrPostal} onChange={(e) => setAddrPostal(e.target.value)} />
                <Input placeholder="Country" value={addrCountry} onChange={(e) => setAddrCountry(e.target.value)} />
              </div>
              <Button type="button" size="sm" variant="secondary" disabled={!addrLine.trim() || addAddr.isPending} onClick={() => addAddr.mutate()}>
                Add address
              </Button>

              {finance ? (
                <>
                  <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                    Documents
                  </p>
                  <ul className="space-y-1 text-xs text-[#4b5563]">
                    {(detail.data?.documents ?? []).map((d) => (
                      <li key={d.id}>
                        <a
                          className="text-[#1a56db]"
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
                  </ul>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Select value={docType} onChange={(e) => setDocType(e.target.value)}>
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
                  <p className="text-[0.65rem] text-[#8b9bb0]">
                    Type is free-form in the API — these labels are examples only.
                  </p>
                </>
              ) : null}

              <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                Activity
              </p>
              <ul className="max-h-28 overflow-auto text-xs text-[#4b5563]">
                {(detail.data?.notesFeed ?? []).map((n) => (
                  <li key={n.id} className="border-b border-[#f3f4f6] py-1">
                    {n.body}
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <Input placeholder="Add a note" value={noteBody} onChange={(e) => setNoteBody(e.target.value)} />
                <Button type="button" size="sm" variant="secondary" disabled={!noteBody.trim() || addNote.isPending} onClick={() => addNote.mutate()}>
                  Add
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
