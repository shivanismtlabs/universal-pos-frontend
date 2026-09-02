"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { posApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { downloadCsv } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { useBootstrap } from "@/lib/bootstrap";
import { FileSpreadsheet, Trash2, X } from "lucide-react";

export type ImportableRow = {
  title: string;
  sku: string;
  categoryName?: string;
  sellUnit?: string;
  price: number;
  qty?: number;
  description?: string;
  manufacturer?: string;
  barcode?: string;
  costPrice?: number;
  reorderPoint?: number;
  hsnOrSac?: string;
  trackInventory?: boolean;
  /** goods (default) | service | rental */
  itemType?: "goods" | "service" | "rental";
  durationMinutes?: number;
  image?: string;
};

const TEMPLATE_HEADERS = [
  "name",
  "sku",
  "type",
  "category",
  "unit",
  "selling_price",
  "opening_stock",
  "duration_minutes",
  "cost_price",
  "barcode",
  "manufacturer",
  "hsn",
  "track_inventory",
  "image_url",
];

/** Minimal CSV line parser (quoted fields). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const s = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    const next = s[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === "," || ch === "\t") {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && next === "\n") i++;
      row.push(cell.trim());
      if (row.some((c) => c.length)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell.trim());
  if (row.some((c) => c.length)) rows.push(row);
  return rows;
}

function normHeader(h: string) {
  return h.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function mapHeader(h: string): string | null {
  const n = normHeader(h);
  const aliases: Record<string, string> = {
    name: "title",
    title: "title",
    item_name: "title",
    product: "title",
    product_name: "title",
    item: "title",
    particulars: "title",
    service_name: "title",
    description_name: "title",
    sku: "sku",
    item_sku: "sku",
    item_code: "sku",
    product_code: "sku",
    code: "sku",
    part_no: "sku",
    part_number: "sku",
    category: "categoryName",
    category_name: "categoryName",
    item_group: "categoryName",
    group: "categoryName",
    department: "categoryName",
    unit: "sellUnit",
    sell_unit: "sellUnit",
    uom: "sellUnit",
    unit_of_measure: "sellUnit",
    base_unit: "sellUnit",
    selling_price: "price",
    price: "price",
    rate: "price",
    sale_price: "price",
    sales_rate: "price",
    unit_price: "price",
    mrp: "price",
    opening_stock: "qty",
    qty: "qty",
    quantity: "qty",
    stock: "qty",
    stock_on_hand: "qty",
    opening_qty: "qty",
    balance_qty: "qty",
    cost_price: "costPrice",
    cost: "costPrice",
    purchase_price: "costPrice",
    purchase_rate: "costPrice",
    buy_price: "costPrice",
    barcode: "barcode",
    upc: "barcode",
    ean: "barcode",
    gtin: "barcode",
    manufacturer: "manufacturer",
    brand: "manufacturer",
    make: "manufacturer",
    company: "manufacturer",
    hsn: "hsnOrSac",
    hsn_sac: "hsnOrSac",
    hsn_code: "hsnOrSac",
    sac: "hsnOrSac",
    hsnorsac: "hsnOrSac",
    tax_code: "hsnOrSac",
    description: "description",
    details: "description",
    track_inventory: "trackInventory",
    track_stock: "trackInventory",
    inventory_tracked: "trackInventory",
    reorder_point: "reorderPoint",
    reorder: "reorderPoint",
    min_stock: "reorderPoint",
    type: "itemType",
    item_type: "itemType",
    kind: "itemType",
    product_type: "itemType",
    duration_minutes: "durationMinutes",
    duration: "durationMinutes",
    duration_min: "durationMinutes",
    minutes: "durationMinutes",
    image_url: "image",
    image: "image",
    photo_url: "image",
    photo: "image",
    picture: "image",
    picture_url: "image",
    img: "image",
    img_url: "image",
  };
  return aliases[n] ?? null;
}

function parseItemType(
  raw: string | undefined,
  unitRaw: string,
  _rowNum?: number,
  titleRaw?: string,
  skuRaw?: string,
): "goods" | "service" | "rental" {
  const t = (raw ?? "").trim().toLowerCase();
  
  // Rental keywords
  if (
    t === "rental" ||
    t === "rent" ||
    t === "rentals" ||
    t === "hire" ||
    t === "costume" ||
    t === "outfit" ||
    t === "gear" ||
    t === "equipment" ||
    t === "lease"
  ) {
    return "rental";
  }
  
  // Service keywords
  if (
    t === "service" ||
    t === "services" ||
    t === "svc" ||
    t === "serv" ||
    t === "labour" ||
    t === "labor" ||
    t === "repair" ||
    t === "maintenance" ||
    t === "salon" ||
    t === "spa" ||
    t === "consulting" ||
    t === "therapy" ||
    t === "treatment" ||
    t === "class" ||
    t === "session"
  ) {
    return "service";
  }
  
  // Goods keywords
  if (
    t === "goods" ||
    t === "good" ||
    t === "product" ||
    t === "products" ||
    t === "physical" ||
    t === "item" ||
    t === "retail" ||
    t === "grocery" ||
    t === "food" ||
    t === "drink" ||
    t === "apparel" ||
    t === "merchandise" ||
    t === "parts"
  ) {
    return "goods";
  }

  // Infer from unit
  const u = unitRaw.trim().toLowerCase();
  if (
    u === "service" ||
    u === "min" ||
    u === "minute" ||
    u === "minutes" ||
    u === "hour" ||
    u === "hr" ||
    u === "session" ||
    u === "visit"
  ) {
    return "service";
  }
  if (u === "day" || u === "rental" || u === "night" || u === "week" || u === "month") {
    return "rental";
  }

  // Smart auto-detect from SKU (e.g. RNT-0050, SVC-001) or Title (e.g. "Cricket Bat Rental")
  const sku = (skuRaw ?? "").trim().toUpperCase();
  if (sku.startsWith("RNT-") || sku.startsWith("RENT-") || sku.startsWith("RNT_")) {
    return "rental";
  }
  if (sku.startsWith("SVC-") || sku.startsWith("SERV-") || sku.startsWith("SVC_")) {
    return "service";
  }
  const title = (titleRaw ?? "").trim().toLowerCase();
  if (/\b(rental|renting|for rent|on rent|hire|costume|outfit)\b/i.test(title)) {
    return "rental";
  }
  if (/\b(servicing|repair|installation|labour|consulting|treatment|therapy|session)\b/i.test(title)) {
    return "service";
  }

  return "goods";
}

export function rowsFromTable(table: string[][]): ImportableRow[] {
  if (table.length < 2) {
    throw new Error("File needs a header row and at least one data row");
  }
  const headers = table[0]!.map(mapHeader);
  if (!headers.includes("title") || !headers.includes("sku")) {
    throw new Error("File must include name and sku columns");
  }
  const out: ImportableRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const cells = table[r]!;
    const obj: Record<string, string> = {};
    headers.forEach((key, i) => {
      if (key) obj[key] = String(cells[i] ?? "");
    });
    if (!obj.title?.trim() && !obj.sku?.trim()) continue;
    const unitRaw = (obj.sellUnit || "").toLowerCase();
    const itemType = parseItemType(
      obj.itemType,
      unitRaw,
      r + 1,
      obj.title,
      obj.sku,
    );
    const unitMap: Record<string, string> = {
      pcs: "pcs",
      piece: "pcs",
      pieces: "pcs",
      pack: "pack",
      box: "pack",
      kg: "kg",
      g: "g",
      l: "L",
      liter: "L",
      litre: "L",
      ml: "ml",
      service: "service",
      min: "min",
      minute: "min",
      minutes: "min",
      hour: "hour",
      hr: "hour",
      day: "day",
      session: "service",
    };
    const qty =
      obj.qty !== undefined && obj.qty !== "" ? Number(obj.qty) : 0;
    const trackRaw = (obj.trackInventory ?? "").trim().toLowerCase();
    let trackInventory = !["false", "no", "off", "0"].includes(trackRaw);
    if (obj.qty !== undefined && obj.qty !== "" && Number.isFinite(qty) && qty >= 0) {
      trackInventory = true;
    }
    if (itemType === "service") {
      trackInventory = false;
    }
    const price = Number(obj.price);
    if (!(price > 0)) {
      throw new Error(`Row ${r + 1}: selling_price must be > 0`);
    }
    const durationRaw = (obj.durationMinutes ?? "").trim();
    const durationMinutes =
      durationRaw !== "" && Number.isFinite(Number(durationRaw))
        ? Number(durationRaw)
        : undefined;
    out.push({
      title: obj.title?.trim() || "",
      sku: obj.sku?.trim() || "",
      categoryName: obj.categoryName?.trim() || undefined,
      sellUnit:
        unitMap[unitRaw] ??
        (itemType === "service" ? "service" : unitRaw || "pcs"),
      price,
      qty: itemType === "service" ? 0 : Number.isFinite(qty) ? qty : 0,
      description: obj.description?.trim() || undefined,
      manufacturer: obj.manufacturer?.trim() || undefined,
      barcode: obj.barcode?.trim() || undefined,
      costPrice:
        obj.costPrice !== undefined && obj.costPrice !== ""
          ? Number(obj.costPrice)
          : undefined,
      reorderPoint:
        obj.reorderPoint !== undefined && obj.reorderPoint !== ""
          ? Number(obj.reorderPoint)
          : undefined,
      hsnOrSac: obj.hsnOrSac?.trim() || undefined,
      trackInventory,
      itemType,
      durationMinutes:
        itemType === "service" &&
        durationMinutes != null &&
        durationMinutes > 0
          ? durationMinutes
          : undefined,
      image: obj.image?.trim() || undefined,
    });
  }
  if (!out.length) throw new Error("No data rows found");
  return out;
}

export function rowsFromCsvText(text: string): ImportableRow[] {
  return rowsFromTable(parseCsv(text));
}

async function rowsFromExcelFile(file: File): Promise<ImportableRow[]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Excel file has no sheet");
  const table: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const raw = cell.value;
      let text = "";
      if (raw == null) text = "";
      else if (typeof raw === "boolean") text = raw ? "true" : "false";
      else if (typeof raw === "number") text = String(raw);
      else if (typeof raw === "object" && "text" in (raw as object))
        text = String((raw as { text?: string }).text ?? "");
      else text = String(cell.text ?? raw ?? "");
      cells[colNumber - 1] = text.trim();
    });
    table.push(cells);
  });
  return rowsFromTable(table);
}

export function downloadItemsTemplate() {
  downloadCsv("universal-pos-items-template.csv", TEMPLATE_HEADERS, [
    [
      "Silk Bow Tie",
      "BOW-TIE-001",
      "goods",
      "Accessories",
      "pcs",
      "499",
      "20",
      "",
      "180",
      "8901000000001",
      "Velvet Co",
      "6214",
      "true",
      "",
    ],
    [
      "Black Velvet Tuxedo",
      "TUX-BLK-01",
      "rental",
      "Formal Wear",
      "pcs",
      "1200",
      "4",
      "",
      "3000",
      "8901234567999",
      "Velvet Co",
      "6203",
      "false",
      "",
    ],
    [
      "AC Servicing",
      "AC-SVC-001",
      "service",
      "Home Services",
      "service",
      "600",
      "0",
      "60",
      "",
      "",
      "",
      "",
      "false",
      "",
    ],
    [
      "Hair Styling",
      "HAIR-30",
      "service",
      "Hair",
      "service",
      "799",
      "0",
      "30",
      "",
      "",
      "",
      "",
      "false",
      "",
    ],
    [
      "USB-C Cable 1m",
      "USBC-1M",
      "goods",
      "Electronics",
      "pcs",
      "199",
      "25",
      "",
      "90",
      "8901234567890",
      "Generic",
      "8544",
      "true",
      "",
    ],
  ]);
}

/**
 * Bulk import — items for Goods, Services, or Rentals.
 */
