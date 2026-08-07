"use client";

import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { readFileAsDataUrl } from "@/lib/utils";

export type CommerceFieldDef = {
  key: string;
  label: string;
  required: boolean;
  type: "string" | "text" | "number" | "category" | "image";
  hint?: string;
};

const textareaClass =
  "mt-0 min-h-[72px] w-full rounded-lg border border-[#d9e0ea] bg-white px-3 py-2 text-[0.875rem] leading-snug text-[#0b1f33] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#94a3b8] hover:border-[#c5d0e0] focus:border-[#1a56db] focus:shadow-[0_0_0_3px_rgba(26,86,219,0.12)]";

/**
 * Schema-driven product form — one component for every commerce mode.
 * Renders from GET /pos/:mode/schema (or floor.schema.fields).
 */
export function DynamicCommerceForm({
  schema,
  values,
  onChange,
  categories,
  imageKey = "imagePreview",
}: {
  schema: CommerceFieldDef[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  categories: Array<{ id: string; name: string }>;
  /** Form key holding data-URL preview for image fields */
  imageKey?: string;
}) {
  return (
    <div className="space-y-4">
      {schema.map((field) => {
        if (field.type === "category" || field.key === "categoryId") {
          return (
            <div key={field.key} className="field-shell">
              <Label>
                {field.label}
                {field.required ? " *" : ""}
              </Label>
              <Select
                value={values.categoryId ?? values[field.key] ?? ""}
                onChange={(e) => onChange(field.key, e.target.value)}
              >
                <option value="">Select category…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              {field.hint ? (
                <p className="mt-1 text-[0.7rem] text-[#8b9bb0]">{field.hint}</p>
              ) : null}
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
                value={values[field.key] ?? ""}
                onChange={(e) => onChange(field.key, e.target.value)}
                placeholder={field.hint}
              />
            </div>
          );
        }

        if (field.type === "image" || field.key === "image") {
          const preview = values[imageKey] ?? values[field.key] ?? "";
          return (
            <div key={field.key} className="field-shell">
              <Label>{field.label}</Label>
              <div className="flex items-start gap-3">
                <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-lg border border-[#d9e0ea] bg-[#f7f9fc]">
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={preview}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="px-1 text-center text-[0.55rem] text-[#8b9bb0]">
                      No img
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <Input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="cursor-pointer text-xs"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 4 * 1024 * 1024) {
                        toast.error("Image must be under 4 MB");
                        return;
                      }
                      void readFileAsDataUrl(file)
                        .then((dataUrl) => onChange(imageKey, dataUrl))
                        .catch(() => toast.error("Could not read image"));
                    }}
                  />
                  {preview ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto px-0 text-[#c81e1e] hover:bg-transparent hover:text-[#a01818]"
                      onClick={() => onChange(imageKey, "")}
                    >
                      Remove
                    </Button>
                  ) : (
                    <p className="text-[0.7rem] text-[#8b9bb0]">
                      {field.hint ?? "Optional photo"}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        }

        return (
          <div key={field.key} className="field-shell">
            <Label>
              {field.label}
              {field.required ? " *" : ""}
            </Label>
            <Input
              type={field.type === "number" ? "number" : "text"}
              value={values[field.key] ?? ""}
              onChange={(e) => onChange(field.key, e.target.value)}
              placeholder={field.hint}
            />
          </div>
        );
      })}
    </div>
  );
}
