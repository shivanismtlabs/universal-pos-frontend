"use client";

import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { readFileAsDataUrl } from "@/lib/utils";
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
 * Schema-driven product form — one component for every commerce mode.
 * Renders from GET /pos/:mode/schema (or floor.schema.fields).
 */
export function DynamicCommerceForm({
  schema,
  values,
  onChange,
  categories,
  imageKey = "imagePreviews",
  fieldErrors,
}: {
  schema: CommerceFieldDef[];
  values: Record<string, string | string[]>;
  onChange: (key: string, value: string | string[]) => void;
  categories: Array<{ id: string; name: string }>;
  /** Form key holding data-URL preview(s) for image fields */
  imageKey?: string;
  fieldErrors?: Partial<Record<string, string>>;
}) {
  const sellUnit = normalizeSellUnit(
    typeof values.sellUnit === "string" ? values.sellUnit : "pcs",
  ) as SellUnit;
  const unitHints = unitMeta(
    typeof values.sellUnit === "string" ? values.sellUnit : "pcs",
  );

  return (
    <div className="space-y-4">
      {schema.map((field) => {
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
          const options =
            field.options?.length
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

        if (field.type === "image" || field.key === "image") {
          const raw = values[imageKey] ?? values[field.key];
          const previews: string[] = Array.isArray(raw)
            ? raw.filter((x): x is string => typeof x === "string" && !!x)
            : typeof raw === "string" && raw
              ? [raw]
              : [];
          const max = 8;
          return (
            <div key={field.key} className="field-shell">
              <Label>{field.label}</Label>
              <p className="mb-2 text-[0.7rem] text-[#8b9bb0]">
                {field.hint ?? "Optional — add up to 8 photos"}
              </p>
              <div className="flex flex-wrap gap-2">
                {previews.map((src, idx) => (
                  <div key={`${idx}-${src.slice(0, 24)}`} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt=""
                      className="h-14 w-14 rounded-lg border border-[#d9e0ea] object-cover"
                    />
                    <button
                      type="button"
                      className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-[#c81e1e] text-[0.65rem] font-bold text-white"
                      onClick={() =>
                        onChange(
                          imageKey,
                          previews.filter((_, i) => i !== idx),
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
                {previews.length < max ? (
                  <label className="grid h-14 w-14 cursor-pointer place-items-center rounded-lg border border-dashed border-[#cfd8e6] text-xs font-semibold text-[#1a56db] hover:bg-[#e8eefb]">
                    +
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      multiple
                      className="sr-only"
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        e.target.value = "";
                        if (!files.length) return;
                        void (async () => {
                          const next = [...previews];
                          for (const file of files) {
                            if (next.length >= max) break;
                            if (file.size > 4 * 1024 * 1024) {
                              toast.error(`${file.name} is over 4 MB`);
                              continue;
                            }
                            try {
                              next.push(await readFileAsDataUrl(file));
                            } catch {
                              toast.error(`Could not read ${file.name}`);
                            }
                          }
                          onChange(imageKey, next);
                        })();
                      }}
                    />
                  </label>
                ) : null}
              </div>
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
        const hint =
          isPrice
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
