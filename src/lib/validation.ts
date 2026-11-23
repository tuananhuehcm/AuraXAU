import { z } from "zod";
import type { AppData } from "./types";
import { generateRoadmap, instrument, vnMs } from "./engine";
const n = z.number().finite(),
  positive = n.positive(),
  nonneg = n.nonnegative(),
  ratio = n.min(0).max(1);
const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_-]+$/, "Mã chỉ gồm chữ, số, gạch ngang và gạch dưới.");
const text = z.string().max(10000),
  label = z.string().min(1).max(150);
const date = z.iso.date(),
  time = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    .refine(
      (s) =>
        Number.isFinite(vnMs(s)) &&
        new Date(vnMs(s) + 7 * 3600e3).toISOString().slice(0, 16) === s,
      "Ngày giờ không hợp lệ.",
    );
const market = z.enum(["XAUUSD", "FX", "STOCK_VN"]),
  cur = z.enum(["USD", "VND"]),
  deleted = z.boolean().optional();
export const appSchema = z.object({
  general: z.object({
    cutFX: n.int().min(0).max(23),
    cutStock: n.int().min(0).max(23),
    lang: z.enum(["vi", "en", "zh-CN"]),
    theme: z.enum(["light", "dark"]),
    sheetUrl: z
      .string()
      .max(500)
      .refine(
        (s) =>
          !s ||
          /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]+/.test(
            s,
          ),
        "Link Google Sheet không hợp lệ.",
      ),
  }),
  accounts: z
    .array(
      z.object({
        id,
        name: label,
        market,
        broker: text,
        cur,
        symbol: label,
        start: positive,
        target: positive,
        startDate: date,
        risk: positive.max(1),
        dayLimit: positive.max(1),
        descale: positive.max(1),
        round: z.boolean(),
        status: z.enum(["Đang chạy", "Tạm dừng", "Đã đóng"]),
        deleted,
      }),
    )
    .max(100),
  instruments: z
    .array(
      z.object({
        sym: label,
        market,
        cur,
        tick: positive,
        tickVal: positive,
        minLot: positive,
        lotStep: positive,
        note: text,
      }),
    )
    .max(500),
  phases: z
    .array(
      z.object({
        acc: id,
        no: positive.int(),
        name: label,
        from: nonneg,
        pct: positive.max(5),
        rmin: ratio,
        rmax: positive.max(1),
      }),
    )
    .max(500),
  botcamps: z
    .array(
      z.object({
        acc: id,
        no: positive.int(),
        level: positive,
        type: z.enum(["Cố định", "% lãi"]),
        value: nonneg,
      }),
    )
    .max(500),
  rates: z
    .array(z.object({ date, rate: positive }))
    .min(1)
    .max(2000),
  rounding: z.array(z.object({ cur, from: nonneg, step: positive })).max(100),
  sessFX: z
    .array(z.object({ t: n.min(0).lt(24), n: label }))
    .min(1)
    .max(30),
  sessStock: z
    .array(z.object({ t: n.min(0).lt(24), n: label }))
    .min(1)
    .max(30),
  setups: z.array(label).max(200),
  trades: z
    .array(
      z.object({
        id,
        acc: id,
        sym: label,
        open: time,
        close: time,
        side: z.enum(["Buy", "Sell"]),
        vol: positive,
        entry: positive,
        sl: positive.nullable(),
        tp: positive.nullable(),
        exit: positive,
        gross: n,
        fee: nonneg,
        swap: n,
        tax: nonneg,
        setup: text,
        disc: n.int().min(1).max(5).nullable(),
        emo: text,
        note: text,
        deleted,
      }),
    )
    .max(20000),
  cashflows: z
    .array(
      z.object({
        id,
        acc: id,
        time,
        type: z.enum(["Nạp", "Rút", "Rút Botcamp"]),
        amount: positive,
        note: text,
        deleted,
      }),
    )
    .max(10000),
  dayNotes: z.record(
    z
      .string()
      .max(150)
      .regex(/^[A-Za-z0-9_-]+\|\d{4}-\d{2}-\d{2}$/),
    text,
  ),
});
export function validateData(raw: unknown): AppData {
  const d = appSchema.parse(raw) as AppData;
  const unique = (keys: string[], what: string) => {
    if (new Set(keys).size !== keys.length)
      throw new Error(`Trùng mã ${what}.`);
  };
  unique(
    d.accounts.map((a) => a.id),
    "tài khoản",
  );
  unique(
    d.trades.map((t) => t.id),
    "lệnh",
  );
  unique(
    d.cashflows.map((c) => c.id),
    "cashflow",
  );
  unique(
    d.instruments.map((i) => i.sym),
    "hợp đồng",
  );
  unique(
    d.rates.map((r) => r.date),
    "ngày tỷ giá",
  );
  unique(
    d.phases.map((p) => `${p.acc}|${p.no}`),
    "giai đoạn",
  );
  unique(
    d.botcamps.map((p) => `${p.acc}|${p.no}`),
    "Botcamp",
  );
  unique(
    d.phases.map((p) => `${p.acc}|${p.from}`),
    "ngưỡng giai đoạn",
  );
  unique(
    d.botcamps.map((p) => `${p.acc}|${p.level}`),
    "mức Botcamp",
  );
  unique(
    d.rounding.map((r) => `${r.cur}|${r.from}`),
    "bước làm tròn",
  );
  unique(
    d.sessFX.map((s) => String(s.t)),
    "giờ phiên FX",
  );
  unique(
    d.sessStock.map((s) => String(s.t)),
    "giờ phiên CK",
  );
  unique(d.setups, "setup");
  const accounts = new Map(d.accounts.map((a) => [a.id, a]));
  for (const row of [...d.trades, ...d.cashflows, ...d.phases, ...d.botcamps])
    if (!accounts.has(row.acc))
      throw new Error(`Không có tài khoản ${row.acc}.`);
  for (const a of d.accounts) {
    if (a.target <= a.start) throw new Error("Mục tiêu phải lớn hơn vốn đầu.");
    if ((a.market === "STOCK_VN") !== (a.cur === "VND"))
      throw new Error("Chứng khoán VN dùng VND; vàng và FX dùng USD.");
    if (!instrument(d, a.symbol, a.market))
      throw new Error(`Thiếu thông số mã ${a.symbol}.`);
    const phases = d.phases.filter((p) => p.acc === a.id);
    if (!phases.length || !phases.some((p) => p.from === 0))
      throw new Error(`${a.id}: cần giai đoạn bắt đầu từ 0.`);
    if (phases.some((p) => p.rmin > p.rmax))
      throw new Error("Risk min phải nhỏ hơn hoặc bằng risk max.");
    const bcs = d.botcamps.filter((b) => b.acc === a.id);
    if (
      bcs.some(
        (b) =>
          b.level <= a.start ||
          b.level >= a.target ||
          (b.type === "% lãi" && b.value > 1),
      )
    )
      throw new Error(
        "Mốc Botcamp phải nằm giữa vốn đầu và mục tiêu; % rút tối đa 100% lãi.",
      );
    generateRoadmap(d, a.id);
  }
  for (const t of d.trades) {
    const a = accounts.get(t.acc)!;
    if (t.close < t.open)
      throw new Error(`${t.id}: giờ đóng phải từ giờ mở trở đi.`);
    if (t.open.slice(0, 10) < a.startDate)
      throw new Error(`${t.id}: lệnh trước ngày bắt đầu tài khoản.`);
    if (a.market === "STOCK_VN" && t.side !== "Buy")
      throw new Error("Chứng khoán VN chỉ hỗ trợ mua trước, bán sau.");
    const inst = instrument(d, t.sym, a.market);
    if (!inst) throw new Error(`${t.id}: thiếu thông số hợp đồng.`);
    if (
      t.vol < inst.minLot - 1e-8 ||
      Math.abs(t.vol / inst.lotStep - Math.round(t.vol / inst.lotStep)) > 1e-6
    )
      throw new Error(`${t.id}: khối lượng không đúng bước hoặc tối thiểu.`);
  }
  for (const c of d.cashflows)
    if (c.time.slice(0, 10) < accounts.get(c.acc)!.startDate)
      throw new Error("Cashflow trước ngày bắt đầu tài khoản.");
  return d;
}
