/**
 * Print / copy product barcodes without relying on blocked window.open popups.
 */
import JsBarcode from "jsbarcode";
import { toast } from "sonner";

export function barcodeValueForProduct(p: {
  barcode?: string | null;
  skuCode?: string | null;
  sku?: string | null;
}): string {
  return (p.barcode || p.skuCode || p.sku || "").trim();
}

export async function copyBarcodeToClipboard(
  value: string,
  label = "Barcode",
): Promise<boolean> {
  const v = value.trim();
  if (!v) {
    toast.error("No barcode or SKU to copy");
    return false;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(v);
    } else {
      const ta = document.createElement("textarea");
      ta.value = v;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    toast.success(`${label} copied`);
    return true;
  } catch {
    toast.error("Could not copy — allow clipboard access");
    return false;
  }
}

function buildBarcodeSvg(
  value: string,
  format: "CODE128" | "EAN13" = "CODE128",
): string {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  try {
    JsBarcode(svg, value, {
      format,
      displayValue: false,
      fontSize: 0,
      height: 64,
      width: format === "EAN13" ? 1.6 : 1.8,
      margin: 0,
      background: "#ffffff",
      lineColor: "#111827",
    });
  } catch {
    return "";
  }
  return svg.outerHTML;
}

function resolveFormat(raw?: string | null): "CODE128" | "EAN13" {
  const f = (raw || "CODE128").toUpperCase().replace(/[_-]/g, "");
  return f === "EAN13" ? "EAN13" : "CODE128";
}

/** Print a barcode label via hidden iframe (avoids popup blockers). */
export function printBarcodeLabel(opts: {
  value: string;
  productName?: string | null;
  sku?: string | null;
  format?: string | null;
}): boolean {
  const value = opts.value.trim();
  if (!value) {
    toast.error("No barcode or SKU to print");
    return false;
  }
  const format = resolveFormat(opts.format);
  const svgHtml = buildBarcodeSvg(value, format);
  if (!svgHtml) {
    toast.error("Could not generate barcode for this value");
    return false;
  }
  const caption = (opts.productName || opts.sku || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<!DOCTYPE html><html><head><title>Barcode ${value.replace(/</g, "")}</title>
<style>
  @page { margin: 8mm; size: auto; }
  body { font-family: ui-monospace, Consolas, monospace; text-align: center; padding: 16px; color: #111; }
  .name { font-family: system-ui, sans-serif; font-size: 12px; margin-bottom: 10px; color: #333; }
  svg { max-width: 100%; height: auto; }
  .code { margin-top: 8px; font-size: 14px; letter-spacing: 0.06em; font-weight: 600; }
</style></head><body>
  ${caption ? `<div class="name">${caption}</div>` : ""}
  ${svgHtml}
  <div class="code">${value.replace(/</g, "&lt;")}</div>
</body></html>`;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    document.body.removeChild(iframe);
    toast.error("Print preview unavailable");
    return false;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const cleanup = () => {
    try {
      document.body.removeChild(iframe);
    } catch {
      /* already removed */
    }
  };
  const runPrint = () => {
    try {
      win.focus();
      win.print();
    } catch {
      toast.error("Print failed");
    } finally {
      window.setTimeout(cleanup, 800);
    }
  };
  if (doc.readyState === "complete") {
    window.setTimeout(runPrint, 50);
  } else {
    iframe.onload = () => window.setTimeout(runPrint, 50);
  }
  return true;
}
