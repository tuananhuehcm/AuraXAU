import Decimal from "decimal.js";
import type {
  Account,
  AppData,
  EnrichedTrade,
  Milestone,
  Roadmap,
  Trade,
} from "./types";

export const roundMoney = (n: number, cur = "USD") =>
  new Decimal(n).toDecimalPlaces(cur === "VND" ? 0 : 2).toNumber();
export const netPnl = (t: Trade) =>
  new Decimal(t.gross).plus(t.swap).minus(t.fee).minus(t.tax).toNumber();
export function vnMs(value: string) {
  return Date.parse(
    value.length === 10 ? `${value}T00:00:00+07:00` : `${value}:00+07:00`,
  );
}
export function vnNow() {
  return new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 16);
}
export function tradingDay(data: AppData, market: string, value: string) {
  const cut =
    market === "STOCK_VN" ? data.general.cutStock : data.general.cutFX;
  return new Date(vnMs(value) + (7 - cut) * 3600e3).toISOString().slice(0, 10);
}
export function newYork(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(vnMs(value)));
}
export function session(data: AppData, market: string, value: string) {
  const wall = market === "STOCK_VN" ? value.slice(11, 16) : newYork(value);
  const [h, m] = wall.split(":").map(Number);
  const rules = (market === "STOCK_VN" ? data.sessStock : data.sessFX)
    .slice()
    .sort((a, b) => a.t - b.t);
  return rules.filter((r) => r.t <= h + m / 60).at(-1)?.n ?? "Ngoài giờ";
}
export function rateAt(data: AppData, day?: string) {
  const rates = data.rates.slice().sort((a, b) => a.date.localeCompare(b.date));
  const found = (day ? rates.filter((r) => r.date <= day) : rates).at(-1);
  if (!found) throw new Error("Chưa có tỷ giá hiệu lực cho ngày này.");
  return found.rate;
}
export const currencyFactor = (data: AppData, a: Account, day?: string) =>
  a.cur === "VND" ? rateAt(data, day) : 1;
export function instrument(data: AppData, symbol: string, market: string) {
  const i =
    data.instruments.find(
      (i) => i.sym === symbol.toUpperCase() && i.market === market,
    ) ?? data.instruments.find((i) => i.sym === `DEFAULT_${market}`);
  return i
    ? { ...i, valuePerPrice: new Decimal(i.tickVal).div(i.tick).toNumber() }
    : null;
}
export function generateRoadmap(
  data: AppData,
  id: string,
  peakCum = 0,
): Roadmap {
  const a = data.accounts.find((a) => a.id === id);
  if (!a) throw new Error("Không tìm thấy tài khoản.");
  const phases = data.phases
    .filter((p) => p.acc === id)
    .sort((a, b) => a.from - b.from);
  const bcs = data.botcamps
    .filter((b) => b.acc === id)
    .sort((a, b) => a.level - b.level);
  const rounding = data.rounding
    .filter((r) => r.cur === a.cur)
    .sort((a, b) => a.from - b.from);
  const rows: Milestone[] = [];
  let cur = a.start,
    k = 0,
    base = a.start,
    withdrawn = 0;
  if (!phases.length || a.target <= a.start)
    return { rows, done: 0, curIdx: 0, peakCum, totalWd: 0 };
  while (cur < a.target && rows.length < 2000) {
    const p = phases.filter((p) => p.from <= cur).at(-1);
    if (!p) throw new Error("Giai đoạn đầu phải bắt đầu từ số dư 0.");
    const raw = new Decimal(cur).mul(1 + p.pct);
    const step = a.round
      ? (rounding.filter((r) => r.from <= raw.toNumber()).at(-1)?.step ?? 0)
      : 0;
    const rounded =
      step > 0
        ? Math.max(
            raw
              .div(step)
              .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
              .mul(step)
              .toNumber(),
            cur + step,
          )
        : raw.toNumber();
    const bc = bcs[k];
    const end = roundMoney(
      Math.min(
        a.target,
        bc && bc.level > cur && bc.level <= rounded ? bc.level : rounded,
      ),
      a.cur,
    );
    if (end <= cur)
      throw new Error(
        "Target quá nhỏ để tạo bậc mới. Hãy tăng target hoặc bước làm tròn.",
      );
    const isBc = !!bc && end === bc.level && end < a.target;
    const wd = isBc
      ? roundMoney(
          bc.type === "Cố định" ? bc.value : bc.value * (end - base),
          a.cur,
        )
      : 0;
    if (wd < 0 || wd >= end)
      throw new Error("Tiền rút Botcamp phải nhỏ hơn số dư tại mốc.");
    const cumTarget = roundMoney(end + withdrawn - a.start, a.cur);
    rows.push({
      no: rows.length + 1,
      phase: p.no,
      phaseName: p.name,
      start: cur,
      pct: p.pct,
      end,
      type: end >= a.target ? "GOAL" : isBc ? `Botcamp ${bc.no}` : "",
      wd,
      realPct: end / cur - 1,
      cumTarget,
      rmin: cur * p.rmin,
      rmax: cur * p.rmax,
      rminPct: p.rmin,
      rmaxPct: p.rmax,
      status: cumTarget <= peakCum + 1e-8 ? "Hoàn thành" : "Chưa đạt",
    });
    if (isBc) k++;
    withdrawn += wd;
    cur = roundMoney(end - wd, a.cur);
    if (isBc) base = cur;
  }
  if (cur < a.target)
    throw new Error("Lộ trình vượt 2.000 bậc. Hãy kiểm tra cấu hình.");
  const done = rows.filter((r) => r.status === "Hoàn thành").length;
  const curIdx = Math.min(done, rows.length - 1);
  if (done < rows.length) rows[curIdx].status = "Đang thực hiện";
  return { rows, done, curIdx, peakCum, totalWd: roundMoney(withdrawn, a.cur) };
}
const liveTrades = (d: AppData, id: string) =>
  d.trades
    .filter((t) => t.acc === id && !t.deleted)
    .slice()
    .sort((a, b) => a.close.localeCompare(b.close) || a.id.localeCompare(b.id));
