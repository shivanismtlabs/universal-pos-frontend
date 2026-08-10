"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  normalizeSellUnit,
  SELL_UNIT_OPTIONS,
  type SellUnit,
} from "@/lib/sell-units";

export type CommerceFieldType =
  | "string"
  | "text"
  | "number"
  | "category"
  | "image"
  | "select";

export type CommerceFieldDef = {
  key: string;
  label: string;
  required: boolean;
  /** API may send plain string; runtime still handles known types. */
  type: CommerceFieldType | (string & {});
  hint?: string;
  options?: Array<{ value: string; label: string }>;
};

const textareaClass =
  "mt-0 min-h-[72px] w-full rounded-lg border border-[#d9e0ea] bg-white px-3 py-2 text-[0.875rem] leading-snug text-[#0b1f33] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#94a3b8] hover:border-[#c5d0e0] focus:border-[#1a56db] focus:shadow-[0_0_0_3px_rgba(26,86,219,0.12)]";

function unitMeta(unitRaw: string | undefined) {
  const unit = normalizeSellUnit(unitRaw);
  return SELL_UNIT_OPTIONS.find((o) => o.value === unit) ?? SELL_UNIT_OPTIONS[0];
}

/**
 * Schema-driven product form (text / number / category / select only).
 * Image fields are intentionally omitted — use ProductImagePicker outside
 * so large file payloads never live in parent form state.
 */
export function DynamicCommerceForm({
  schema,
  values,
  onChange,
  categories,
  fieldErrors,
}: {
  schema: CommerceFieldDef[];
  values: Record<string, string | string[]>;
  onChange: (key: string, value: string | string[]) => void;
  categories: Array<{ id: string; name: string }>;
  /** @deprecated images are handled by ProductImagePicker */
  imageKey?: string;
  fieldErrors?: Partial<Record<string, string>>;
}) {
  const sellUnit = normalizeSellUnit(
    typeof values.sellUnit === "string" ? values.sellUnit : "pcs",
  ) as SellUnit;
  const unitHints = unitMeta(
    typeof values.sellUnit === "string" ? values.sellUnit : "pcs",
  );

  const fields = schema.filter(
    (f) => f.type !== "image" && f.key !== "image" && f.key !== "imagePreviews",
  );

  return (
    <div className="space-y-4">
      {fields.map((field) => {
        const err = fieldErrors?.[field.key];

        if (field.type === "category" || field.key === "categoryId") {
          return (
            <div key={field.key} className="field-shell">
              <Label>
                {field.label}
                {field.required ? " *" : ""}
              </Label>
              <Select
                value={
                  typeof values.categoryId === "string"
                    ? values.categoryId
                    : typeof values[field.key] === "string"
                      ? values[field.key]
                      : ""
                }
                onChange={(e) => onChange(field.key, e.target.value)}
              >
                <option value="">Select category…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              {err ? (
                <p className="mt-1 text-[0.7rem] text-[#c81e1e]">{err}</p>
              ) : field.hint ? (
                <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">{field.hint}</p>
              ) : null}
            </div>
          );
        }

        if (field.type === "select" || field.key === "sellUnit") {
          const options = field.options?.length
            ? field.options
            : SELL_UNIT_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              }));
          return (
            <div key={field.key} className="field-shell">
              <Label>
                {field.label}
                {field.required ? " *" : ""}
              </Label>
              <Select
                value={
                  (typeof values[field.key] === "string"
                    ? values[field.key]
                    : "pcs") || "pcs"
                }
                onChange={(e) => onChange(field.key, e.target.value)}
              >
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              {err ? (
                <p className="mt-1 text-[0.7rem] text-[#c81e1e]">{err}</p>
              ) : (
                <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">
                  {field.hint ?? unitHints.qtyHint}
                </p>
              )}
            </div>
          );
        }

        if (field.type === "text") {
          return (
            <div key={field.key} className="field-shell">
              <Label>
                {field.label}
                {field.required ? " *" : ""}
              </Label>
              <textarea
                className={textareaClass}
                value={
                  typeof values[field.key] === "string" ? values[field.key] : ""
                }
                onChange={(e) => onChange(field.key, e.target.value)}
                placeholder={field.hint}
              />
              {err ? (
                <p className="mt-1 text-[0.7rem] text-[#c81e1e]">{err}</p>
              ) : null}
            </div>
          );
        }

        const isPrice = field.key === "price";
        const isQty = field.key === "qty";
        const step = isQty
          ? sellUnit === "kg" || sellUnit === "L"
            ? "0.001"
            : "1"
          : isPrice
            ? "0.01"
            : undefined;
        const hint = isPrice
          ? unitHints.priceHint
          : isQty
            ? unitHints.qtyHint
            : field.hint;

        return (
          <div key={field.key} className="field-shell">
            <Label>
              {isPrice
                ? `${field.label} (${unitHints.priceHint.toLowerCase()})`
                : isQty
                  ? `${field.label} (${sellUnit})`
                  : field.label}
              {field.required ? " *" : ""}
            </Label>
            <Input
              type={field.type === "number" ? "number" : "text"}
              inputMode={field.type === "number" ? "decimal" : undefined}
              step={step}
              min={field.type === "number" ? "0" : undefined}
              maxLength={field.key === "sku" ? 18 : undefined}
              value={
                typeof values[field.key] === "string" ? values[field.key] : ""
              }
              onChange={(e) => onChange(field.key, e.target.value)}
              placeholder={hint}
            />
            {err ? (
              <p className="mt-1 text-[0.7rem] text-[#c81e1e]">{err}</p>
            ) : hint ? (
              <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">{hint}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
