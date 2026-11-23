import { test } from "node:test";
import assert from "node:assert/strict";
import { sampleData } from "../src/lib/data";
import {
  accountSnapshot,
  balanceAt,
  effectiveStep,
  enrichTrades,
  generateRoadmap,
  newYork,
  positionSize,
  tradingDay,
} from "../src/lib/engine";
import { validateData } from "../src/lib/validation";
test("sample roadmap reconciles every step, Botcamp and goal", () => {
  const d = sampleData(),
    r = generateRoadmap(d, "ACC01");
  assert.equal(r.rows.length, 61);
  assert.equal(r.totalWd, 7700);
  assert.equal(r.rows.at(-1)!.end, 100000);
  assert.equal(r.rows.at(-1)!.cumTarget, 107500);
  assert.deepEqual(
    r.rows.filter((r) => r.wd).map((r) => [r.no, r.end, r.wd]),
    [
      [8, 1000, 200],
      [16, 2500, 500],
      [30, 10000, 2000],
      [50, 50000, 5000],
    ],
  );
  for (let i = 1; i < r.rows.length; i++)
    assert.equal(r.rows[i].start, r.rows[i - 1].end - r.rows[i - 1].wd);
});
test("sample balances, costs and quantitative metrics reconcile", () => {
  const d = sampleData(),
    tr = enrichTrades(d),
    gold = accountSnapshot(d, d.accounts[0], tr),
    stock = accountSnapshot(d, d.accounts[1], tr);
  assert.equal(gold.balance, 222);
  assert.equal(gold.cum, 22);
  assert.equal(gold.pf, 3.75);
  assert.equal(gold.winrate, 2 / 3);
  assert.equal(stock.balance, 121101000);
  assert.equal(stock.cum, 1101000);
  assert.equal(tr.find((t) => t.id === "S000001")!.R, 1.101);
});
test("risk is based on step capital, never the growing current balance", () => {
  const d = sampleData(),
    a = d.accounts[0];
  const p = positionSize(d, a, "XAUUSD", 0.03, 6);
  assert.equal(p.base, 200);
  assert.equal(p.budget, 6);
  assert.equal(p.size, 0.01);
  assert.equal(p.percent, 0.03);
  assert.equal(enrichTrades(d).find((t) => t.id === "T000003")!.riskPct, 0.025);
});
test("minimum size reports both budget overrun and actual risk", () => {
  const d = sampleData();
  const p = positionSize(d, d.accounts[0], "XAUUSD", 0.01, 15);
  assert.equal(p.size, 0.01);
  assert.equal(p.belowMinimum, true);
  assert.equal(p.over, true);
  assert.equal(p.real, 15);
});
test("withdrawals never cause drawdown or erase completed milestones", () => {
  const d = sampleData();
  d.trades = d.trades.filter((t) => t.acc === "ACC01").slice(0, 1);
  d.trades[0].gross = 800;
  d.cashflows = [
    {
      id: "CF_TEST",
      acc: "ACC01",
      time: "2026-11-23T18:00",
      type: "Rút Botcamp",
      amount: 200,
      note: "",
    },
  ];
  const e = effectiveStep(d, d.accounts[0]);
  assert.equal(e.perf.dd, 0);
  assert.equal(e.rm.done, 8);
  assert.equal(accountSnapshot(d, d.accounts[0], enrichTrades(d)).balance, 800);
  d.trades.push({
    ...d.trades[0],
    id: "T_LOSS",
    open: "2026-11-24T10:00",
    close: "2026-11-24T11:00",
    gross: -110,
  });
  const after = effectiveStep(d, d.accounts[0]);
  assert.equal(after.rm.done, 8);
  assert.equal(after.descaled, true);
  assert.equal(after.step.no, 8);
});
test("cashflow during the trading day does not change daily loss denominator", () => {
  const d = sampleData();
  d.trades = [{ ...d.trades[0], gross: -20 }];
  d.cashflows = [
    {
      id: "CF_DAY",
      acc: "ACC01",
      time: "2026-11-23T16:00",
      type: "Nạp",
      amount: 100,
      note: "",
    },
  ];
  const t = enrichTrades(d)[0];
  assert.equal(t.dayPct, -0.1);
  assert.equal(t.breaker, true);
  assert.equal(t.balBefore, 200);
  assert.equal(t.balAfter, 280);
});
test("risk at opening excludes later closes and a simultaneous self-close", () => {
  const d = sampleData();
  d.trades = [
    {
      ...d.trades[0],
      open: "2026-11-23T10:00",
      close: "2026-11-23T10:00",
      gross: 500,
    },
  ];
  const t = enrichTrades(d)[0];
  assert.equal(t.riskBase, 200);
  assert.equal(t.balBefore, 200);
  assert.equal(t.step, 1);
});
test("VN day cut and New York DST use correct boundary instants", () => {
  const d = sampleData();
  assert.equal(tradingDay(d, "XAUUSD", "2026-11-24T04:59"), "2026-11-23");
  assert.equal(tradingDay(d, "XAUUSD", "2026-11-24T05:00"), "2026-11-24");
  assert.equal(tradingDay(d, "STOCK_VN", "2026-11-24T00:00"), "2026-11-24");
  assert.equal(newYork("2026-03-08T13:59"), "01:59");
  assert.equal(newYork("2026-03-08T14:00"), "03:00");
  assert.equal(newYork("2026-11-01T12:59"), "01:59");
  assert.equal(newYork("2026-11-01T13:00"), "01:00");
});
test("validation rejects duplicated IDs, invalid lots and malformed dates", () => {
  const d = sampleData();
  validateData(d);
  d.trades.push({ ...d.trades[0] });
  assert.throws(() => validateData(d), /Trùng/);
  d.trades.pop();
  d.trades[0].vol = 0.015;
  assert.throws(() => validateData(d), /khối lượng/);
  d.trades[0].vol = 0.01;
  d.trades[0].open = "2026-02-31T10:00";
  assert.throws(() => validateData(d));
});
test("a contract from another market cannot be used to size a trade", () => {
  const d = sampleData();
  d.trades[0].sym = "EURUSD";
  assert.throws(() => validateData(d), /thiếu thông số/);
});