const liveCash = (d: AppData, id: string) =>
  d.cashflows.filter((c) => c.acc === id && !c.deleted);
export function balanceAt(
  data: AppData,
  a: Account,
  time: string,
  inclusive = false,
) {
  const before = (s: string) => (inclusive ? s <= time : s < time);
  return roundMoney(
    a.start +
      liveTrades(data, a.id)
        .filter((t) => before(t.close))
        .reduce((s, t) => s + netPnl(t), 0) +
      liveCash(data, a.id)
        .filter((c) => before(c.time))
        .reduce((s, c) => s + (c.type === "Nạp" ? c.amount : -c.amount), 0),
    a.cur,
  );
}
export function performanceAt(data: AppData, a: Account, time?: string) {
  const events = [
    ...liveTrades(data, a.id).map((t) => ({
      time: t.close,
      delta: netPnl(t),
      profit: true,
      id: t.id,
    })),
    ...liveCash(data, a.id)
      .filter((c) => c.type === "Nạp")
      .map((c) => ({ time: c.time, delta: c.amount, profit: false, id: c.id })),
  ]
    .filter((e) => !time || e.time <= time)
    .sort((a, b) => a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
  let cum = 0,
    peakCum = 0,
    adjusted = a.start,
    peak = a.start;
  for (const e of events) {
    adjusted += e.delta;
    peak = Math.max(peak, adjusted);
    if (e.profit) {
      cum += e.delta;
      peakCum = Math.max(peakCum, cum);
    }
  }
  return {
    cum,
    peakCum,
    adjusted,
    peak,
    dd: peak > 0 ? Math.max(0, (peak - adjusted) / peak) : 0,
  };
}
export function effectiveStep(data: AppData, a: Account, time?: string) {
  const perf = performanceAt(data, a, time),
    rm = generateRoadmap(data, a.id, perf.peakCum);
  const index = Math.max(0, rm.curIdx - (perf.dd >= a.descale ? 1 : 0));
  return { rm, step: rm.rows[index], perf, descaled: index !== rm.curIdx };
}
export function positionSize(
  data: AppData,
  a: Account,
  symbol: string,
  percent: number,
  sl: number,
) {
  const inst = instrument(data, symbol, a.market),
    { step } = effectiveStep(data, a);
  if (!inst || !step || percent <= 0 || sl <= 0)
    throw new Error("Nhập mã, % risk và khoảng SL hợp lệ.");
  const budget = new Decimal(step.start).mul(percent);
  const unit = new Decimal(sl).mul(inst.valuePerPrice);
  const raw = budget.div(unit);
  const size = Decimal.max(
    inst.minLot,
    raw.div(inst.lotStep).floor().mul(inst.lotStep),
  ).toNumber();
  const real = new Decimal(size).mul(unit).toNumber();
  return {
    size,
    budget: budget.toNumber(),
    real,
    percent: real / step.start,
    base: step.start,
    step: step.no,
    belowMinimum: raw.lt(inst.minLot),
    over: real > step.rmax + 1e-8,
    max: step.rmax,
  };
}
export function dayStart(data: AppData, a: Account, day: string) {
  const cut =
    a.market === "STOCK_VN" ? data.general.cutStock : data.general.cutFX;
  return `${day}T${String(cut).padStart(2, "0")}:00`;
}
export function enrichTrades(data: AppData): EnrichedTrade[] {
  const out: EnrichedTrade[] = [];
  for (const a of data.accounts.filter((a) => !a.deleted)) {
    let cum = 0;
    const list = liveTrades(data, a.id),
      cash = liveCash(data, a.id),
      days: Record<string, number> = {};
    for (const t of list) {
      const net = roundMoney(netPnl(t), a.cur);
      cum = roundMoney(cum + net, a.cur);
      const inst = instrument(data, t.sym, a.market),
        slDist = t.sl == null ? null : Math.abs(t.entry - t.sl);
      const risk =
        slDist != null && inst
          ? new Decimal(slDist).mul(t.vol).mul(inst.valuePerPrice).toNumber()
          : null;
      const day = tradingDay(data, a.market, t.close);
      const balAfter = roundMoney(
        a.start +
          cum +
          cash
            .filter((c) => c.time <= t.close)
            .reduce((s, c) => s + (c.type === "Nạp" ? c.amount : -c.amount), 0),
        a.cur,
      );
      // Risk is frozen against the roadmap step in force when the trade opened.
      const atOpen = {
        ...data,
        trades: data.trades.filter(
          (x) =>
            x.id !== t.id &&
            (x.close < t.open || (x.close === t.open && x.id < t.id)),
        ),
      };
      const opened = effectiveStep(atOpen, a, t.open),
        riskBase = opened.step?.start ?? a.start;
      const perf = performanceAt(data, a, t.close);
      const rate = currencyFactor(data, a, t.close.slice(0, 10));
      days[day] = (days[day] ?? 0) + net;
      const sod = balanceAt(data, a, dayStart(data, a, day));
      const dayPct = sod > 0 ? days[day] / sod : 0;
      out.push({
        ...t,
        net,
        slDist,
        risk,
        R: risk ? net / risk : null,
        result: net > 0 ? "Win" : net < 0 ? "Loss" : "BE",
        rate,
        usd: net / rate,
        day,
        sess: session(data, a.market, t.open),
        cum,
        balAfter,
        balBefore: balanceAt(atOpen, a, t.open, true),
        step: opened.step?.no ?? 1,
        riskBase,
        riskPct: risk == null ? null : risk / riskBase,
        riskMax: opened.step?.rmax ?? 0,
        over: risk != null && risk > (opened.step?.rmax ?? 0) + 1e-8,
        adj: perf.adjusted,
        dd: perf.dd,
        descale: perf.dd >= a.descale,
        dayPnl: days[day],
        dayPct,
        breaker: sod > 0 && dayPct <= -a.dayLimit,
      });
    }
  }
  return out.sort(
    (a, b) => a.close.localeCompare(b.close) || a.id.localeCompare(b.id),
  );
}
export function accountSnapshot(
  data: AppData,
  a: Account,
  trades: EnrichedTrade[],
) {
  const mine = trades.filter((t) => t.acc === a.id),
    cash = liveCash(data, a.id);
  const perf = performanceAt(data, a);
  const deposits = cash
    .filter((c) => c.type === "Nạp")
    .reduce((s, c) => s + c.amount, 0);
  const balance = roundMoney(
    a.start +
      perf.cum +
      cash.reduce((s, c) => s + (c.type === "Nạp" ? c.amount : -c.amount), 0),
    a.cur,
  );
  const wins = mine.filter((t) => t.net > 0),
    losses = mine.filter((t) => t.net < 0);
  const grossWin = wins.reduce((s, t) => s + t.net, 0),
    grossLoss = -losses.reduce((s, t) => s + t.net, 0);
  return {
    balance,
    cum: perf.cum,
    dd: perf.dd,
    deposits,
    usdBalance: balance / currencyFactor(data, a),
    usdPnl: mine.reduce((s, t) => s + t.usd, 0),
    growth: perf.cum / (a.start + deposits),
    n: mine.length,
    winrate: mine.length ? wins.length / mine.length : null,
    pf: grossLoss ? grossWin / grossLoss : null,
    bcWithdrawn: cash
      .filter((c) => c.type === "Rút Botcamp")
      .reduce((s, c) => s + c.amount, 0),
  };
}
