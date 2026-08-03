"use client";

import { cn } from "@/lib/utils";

export function FieldError({
  message,
  className,
}: {
  message?: string;
  className?: string;
}) {
  if (!message) return null;
  return (
    <p className={cn("mt-1.5 text-xs text-[#b91c1c]", className)} role="alert">
      {message}
    </p>
  );
}

export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="display text-2xl">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-[#6b7280]">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