export function ItemsImportDialog({
  open,
  onClose,
  onImported,
  locationId,
}: {
  open: boolean;
  onClose: () => void;
  onImported?: () => void;
  locationId?: string;
}) {
  const qc = useQueryClient();
  const { hasMode } = useBootstrap();
  const hasRental = hasMode("rental");
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportableRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  const importMut = useMutation({
    mutationFn: (items: ImportableRow[]) =>
      posApi.importSaleProducts({
        items,
        createCategories: true,
        ...(locationId ? { locationId } : {}),
      }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["catalog-products"] });
      void qc.invalidateQueries({ queryKey: ["catalog-products-home"] });
      void qc.invalidateQueries({ queryKey: ["inv-levels"] });
      void qc.invalidateQueries({ queryKey: ["inv-ledger"] });
      void qc.invalidateQueries({ queryKey: ["pos-sale-products"] });
      void qc.invalidateQueries({ queryKey: ["pos-sale-categories"] });
      void qc.invalidateQueries({ queryKey: ["pos-sale-floor"] });
      void qc.invalidateQueries({ queryKey: ["catalog-products"] });
      void qc.invalidateQueries({ queryKey: ["catalog-products-home"] });
      void qc.invalidateQueries({ queryKey: ["pos-sale-catalog"] });
      void qc.invalidateQueries({ queryKey: ["services-catalog"] });
      void qc.invalidateQueries({ queryKey: ["services-summary"] });
      void qc.invalidateQueries({ queryKey: ["catalog-services-for-rental"] });
      toast.success(
        `Imported ${res.imported} item${res.imported === 1 ? "" : "s"}${
          res.failed ? ` · ${res.failed} failed` : ""
        }`,
      );
      if (res.errors?.length) {
        const sample = res.errors
          .slice(0, 3)
          .map((e) => `Row ${e.row}: ${e.message}`)
          .join(" · ");
        toast.error(sample);
      }
      setPreview(null);
      setFileName("");
      onImported?.();
      onClose();
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.messages.join(", ") : "Import failed",
      ),
  });

  if (!open) return null;

  function clearSelectedFile() {
    setPreview(null);
    setFileName("");
    setParseError(null);
    if (fileRef.current) {
      fileRef.current.value = "";
    }
  }

  async function onFile(file: File | null) {
    if (!file) return;
    setParseError(null);
    setFileName(file.name);
    try {
      const lower = file.name.toLowerCase();
      const rows = lower.endsWith(".xlsx") || lower.endsWith(".xls")
        ? await rowsFromExcelFile(file)
        : rowsFromCsvText(await file.text());
      setPreview(rows);
    } catch (e) {
      setPreview(null);
      setParseError(e instanceof Error ? e.message : "Could not read file");
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[#0b1f33]/45"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[#d9e0ea] bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-[#eef1f4] px-5 py-4">
          <div>
            <p className="text-[0.65rem] font-bold tracking-[0.12em] text-[#1a56db] uppercase">
              Inventory · Import
            </p>
            <h2 className="mt-0.5 text-lg font-semibold text-[#0b1f33]">
              Import items
            </h2>
            <p className="mt-1 text-[0.8rem] text-[#5a6b7d]">
              Bulk import from Excel (.xlsx) or CSV. Creates items for{" "}
              <strong>Goods</strong>, <strong>Services</strong>, or <strong>Rentals</strong>. Use column{" "}
              <code className="text-[0.75rem]">type</code>:{" "}
              <code className="text-[0.75rem]">goods</code>,{" "}
              <code className="text-[0.75rem]">service</code>, or{" "}
              <code className="text-[0.75rem]">rental</code> — empty defaults
              to Goods.
            </p>
          </div>
          <button
            type="button"
            className="rounded-md p-1.5 text-[#5a6b7d] hover:bg-[#f4f6fa]"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => downloadItemsTemplate()}
            >
              Download template
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => fileRef.current?.click()}
            >
              Choose file
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,.xls,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
            />
          </div>
          {fileName ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-[#d9e0ea] bg-[#f8fafc] px-3.5 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <FileSpreadsheet className="h-5 w-5 shrink-0 text-[#1a56db]" />
                <div className="min-w-0">
                  <p className="truncate text-[0.8125rem] font-medium text-[#0b1f33]">
                    {fileName}
                  </p>
                  {preview ? (
                    <p className="text-[0.7rem] font-semibold text-[#059669]">
                      {preview.length} item{preview.length === 1 ? "" : "s"} ready to import
                    </p>
                  ) : parseError ? (
                    <p className="text-[0.7rem] font-semibold text-[#c81e1e]">
                      Error reading file
                    </p>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={clearSelectedFile}
                className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-[#c81e1e] hover:bg-[#fee2e2] transition"
                title="Remove selected file"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Remove</span>
              </button>
            </div>
          ) : null}
          {parseError ? (
            <p className="rounded-lg border border-[#fecaca] bg-[#fff6f6] px-3 py-2 text-[0.8rem] text-[#c81e1e]">
              {parseError}
            </p>
          ) : null}
          {preview ? (
            <div className="rounded-lg border border-[#e8edf4] bg-[#f8fafc] px-3 py-3 text-[0.8rem]">
              <p className="font-semibold text-[#0b1f33]">
                Ready to import {preview.length} item
                {preview.length === 1 ? "" : "s"}
              </p>
              <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto text-[#5a6b7d]">
                {preview.slice(0, 8).map((r) => (
                  <li key={r.sku} className="truncate">
                    {r.title} · <span className="font-mono">{r.sku}</span> ·{" "}
                    {r.itemType === "service" ? "service" : "goods"} · ₹
                    {r.price}
                    {r.durationMinutes ? ` · ${r.durationMinutes}m` : ""}
                    {r.image ? " · photo" : ""}
                  </li>
                ))}
                {preview.length > 8 ? (
                  <li>…and {preview.length - 8} more</li>
                ) : null}
              </ul>
            </div>
          ) : (
            <p className="text-[0.78rem] leading-relaxed text-[#8b9bb0]">
              Required: <strong>name</strong>, <strong>sku</strong>,{" "}
              <strong>selling_price</strong>. For services set{" "}
              <strong>type</strong>=<code>service</code> (or unit{" "}
              <code>service</code> / <code>min</code>). Optional: category,
              unit, opening_stock, duration_minutes, cost_price, barcode,
              track_inventory, image_url.
            </p>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-[#eef1f4] px-5 py-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!preview?.length || importMut.isPending}
            onClick={() => preview && importMut.mutate(preview)}
          >
            {importMut.isPending ? "Importing…" : "Import items"}
          </Button>
        </div>
      </div>
    </div>
  );
}
