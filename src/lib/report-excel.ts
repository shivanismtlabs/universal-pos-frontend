import ExcelJS from "exceljs";

export type ReportExcelSheet = {
  name: string;
  columns: Array<{ header: string; width?: number }>;
  rows: Array<Array<string | number | null | undefined>>;
};

export type ReportExcelInput = {
  filename: string;
  title: string;
  tenantName?: string;
  subtitle?: string;
  sheets: ReportExcelSheet[];
};

/** Generic multi-sheet .xlsx download for finance / ops reports. */
export async function downloadReportExcel(input: ReportExcelInput) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Universal POS";
  wb.created = new Date();

  for (const sheet of input.sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31), {
      views: [{ state: "frozen", ySplit: 4 }],
    });

    sheet.columns.forEach((col, i) => {
      ws.getColumn(i + 1).width = col.width ?? 16;
    });

    ws.addRow([input.tenantName || "Universal POS"]);
    ws.getRow(1).font = { bold: true, size: 14 };
    ws.addRow([input.title]);
    ws.getRow(2).font = { bold: true, size: 12 };
    ws.addRow([input.subtitle || ""]);
    ws.addRow([]);

    const header = ws.addRow(sheet.columns.map((c) => c.header));
    header.font = { bold: true };
    header.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE8EEF7" },
    };

    for (const row of sheet.rows) {
      ws.addRow(row.map((c) => (c === undefined || c === null ? "" : c)));
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = input.filename.endsWith(".xlsx")
    ? input.filename
    : `${input.filename}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
