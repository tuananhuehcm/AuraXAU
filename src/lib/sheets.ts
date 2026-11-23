import { JWT } from "google-auth-library";
import ExcelJS from "exceljs";
import {
  createWorkbook,
  type Baseline,
  makeBaseline,
  mergeWorkbook,
} from "./workbook";
import { prisma } from "./db";
import { readWorkspace, writeWorkspace } from "./store";
import type { Prisma } from "@/generated/prisma/client";
async function api(url: string, method = "GET", body?: unknown) {
  if (
    !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
    !process.env.GOOGLE_PRIVATE_KEY
  )
    throw new Error("Chưa cấu hình Google Service Account trên Vercel.");
  const jwt = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  try {
    const result = await jwt.request({
      url: `https://sheets.googleapis.com/v4/spreadsheets/${url}`,
      method: method as "GET" | "POST",
      data: body,
    });
    return result.data;
  } catch {
    throw new Error(
      "Không truy cập được Google Sheet. Kiểm tra Service Account, Google Sheets API và quyền Editor của file.",
    );
  }
}
export async function syncSheet(expectedRevision: number) {
  const current = await readWorkspace();
  if (current.revision !== expectedRevision) throw new Error("CONFLICT");
  const id = current.data.general.sheetUrl.match(/\/d\/([A-Za-z0-9_-]+)/)?.[1];
  if (!id)
    throw new Error("Lưu link Google Sheet trong Cài đặt trước khi đồng bộ.");
  const snapshot = (await api(`${id}?includeGridData=false`)) as {
    sheets: {
      properties: {
        sheetId: number;
        title: string;
        gridProperties: { rowCount: number; columnCount: number };
      };
    }[];
  };
  const required = ["Dashboard", "Lo_Trinh", "Trades", "Cashflow", "Settings"];
  if (
    required.some(
      (name) => !snapshot.sheets.some((s) => s.properties.title === name),
    )
  )
    throw new Error(
      "Sheet cần đủ Dashboard, Lo_Trinh, Trades, Cashflow và Settings. Hãy nhập file Excel xuất từ app vào Google Sheets trước.",
    );
  const ranges = required
    .map((s) => `ranges=${encodeURIComponent(`'${s}'!A1:BJ20005`)}`)
    .join("&");
  const response = (await api(
    `${id}/values:batchGet?${ranges}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`,
  )) as { valueRanges: { values?: unknown[][] }[] };
  const w = new ExcelJS.Workbook();
  required.forEach((name, i) => {
    const sheet = w.addWorksheet(name);
    for (const r of response.valueRanges[i]?.values ?? []) sheet.addRow(r);
  });
  const baselineRow = await prisma.sheetSync.findUnique({ where: { id } });
  const merged = mergeWorkbook(
    w,
    current.data,
    baselineRow?.baseline as Baseline | undefined,
    id,
  );
  const saved = await writeWorkspace(merged.data, current.revision);
  try {
    const exportW = await createWorkbook(merged.data);
    const update = [];
    for (const s of exportW.worksheets) {
      const prop = snapshot.sheets.find(
        (x) => x.properties.title === s.name,
      )!.properties;
      const rows: unknown[] = [];
      const height = Math.max(s.rowCount, prop.gridProperties.rowCount),
        width = Math.max(s.columnCount, 60, prop.gridProperties.columnCount);
      if (
        height > prop.gridProperties.rowCount ||
        width > prop.gridProperties.columnCount
      )
        update.push({
          updateSheetProperties: {
            properties: {
              sheetId: prop.sheetId,
              gridProperties: { rowCount: height, columnCount: width },
            },
            fields: "gridProperties(rowCount,columnCount)",
          },
        });
      for (let r = 1; r <= height; r++) {
        const values = [];
        for (let c = 1; c <= width; c++) {
          const cell = s.getCell(r, c);
          let value = cell.value;
          if (value && typeof value === "object" && "formula" in value)
            value = value.result ?? null;
          values.push({
            userEnteredValue:
              typeof value === "number"
                ? { numberValue: value }
                : value == null
                  ? {}
                  : { stringValue: String(value) },
          });
        }
        rows.push({ values });
      }
      update.push({
        updateCells: {
          range: {
            sheetId: prop.sheetId,
            startRowIndex: 0,
            startColumnIndex: 0,
          },
          rows,
          fields: "userEnteredValue",
        },
      });
    }
    await api(`${id}:batchUpdate`, "POST", { requests: update });
    await prisma.sheetSync.upsert({
      where: { id },
      create: {
        id,
        baseline: makeBaseline(merged.data) as Prisma.InputJsonValue,
      },
      update: { baseline: makeBaseline(merged.data) as Prisma.InputJsonValue },
    });
    await prisma.syncLog.create({
      data: { summary: `${id}: ${merged.summary}` },
    });
    return {
      revision: saved.revision,
      summary: `Đồng bộ xong · ${merged.summary}`,
    };
  } catch {
    await prisma.syncLog.create({
      data: { summary: `${id}: DB đã lưu; đẩy lên Sheet thất bại.` },
    });
    throw new Error(
      "DB đã lưu nhưng chưa đẩy được lên Sheet. Kiểm tra quyền Editor và tải lại app trước khi đồng bộ lại.",
    );
  }
}
