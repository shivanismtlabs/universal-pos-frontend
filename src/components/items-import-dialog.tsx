"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { posApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { downloadCsv } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export type ImportableRow = {
  title: string;
  sku: string;
  categoryName?: string;
  sellUnit?: "pcs" | "pack" | "kg" | "g" | "L" | "ml";
  price: number;
  qty?: number;
  description?: string;
  manufacturer?: string;
  barcode?: string;
  costPrice?: number;
  reorderPoint?: number;
  hsnOrSac?: string;
  trackInventory?: boolean;
  image?: string;
};

const TEMPLATE_HEADERS = [
  "name",
  "sku",
  "category",
  "unit",
  "selling_price",
  "opening_stock",
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
    sku: "sku",
    item_sku: "sku",
    category: "categoryName",
    category_name: "categoryName",
    unit: "sellUnit",
    sell_unit: "sellUnit",
    uom: "sellUnit",
    selling_price: "price",
    price: "price",
    rate: "price",
    opening_stock: "qty",
    qty: "qty",
    quantity: "qty",
    stock: "qty",
    stock_on_hand: "qty",
    cost_price: "costPrice",
    cost: "costPrice",
    barcode: "barcode",
    upc: "barcode",
    manufacturer: "manufacturer",
    brand: "manufacturer",
    hsn: "hsnOrSac",
    hsn_sac: "hsnOrSac",
    hsnorsac: "hsnOrSac",
    description: "description",
    track_inventory: "trackInventory",
    track: "trackInventory",
    reorder_point: "reorderPoint",
    reorder: "reorderPoint",
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
    const unitRaw = (obj.sellUnit || "pcs").toLowerCase();
    const unitMap: Record<string, ImportableRow["sellUnit"]> = {
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
    };
    const trackRaw = (obj.trackInventory || "true").toLowerCase();
    const trackInventory = !["0", "false", "no", "n"].includes(trackRaw);
    const price = Number(obj.price);
    if (!(price > 0)) {
      throw new Error(`Row ${r + 1}: selling_price must be > 0`);
    }
    out.push({
      title: obj.title?.trim() || "",
      sku: obj.sku?.trim() || "",
      categoryName: obj.categoryName?.trim() || undefined,
      sellUnit: unitMap[unitRaw] ?? "pcs",
      price,
      qty: obj.qty !== undefined && obj.qty !== "" ? Number(obj.qty) : 0,
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
      cells[colNumber - 1] = String(cell.text ?? cell.value ?? "").trim();
    });
    table.push(cells);
  });
  return rowsFromTable(table);
}

export function downloadItemsTemplate() {
  downloadCsv("universal-pos-items-template.csv", TEMPLATE_HEADERS, [
    [
      "USB-C Cable 1m",
      "USBC-1M",
      "Accessories",
      "pcs",
      "199",
      "25",
      "90",
      "8901234567890",
      "Generic",
      "8544",
      "true",
      "https://images.unsplash.com/photo-1583394838336-acd977736f90",
    ],
    [
      "Organic Almond Milk 1L",
      "ALM-MILK-1L",
      "Beverages",
      "L",
      "145",
      "12.5",
      "98",
      "",
      "Farm Co",
      "",
      "true",
      "https://images.unsplash.com/photo-1550583724-b2692b85b150",
    ],
  ]);
}

/**
 * Zoho-style bulk import items dialog — Universal POS (sale mode).
 */
export function ItemsImportDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported?: () => void;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportableRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  const importMut = useMutation({
    mutationFn: (items: ImportableRow[]) =>
      posApi.importSaleProducts({
        items,
        createCategories: true,
      }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["catalog-products"] });
      void qc.invalidateQueries({ queryKey: ["catalog-products-home"] });
      void qc.invalidateQueries({ queryKey: ["inv-levels"] });
      void qc.invalidateQueries({ queryKey: ["pos-sale-products"] });
      void qc.invalidateQueries({ queryKey: ["pos-sale-categories"] });
      void qc.invalidateQueries({ queryKey: ["pos-sale-floor"] });
      void qc.invalidateQueries({ queryKey: ["catalog-products"] });
      void qc.invalidateQueries({ queryKey: ["catalog-products-home"] });
      void qc.invalidateQueries({ queryKey: ["pos-sale-catalog"] });
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
              Bulk import from Excel (.xlsx) or CSV. First row must be headers
              like name, sku, selling_price. Stock is added for this shop.
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
            <p className="text-[0.8rem] text-[#5a6b7d]">
              Selected: <span className="font-medium text-[#0b1f33]">{fileName}</span>
            </p>
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
                    {r.title} · <span className="font-mono">{r.sku}</span> · ₹
                    {r.price}
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
              Required columns: <strong>name</strong>, <strong>sku</strong>,{" "}
              <strong>selling_price</strong>. Optional: category, unit,
              opening_stock, cost_price, barcode, manufacturer, hsn,
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
