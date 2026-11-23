import ExcelJS from "exceljs";
import { randomUUID, createHash } from "node:crypto";
import type { AppData } from "./types";
import {
  accountSnapshot,
  enrichTrades,
  effectiveStep,
  newYork,
  generateRoadmap,
} from "./engine";
import { validateData } from "./validation";
type Kind =
  "text" | "number" | "nullable" | "date" | "time" | "boolean" | "session";
type Col = [string, string, Kind?];
type Collection =
  | "accounts"
  | "instruments"
  | "phases"
  | "botcamps"
  | "rates"
  | "rounding"
  | "sessFX"
  | "sessStock"
  | "setups"
  | "trades"
  | "cashflows";
export const tradeCols: Col[] = [
  ["id", "trade_id"],
  ["acc", "Tài khoản"],
  ["sym", "Mã"],
  ["open", "Mở lúc", "time"],
  ["close", "Đóng lúc", "time"],
  ["side", "Chiều"],
  ["vol", "Khối lượng", "number"],
  ["entry", "Giá vào", "number"],
  ["sl", "Giá SL", "nullable"],
  ["tp", "Giá TP", "nullable"],
  ["exit", "Giá đóng", "number"],
  ["gross", "PnL gộp", "number"],
  ["fee", "Phí", "number"],
  ["swap", "Swap", "number"],
  ["tax", "Thuế", "number"],
  ["setup", "Setup"],
  ["disc", "Kỷ luật (1–5)", "nullable"],
  ["emo", "Cảm xúc"],
  ["note", "Ghi chú"],
];
export const cashCols: Col[] = [
  ["id", "cf_id"],
  ["acc", "Tài khoản"],
  ["time", "Thời gian (giờ VN)", "time"],
  ["type", "Loại"],
  ["amount", "Số tiền", "number"],
  ["note", "Ghi chú"],
];
export const blocks: {
  key: Collection;
  col: number;
  title: string;
  cols: Col[];
}[] = [
  {
    key: "accounts",
    col: 4,
    title: "TÀI KHOẢN",
    cols: [
      ["id", "account_id"],
      ["name", "Tên tài khoản"],
      ["market", "Thị trường"],
      ["broker", "Broker / Sàn"],
      ["cur", "Tiền tệ"],
      ["symbol", "Mã mặc định"],
      ["start", "Vốn đầu", "number"],
      ["target", "Mục tiêu", "number"],
      ["startDate", "Ngày bắt đầu", "date"],
      ["risk", "Risk mặc định %", "number"],
      ["dayLimit", "Giới hạn lỗ ngày %", "number"],
      ["descale", "Ngưỡng hạ bậc (DD từ đỉnh) %", "number"],
      ["round", "Làm tròn mốc", "boolean"],
      ["status", "Trạng thái"],
    ],
  },
  {
    key: "instruments",
    col: 19,
    title: "THÔNG SỐ HỢP ĐỒNG / MÃ",
    cols: [
      ["sym", "Mã"],
      ["market", "Thị trường"],
      ["cur", "Tiền tệ"],
      ["tick", "Bước giá (pip/tick)", "number"],
      ["tickVal", "Giá trị 1 bước / 1 lot", "number"],
      ["_value", "Giá trị 1.0 giá / 1 lot", "number"],
      ["minLot", "KL tối thiểu", "number"],
      ["lotStep", "Bước KL", "number"],
      ["note", "Ghi chú"],
    ],
  },
  {
    key: "phases",
    col: 29,
    title: "GIAI ĐOẠN LỘ TRÌNH",
    cols: [
      ["_key", "key"],
      ["acc", "account_id"],
      ["no", "Giai đoạn #", "number"],
      ["name", "Tên giai đoạn"],
      ["from", "Từ số dư", "number"],
      ["pct", "Target % / bậc", "number"],
      ["rmin", "Risk min %", "number"],
      ["rmax", "Risk max %", "number"],
    ],
  },
  {
    key: "botcamps",
    col: 38,
    title: "BOTCAMP",
    cols: [
      ["_key", "key"],
      ["acc", "account_id"],
      ["no", "Botcamp #", "number"],
      ["level", "Mức số dư", "number"],
      ["type", "Kiểu rút"],
      ["value", "Giá trị rút", "number"],
    ],
  },
  {
    key: "rates",
    col: 45,
    title: "TỶ GIÁ",
    cols: [
      ["date", "Ngày hiệu lực", "date"],
      ["rate", "VND / 1 USD", "number"],
    ],
  },
  {
    key: "rounding",
    col: 48,
    title: "BƯỚC LÀM TRÒN MỐC",
    cols: [
      ["_key", "key"],
      ["cur", "Tiền tệ"],
      ["_no", "#", "number"],
      ["from", "Từ số dư", "number"],
      ["step", "Bước làm tròn", "number"],
    ],
  },
  {
    key: "sessFX",
    col: 54,
    title: "PHIÊN VÀNG/FX",
    cols: [
      ["t", "Bắt đầu (NY)", "session"],
      ["n", "Phiên"],
    ],
  },
  {
    key: "sessStock",
    col: 57,
    title: "PHIÊN CK VN",
    cols: [
      ["t", "Bắt đầu (VN)", "session"],
      ["n", "Phiên"],
    ],
  },
  { key: "setups", col: 60, title: "SETUP", cols: [["name", "Tên setup"]] },
];
export function rowsFor(
  d: AppData,
  key: Collection,
): Record<string, unknown>[] {
  return key === "setups"
    ? d.setups.map((name) => ({ name }))
    : (d[key] as unknown as Record<string, unknown>[]).filter(
        (r) => !r.deleted,
      );
}
export function recordKey(key: Collection, r: Record<string, unknown>) {
  if (key === "phases" || key === "botcamps") return `${r.acc}|${r.no}`;
  if (key === "rates") return String(r.date);
  if (key === "instruments") return String(r.sym);
  if (key === "rounding") return `${r.cur}|${r.from}`;
  if (key === "sessFX" || key === "sessStock") return String(r.t);
  if (key === "setups") return String(r.name);
  return String(r.id);
}
function formatSheet(sheet: ExcelJS.Worksheet, title: string) {
  sheet.getCell("A1").value = title;
  sheet.getCell("A1").font = {
    name: "Arial",
    size: 16,
    bold: true,
    color: { argb: "FF1C1B18" },
  };
  sheet.getCell("A2").value =
    "Ô vàng: nhập liệu. Ô xám: kết quả tự tính. Tỷ lệ lưu dạng thập phân (0.03 = 3%). Không đổi tên cột dòng 5.";
  sheet.views = [{ state: "frozen", ySplit: 5, showGridLines: false }];
  sheet.properties.defaultRowHeight = 22;
}
function writeBlock(
  sheet: ExcelJS.Worksheet,
  col: number,
  cols: Col[],
  rows: Record<string, unknown>[],
  title?: string,
) {
  if (title) sheet.getCell(4, col).value = title;
  cols.forEach(([key, label], i) => {
    const c = sheet.getCell(5, col + i);
    c.value = label;
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    c.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF2F2B21" },
    };
    sheet.getColumn(col + i).width = key.includes("note")
      ? 35
      : Math.max(16, Math.min(label.length + 2, 27));
  });
  rows.forEach((r, i) =>
    cols.forEach(([key, , kind], j) => {
      const c = sheet.getCell(i + 6, col + j);
      let v = r[key];
      if (key === "_value") v = Number(r.tickVal) / Number(r.tick);
      if (key === "_key")
        v = r.acc ? `${r.acc}|${r.no}` : r.cur ? `${r.cur}|${i + 1}` : "";
      if (key === "_no") v = i + 1;
      if (kind === "boolean") v = v ? "Có" : "Không";
      if (kind === "session") v = Number(v) / 24;
      c.value = (v ?? null) as ExcelJS.CellValue;
      c.font = {
        name: "Arial",
        size: 10,
        color: { argb: key.startsWith("_") ? "FF1C1B18" : "FF205CA5" },
      };
      c.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: key.startsWith("_") ? "FFF1F0ED" : "FFFFF5D9" },
      };
      if (kind === "number" || kind === "nullable")
        c.numFmt = "#,##0.00########";
      if (kind === "session") c.numFmt = "hh:mm";
    }),
  );
}
export async function createWorkbook(d: AppData, accountId?: string) {
  const w = new ExcelJS.Workbook();
  w.creator = "AuraGold 100K";
  w.created = new Date();
  const dashboard = w.addWorksheet("Dashboard"),
    roadmap = w.addWorksheet("Lo_Trinh"),
    trades = w.addWorksheet("Trades"),
    cash = w.addWorksheet("Cashflow"),
    settings = w.addWorksheet("Settings");
  for (const s of w.worksheets) formatSheet(s, `AURAGOLD 100K — ${s.name}`);
  const enriched = enrichTrades(d);
  writeBlock(
    dashboard,
    1,
    [
      ["id", "account_id"],
      ["name", "Tên"],
      ["cur", "Tiền tệ"],
      ["balance", "Số dư", "number"],
      ["usdBalance", "Số dư USD", "number"],
      ["cum", "PnL", "number"],
      ["usdPnl", "PnL USD", "number"],
      ["n", "Số lệnh", "number"],
      ["winrate", "Winrate", "number"],
      ["dd", "Drawdown", "number"],
    ],
    d.accounts.map((a) => ({ ...a, ...accountSnapshot(d, a, enriched) })),
  );
  const a = d.accounts.find((a) => a.id === accountId) ?? d.accounts[0];
  if (a) {
    const rm = effectiveStep(d, a).rm;
    writeBlock(
      roadmap,
      1,
      [
        ["no", "Bậc", "number"],
        ["phaseName", "Giai đoạn"],
        ["start", "Vốn đầu bậc", "number"],
        ["pct", "Target %", "number"],
        ["end", "Vốn cuối bậc", "number"],
        ["type", "Loại mốc"],
        ["wd", "Rút kế hoạch", "number"],
        ["cumTarget", "Lợi nhuận lũy kế mục tiêu", "number"],
        ["rmin", "Risk min", "number"],
        ["rmax", "Risk max", "number"],
        ["status", "Trạng thái"],
      ],
      rm.rows as unknown as Record<string, unknown>[],
    );
    roadmap.getCell("A2").value =
      `Tài khoản ${a.id} · ${rm.rows.length} bậc · tổng rút ${rm.totalWd} ${a.cur}`;
  }
  const calculated: Col[] = [
    ["market", "Thị trường"],
    ["cur", "Tiền tệ"],
    ["net", "PnL ròng", "number"],
    ["slDist", "Khoảng SL (giá)", "number"],
    ["risk", "Rủi ro dự kiến", "number"],
    ["R", "R thực", "number"],
    ["result", "Kết quả"],
    ["rate", "Tỷ giá", "number"],
    ["usd", "PnL ròng USD", "number"],
    ["day", "Ngày giao dịch"],
    ["ny", "Giờ mở (New York)"],
    ["sess", "Phiên"],
    ["cum", "PnL lũy kế (TK)", "number"],
    ["balAfter", "Số dư sau lệnh", "number"],
    ["balBefore", "Số dư trước lệnh", "number"],
    ["riskPct", "% Risk thực", "number"],
    ["step", "Bậc áp dụng", "number"],
    ["riskBase", "Vốn đầu bậc áp dụng", "number"],
    ["riskMax", "Risk max bậc", "number"],
    ["over", "Vượt risk?"],
    ["dd", "DD từ đỉnh", "number"],
    ["dayPct", "% lãi/lỗ ngày", "number"],
  ];
  writeBlock(
    trades,
    1,
    [...tradeCols, ...calculated],
    enriched.map((t) => ({
      ...t,
      market: d.accounts.find((a) => a.id === t.acc)!.market,
      cur: d.accounts.find((a) => a.id === t.acc)!.cur,
      ny: newYork(t.open),
      over: t.over ? "VƯỢT" : "",
    })),
  );
  writeBlock(cash, 1, cashCols, rowsFor(d, "cashflows"));
  settings.getCell("A4").value = "THÔNG SỐ CHUNG";
  settings.getCell("A5").value = "Thông số";
  settings.getCell("B5").value = "Giá trị";
  settings.getCell("A6").value = "Giờ cắt ngày — Vàng & FX (giờ VN)";
  settings.getCell("B6").value = d.general.cutFX;
  settings.getCell("A7").value = "Giờ cắt ngày — Chứng khoán (giờ VN)";
  settings.getCell("B7").value = d.general.cutStock;
  for (const b of blocks)
    writeBlock(settings, b.col, b.cols, rowsFor(d, b.key), b.title);
  // Computed output columns are grey and must never be imported as inputs.
  for (const s of [dashboard, roadmap])
    s.eachRow((row, no) => {
      if (no >= 6)
        row.eachCell((c) => {
          c.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF1F0ED" },
          };
          c.font = { name: "Arial", size: 10, color: { argb: "FF1C1B18" } };
        });
    });
  trades.eachRow((row, no) => {
    if (no >= 6)
      for (let i = 20; i <= row.cellCount; i++) {
        const c = row.getCell(i);
        c.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF1F0ED" },
        };
        c.font = { name: "Arial", size: 10 };
      }
  });
  return w;
}
export function cellValue(cell: ExcelJS.Cell): unknown {
  const v = cell.value;
  if (v && typeof v === "object" && "formula" in v) return v.result ?? "";
  if (v && typeof v === "object" && "richText" in v)
    return v.richText.map((x) => x.text).join("");
  return v ?? "";
}
function cast(v: unknown, kind: Kind | undefined) {
  if (kind === "date" || kind === "time") {
    if (v instanceof Date)
      return v.toISOString().slice(0, kind === "date" ? 10 : 16);
    if (typeof v === "number")
      return new Date(Date.UTC(1899, 11, 30) + v * 864e5)
        .toISOString()
        .slice(0, kind === "date" ? 10 : 16);
    return String(v)
      .trim()
      .slice(0, kind === "date" ? 10 : 16)
      .replace(" ", "T");
  }
  if (kind === "boolean")
    return v === true || v === "Có" || v === "TRUE" || v === 1;
  if (kind === "session") {
    if (v instanceof Date) return v.getUTCHours() + v.getUTCMinutes() / 60;
    return typeof v === "string" && v.includes(":")
      ? Number(v.split(":")[0]) + Number(v.split(":")[1]) / 60
      : Math.round(Number(v) * 24 * 1e8) / 1e8;
  }
  if (kind === "number" || kind === "nullable")
    return v === "" || v == null ? (kind === "nullable" ? null : 0) : Number(v);
  return String(v ?? "").trim();
}
export function readBlock(
  sheet: ExcelJS.Worksheet,
  col: number,
  cols: Col[],
  key: Collection,
  sourceId?: string,
) {
  const headers = new Map<string, number>();
  for (let i = col; i < col + cols.length; i++)
    headers.set(String(cellValue(sheet.getCell(5, i))).trim(), i);
  for (const [field, label] of cols)
    if (!field.startsWith("_") && !headers.has(label))
      throw new Error(`${sheet.name}: thiếu cột "${label}" ở dòng 5.`);
  const records: Record<string, unknown>[] = [];
  for (let r = 6; r <= Math.min(sheet.rowCount, 20005); r++) {
    const row: Record<string, unknown> = {};
    for (const [field, label, kind] of cols)
      if (!field.startsWith("_"))
        row[field] = cast(
          cellValue(sheet.getCell(r, headers.get(label)!)),
          kind,
        );
    const anchor =
      key === "trades" || key === "cashflows"
        ? "acc"
        : key === "accounts"
          ? "id"
          : key === "instruments"
            ? "sym"
            : key === "phases" || key === "botcamps"
              ? "acc"
              : key === "rates"
                ? "date"
                : key === "rounding"
                  ? "cur"
                  : "n";
    if (key === "setups") {
      if (row.name) records.push(row);
      continue;
    }
    if (!row[anchor]) continue;
    if ((key === "trades" || key === "cashflows") && !row.id)
      row.id = `${key === "trades" ? "T" : "CF"}_${
        sourceId
          ? createHash("sha256")
              .update(`${sourceId}|${key}|${r}|${canonical(row)}`)
              .digest("hex")
              .slice(0, 28)
          : randomUUID()
      }`;
    records.push(row);
  }
  return records;
}
export type Baseline = Record<string, string>;
const canonical = (v: unknown): string =>
  v && typeof v === "object"
    ? Array.isArray(v)
      ? `[${v.map(canonical).join(",")}]`
      : `{${Object.entries(v)
          .filter(([k]) => k !== "deleted")
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
          .join(",")}}`
    : JSON.stringify(v);
