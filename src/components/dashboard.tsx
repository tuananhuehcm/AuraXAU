"use client";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  BookOpen,
  CalendarDays,
  Route,
  ChartNoAxesCombined,
  Settings,
  Sun,
  Moon,
  Download,
  Upload,
  Printer,
  Plus,
  LogOut,
  Cloud,
  FlaskConical,
  Menu,
  X,
} from "lucide-react";
import type {
  Account,
  AppData,
  Language,
  Trade,
  EnrichedTrade,
} from "@/lib/types";
import { messages } from "@/lib/messages";
import { sampleData, emptyData } from "@/lib/data";
import { validateData } from "@/lib/validation";
import {
  accountSnapshot,
  balanceAt,
  currencyFactor,
  dayStart,
  effectiveStep,
  enrichTrades,
  generateRoadmap,
  instrument,
  netPnl,
  newYork,
  positionSize,
  tradingDay,
  vnNow,
} from "@/lib/engine";
import {
  Panel,
  Metric,
  Field,
  Empty,
  Num,
  money,
  number,
  percent,
  shortDate,
  tone,
} from "./ui";
import SettingsPanel from "./settings";
type Tab =
  "cockpit" | "journal" | "calendar" | "roadmap" | "stats" | "settings";
export type Commit = (next: AppData) => Promise<boolean>;
const copy = (d: AppData) => structuredClone(d);
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Không thể xử lý yêu cầu.";
export default function Dashboard({
  mode,
  email,
}: {
  mode: "demo" | "cloud";
  email?: string;
}) {
  const [data, setData] = useState<AppData | null>(null),
    [loadingError, setLoadingError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const revision = useRef(0),
    lock = useRef(false);
  const load = useCallback(async () => {
    try {
      setLoadingError("");
      if (mode === "demo") {
        const saved = localStorage.getItem("auragold.demo.v1");
        let d = sampleData();
        if (saved) {
          try {
            d = validateData(JSON.parse(saved));
          } catch {
            localStorage.removeItem("auragold.demo.v1");
          }
        }
        setData(d);
      } else {
        const r = await fetch("/api/workspace", { cache: "no-store" });
        const body = await r.json();
        if (!r.ok) throw new Error(body.error);
        revision.current = body.revision;
        setData(body.data);
      }
    } catch (e) {
      setLoadingError(errorText(e));
    }
  }, [mode]);
  useEffect(() => {
    void load();
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, [load]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 7000);
    return () => clearTimeout(id);
  }, [notice]);
  const commit: Commit = async (next) => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    try {
      const d = validateData(next);
      if (mode === "cloud") {
        const r = await fetch("/api/workspace", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: d, revision: revision.current }),
        });
        const body = await r.json();
        if (!r.ok)
          throw new Error(
            r.status === 409
              ? "Dữ liệu đã thay đổi ở cửa sổ khác. Tải lại trước khi sửa tiếp."
              : body.error,
          );
        revision.current = body.revision;
      } else localStorage.setItem("auragold.demo.v1", JSON.stringify(d));
      setData(d);
      setNotice(
        d.general.lang === "vi"
          ? "Đã lưu thay đổi"
          : d.general.lang === "en"
            ? "Changes saved"
            : "已保存更改",
      );
      return true;
    } catch (e) {
      setNotice(errorText(e));
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  if (!data)
    return (
      <main className="loading-screen">
        <span className="logo">A</span>
        {loadingError ? (
          <>
            <h1>Chưa tải được dữ liệu</h1>
            <p>{loadingError}</p>
            <button onClick={load}>Tải lại</button>
            <a href="/setup">Hướng dẫn cấu hình</a>
          </>
        ) : (
          <p>Đang tải AuraGold…</p>
        )}
      </main>
    );
  return (
    <NextIntlClientProvider
      locale={data.general.lang}
      messages={messages[data.general.lang]}
    >
      <DashboardApp
        data={data}
        commit={commit}
        busy={busy}
        notice={notice}
        notify={setNotice}
        mode={mode}
        email={email}
        revision={revision.current}
        reload={load}
      />
    </NextIntlClientProvider>
  );
}
function DashboardApp({
  data,
  commit,
  busy,
  notice,
  notify,
  mode,
  email,
  revision,
  reload,
}: {
  data: AppData;
  commit: Commit;
  busy: boolean;
  notice: string;
  notify: (s: string) => void;
  mode: "demo" | "cloud";
  email?: string;
  revision: number;
  reload: () => Promise<void>;
}) {
  const t = useTranslations(),
    [tab, setTab] = useState<Tab>("cockpit"),
    [acc, setAcc] = useState(data.accounts[0]?.id ?? ""),
    [navOpen, setNavOpen] = useState(false),
    [clock, setClock] = useState(vnNow()),
    [trade, setTrade] = useState<Trade | null | undefined>(),
    [sub, setSub] = useState<"trades" | "cash">("trades"),
    [ioBusy, setIoBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const accounts = data.accounts.filter((a) => !a.deleted),
    account = accounts.find((a) => a.id === acc) ?? accounts[0];
  const trades = useMemo(() => enrichTrades(data), [data]);
  useEffect(() => {
    document.documentElement.dataset.theme = data.general.theme;
    document.documentElement.lang = data.general.lang;
  }, [data.general.theme, data.general.lang]);
  useEffect(() => {
    const timer = setInterval(() => setClock(vnNow()), 30000);
    return () => clearInterval(timer);
  }, []);
  const navigate = (v: Tab) => {
    setTab(v);
    setNavOpen(false);
  };
  const modifyGeneral = (k: "theme" | "lang", value: string) => {
    const d = copy(data);
    if (k === "theme") d.general.theme = value as "light" | "dark";
    else d.general.lang = value as Language;
    void commit(d);
  };
  const exportExcel = async () => {
    setIoBusy(true);
    try {
      const r = await fetch("/api/excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "export",
          ...(mode === "demo" ? { data } : {}),
          accountId: account?.id,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      const url = URL.createObjectURL(await r.blob()),
        a = document.createElement("a");
      a.href = url;
      a.download = `AuraGold_${clock.slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      notify(errorText(e));
    } finally {
      setIoBusy(false);
    }
  };
  const importExcel = async (file: File) => {
    setIoBusy(true);
    try {
      if (file.size > 8e6) throw new Error("File tối đa 8 MB.");
      const form = new FormData();
      form.set("file", file);
      if (mode === "demo") form.set("data", JSON.stringify(data));
      const r = await fetch("/api/excel/import", {
        method: "POST",
        body: form,
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      const ok = await commit(body.data);
      if (ok) notify(body.summary);
    } catch (e) {
      notify(errorText(e));
    } finally {
      setIoBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };
  const nav = [
    { id: "cockpit", icon: LayoutDashboard },
    { id: "journal", icon: BookOpen },
    { id: "calendar", icon: CalendarDays },
    { id: "roadmap", icon: Route },
    { id: "stats", icon: ChartNoAxesCombined },
    { id: "settings", icon: Settings },
  ] as const;
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href={mode === "demo" ? "/demo" : "/"}>
          <span className="logo">A</span>
          <span>
            AuraGold <b>100K</b>
          </span>
        </a>
        <div className="topbar-account">
          <span>{t("account")}</span>
          <select
            aria-label={t("account")}
            value={account?.id ?? ""}
            onChange={(e) => setAcc(e.target.value)}
          >
            {accounts.length ? (
              accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.id} · {a.name}
                </option>
              ))
            ) : (
              <option value="">—</option>
            )}
          </select>
        </div>
        <nav className={navOpen ? "nav open" : "nav"} aria-label="Main">
          {nav.map(({ id, icon: Icon }) => (
            <button
              key={id}
              className={tab === id ? "nav-item active" : "nav-item"}
              onClick={() => navigate(id)}
            >
              <Icon size={17} />
              <span>{t(id)}</span>
            </button>
          ))}
        </nav>
        <div className="topbar-tools">
          <button
            className="icon-button"
            aria-label="Theme"
            onClick={() =>
              modifyGeneral(
                "theme",
                data.general.theme === "light" ? "dark" : "light",
              )
            }
          >
            {data.general.theme === "light" ? (
              <Moon size={18} />
            ) : (
              <Sun size={18} />
            )}
          </button>
          <select
            aria-label="Language"
            value={data.general.lang}
            onChange={(e) => modifyGeneral("lang", e.target.value)}
          >
            <option value="vi">VI</option>
            <option value="en">EN</option>
            <option value="zh-CN">中文</option>
          </select>
          <button
            className="icon-button mobile-menu"
            aria-label="Menu"
            onClick={() => setNavOpen(!navOpen)}
          >
            {navOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
          {mode === "cloud" && (
            <button
              className="icon-button"
              title={t("logout")}
              onClick={() => signOut({ callbackUrl: "/" })}
            >
              <LogOut size={18} />
            </button>
          )}
        </div>
      </header>
      <div className={`connection-bar ${mode}`}>
        <span>
          {mode === "demo" ? <FlaskConical size={13} /> : <Cloud size={13} />}
          <b>{mode === "demo" ? t("demo") : t("cloud")}</b>
          <span>{mode === "demo" ? t("demoNote") : email}</span>
        </span>
        <span>
          VN {clock.slice(11, 16)} <i>·</i> NY {newYork(clock)}
          {busy && <b className="saving">{t("saving")}</b>}
        </span>
      </div>
      <main className="workspace">
        <div className="page-heading">
          <div>
            <p className="eyebrow">
              {account
                ? `${account.id} / ${account.market} / ${account.cur}`
                : "AURAGOLD 100K"}
            </p>
            <h1>{t(tab)}</h1>
            <p className="page-subtitle">
              {tab === "cockpit"
                ? "Mỗi lệnh có kế hoạch. Mỗi bậc có kỷ luật."
                : account?.name}
            </p>
          </div>
          <div className="toolbar no-print">
            <button
              className="secondary"
              disabled={ioBusy || busy}
              onClick={exportExcel}
            >
              <Download size={15} />
              {t("export")}
            </button>
            <button
              className="secondary"
              disabled={ioBusy || busy}
              onClick={() => inputRef.current?.click()}
            >
              <Upload size={15} />
              {t("import")}
            </button>
            <button
              className="icon-button outlined"
              aria-label={t("pdf")}
              title={t("pdf")}
              onClick={() => window.print()}
            >
              <Printer size={17} />
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importExcel(file);
              }}
            />
            {account && tab !== "settings" && (
              <button className="primary" onClick={() => setTrade(null)}>
                <Plus size={16} />
                {t("quick")}
              </button>
            )}
          </div>
        </div>
        {tab === "settings" ? (
          <SettingsPanel
            data={data}
            commit={commit}
            busy={busy}
            mode={mode}
            notify={notify}
            revision={revision}
            reload={reload}
          />
        ) : !account ? (
          <Panel>
            <Empty>{t("noAccount")}</Empty>
            <button className="primary" onClick={() => navigate("settings")}>
              {t("addAccount")}
            </button>
          </Panel>
        ) : (
          <>
            {tab === "cockpit" && (
              <Cockpit
                data={data}
                account={account}
                trades={trades}
                onTab={navigate}
                onTrade={() => setTrade(null)}
              />
            )}
            {tab === "journal" && (
              <>
                <div className="segmented">
                  <button
                    className={sub === "trades" ? "active" : ""}
                    onClick={() => setSub("trades")}
                  >
                    {t("journal")}
                  </button>
                  <button
                    className={sub === "cash" ? "active" : ""}
                    onClick={() => setSub("cash")}
                  >
                    {t("cashflow")}
                  </button>
                </div>
                {sub === "trades" ? (
                  <Journal
                    data={data}
                    trades={trades}
                    commit={commit}
                    onEdit={setTrade}
                  />
                ) : (
                  <Cashflows data={data} account={account} commit={commit} />
                )}
              </>
            )}
            {tab === "calendar" && (
              <Calendar
                data={data}
                account={account}
                trades={trades}
                commit={commit}
              />
            )}
            {tab === "roadmap" && (
              <RoadmapView data={data} account={account} trades={trades} />
            )}
            {tab === "stats" && (
              <Statistics data={data} account={account} trades={trades} />
            )}
          </>
        )}
        <footer className="app-footer">
          <span>
            AuraGold 100K <i>·</i> Personal trading journal
          </span>
          <span>
            {busy ? t("saving") : t("saved")}{" "}
            {mode === "demo" ? "· demo" : "· cloud"}
          </span>
        </footer>
      </main>
      {notice && (
        <div role="status" className="toast">
          {notice}
          <button onClick={() => notify("")} aria-label="Close">
            <X size={16} />
          </button>
        </div>
      )}
      {trade !== undefined && account && (
        <TradeDialog
          data={data}
          account={account}
          existing={trade}
          commit={commit}
          onClose={() => setTrade(undefined)}
        />
      )}
    </div>
  );
}
function Cockpit({
  data,
  account: a,
  trades,
  onTab,
  onTrade,
}: {
  data: AppData;
  account: Account;
  trades: EnrichedTrade[];
  onTab: (t: Tab) => void;
  onTrade: () => void;
}) {
  const t = useTranslations(),
    s = accountSnapshot(data, a, trades),
    { rm, step: r, descaled } = effectiveStep(data, a);
  const today = tradingDay(data, a.market, vnNow()),
    daily = trades
      .filter((t) => t.acc === a.id && t.day === today)
      .reduce((s, t) => s + t.net, 0),
    sod = balanceAt(data, a, dayStart(data, a, today)),
    dailyPct = sod > 0 ? daily / sod : 0;
  const due = Math.max(
      0,
      rm.rows
        .filter((r) => r.status === "Hoàn thành")
        .reduce((s, r) => s + r.wd, 0) - s.bcWithdrawn,
    ),
    nextBc = rm.rows.slice(rm.curIdx).find((r) => r.type.startsWith("Botcamp")),
    current = rm.rows[rm.curIdx];
  const previousTarget = rm.curIdx ? rm.rows[rm.curIdx - 1].cumTarget : 0,
    progress = current
      ? Math.max(
          0,
          Math.min(
            1,
            (s.cum - previousTarget) / (current.cumTarget - previousTarget),
          ),
        )
      : 0;
  return (
    <>
      <div className="alerts">
        <div className={`alert ${s.dd >= a.descale ? "danger" : ""}`}>
          <span className="status-dot" />
          <div>
            <span>
              {t("drawdown")} · {percent(a.descale, 0)}
            </span>
            <b>
              {s.dd >= a.descale ? `${t("activeStep")} ${r?.no}` : t("normal")}{" "}
              · DD {percent(s.dd)}
            </b>
          </div>
        </div>
        <div className={`alert ${dailyPct <= -a.dayLimit ? "danger" : ""}`}>
          <span className="status-dot" />
          <div>
            <span>
              {t("breaker")} · {percent(a.dayLimit, 0)}
            </span>
            <b>
              {dailyPct <= -a.dayLimit
                ? t("stopToday")
                : money(daily, a.cur, true)}{" "}
              <small>({percent(dailyPct)})</small>
            </b>
          </div>
        </div>
        <div className={`alert ${due > 0 ? "warning" : ""}`}>
          <span className="status-dot" />
          <div>
            <span>{t("withdrawDue")}</span>
            <b>{due > 0 ? money(due, a.cur) : t("noWithdrawal")}</b>
          </div>
        </div>
      </div>
      <div className="metrics four">
        <Metric
          label={t("balance")}
          value={money(s.balance, a.cur)}
          detail={
            <>
              <span className={tone(s.cum)}>
                {money(s.cum, a.cur, true)} · {percent(s.growth)}
              </span>
              {a.cur === "VND" && <span> ≈ {money(s.usdBalance)}</span>}
            </>
          }
        />
        <Metric
          label={t("step")}
          value={
            <>
              {Math.min(rm.done + 1, rm.rows.length)}{" "}
              <small>/ {rm.rows.length}</small>
            </>
          }
          detail={r ? `${r.phaseName} · ${percent(r.pct, 0)} / bậc` : "—"}
        />
        <Metric
          label={t("next")}
          value={money(current?.end, a.cur)}
          accent
          detail={
            <>
              <span>
                {t("remaining")}:{" "}
                {money(Math.max(0, (current?.cumTarget ?? 0) - s.cum), a.cur)}
              </span>
              <div className="progress-track">
                <div style={{ width: `${progress * 100}%` }} />
              </div>
            </>
          }
        />
        <Metric
          label={t("risk")}
          value={r ? `${money(r.rmin, a.cur)} – ${money(r.rmax, a.cur)}` : "—"}
          detail={
            r ? (
              <>
                {percent(r.rminPct)} – {percent(r.rmaxPct)} · {t("stepStart")}{" "}
                {money(r.start, a.cur)}
                {descaled && (
                  <span className="negative">
                    {" "}
                    · {t("activeStep")} {r.no}
                  </span>
                )}
              </>
            ) : (
              "—"
            )
          }
        />
      </div>
      <Panel
        title={t("upcoming")}
        action={
          <button className="text-button" onClick={() => onTab("roadmap")}>
            {rm.rows.length} bậc · {money(rm.totalWd, a.cur)}
          </button>
        }
      >
        <div className="milestone-strip">
          {rm.rows.slice(rm.curIdx, rm.curIdx + 8).map((r, i) => (
            <div
              key={r.no}
              className={`milestone-chip ${i === 0 ? "current" : ""} ${r.type ? "botcamp" : ""}`}
            >
              <span>
                Bậc {r.no}
                {r.type ? ` · ${r.type}` : ""}
              </span>
              <b>{money(r.end, a.cur)}</b>
              {r.wd > 0 && (
                <small>
                  {t("withdrawal")} {money(r.wd, a.cur)}
                </small>
              )}
            </div>
          ))}
        </div>
      </Panel>
      <div className="two-columns">
        <Calculator data={data} account={a} />
        <Panel title={t("quick")}>
          <div className="quick-illustration">
            <BookOpen size={32} />
            <h3>{t("tradeForm")}</h3>
            <p className="muted">
              {t("riskBase")}: {money(r?.start, a.cur)} · {t("activeStep")}{" "}
              {r?.no}
            </p>
            <button className="primary" onClick={onTrade}>
              <Plus size={16} />
              {t("quick")}
            </button>
          </div>
          <div className="quick-summary">
            <span>
              {t("trades")}
              <b>{s.n}</b>
            </span>
            <span>
              {t("winrate")}
              <b>{percent(s.winrate)}</b>
            </span>
            <span>
              Profit Factor<b>{number(s.pf)}</b>
            </span>
          </div>
        </Panel>
      </div>
      <Panel title={t("overview")}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {[
                  "account",
                  "market",
                  "balance",
                  "profit",
                  "growth",
                  "trades",
                  "winrate",
                  "step",
                ].map((k) => (
                  <th key={k}>{t(k)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.accounts.map((a) => {
                const sn = accountSnapshot(data, a, trades),
                  p = effectiveStep(data, a);
                return (
                  <tr key={a.id}>
                    <td>
                      <b>{a.name}</b>
                      <small>
                        {a.id} · {a.cur}
                      </small>
                    </td>
                    <td>
                      <span className="badge">{a.market}</span>
                    </td>
                    <td className="numeric">{money(sn.usdBalance)}</td>
                    <td className={`numeric ${tone(sn.usdPnl)}`}>
                      {money(sn.usdPnl, "USD", true)}
                    </td>
                    <td className="numeric">{percent(sn.growth)}</td>
                    <td className="numeric">{sn.n}</td>
                    <td className="numeric">{percent(sn.winrate)}</td>
                    <td>
                      {Math.min(p.rm.done + 1, p.rm.rows.length)} /{" "}
                      {p.rm.rows.length}
                    </td>
                  </tr>
                );
              })}
              <tr className="total-row">
                <td colSpan={2}>{t("total")} (USD)</td>
                <td className="numeric">
                  {money(
                    data.accounts.reduce(
                      (s, a) => s + accountSnapshot(data, a, trades).usdBalance,
                      0,
                    ),
                  )}
                </td>
                <td className="numeric">
                  {money(
                    data.accounts.reduce(
                      (s, a) => s + accountSnapshot(data, a, trades).usdPnl,
                      0,
                    ),
                    "USD",
                    true,
                  )}
                </td>
                <td colSpan={4} />
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
function Calculator({ data, account: a }: { data: AppData; account: Account }) {
  const t = useTranslations(),
    [pct, setPct] = useState(a.risk * 100),
    [sl, setSl] = useState(a.market === "STOCK_VN" ? 5000 : 6),
    [sym, setSym] = useState(a.symbol);
  useEffect(() => {
    setPct(a.risk * 100);
    setSl(a.market === "STOCK_VN" ? 5000 : 6);
    setSym(a.symbol);
  }, [a.id, a.risk, a.market, a.symbol]);
  let calc: ReturnType<typeof positionSize> | null = null;
  try {
    calc = positionSize(data, a, sym, pct / 100, sl);
  } catch {}
  return (
    <Panel title={t("calculator")}>
      <div className="form-grid three">
        <Field label={t("symbol")}>
          <select value={sym} onChange={(e) => setSym(e.target.value)}>
            {data.instruments
              .filter((i) => i.market === a.market)
              .map((i) => (
                <option key={i.sym}>{i.sym}</option>
              ))}
          </select>
        </Field>
        <Field label="% Risk">
          <input
            type="number"
            step="0.1"
            min="0.01"
            max="100"
            value={pct}
            onChange={(e) => setPct(+e.target.value)}
          />
        </Field>
        <Field label={`SL (${a.market === "STOCK_VN" ? "₫/cp" : "giá"})`}>
          <input
            type="number"
            step="any"
            min="0"
            value={sl}
            onChange={(e) => setSl(+e.target.value)}
          />
        </Field>
      </div>
      {calc && (
        <>
          <div className="risk-base">
            <span>{t("riskBase")}</span>
            <b>
              {money(calc.base, a.cur)} · {t("step")} {calc.step}
            </b>
          </div>
          <div className="calculator-results">
            <div>
              <span>{t("volume")}</span>
              <strong>
                {number(calc.size, a.market === "STOCK_VN" ? 0 : 2)}{" "}
                <small>{a.market === "STOCK_VN" ? "cp" : "lot"}</small>
              </strong>
            </div>
            <div>
              <span>{t("realRisk")}</span>
              <strong>{money(calc.real, a.cur)}</strong>
            </div>
            <div>
              <span>{t("realPercent")}</span>
              <strong>{percent(calc.percent)}</strong>
            </div>
          </div>
          <p
            className={`inline-message ${calc.over ? "danger" : calc.belowMinimum ? "warning" : "success"}`}
          >
            {calc.over
              ? t("overRisk")
              : calc.belowMinimum
                ? t("minVolume")
                : t("validRisk")}
          </p>
        </>
      )}
    </Panel>
  );
}
function TradeDialog({
  data,
  account,
  existing,
  commit,
  onClose,
}: {
  data: AppData;
  account: Account;
  existing: Trade | null;
  commit: Commit;
  onClose: () => void;
}) {
  const t = useTranslations(),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    a = data.accounts.find((a) => a.id === existing?.acc) ?? account;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget),
      s = (k: string) => String(fd.get(k) ?? ""),
      n = (k: string) => (s(k) === "" ? null : Number(s(k)));
    try {
      setSaving(true);
      const inst = instrument(data, s("sym"), a.market);
      if (!inst) throw new Error("Chưa có thông số hợp đồng.");
      const side = s("side") as "Buy" | "Sell",
        gross =
          n("gross") ??
          (n("exit")! - n("entry")!) *
            (side === "Buy" ? 1 : -1) *
            n("vol")! *
            inst.valuePerPrice;
      const row: Trade = {
        id: existing?.id ?? `T_${crypto.randomUUID()}`,
        acc: a.id,
        sym: s("sym").toUpperCase(),
        open: s("open"),
        close: s("close"),
        side,
        vol: n("vol")!,
        entry: n("entry")!,
        sl: n("sl"),
        tp: n("tp"),
        exit: n("exit")!,
        gross,
        fee: n("fee") ?? 0,
        swap: n("swap") ?? 0,
        tax: n("tax") ?? 0,
        setup: s("setup"),
        disc: n("disc"),
        emo: s("emo"),
        note: s("note"),
      };
      const d = copy(data);
      if (existing)
        d.trades = d.trades.map((t) => (t.id === existing.id ? row : t));
      else d.trades.push(row);
      if (await commit(d)) onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trade-title"
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">
              {a.id} · {a.name}
            </p>
            <h2 id="trade-title">{existing ? t("edit") : t("quick")}</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={t("cancel")}
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid three">
            <Field label={t("symbol")}>
              <input
                name="sym"
                defaultValue={
                  existing?.sym ?? (a.market === "STOCK_VN" ? "" : a.symbol)
                }
                required
                autoFocus
              />
            </Field>
            <Field label={t("side")}>
              <select name="side" defaultValue={existing?.side ?? "Buy"}>
                <option>Buy</option>
                {a.market !== "STOCK_VN" && <option>Sell</option>}
              </select>
            </Field>
            <Field label={t("volume")}>
              <Num
                name="vol"
                value={existing?.vol ?? (a.market === "STOCK_VN" ? 100 : 0.01)}
                required
                min={0}
              />
            </Field>
            <Field label={`${t("open")} (VN)`}>
              <input
                name="open"
                type="datetime-local"
                defaultValue={existing?.open ?? vnNow()}
                required
              />
            </Field>
            <Field label={`${t("close")} (VN)`}>
              <input
                name="close"
                type="datetime-local"
                defaultValue={existing?.close ?? vnNow()}
                required
              />
            </Field>
            <Field label={t("entry")}>
              <Num name="entry" value={existing?.entry} required min={0} />
            </Field>
            <Field label={t("stop")}>
              <Num name="sl" value={existing?.sl ?? ""} min={0} />
            </Field>
            <Field label={t("target")}>
              <Num name="tp" value={existing?.tp ?? ""} min={0} />
            </Field>
            <Field label={t("exit")}>
              <Num name="exit" value={existing?.exit} required min={0} />
            </Field>
            <Field label={`${t("gross")} (${t("optional")})`}>
              <Num name="gross" value={existing?.gross ?? ""} />
            </Field>
            <Field label={t("fee")}>
              <Num name="fee" value={existing?.fee ?? 0} min={0} />
            </Field>
            <Field label={t("swap")}>
              <Num name="swap" value={existing?.swap ?? 0} />
            </Field>
            <Field label={t("tax")}>
              <Num name="tax" value={existing?.tax ?? 0} min={0} />
            </Field>
            <Field label={t("setup")}>
              <select
                name="setup"
                defaultValue={existing?.setup ?? data.setups[0]}
              >
                <option value="">—</option>
                {data.setups.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label={`${t("discipline")} (1–5)`}>
              <Num
                name="disc"
                value={existing?.disc ?? 5}
                min={1}
                max={5}
                step="1"
              />
            </Field>
          </div>
          <div className="form-grid">
            <Field label={t("emotion")}>
              <input name="emo" defaultValue={existing?.emo ?? ""} />
            </Field>
            <Field label={t("note")}>
              <textarea
                name="note"
                defaultValue={existing?.note ?? ""}
                rows={3}
              />
            </Field>
          </div>
          {error && <p className="inline-message danger">{error}</p>}
          <div className="modal-footer">
            <button type="button" className="secondary" onClick={onClose}>
              {t("cancel")}
            </button>
            <button className="primary" disabled={saving} type="submit">
              {saving ? t("saving") : t("save")}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
function Journal({
  data,
  trades,
  commit,
  onEdit,
}: {
  data: AppData;
  trades: EnrichedTrade[];
  commit: Commit;
  onEdit: (t: Trade) => void;
}) {
  const t = useTranslations(),
    [filter, setFilter] = useState({
      acc: "",
      from: "",
      to: "",
      sym: "",
      sess: "",
      side: "",
      setup: "",
      result: "",
      disc: "",
      warn: "",
      sl: "",
    }),
    [showDeleted, setShowDeleted] = useState(false);
  const rows = trades
    .filter(
      (x) =>
        (!filter.acc || x.acc === filter.acc) &&
        (!filter.from || x.day >= filter.from) &&
        (!filter.to || x.day <= filter.to) &&
        (!filter.sym ||
          x.sym.toUpperCase().includes(filter.sym.toUpperCase())) &&
        (!filter.sess || x.sess === filter.sess) &&
        (!filter.side || x.side === filter.side) &&
        (!filter.setup || x.setup === filter.setup) &&
        (!filter.result || x.result === filter.result) &&
        (!filter.disc || (x.disc ?? 0) >= +filter.disc) &&
        (!filter.warn || x.over || x.descale || x.breaker) &&
        (!filter.sl ||
          (x.slDist != null &&
            x.slDist >= +filter.sl.split(":")[0] &&
            x.slDist < +filter.sl.split(":")[1])),
    )
    .sort((a, b) => b.close.localeCompare(a.close));
  const field = (key: keyof typeof filter, label: string, opts?: string[]) => (
    <Field label={label}>
      {opts ? (
        <select
          value={filter[key]}
          onChange={(e) => setFilter({ ...filter, [key]: e.target.value })}
        >
          <option value="">{t("all")}</option>
          {opts.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input
          type={key === "from" || key === "to" ? "date" : "text"}
          value={filter[key]}
          onChange={(e) => setFilter({ ...filter, [key]: e.target.value })}
        />
      )}
    </Field>
  );
  const remove = async (id: string, deleted: boolean) => {
    const d = copy(data);
    d.trades = d.trades.map((t) => (t.id === id ? { ...t, deleted } : t));
    await commit(d);
  };
  return (
    <>
      <Panel>
        <div className="filters">
          {field(
            "acc",
            t("account"),
            data.accounts.map((a) => a.id),
          )}
          {field("from", t("from"))}
          {field("to", t("to"))}
          {field("sym", t("symbol"))}
          {field(
            "sess",
            t("session"),
            Array.from(
              new Set([...data.sessFX, ...data.sessStock].map((s) => s.n)),
            ),
          )}
          {field("side", t("side"), ["Buy", "Sell"])}
          {field("setup", t("setup"), data.setups)}
          {field("result", t("result"), ["Win", "Loss", "BE"])}
          {field("disc", t("discipline"), ["3", "4", "5"])}
          <Field label="SL">
            <select
              value={filter.sl}
              onChange={(e) => setFilter({ ...filter, sl: e.target.value })}
            >
              <option value="">{t("all")}</option>
              {[
                [0, 5],
                [5, 6],
                [6, 8],
                [8, 10],
                [10, 1e12],
              ].map(([a, b]) => (
                <option key={a} value={`${a}:${b}`}>
                  {a} – {b === 1e12 ? "∞" : b}
                </option>
              ))}
            </select>
          </Field>
          <label className="check">
            <input
              type="checkbox"
              checked={!!filter.warn}
              onChange={(e) =>
                setFilter({ ...filter, warn: e.target.checked ? "1" : "" })
              }
            />
            {t("warnings")}
          </label>
        </div>
      </Panel>
      <div className="summary-line">
        <span>
          <b>{rows.length}</b> {t("trades")}
        </span>
        <span>
          {t("winrate")}{" "}
          <b>
            {percent(
              rows.length
                ? rows.filter((t) => t.net > 0).length / rows.length
                : null,
            )}
          </b>
        </span>
        <span>
          {t("net")}{" "}
          <b className={tone(rows.reduce((s, t) => s + t.usd, 0))}>
            {money(
              rows.reduce((s, t) => s + t.usd, 0),
              "USD",
              true,
            )}
          </b>
        </span>
        <button
          className="text-button"
          onClick={() => setShowDeleted(!showDeleted)}
        >
          {t("deleted")} ({data.trades.filter((t) => t.deleted).length})
        </button>
      </div>
      <Panel>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {[
                  "account",
                  "symbol",
                  "open",
                  "session",
                  "side",
                  "volume",
                  "net",
                  "step",
                  "risk",
                  "averageR",
                  "setup",
                  "discipline",
                ].map((k) => (
                  <th key={k}>{t(k)}</th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {(showDeleted ? data.trades.filter((t) => t.deleted) : rows).map(
                (x) => {
                  const row = x as EnrichedTrade,
                    a = data.accounts.find((a) => a.id === x.acc)!;
                  return (
                    <tr key={x.id}>
                      <td>{x.acc}</td>
                      <td>
                        <b>{x.sym}</b>
                        <small>{x.id.slice(0, 14)}</small>
                      </td>
                      <td>
                        {shortDate(x.open)} {x.open.slice(11, 16)}
                        <small>
                          {a.market !== "STOCK_VN"
                            ? `${newYork(x.open)} NY`
                            : "VN"}
                        </small>
                      </td>
                      <td>{row.sess}</td>
                      <td>
                        <span
                          className={`badge ${x.side === "Buy" ? "green" : "red"}`}
                        >
                          {x.side}
                        </span>
                      </td>
                      <td className="numeric">
                        {number(x.vol, a.market === "STOCK_VN" ? 0 : 2)}
                      </td>
                      <td className={`numeric ${tone(netPnl(x))}`}>
                        <b>{money(netPnl(x), a.cur, true)}</b>
                        {a.cur === "VND" && <small>{money(row.usd)}</small>}
                      </td>
                      <td>{row.step}</td>
                      <td className={row.over ? "negative" : ""}>
                        {percent(row.riskPct)}
                        <small>
                          {row.over
                            ? t("overRisk")
                            : row.descale
                              ? t("drawdown")
                              : row.breaker
                                ? t("breaker")
                                : ""}
                        </small>
                      </td>
                      <td className="numeric">{number(row.R)}</td>
                      <td>{x.setup}</td>
                      <td>{x.disc ?? "—"}/5</td>
                      <td>
                        <div className="row-actions">
                          {showDeleted ? (
                            <button
                              className="text-button"
                              onClick={() => remove(x.id, false)}
                            >
                              {t("restore")}
                            </button>
                          ) : (
                            <>
                              <button
                                className="text-button"
                                onClick={() => onEdit(x)}
                              >
                                {t("edit")}
                              </button>
                              <button
                                className="text-button negative"
                                onClick={() => remove(x.id, true)}
                              >
                                {t("remove")}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                },
              )}
            </tbody>
          </table>
          {!rows.length && !showDeleted && <Empty>{t("noTrades")}</Empty>}
        </div>
      </Panel>
    </>
  );
}
function Cashflows({
  data,
  account,
  commit,
}: {
  data: AppData;
  account: Account;
  commit: Commit;
}) {
  const t = useTranslations(),
    [editing, setEditing] = useState<string | null>(null),
    row = data.cashflows.find((c) => c.id === editing),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget),
      d = copy(data),
      c = {
        id: row?.id ?? `CF_${crypto.randomUUID()}`,
        acc: String(fd.get("acc")),
        time: String(fd.get("time")),
        type: String(fd.get("type")) as "Nạp" | "Rút" | "Rút Botcamp",
        amount: Number(fd.get("amount")),
        note: String(fd.get("note")),
      };
    if (row) d.cashflows = d.cashflows.map((x) => (x.id === row.id ? c : x));
    else d.cashflows.push(c);
    if (await commit(d)) setEditing(null);
    setBusy(false);
  }
  return (
    <>
      <Panel title={t("cashflow")}>
        <form key={row?.id ?? "new"} onSubmit={submit}>
          <div className="filters">
            <Field label={t("account")}>
              <select name="acc" defaultValue={row?.acc ?? account.id}>
                {data.accounts.map((a) => (
                  <option key={a.id}>{a.id}</option>
                ))}
              </select>
            </Field>
            <Field label={`${t("time")} (VN)`}>
              <input
                type="datetime-local"
                name="time"
                defaultValue={row?.time ?? vnNow()}
                required
              />
            </Field>
            <Field label={t("type")}>
              <select name="type" defaultValue={row?.type ?? "Nạp"}>
                {["Nạp", "Rút", "Rút Botcamp"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <Field label={t("amount")}>
              <Num name="amount" value={row?.amount} min={0} required />
            </Field>
            <Field label={t("note")}>
              <input name="note" defaultValue={row?.note} />
            </Field>
            <button className="primary" type="submit" disabled={busy}>
              {t("save")}
            </button>
            {row && (
              <button
                type="button"
                className="secondary"
                onClick={() => setEditing(null)}
              >
                {t("cancel")}
              </button>
            )}
          </div>
        </form>
      </Panel>
      <Panel>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {["account", "time", "type", "amount", "note"].map((k) => (
                  <th key={k}>{t(k)}</th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {data.cashflows
                .filter((c) => !c.deleted)
                .slice()
                .sort((a, b) => b.time.localeCompare(a.time))
                .map((c) => (
                  <tr key={c.id}>
                    <td>{c.acc}</td>
                    <td>
                      {shortDate(c.time)} {c.time.slice(11, 16)}
                    </td>
                    <td>{c.type}</td>
                    <td
                      className={`numeric ${c.type === "Nạp" ? "positive" : "negative"}`}
                    >
                      {money(
                        c.amount,
                        data.accounts.find((a) => a.id === c.acc)?.cur,
                      )}
                    </td>
                    <td>{c.note}</td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => setEditing(c.id)}
                      >
                        {t("edit")}
                      </button>
                      <button
                        className="text-button negative"
                        onClick={() => {
                          const d = copy(data);
                          d.cashflows = d.cashflows.map((x) =>
                            x.id === c.id ? { ...x, deleted: true } : x,
                          );
                          void commit(d);
                        }}
                      >
                        {t("remove")}
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!data.cashflows.some((c) => !c.deleted) && (
            <Empty>{t("noCashflow")}</Empty>
          )}
        </div>
        {data.cashflows
          .filter((c) => c.deleted)
          .map((c) => (
            <p key={c.id} className="muted">
              {t("deleted")} · {c.id}{" "}
              <button
                className="text-button"
                onClick={() => {
                  const d = copy(data);
                  d.cashflows = d.cashflows.map((x) =>
                    x.id === c.id ? { ...x, deleted: false } : x,
                  );
                  void commit(d);
                }}
              >
                {t("restore")}
              </button>
            </p>
          ))}
      </Panel>
    </>
  );
}
function Calendar({
  data,
  account: a,
  trades,
  commit,
}: {
  data: AppData;
  account: Account;
  trades: EnrichedTrade[];
  commit: Commit;
}) {
  const t = useTranslations(),
    [month, setMonth] = useState(vnNow().slice(0, 7)),
    [view, setView] = useState("month"),
    [selected, setSelected] = useState(vnNow().slice(0, 10)),
    [note, setNote] = useState(""),
    [noteBusy, setNoteBusy] = useState(false);
  const key = `${a.id}|${selected}`;
  useEffect(() => setNote(data.dayNotes[key] ?? ""), [key, data.dayNotes]);
  const mine = trades.filter((x) => x.acc === a.id),
    byDay = new Map<string, EnrichedTrade[]>();
  mine.forEach((x) => byDay.set(x.day, [...(byDay.get(x.day) ?? []), x]));
  const summary = (day: string) => {
    const rows = byDay.get(day) ?? [],
      net = rows.reduce((s, x) => s + x.net, 0),
      usd = rows.reduce((s, x) => s + x.usd, 0),
      sod = balanceAt(data, a, dayStart(data, a, day)),
      p = sod > 0 ? net / sod : 0;
    return {
      rows,
      net,
      usd,
      p,
      breaker: rows.some((x) => x.breaker),
      wins: rows.filter((x) => x.net > 0).length,
      losses: rows.filter((x) => x.net < 0).length,
    };
  };
  const monthly = mine.filter((x) => x.day.startsWith(month)),
    mPnl = monthly.reduce((s, x) => s + x.usd, 0),
    days = [...byDay.keys()].filter((k) => k.startsWith(month)),
    selectedSummary = summary(selected),
    maxAbs = Math.max(1, ...days.map((k) => Math.abs(summary(k).usd)));
  const first = new Date(`${month}-01T00:00:00Z`),
    start = first.valueOf() - ((first.getUTCDay() + 6) % 7) * 864e5;
  const selectedMs = Date.parse(selected + "T00:00:00Z"),
    selectedWeek = Math.max(
      0,
      Math.min(5, Math.floor((selectedMs - start) / (7 * 864e5))),
    );
  const weeks = view === "month" ? [0, 1, 2, 3, 4, 5] : [selectedWeek],
    weekday =
      data.general.lang === "vi"
        ? ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "CN"]
        : data.general.lang === "en"
          ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
          : ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const changeMonth = (delta: number) => {
    const d = new Date(first);
    d.setUTCMonth(d.getUTCMonth() + delta);
    setMonth(d.toISOString().slice(0, 7));
    setSelected(d.toISOString().slice(0, 10));
  };
  return (
    <>
      <div className="calendar-toolbar">
        <div className="row">
          <button
            className="icon-button outlined"
            aria-label="Previous month"
            onClick={() => changeMonth(-1)}
          >
            ‹
          </button>
          <input
            aria-label={t("month")}
            className="month-picker"
            type="month"
            value={month}
            onChange={(e) => {
              if (e.target.value) {
                setMonth(e.target.value);
                setSelected(`${e.target.value}-01`);
              }
            }}
          />
          <button
            className="icon-button outlined"
            aria-label="Next month"
            onClick={() => changeMonth(1)}
          >
            ›
          </button>
        </div>
        <div className="segmented">
          <button
            className={view === "month" ? "active" : ""}
            onClick={() => setView("month")}
          >
            {t("month")}
          </button>
          <button
            className={view === "week" ? "active" : ""}
            onClick={() => setView("week")}
          >
            {t("week")}
          </button>
        </div>
      </div>
      <div className="metrics four">
        <Metric
          label={t("totalMonth")}
          value={<span className={tone(mPnl)}>{money(mPnl, "USD", true)}</span>}
        />
        <Metric label={t("trades")} value={monthly.length} />
        <Metric
          label={t("winrate")}
          value={percent(
            monthly.length
              ? monthly.filter((x) => x.net > 0).length / monthly.length
              : null,
          )}
        />
        <Metric
          label={t("dayProfit")}
          value={`${days.filter((k) => summary(k).net > 0).length} / ${days.filter((k) => summary(k).net < 0).length}`}
        />
      </div>
      <p className="muted small">
        {a.id} · USD ·{" "}
        {a.market === "STOCK_VN" ? data.general.cutStock : data.general.cutFX}
        :00 VN
      </p>
      <div className="calendar-layout">
        <Panel className="calendar-panel">
          <div className="calendar-scroll">
            <div className="calendar-grid">
              {[...weekday, t("total")].map((h) => (
                <div className="calendar-head" key={h}>
                  {h}
                </div>
              ))}
              {weeks.map((w) => {
                let total = 0,
                  count = 0;
                return (
                  <div className="calendar-week" key={w}>
                    {Array.from({ length: 7 }, (_, day) => {
                      const iso = new Date(start + (w * 7 + day) * 864e5)
                          .toISOString()
                          .slice(0, 10),
                        s = summary(iso),
                        inMonth = iso.startsWith(month);
                      if (inMonth) {
                        total += s.usd;
                        count += s.rows.length;
                      }
                      const intensity =
                        0.09 + 0.26 * Math.min(1, Math.abs(s.usd) / maxAbs);
                      return (
                        <button
                          key={iso}
                          className={`calendar-cell ${inMonth ? "" : "outside"} ${iso === selected ? "selected" : ""} ${s.breaker ? "breaker" : ""}`}
                          style={
                            inMonth && s.usd
                              ? {
                                  backgroundColor: `color-mix(in srgb, var(--${s.usd > 0 ? "positive" : "negative"}) ${Math.round(intensity * 100)}%, var(--panel))`,
                                }
                              : undefined
                          }
                          onClick={() => setSelected(iso)}
                        >
                          <span>{shortDate(iso)}</span>
                          {inMonth && s.rows.length > 0 && (
                            <>
                              <b className={tone(s.usd)}>
                                {money(s.usd, "USD", true)}
                              </b>
                              <small>
                                {s.rows.length} · {s.wins}W/{s.losses}L
                              </small>
                              <small>
                                {percent(s.p)} {s.breaker ? "⛔" : ""}
                              </small>
                            </>
                          )}
                        </button>
                      );
                    })}
                    <div className="calendar-cell week-total">
                      <span>
                        {t("week")} {w + 1}
                      </span>
                      {count > 0 && (
                        <>
                          <b className={tone(total)}>
                            {money(total, "USD", true)}
                          </b>
                          <small>
                            {count} {t("trades")}
                          </small>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="legend">
            <span className="positive">● {t("dayProfit").split("/")[0]}</span>
            <span className="negative">● {t("dayProfit").split("/")[1]}</span>
            <span>⛔ {t("breaker")}</span>
          </div>
        </Panel>
        <Panel
          title={`${shortDate(selected)}/${selected.slice(0, 4)}`}
          className="day-drawer"
        >
          <div className="day-metrics">
            <div>
              <span>{t("dayPnl")}</span>
              <b className={tone(selectedSummary.net)}>
                {money(selectedSummary.net, a.cur, true)}
              </b>
            </div>
            <div>
              <span>{t("dayPercent")}</span>
              <b>{percent(selectedSummary.p)}</b>
            </div>
          </div>
          <h3>{t("journal")}</h3>
          {selectedSummary.rows.length ? (
            selectedSummary.rows.map((x) => (
              <div className="day-trade" key={x.id}>
                <div>
                  <b>
                    {x.side} {x.sym} ·{" "}
                    {number(x.vol, a.market === "STOCK_VN" ? 0 : 2)}
                  </b>
                  <b className={tone(x.net)}>{money(x.net, a.cur, true)}</b>
                </div>
                <small>
                  {x.open.slice(11, 16)} VN · {x.sess} · R {number(x.R)}
                </small>
                <small>
                  {x.setup} · {x.disc ?? "—"}/5 · {x.emo}
                </small>
                <p>{x.note}</p>
              </div>
            ))
          ) : (
            <p className="muted">{t("noDayTrade")}</p>
          )}
          <Field label={t("dayNotes")}>
            <textarea
              rows={5}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={10000}
            />
          </Field>
          <button
            className="primary wide"
            disabled={noteBusy || note === (data.dayNotes[key] ?? "")}
            onClick={async () => {
              setNoteBusy(true);
              const d = copy(data);
              d.dayNotes[key] = note;
              await commit(d);
              setNoteBusy(false);
            }}
          >
            {noteBusy ? t("saving") : t("saveNote")}
          </button>
        </Panel>
      </div>
    </>
  );
}
function RoadmapView({
  data,
  account: a,
  trades,
}: {
  data: AppData;
  account: Account;
  trades: EnrichedTrade[];
}) {
  const t = useTranslations(),
    { rm } = effectiveStep(data, a),
    withdrawals = data.cashflows.filter(
      (c) => c.acc === a.id && c.type === "Rút Botcamp" && !c.deleted,
    );
  return (
    <>
      <div className="metrics four">
        <Metric
          label={`${t("startBalance")} / ${t("goal")}`}
          value={money(a.start, a.cur)}
          detail={money(a.target, a.cur)}
        />
        <Metric
          label={t("roadmap")}
          value={rm.rows.length}
          detail={`${data.botcamps.filter((b) => b.acc === a.id).length} Botcamp + GOAL`}
        />
        <Metric
          label={t("completed")}
          value={`${rm.done} / ${rm.rows.length}`}
          detail={`${t("profit")}: ${money(rm.peakCum, a.cur)}`}
        />
        <Metric
          label={t("plannedWithdrawal")}
          value={money(rm.totalWd, a.cur)}
          accent
        />
      </div>
      <Panel>
        <div className="table-wrap roadmap-table">
          <table>
            <thead>
              <tr>
                {[
                  "step",
                  "phases",
                  "stepStart",
                  "target",
                  "stepEnd",
                  "actualTarget",
                  "withdrawal",
                  "cumulativeTarget",
                  "risk",
                  "status",
                ].map((k) => (
                  <th key={k}>{t(k)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rm.rows.map((r, i) => (
                <tr
                  key={r.no}
                  className={`${r.type ? "botcamp-row" : ""} ${i === rm.curIdx ? "active-row" : ""}`}
                >
                  <td>
                    <b>{r.no}</b>
                  </td>
                  <td>{r.phaseName}</td>
                  <td className="numeric">{money(r.start, a.cur)}</td>
                  <td>{percent(r.pct, 0)}</td>
                  <td className="numeric">
                    <b>{money(r.end, a.cur)}</b>
                    <small>{r.type}</small>
                  </td>
                  <td>{percent(r.realPct)}</td>
                  <td className="numeric">{r.wd ? money(r.wd, a.cur) : "—"}</td>
                  <td className="numeric">{money(r.cumTarget, a.cur)}</td>
                  <td className="numeric">
                    {money(r.rmin, a.cur)} – {money(r.rmax, a.cur)}
                  </td>
                  <td>
                    <span
                      className={`badge ${r.status === "Hoàn thành" ? "green" : r.status === "Đang thực hiện" ? "gold" : ""}`}
                    >
                      {t(
                        r.status === "Hoàn thành"
                          ? "completedStatus"
                          : r.status === "Đang thực hiện"
                            ? "activeStatus"
                            : "pendingStatus",
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title={t("withdrawHistory")}>
        {withdrawals.length ? (
          <div className="withdrawal-list">
            {withdrawals.map((c) => (
              <div key={c.id}>
                <span>
                  {shortDate(c.time)} · {c.note}
                </span>
                <b>{money(c.amount, a.cur)}</b>
              </div>
            ))}
          </div>
        ) : (
          <Empty>{t("noWithdrawalHistory")}</Empty>
        )}
      </Panel>
    </>
  );
}
function Statistics({
  data,
  account,
  trades,
}: {
  data: AppData;
  account: Account;
  trades: EnrichedTrade[];
}) {
  const t = useTranslations(),
    [acc, setAcc] = useState(account.id),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  useEffect(() => setAcc(account.id), [account.id]);
  const rows = trades
      .filter(
        (x) =>
          (acc === "*" || x.acc === acc) &&
          (!from || x.day >= from) &&
          (!to || x.day <= to),
      )
      .sort((a, b) => a.close.localeCompare(b.close)),
    wins = rows.filter((x) => x.usd > 0),
    losses = rows.filter((x) => x.usd < 0),
    gw = wins.reduce((s, x) => s + x.usd, 0),
    gl = -losses.reduce((s, x) => s + x.usd, 0),
    rs = rows.filter((x) => x.R != null);
  const streak = (win: boolean) => {
    let cur = 0,
      max = 0;
    rows.forEach((x) => {
      cur = (win ? x.net > 0 : x.net < 0) ? cur + 1 : 0;
      max = Math.max(max, cur);
    });
    return max;
  };
  const metrics = [
    [t("trades"), rows.length],
    [t("winrate"), percent(rows.length ? wins.length / rows.length : null)],
    ["Profit Factor", number(gl ? gw / gl : null)],
    [t("expectancy"), money(rows.length ? (gw - gl) / rows.length : null)],
    [
      t("averageR"),
      number(rs.length ? rs.reduce((s, x) => s + x.R!, 0) / rs.length : null),
    ],
    [t("maxWinStreak"), streak(true)],
    [t("maxLossStreak"), streak(false)],
    [
      t("averageDiscipline"),
      number(
        rows.length
          ? rows.reduce((s, x) => s + (x.disc ?? 0), 0) / rows.length
          : null,
        1,
      ),
    ],
  ];
  const groups = (title: string, fn: (x: EnrichedTrade) => string) => {
    const keys = Array.from(new Set(rows.map(fn)));
    return (
      <Panel title={title}>
        {keys.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th />
                  <th>{t("trades")}</th>
                  <th>{t("winrate")}</th>
                  <th>PnL (USD)</th>
                  <th>R</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => {
                  const g = rows.filter((x) => fn(x) === k),
                    r = g.filter((x) => x.R != null),
                    sum = g.reduce((s, x) => s + x.usd, 0);
                  return (
                    <tr key={k}>
                      <td>{k}</td>
                      <td>{g.length}</td>
                      <td>
                        {percent(g.filter((x) => x.net > 0).length / g.length)}
                      </td>
                      <td className={`numeric ${tone(sum)}`}>
                        {money(sum, "USD", true)}
                      </td>
                      <td>
                        {number(
                          r.length
                            ? r.reduce((s, x) => s + x.R!, 0) / r.length
                            : null,
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>{t("noData")}</Empty>
        )}
      </Panel>
    );
  };
  const bucket = (x: EnrichedTrade) => {
    if (x.slDist == null) return "Không SL";
    const market = data.accounts.find((a) => a.id === x.acc)?.market;
    if (market === "FX") return `${x.sym} · ${number(x.slDist, 5)}`;
    const bounds =
      market === "STOCK_VN" ? [0, 2000, 5000, 10000] : [0, 5, 6, 8, 10];
    let i = bounds.findLastIndex((v) => v <= x.slDist!);
    return `${market === "STOCK_VN" ? "CK · " : "XAU · "}${bounds[i]} – ${bounds[i + 1] ?? "∞"}`;
  };
  return (
    <>
      <div className="filters stats-filters">
        <Field label={t("account")}>
          <select value={acc} onChange={(e) => setAcc(e.target.value)}>
            <option value="*">{t("all")}</option>
            {data.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("from")}>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label={t("to")}>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
      </div>
      <Panel title={t("equity")}>
        <Equity data={data} trades={rows} accountId={acc} />
      </Panel>
      <div className="metrics four">
        {metrics.map(([label, value]) => (
          <Metric key={String(label)} label={label} value={value} />
        ))}
      </div>
      <div className="stats-groups">
        {groups(t("bySession"), (x) => x.sess)}
        {groups(t("byStop"), bucket)}
        {groups(t("bySetup"), (x) => x.setup || "—")}
      </div>
    </>
  );
}
function Equity({
  data,
  trades,
  accountId,
}: {
  data: AppData;
  trades: EnrichedTrade[];
  accountId: string;
}) {
  const t = useTranslations();
  if (accountId === "*")
    return (
      <Empty>
        {t("account")} · {t("equity")}
      </Empty>
    );
  const a = data.accounts.find((a) => a.id === accountId)!;
  const r = effectiveStep(data, a).step;
  const points = [a.start, ...trades.map((x) => x.balAfter)],
    vals = [...points, r?.start ?? a.start, r?.end ?? a.target],
    lo = Math.min(...vals),
    hi = Math.max(...vals),
    pad = (hi - lo) * 0.12 || 1,
    min = lo - pad,
    max = hi + pad;
  const x = (i: number) =>
      70 + (points.length > 1 ? i / (points.length - 1) : 0) * 740,
    y = (n: number) => 240 - ((n - min) / (max - min)) * 210;
  return (
    <div className="equity-chart">
      <svg viewBox="0 0 1000 290" role="img" aria-label={t("equity")}>
        <defs>
          <linearGradient id="equity-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity=".22" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[lo, (lo + hi) / 2, hi].map((n) => (
          <g key={n}>
            <line x1="70" x2="810" y1={y(n)} y2={y(n)} className="chart-grid" />
            <text x="60" y={y(n) + 4} textAnchor="end">
              {number(n, 0)}
            </text>
          </g>
        ))}
        {r && (
          <>
            <line
              x1="70"
              x2="810"
              y1={y(r.end)}
              y2={y(r.end)}
              className="chart-target"
            />
            <text x="825" y={y(r.end) + 4}>
              {t("next")}
            </text>
            <text x="825" y={y(r.end) + 24}>
              {money(r.end, a.cur)}
            </text>
          </>
        )}
        <path
          d={`M70 240 ${points.map((n, i) => `L${x(i)} ${y(n)}`).join(" ")} L${x(points.length - 1)} 240 Z`}
          fill="url(#equity-fill)"
        />
        <path
          d={points.map((n, i) => `${i ? "L" : "M"}${x(i)} ${y(n)}`).join(" ")}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="3"
        />
        {points.map((n, i) => (
          <circle key={i} cx={x(i)} cy={y(n)} r="4" fill="var(--accent)">
            <title>
              {i}: {money(n, a.cur)}
            </title>
          </circle>
        ))}
        <text x="70" y="275">
          {t("startBalance")}
        </text>
        <text x="810" y="275" textAnchor="end">
          {trades.length} {t("trades")}
        </text>
      </svg>
    </div>
  );
}
