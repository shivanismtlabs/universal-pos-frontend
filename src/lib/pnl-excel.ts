import ExcelJS from "exceljs";

type StatementLine = {
  key: string;
  label: string;
  amount: number | null;
  indent: number;
  bold?: boolean;
  section?: boolean;
  pct?: number | null;
};

type PnLExportInput = {
  tenantName: string;
  periodLabel: string;
  currencyCode: string;
  costingMethod: string;
  lines: StatementLine[];
  current: {
    grossSales: number;
    returnsRefunds: number;
    discounts: number;
    netSales: number;
    cogs: number;
    costOfService: number;
    grossProfit: number;
    operatingExpenses: number;
    operatingProfit: number;
    taxExpense: number;
    netProfit: number;
  };
};

/** Accountant-ready .xlsx with live formulas (not static-only values). */
export async function downloadPnlExcel(input: PnLExportInput) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Universal POS";
  wb.created = new Date();
  const ws = wb.addWorksheet("Profit & Loss", {
    views: [{ state: "frozen", ySplit: 5 }],
  });

  ws.getColumn(1).width = 42;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 14;

  ws.addRow([input.tenantName]);
  ws.getRow(1).font = { bold: true, size: 14 };
  ws.addRow(["Profit & Loss Statement"]);
  ws.getRow(2).font = { bold: true, size: 12 };
  ws.addRow([input.periodLabel]);
  ws.addRow([
    "Currency: " +
      input.currencyCode +
      " · Costing: " +
      input.costingMethod,
  ]);
  ws.addRow([]);

  const header = ws.addRow(["Line item", "Amount", "Margin %"]);
  header.font = { bold: true };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8EEF7" },
  };

  // Rows 7–17 hold editable inputs + formula roll-ups
  const c = input.current;
  ws.addRow(["Gross sales", c.grossSales, null]); // 7
  ws.addRow(["Less: Returns & refunds", -c.returnsRefunds, null]); // 8
  ws.addRow(["Less: Discounts", -c.discounts, null]); // 9
  const rNet = ws.addRow(["Net Sales", null, null]); // 10
  rNet.getCell(2).value = { formula: "B7+B8+B9" };
  rNet.font = { bold: true };

  ws.addRow(["Cost of Goods Sold (COGS)", -c.cogs, null]); // 11
  ws.addRow(["Cost of Service Delivery", -c.costOfService, null]); // 12
  const rGp = ws.addRow(["Gross Profit", null, null]); // 13
  rGp.getCell(2).value = { formula: "B10+B11+B12" };
  rGp.getCell(3).value = {
    formula: 'IF(B10=0,"",ROUND(B13/B10*100,2))',
  };
  rGp.font = { bold: true };

  ws.addRow(["Total Operating Expenses", -c.operatingExpenses, null]); // 14
  const rOp = ws.addRow(["Operating Profit (EBITDA)", null, null]); // 15
  rOp.getCell(2).value = { formula: "B13+B14" };
  rOp.font = { bold: true };

  ws.addRow(["Less: Taxes / provisions", -c.taxExpense, null]); // 16
  const rNp = ws.addRow(["Net Profit", null, null]); // 17
  rNp.getCell(2).value = { formula: "B15+B16" };
  rNp.getCell(3).value = {
    formula: 'IF(B10=0,"",ROUND(B17/B10*100,2))',
  };
  rNp.font = { bold: true, size: 12 };

  for (let r = 7; r <= 17; r++) {
    ws.getRow(r).getCell(2).numFmt = "#,##0.00";
  }
  rGp.getCell(3).numFmt = "0.00";
  rNp.getCell(3).numFmt = "0.00";

  ws.addRow([]);
  ws.addRow(["Detail statement (reference)"]).font = {
    bold: true,
    italic: true,
  };
  for (const line of input.lines) {
    if (line.section) {
      const row = ws.addRow([line.label, null, null]);
      row.font = { bold: true, color: { argb: "FF64748B" } };
      continue;
    }
    const label =
      (line.indent > 0 ? "  ".repeat(line.indent) : "") + line.label;
    const row = ws.addRow([
      label,
      line.amount,
      line.pct != null ? line.pct : null,
    ]);
    if (line.bold) row.font = { bold: true };
    if (typeof line.amount === "number") {
      row.getCell(2).numFmt = "#,##0.00";
    }
  }

  ws.addRow([]);
  ws.addRow([
    "Note: Rows 7–17 use Excel formulas for Net Sales / Gross Profit / Operating Profit / Net Profit. Edit inputs to recalculate.",
  ]);

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    "pnl_" +
    input.periodLabel.replace(/[^\dA-Za-z]+/g, "_").slice(0, 40) +
    ".xlsx";
  a.click();
  URL.revokeObjectURL(url);
}