export function makeBaseline(d: AppData): Baseline {
  const out: Baseline = {};
  for (const b of [
    ...blocks,
    { key: "trades" as const },
    { key: "cashflows" as const },
  ])
    for (const r of rowsFor(d, b.key))
      out[`${b.key}:${recordKey(b.key, r)}`] = canonical(r);
  out.general = canonical({
    cutFX: d.general.cutFX,
    cutStock: d.general.cutStock,
  });
  return out;
}
export function mergeWorkbook(
  w: ExcelJS.Workbook,
  current: AppData,
  baseline?: Baseline,
  sourceId?: string,
) {
  const d = structuredClone(current);
  let added = 0,
    updated = 0,
    conflicts = 0;
  const sources = [
    ...blocks.map((b) => ({ ...b, sheet: "Settings" })),
    { key: "trades" as const, col: 1, cols: tradeCols, sheet: "Trades" },
    { key: "cashflows" as const, col: 1, cols: cashCols, sheet: "Cashflow" },
  ];
  for (const b of sources) {
    const s = w.getWorksheet(b.sheet);
    if (!s) throw new Error(`Thiếu sheet ${b.sheet}.`);
    const records = readBlock(s, b.col, b.cols, b.key, sourceId),
      existing = (b.key === "setups"
        ? d.setups.map((name) => ({ name }))
        : d[b.key]) as unknown as Record<string, unknown>[];
    const seen = new Set<string>();
    for (const r of records) {
      const id = recordKey(b.key, r);
      if (seen.has(id)) throw new Error(`${b.sheet}: trùng mã ${id}.`);
      seen.add(id);
      const i = existing.findIndex((x) => recordKey(b.key, x) === id),
        before = i >= 0 ? existing[i] : null;
      if (before?.deleted) {
        conflicts++;
        continue;
      }
      const canonicalCurrent = before ? canonical(before) : undefined,
        incoming = canonical(r),
        base = baseline?.[`${b.key}:${id}`];
      if (
        before &&
        incoming !== canonicalCurrent &&
        baseline &&
        canonicalCurrent !== base
      ) {
        conflicts++;
        continue;
      }
      if (before && incoming === canonicalCurrent) continue;
      if (i >= 0) {
        existing[i] = r;
        updated++;
      } else {
        existing.push(r);
        added++;
      }
    }
    if (b.key === "setups") d.setups = existing.map((x) => String(x.name));
    else (d[b.key] as unknown) = existing;
  }
  const settings = w.getWorksheet("Settings")!;
  const general = {
    cutFX: Number(cellValue(settings.getCell("B6"))),
    cutStock: Number(cellValue(settings.getCell("B7"))),
  };
  const currentGeneral = {
    cutFX: d.general.cutFX,
    cutStock: d.general.cutStock,
  };
  if (
    baseline &&
    canonical(currentGeneral) !== baseline.general &&
    canonical(general) !== canonical(currentGeneral)
  ) {
    conflicts++;
  } else Object.assign(d.general, general);
  return {
    data: validateData(d),
    summary: `${added} dòng mới · ${updated} cập nhật · ${conflicts} xung đột giữ bản DB`,
    added,
    updated,
    conflicts,
  };
}
