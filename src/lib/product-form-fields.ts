import type { MetaFieldDef } from "@/lib/business-config";

export type CustomFieldDefLite = {
  entity?: string;
  fieldKey?: string;
  field_key?: string;
  key?: string;
  label: string;
  dataType?: string;
  data_type?: string;
  type?: string;
  required?: boolean;
  options?: unknown;
  sortOrder?: number | null;
  sort_order?: number | null;
};

function looksLikeDef(rec: Record<string, unknown>): boolean {
  return Boolean(rec.fieldKey ?? rec.field_key ?? rec.key);
}

function asDefArray(raw: unknown): CustomFieldDefLite[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw as CustomFieldDefLite[];
  if (typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  for (const key of ["data", "items", "rows", "definitions"]) {
    const nested = rec[key];
    if (Array.isArray(nested) && nested.length) {
      return nested as CustomFieldDefLite[];
    }
    const inner = asDefArray(nested);
    if (inner?.length) return inner;
  }
  if (looksLikeDef(rec)) return [rec as CustomFieldDefLite];
  return null;
}

/** Settings/API may return a bare array or `{ data }` / `{ items }`. */
export function normalizeCustomFieldDefs(raw: unknown): CustomFieldDefLite[] {
  return asDefArray(raw) ?? [];
}

export const CUSTOM_FIELD_QUERY = {
  staleTime: 0,
  refetchOnMount: "always" as const,
  refetchOnWindowFocus: true,
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
  if (t === "date") return "date";
  if (t === "datetime") return "datetime";
  if (t === "email") return "email";
  if (t === "phone") return "phone";
  return "text";
}

export function customFieldDefsToMeta(
  defs: CustomFieldDefLite[] | unknown,
): MetaFieldDef[] {
  const skip = new Set(["taxRatePercent"]);
  return normalizeCustomFieldDefs(defs)
    .slice()
    .sort(
      (a, b) => (a.sortOrder ?? a.sort_order ?? 0) - (b.sortOrder ?? b.sort_order ?? 0),
    )
    .map((d) => {
      const key = String(d.fieldKey ?? d.field_key ?? d.key ?? "").trim();
      const label = String(d.label ?? key).trim();
      return {
        key,
        label: label || key,
        type: mapDataType(
          String(d.dataType ?? d.data_type ?? d.type ?? "text"),
        ),
        required: Boolean(d.required),
        entity: "item" as const,
        options: parseOptions(d.options),
      };
    })
    .filter((f) => f.key && !skip.has(f.key));
}

/** Settings custom fields + BusinessConfig item fields (org signup extras). */
export function mergeProductFormFields(
  apiDefs: unknown,
  configFields?: MetaFieldDef[] | null,
): MetaFieldDef[] {
  const fromApi = customFieldDefsToMeta(apiDefs);
  const seen = new Set(fromApi.map((f) => f.key));
  const fromConfig: MetaFieldDef[] = [];
  for (const f of configFields ?? []) {
    const key = String(f.key ?? "").trim();
    if (!key || seen.has(key) || skipTaxKey(key)) continue;
    seen.add(key);
    fromConfig.push({
      ...f,
      key,
      type: mapDataType(String(f.type ?? "text")),
      entity: "item",
    });
  }
  return [...fromApi, ...fromConfig];
}

function skipTaxKey(key: string) {
  return key === "taxRatePercent";
}
