export type Market = "XAUUSD" | "FX" | "STOCK_VN";
export type Currency = "USD" | "VND";
export type Language = "vi" | "en" | "zh-CN";
export interface Account {
  id: string;
  name: string;
  market: Market;
  broker: string;
  cur: Currency;
  symbol: string;
  start: number;
  target: number;
  startDate: string;
  risk: number;
  dayLimit: number;
  descale: number;
  round: boolean;
  status: string;
  deleted?: boolean;
}
export interface Instrument {
  sym: string;
  market: Market;
  cur: Currency;
  tick: number;
  tickVal: number;
  minLot: number;
  lotStep: number;
  note: string;
}
export interface Phase {
  acc: string;
  no: number;
  name: string;
  from: number;
  pct: number;
  rmin: number;
  rmax: number;
}
export interface Botcamp {
  acc: string;
  no: number;
  level: number;
  type: "Cố định" | "% lãi";
  value: number;
}
export interface Trade {
  id: string;
  acc: string;
  sym: string;
  open: string;
  close: string;
  side: "Buy" | "Sell";
  vol: number;
  entry: number;
  sl: number | null;
  tp: number | null;
  exit: number;
  gross: number;
  fee: number;
  swap: number;
  tax: number;
  setup: string;
  disc: number | null;
  emo: string;
  note: string;
  deleted?: boolean;
}
export interface Cashflow {
  id: string;
  acc: string;
  time: string;
  type: "Nạp" | "Rút" | "Rút Botcamp";
  amount: number;
  note: string;
  deleted?: boolean;
}
export interface SessionRule {
  t: number;
  n: string;
}
export interface AppData {
  general: {
    cutFX: number;
    cutStock: number;
    lang: Language;
    theme: "light" | "dark";
    sheetUrl: string;
  };
  accounts: Account[];
  instruments: Instrument[];
  phases: Phase[];
  botcamps: Botcamp[];
  rates: { date: string; rate: number }[];
  rounding: { cur: Currency; from: number; step: number }[];
  sessFX: SessionRule[];
  sessStock: SessionRule[];
  setups: string[];
  trades: Trade[];
  cashflows: Cashflow[];
  dayNotes: Record<string, string>;
}
export interface Milestone {
  no: number;
  phase: number;
  phaseName: string;
  start: number;
  pct: number;
  end: number;
  type: string;
  wd: number;
  realPct: number;
  cumTarget: number;
  rmin: number;
  rmax: number;
  rminPct: number;
  rmaxPct: number;
  status: "Hoàn thành" | "Đang thực hiện" | "Chưa đạt";
}
export interface Roadmap {
  rows: Milestone[];
  done: number;
  curIdx: number;
  peakCum: number;
  totalWd: number;
}
export interface EnrichedTrade extends Trade {
  net: number;
  slDist: number | null;
  risk: number | null;
  R: number | null;
  result: "Win" | "Loss" | "BE";
  rate: number;
  usd: number;
  day: string;
  sess: string;
  cum: number;
  balAfter: number;
  balBefore: number;
  step: number;
  riskBase: number;
  riskPct: number | null;
  riskMax: number;
  over: boolean;
  adj: number;
  dd: number;
  descale: boolean;
  dayPnl: number;
  dayPct: number;
  breaker: boolean;
}
