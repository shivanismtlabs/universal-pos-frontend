"use client";

import { useEffect, useId, useRef } from "react";
import JsBarcode from "jsbarcode";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  copyBarcodeToClipboard,
  printBarcodeLabel,
} from "@/lib/print-barcode";

type ProductBarcodePreviewProps = {
  value: string;
  /** CODE128 (default) or legacy EAN13 */
  format?: "CODE128" | "EAN13" | string | null;
  /** Alias used by catalog forms */
  barcodeType?: "CODE128" | "EAN13" | string | null;
  productName?: string | null;
  sku?: string | null;
  className?: string;
  /** Compact inline strip for forms; "label" is an alias of card */
  variant?: "card" | "inline" | "label";
  showPrint?: boolean;
};

function resolveFormat(format?: string | null): "CODE128" | "EAN13" {
  const f = (format || "CODE128").toUpperCase().replace(/[_-]/g, "");
  if (f === "EAN13") return "EAN13";
  return "CODE128";
}

export function ProductBarcodePreview({
  value,
  format,
  barcodeType,
  productName,
  sku,
  className,
  variant = "card",
  showPrint = true,
}: ProductBarcodePreviewProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const printId = useId().replace(/:/g, "");
  const trimmed = value.trim();
  const barcodeFormat = resolveFormat(format ?? barcodeType);
  const captionName = productName || sku || null;

  useEffect(() => {
    if (!svgRef.current || !trimmed) return;
    try {
      JsBarcode(svgRef.current, trimmed, {
        format: barcodeFormat,
        displayValue: false,
        fontSize: 0,
        height: variant === "inline" ? 48 : 64,
        width: barcodeFormat === "EAN13" ? 1.6 : 1.8,
        margin: 0,
        background: "#ffffff",
        lineColor: "#111827",
      });
    } catch {
      if (svgRef.current) {
        while (svgRef.current.firstChild) {
          svgRef.current.removeChild(svgRef.current.firstChild);
        }
      }
    }
  }, [trimmed, barcodeFormat, variant]);

  function printLabel() {
    printBarcodeLabel({
      value: trimmed,
      productName: captionName,
      sku,
      format: barcodeFormat,
    });
  }

  function copyLabel() {
    void copyBarcodeToClipboard(trimmed);
  }

  if (!trimmed) {
    if (variant === "inline") return null;
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed border-[#d5dde8] bg-[#fafbfc] px-4 py-6 text-center text-[0.8rem] text-[#8b9bb0]",
          className,
        )}
      >
        Enter or generate a barcode to preview the label
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <div className={cn("flex flex-wrap items-center gap-4", className)}>
        <div className="rounded border border-[#e2e8f0] bg-white px-3 py-2">
          <svg ref={svgRef} />
          <p className="mt-1 text-center font-mono text-[0.75rem] font-semibold tracking-wide text-[#111827]">
            {trimmed}
          </p>
        </div>
        {showPrint ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={printLabel}>
              Print
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={copyLabel}>
              Copy
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      id={`barcode-label-${printId}`}
      className={cn(
        "overflow-hidden rounded-lg border border-[#e2e8f0] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        className,
      )}
    >
      <div className="flex flex-col items-center px-6 py-5">
        {captionName ? (
          <p className="mb-3 max-w-full truncate text-center text-[0.8rem] font-medium text-[#334155]">
            {captionName}
          </p>
        ) : null}
        <svg ref={svgRef} className="max-w-full" />
        <p className="mt-2 font-mono text-[0.95rem] font-semibold tracking-[0.08em] text-[#111827]">
          {trimmed}
        </p>
      </div>
      {showPrint ? (
        <div className="flex items-center justify-between border-t border-[#eef2f7] bg-[#fafbfc] px-4 py-2.5">
          <span className="text-[0.7rem] font-medium tracking-wide text-[#94a3b8] uppercase">
            {barcodeFormat === "EAN13" ? "EAN-13" : "Code 128"}
          </span>
          <div className="flex items-center gap-1.5">
            <Button type="button" variant="ghost" size="sm" className="h-8" onClick={copyLabel}>
              Copy
            </Button>
            <Button type="button" variant="secondary" size="sm" className="h-8" onClick={printLabel}>
              Print barcode
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
