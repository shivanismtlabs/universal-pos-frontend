import type { MetaFieldDef } from "@/lib/business-config";

export type CustomFieldDefLite = {
  fieldKey: string;
  label: string;
  dataType: string;
  required?: boolean;
  options?: unknown;
};

function parseOptions(
  raw: unknown,
): Array<{ value: string; label: string }> | undefined {
  if (!raw) return undefined;
  // Settings API may store { options: ["a","b"] } or a flat array
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const nested = (raw as { options?: unknown }).options;
    if (nested !== undefined) return parseOptions(nested);
  }
  if (Array.isArray(raw)) {
    const out: Array<{ value: string; label: string }> = [];
    for (const item of raw) {
      if (typeof item === "string" && item.trim()) {
        out.push({ value: item.trim(), label: item.trim() });
      } else if (item && typeof item === "object") {
        const rec = item as Record<string, unknown>;
        const value = String(rec.value ?? rec.id ?? rec.label ?? "").trim();
        const label = String(rec.label ?? rec.name ?? value).trim();
        if (value) out.push({ value, label: label || value });
      }
    }
    return out.length ? out : undefined;
  }
  return undefined;
}

function mapDataType(dataType: string): string {
  const t = dataType.trim().toLowerCase();
  if (t === "boolean") return "boolean";
  if (t === "number" || t === "currency") return "number";
  if (t === "select" || t === "multi_select") return "select";
  if (t === "textarea") return "textarea";
  return "text";
}

export function customFieldDefsToMeta(
  defs: CustomFieldDefLite[],
): MetaFieldDef[] {
  return defs.map((d) => ({
    key: d.fieldKey,
    label: d.label,
    type: mapDataType(d.dataType),
    required: Boolean(d.required),
    entity: "item",
    options: parseOptions(d.options),
  }));
}

/** Profile extras + Settings → Custom fields (product), no duplicate keys. */
export function mergeProductFormFields(
  itemMeta: MetaFieldDef[],
  custom: CustomFieldDefLite[] | undefined,
): MetaFieldDef[] {
  const skip = new Set(["taxRatePercent"]);
  const seen = new Set(itemMeta.map((f) => f.key));
  const extra = customFieldDefsToMeta(custom ?? []).filter((f) => {
    if (!f.key || skip.has(f.key) || seen.has(f.key)) return false;
    seen.add(f.key);
    return true;
  });
  return [...itemMeta.filter((f) => !skip.has(f.key)), ...extra];
}
