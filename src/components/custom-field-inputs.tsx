"use client";

import Link from "next/link";
import type { MetaFieldDef } from "@/lib/business-config";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const selectClass =
  "mt-1 h-10 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm";
const textareaClass =
  "mt-1 min-h-[72px] w-full rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-sm";

export function CustomFieldInputs({
  fields,
  values,
  onChange,
}: {
  fields: MetaFieldDef[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  if (!fields.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((field) => {
        const value = values[field.key] ?? "";
        const set = (v: string) => onChange(field.key, v);
        return (
          <div
            key={field.key}
            className={
              field.type === "text" || field.type === "textarea"
                ? "sm:col-span-2"
                : undefined
            }
          >
            <Label>
              {field.label}
              {field.required ? " *" : ""}
            </Label>
            {field.type === "boolean" ? (
              <label className="mt-2 flex items-center gap-2 text-sm text-[#0b1f33]">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#1a56db]"
                  checked={value === "true" || value === "1"}
                  onChange={(e) => set(e.target.checked ? "true" : "false")}
                />
                Yes
              </label>
            ) : field.type === "select" && field.options?.length ? (
              <select
                className={selectClass}
                value={value}
                onChange={(e) => set(e.target.value)}
              >
                <option value="">Select</option>
                {field.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : field.type === "textarea" ? (
              <textarea
                className={textareaClass}
                value={value}
                onChange={(e) => set(e.target.value)}
                placeholder={field.hint}
              />
            ) : (
              <Input
                className="mt-1"
                type={
                  field.type === "number"
                    ? "number"
                    : field.type === "date"
                      ? "date"
                      : field.type === "datetime"
                        ? "datetime-local"
                        : field.type === "email"
                          ? "email"
                          : field.type === "phone"
                            ? "tel"
                            : "text"
                }
                value={value}
                onChange={(e) => set(e.target.value)}
                placeholder={field.hint}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Always-visible block so users can see custom fields after adding them. */
export function CustomFieldsSection({
  title = "Custom fields",
  hint,
  fields,
  loading,
  values,
  onChange,
}: {
  title?: string;
  hint: string;
  fields: MetaFieldDef[];
  loading?: boolean;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-[#c9d7f5] bg-[#f5f8ff] p-4">
      <div>
        <h3 className="text-sm font-bold text-[#0b1f33]">{title}</h3>
        <p className="mt-0.5 text-[0.8rem] text-[#5a6b7d]">{hint}</p>
      </div>
      {loading ? (
        <p className="text-sm text-[#5a6b7d]">Loading extra fields…</p>
      ) : fields.length ? (
        <CustomFieldInputs
          fields={fields}
          values={values}
          onChange={onChange}
        />
      ) : (
        <p className="text-sm text-[#5a6b7d]">
          None yet. Add them in{" "}
          <Link
            href="/settings/custom-fields"
            className="font-semibold text-[#1a56db] hover:underline"
          >
            Settings → Custom fields
          </Link>
          , then refresh this page.
        </p>
      )}
    </section>
  );
}
