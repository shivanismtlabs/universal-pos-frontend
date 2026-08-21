"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { customFieldsApi, type CustomFieldEntityKey } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";

const ENTITIES: Array<{
  value: CustomFieldEntityKey;
  label: string;
  where: string;
}> = [
  {
    value: "product",
    label: "Product (Items)",
    where: "Shows on Catalog → New Item / Edit Item",
  },
  {
    value: "customer",
    label: "Customer",
    where: "Shows on Customers → Add / Edit",
  },
  {
    value: "order",
    label: "Order (POS ticket)",
    where: "Shows on Counter (POS) ticket before payment",
  },
  {
    value: "work_job",
    label: "Service job",
    where: "Shows on service / job screens when that form is used",
  },
  {
    value: "membership",
    label: "Membership / plan",
    where: "Shows on membership / plan flows",
  },
  {
    value: "employee",
    label: "Employee",
    where: "Shows on staff records",
  },
  {
    value: "appointment",
    label: "Appointment",
    where: "Shows on appointment booking",
  },
];

const DATA_TYPES = [
  "text",
  "number",
  "date",
  "select",
  "multi_select",
  "boolean",
  "email",
  "phone",
  "currency",
] as const;

type CustomFieldDefinition = {
  id: string;
  entity: CustomFieldEntityKey;
  fieldKey: string;
  label: string;
  dataType: string;
  required: boolean;
};

export default function CustomFieldsSettingsPage() {
  const qc = useQueryClient();
  const [entity, setEntity] = useState<CustomFieldEntityKey>("product");
  const [fieldKey, setFieldKey] = useState("");
  const [label, setLabel] = useState("");
  const [dataType, setDataType] = useState<string>("text");
  const [required, setRequired] = useState(false);
  const [optionsCsv, setOptionsCsv] = useState("");

  const entityHelp =
    ENTITIES.find((e) => e.value === entity)?.where ??
    "Pick where this field should appear";

  const defsQ = useQuery({
    queryKey: ["custom-field-definitions", entity],
    queryFn: () => customFieldsApi.listDefinitions(entity),
  });

  const createDef = useMutation({
    mutationFn: async () => {
      const key = fieldKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
      const title = label.trim();
      if (!key || key.length < 2) throw new Error("Field key is required");
      if (!title) throw new Error("Label is required");
      const options =
        dataType === "select" || dataType === "multi_select"
          ? optionsCsv
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean)
          : undefined;
      return customFieldsApi.createDefinition({
        entity,
        fieldKey: key,
        label: title,
        dataType,
        required,
        ...(options?.length ? { options } : {}),
      });
    },
    onSuccess: async () => {
      toast.success(
        entity === "product"
          ? "Field added — open Catalog → New Item to fill it"
          : entity === "order"
            ? "Field added — open Counter (POS) ticket to fill it"
            : "Custom field added",
      );
      setFieldKey("");
      setLabel("");
      setOptionsCsv("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["custom-field-definitions"] }),
        qc.invalidateQueries({ queryKey: ["custom-fields"] }),
      ]);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Could not add field");
    },
  });

  const rows = useMemo<CustomFieldDefinition[]>(() => {
    const raw = defsQ.data as unknown;
    if (Array.isArray(raw)) return raw as CustomFieldDefinition[];
    if (raw && typeof raw === "object") {
      const rec = raw as { data?: unknown; items?: unknown };
      if (Array.isArray(rec.data)) return rec.data as CustomFieldDefinition[];
      if (Array.isArray(rec.items)) return rec.items as CustomFieldDefinition[];
    }
    return [];
  }, [defsQ.data]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Custom Fields"
        subtitle="Extend customer, product, order, service, rental, and subscription data without code."
      />

      <section className="space-y-4 rounded-2xl border border-[#e5e7eb] bg-white p-5">
        <div className="rounded-xl border border-[#dbe4ff] bg-[#f5f8ff] px-3 py-2.5 text-sm text-[#1e3a5f]">
          <p className="font-semibold">Where will this show?</p>
          <p className="mt-0.5 text-[0.85rem] text-[#475569]">{entityHelp}</p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Entity</Label>
            <select
              className="mt-1 h-10 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm"
              value={entity}
              onChange={(e) =>
                setEntity(e.target.value as CustomFieldEntityKey)
              }
            >
              {ENTITIES.map((it) => (
                <option key={it.value} value={it.value}>
                  {it.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Field type</Label>
            <select
              className="mt-1 h-10 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm"
              value={dataType}
              onChange={(e) => setDataType(e.target.value)}
            >
              {DATA_TYPES.map((it) => (
                <option key={it} value={it}>
                  {it}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Field key</Label>
            <Input
              className="mt-1"
              placeholder="pet_name"
              value={fieldKey}
              onChange={(e) => setFieldKey(e.target.value)}
            />
          </div>
          <div>
            <Label>Label</Label>
            <Input
              className="mt-1"
              placeholder="Pet name"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
        </div>

        {dataType === "select" || dataType === "multi_select" ? (
          <div>
            <Label>Options (comma-separated)</Label>
            <Input
              className="mt-1"
              placeholder="Small, Medium, Large"
              value={optionsCsv}
              onChange={(e) => setOptionsCsv(e.target.value)}
            />
          </div>
        ) : null}

        <label className="flex items-center gap-2 text-sm text-[#0b1f33]">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
          />
          Required field
        </label>

        <Button
          type="button"
          onClick={() => createDef.mutate()}
          disabled={createDef.isPending}
        >
          {createDef.isPending ? "Saving..." : "Add field"}
        </Button>
      </section>

      <section className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
        <h2 className="text-sm font-semibold text-[#0b1f33]">
          Defined fields — {ENTITIES.find((e) => e.value === entity)?.label}
        </h2>
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-lg border border-[#eef2f8] bg-[#f8fafc] px-3 py-2 text-sm"
            >
              <span className="font-semibold text-[#0b1f33]">{row.label}</span>
              <span className="ml-2 font-mono text-[0.75rem] text-[#5a6b7d]">
                {row.fieldKey}
              </span>
              <span className="ml-2 text-[0.75rem] text-[#5a6b7d] uppercase">
                {row.dataType}
              </span>
              {row.required ? (
                <span className="ml-2 text-[0.75rem] text-[#b45309]">
                  required
                </span>
              ) : null}
            </li>
          ))}
          {!rows.length ? (
            <li className="py-6 text-center text-sm text-[#5a6b7d]">
              No custom fields for this entity yet
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
