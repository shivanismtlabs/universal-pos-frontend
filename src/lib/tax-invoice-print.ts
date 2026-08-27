/**
 * Professional GST tax invoice print (browser print dialog).
 * Uses a hidden iframe so popup blockers cannot block printing.
 */
import { formatInr, mediaUrl, moneyNumber } from "@/lib/utils";

export type TaxInvoiceLine = {
  name: string;
  sku?: string | null;
  hsn?: string | null;
  qty: number;
  rate: number;
  tax: number;
  amount: number;
};

export type TaxInvoicePrintInput = {
  invoiceNumber: string;
  createdAt?: string;
  orderNumber: string;
  gstin?: string | null;
  placeOfSupply?: string | null;
  cgst: number;
  sgst: number;
  igst: number;
  grandTotal: number;
  shop: {
    name: string;
    tagline?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    logoUrl?: string | null;
  };
  customer: {
    name: string;
    phone?: string | null;
  };
  lines: TaxInvoiceLine[];
  subtotal: number;
  taxTotal: number;
  discountTotal?: number;
};

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pad2(n: number) {
  return n.toFixed(2);
}

function buildHtml(inv: TaxInvoicePrintInput) {
  const logo = mediaUrl(inv.shop.logoUrl);
  const when = inv.createdAt
    ? new Date(inv.createdAt).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : new Date().toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      });

  const rows = inv.lines
    .map(
      (l, i) => `<tr>
      <td class="c">${i + 1}</td>
      <td>
        <div class="name">${esc(l.name)}</div>
        ${l.sku ? `<div class="muted">${esc(l.sku)}</div>` : ""}
      </td>
      <td class="c mono">${esc(l.hsn || "—")}</td>
      <td class="r mono">${l.qty % 1 === 0 ? String(l.qty) : pad2(l.qty)}</td>
      <td class="r mono">${pad2(l.rate)}</td>
      <td class="r mono">${pad2(l.tax)}</td>
      <td class="r mono">${pad2(l.amount)}</td>
    </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${esc(inv.invoiceNumber)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    color: #0b1f33;
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    font-size: 12px;
    line-height: 1.45;
  }
  .sheet { max-width: 720px; margin: 0 auto; padding: 8px; }
  .top {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
    border-bottom: 2px solid #1a56db;
    padding-bottom: 14px;
  }
  .brand { display: flex; gap: 12px; align-items: flex-start; min-width: 0; }
  .logo {
    width: 56px; height: 56px; object-fit: contain;
    border: 1px solid #e2e8f0; border-radius: 8px; background: #fff;
  }
  .shop-name { font-size: 18px; font-weight: 800; letter-spacing: -0.02em; margin: 0; }
  .muted { color: #64748b; font-size: 11px; }
  .doc-title { text-align: right; }
  .doc-title h1 {
    margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.04em;
    text-transform: uppercase; color: #1a56db;
  }
  .doc-title .num { margin-top: 4px; font-family: ui-monospace, Consolas, monospace; font-weight: 700; }
  .meta {
    display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
    margin: 16px 0 12px;
  }
  .box {
    border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; background: #f8fafc;
  }
  .box h3 {
    margin: 0 0 6px; font-size: 10px; letter-spacing: 0.1em;
    text-transform: uppercase; color: #64748b; font-weight: 700;
  }
  .box p { margin: 0 0 2px; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 4px; }
  table.items th {
    background: #0b1f33; color: #fff; font-size: 10px; letter-spacing: 0.06em;
    text-transform: uppercase; padding: 8px 6px; font-weight: 700;
  }
  table.items td { padding: 8px 6px; border-bottom: 1px solid #e8ecf1; vertical-align: top; }
  table.items tr:nth-child(even) td { background: #fafbfc; }
  .name { font-weight: 650; }
  .c { text-align: center; }
  .r { text-align: right; }
  .mono { font-variant-numeric: tabular-nums; font-family: ui-monospace, Consolas, monospace; }
  .totals {
    margin-top: 14px; margin-left: auto; width: 280px;
    border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;
  }
  .totals .row {
    display: flex; justify-content: space-between; gap: 12px;
    padding: 7px 12px; border-bottom: 1px solid #eef2f7;
  }
  .totals .row:last-child { border-bottom: 0; }
  .totals .grand {
    background: #eef2ff; font-weight: 800; font-size: 14px; color: #1a56db;
  }
  .totals .label {
    justify-content: flex-start;
    font-weight: 650;
    color: #64748b;
    font-size: 11px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .foot {
    margin-top: 22px; padding-top: 10px; border-top: 1px dashed #cbd5e1;
    display: flex; justify-content: space-between; gap: 12px; color: #64748b; font-size: 11px;
  }
  @media print {
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <div class="top">
      <div class="brand">
        ${logo ? `<img class="logo" src="${esc(logo)}" alt=""/>` : ""}
        <div>
          <p class="shop-name">${esc(inv.shop.name)}</p>
          ${inv.shop.tagline ? `<p class="muted">${esc(inv.shop.tagline)}</p>` : ""}
          ${inv.shop.address ? `<p class="muted">${esc(inv.shop.address)}</p>` : ""}
          ${inv.shop.phone ? `<p class="muted">Phone: ${esc(inv.shop.phone)}</p>` : ""}
          ${inv.shop.email ? `<p class="muted">${esc(inv.shop.email)}</p>` : ""}
          ${inv.gstin ? `<p class="muted"><strong>GSTIN:</strong> ${esc(inv.gstin)}</p>` : ""}
        </div>
      </div>
      <div class="doc-title">
        <h1>Tax Invoice</h1>
        <p class="num">${esc(inv.invoiceNumber)}</p>
        <p class="muted">${esc(when)}</p>
      </div>
    </div>

    <div class="meta">
      <div class="box">
        <h3>Bill to</h3>
        <p><strong>${esc(inv.customer.name)}</strong></p>
        ${inv.customer.phone ? `<p class="muted">${esc(inv.customer.phone)}</p>` : ""}
      </div>
      <div class="box">
        <h3>Order</h3>
        <p><strong>${esc(inv.orderNumber)}</strong></p>
        ${inv.placeOfSupply ? `<p class="muted">Place of supply: ${esc(inv.placeOfSupply)}</p>` : ""}
      </div>
    </div>

    <table class="items">
      <thead>
        <tr>
          <th style="width:36px">#</th>
          <th>Item</th>
          <th style="width:72px">HSN</th>
          <th style="width:56px">Qty</th>
          <th style="width:72px">Rate</th>
          <th style="width:64px">Tax</th>
          <th style="width:80px">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="7" class="c muted">No line items</td></tr>`}
      </tbody>
    </table>

    <div class="totals">
      <div class="row"><span>Total</span><span class="mono">${formatInr(inv.subtotal)}</span></div>
      ${inv.taxTotal > 0 ? `<div class="row label"><span>Taxable value</span></div>` : ""}
      ${inv.cgst > 0 || inv.sgst > 0 || inv.taxTotal > 0 ? `<div class="row"><span>CGST</span><span class="mono">${formatInr(inv.cgst)}</span></div>` : ""}
      ${inv.cgst > 0 || inv.sgst > 0 || inv.taxTotal > 0 ? `<div class="row"><span>SGST</span><span class="mono">${formatInr(inv.sgst)}</span></div>` : ""}
      ${moneyNumber(inv.igst) > 0 ? `<div class="row"><span>IGST</span><span class="mono">${formatInr(inv.igst)}</span></div>` : ""}
      ${(inv.discountTotal ?? 0) > 0 ? `<div class="row"><span>Discount</span><span class="mono">−${formatInr(inv.discountTotal!)}</span></div>` : ""}
      <div class="row grand"><span>Net Payable</span><span class="mono">${formatInr(inv.grandTotal)}</span></div>
    </div>

    <div class="foot">
      <p>This is a computer-generated tax invoice.</p>
      <p>Thank you for your business.</p>
    </div>
  </div>
</body>
</html>`;
}

export function printTaxInvoice(inv: TaxInvoicePrintInput) {
  if (typeof document === "undefined") return false;

  const html = buildHtml(inv);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    document.body.removeChild(iframe);
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
      cleanup();
      return;
    }
    window.setTimeout(cleanup, 1000);
  };

  if (doc.readyState === "complete") {
    window.setTimeout(runPrint, 80);
  } else {
    iframe.onload = () => window.setTimeout(runPrint, 80);
  }
  return true;
}
