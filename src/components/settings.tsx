"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { AppData } from "@/lib/types";
import { sampleData } from "@/lib/data";
import { vnNow } from "@/lib/engine";
import type { Commit } from "./dashboard";
import { Field, Panel } from "./ui";
type Column = {
  key: string;
  label: string;
  kind?: "number" | "percent" | "date" | "boolean";
  options?: string[];
};
type ArrayKey =
  | "accounts"
  | "phases"
  | "botcamps"
  | "instruments"
  | "rates"
  | "rounding"
  | "sessFX"
  | "sessStock";
export default function SettingsPanel({
  data,
  commit,
  busy,
  mode,
  notify,
  revision,
  reload,
}: {
  data: AppData;
  commit: Commit;
  busy: boolean;
  mode: "demo" | "cloud";
  notify: (s: string) => void;
  revision: number;
  reload: () => Promise<void>;
}) {
  const t = useTranslations(),
    [draft, setDraft] = useState(() => structuredClone(data)),
    [tab, setTab] = useState("accounts"),
    [syncing, setSyncing] = useState(false),
    [logs, setLogs] = useState<string[]>([]),
    [setup, setSetup] = useState("");
  useEffect(() => setDraft(structuredClone(data)), [data]);
  const accounts = draft.accounts.map((a) => a.id),
    n = (key: string, label: string): Column => ({
      key,
      label,
      kind: "number",
    }),
    p = (key: string, label: string): Column => ({
      key,
      label,
      kind: "percent",
    });
  const text = (key: string, label: string): Column => ({ key, label });
  const accountColumn: Column = {
    key: "acc",
    label: t("account"),
    options: accounts,
  };
  const table = (
    title: string,
    collection: ArrayKey,
    cols: Column[],
    blank: Record<string, unknown>,
  ) => {
    const rows = draft[collection] as unknown as Record<string, unknown>[];
    const change = (i: number, key: string, value: unknown) => {
      const next = structuredClone(draft);
      const list = next[collection] as unknown as Record<string, unknown>[];
      list[i][key] = value;
      setDraft(next);
    };
    const add = () => {
      const next = structuredClone(draft);
      (next[collection] as unknown as Record<string, unknown>[]).push(blank);
      setDraft(next);
    };
    return (
      <Panel
        title={title}
        action={
          <button type="button" className="secondary" onClick={add}>
            <Plus size={14} />
            {t("save") === "保存" ? "添加" : "+"}
          </button>
        }
      >
        <div className="table-wrap">
          <table className="editable-table">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {cols.map((c) => (
                    <td key={c.key}>
                      {c.options ? (
                        <select
                          aria-label={c.label}
                          value={String(row[c.key] ?? "")}
                          onChange={(e) => change(i, c.key, e.target.value)}
                        >
                          {c.options.map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      ) : c.kind === "boolean" ? (
                        <input
                          aria-label={c.label}
                          type="checkbox"
                          checked={!!row[c.key]}
                          onChange={(e) => change(i, c.key, e.target.checked)}
                        />
                      ) : (
                        <input
                          aria-label={c.label}
                          type={
                            c.kind === "date"
                              ? "date"
                              : c.kind === "number" || c.kind === "percent"
                                ? "number"
                                : "text"
                          }
                          step="any"
                          value={
                            c.kind === "percent"
                              ? Math.round(Number(row[c.key] ?? 0) * 1e6) / 1e4
                              : String(row[c.key] ?? "")
                          }
                          onChange={(e) =>
                            change(
                              i,
                              c.key,
                              c.kind === "percent"
                                ? Number(e.target.value) / 100
                                : c.kind === "number"
                                  ? Number(e.target.value)
                                  : e.target.value,
                            )
                          }
                        />
                      )}
                    </td>
                  ))}
                  <td>
                    <button
                      type="button"
                      className="text-button negative"
                      onClick={() => {
                        const next = structuredClone(draft);
                        (next[collection] as unknown[]).splice(i, 1);
                        setDraft(next);
                      }}
                    >
                      {t("remove")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    );
  };
  async function sync() {
    if (mode === "demo") {
      notify(
        "Bản mẫu không kết nối Google Sheet. Đăng nhập tài khoản thật để đồng bộ.",
      );
      return;
    }
    setSyncing(true);
    try {
      const r = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      setLogs([body.summary, ...logs]);
      await reload();
      notify(body.summary);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Đồng bộ thất bại.");
    } finally {
      setSyncing(false);
    }
  }
  const first = accounts[0] ?? "",
    nextId = `ACC${String(draft.accounts.length + 1).padStart(2, "0")}`;
  return (
    <>
      <div className="segmented settings-tabs">
        {[
          "accounts",
          "phases",
          "contracts",
          "rates",
          "sessions",
          "sync",
          "general",
        ].map((k) => (
          <button
            key={k}
            className={tab === k ? "active" : ""}
            onClick={() => setTab(k)}
          >
            {t(k === "accounts" ? "account" : k)}
          </button>
        ))}
      </div>
      {tab !== "sync" && (
        <div className="settings-save">
          <span className="muted">
            {t("settings")} · {t("save")} {t("general").toLowerCase()}
          </span>
          <button
            className="primary"
            disabled={busy || JSON.stringify(draft) === JSON.stringify(data)}
            onClick={() => commit(draft)}
          >
            {busy ? t("saving") : t("apply")}
          </button>
        </div>
      )}
      {tab === "accounts" && (
        <>
          {table(
            t("account"),
            "accounts",
            [
              text("id", "ID"),
              text("name", t("name")),
              {
                key: "market",
                label: t("market"),
                options: ["XAUUSD", "FX", "STOCK_VN"],
              },
              text("broker", t("broker")),
              { key: "cur", label: t("currency"), options: ["USD", "VND"] },
              text("symbol", t("symbol")),
              n("start", t("startBalance")),
              n("target", t("goal")),
              { key: "startDate", label: t("startDate"), kind: "date" },
              p("risk", "Risk %"),
              p("dayLimit", `${t("breaker")} %`),
              p("descale", "DD %"),
              { key: "round", label: t("rates"), kind: "boolean" },
              {
                key: "status",
                label: t("status"),
                options: ["Đang chạy", "Tạm dừng", "Đã đóng"],
              },
            ],
            {
              id: nextId,
              name: "Tài khoản mới",
              market: "XAUUSD",
              broker: "",
              cur: "USD",
              symbol: "XAUUSD",
              start: 200,
              target: 100000,
              startDate: vnNow().slice(0, 10),
              risk: 0.03,
              dayLimit: 0.1,
              descale: 0.1,
              round: true,
              status: "Đang chạy",
            },
          )}
          <p className="inline-message warning">
            Tài khoản mới cần ít nhất một giai đoạn từ số dư 0. Thêm tài khoản
            và giai đoạn, rồi bấm Lưu thay đổi.
          </p>
          {!draft.accounts.length && (
            <button
              className="secondary"
              onClick={() => {
                const d = sampleData();
                d.trades = [];
                d.cashflows = [];
                d.dayNotes = {};
                d.general = data.general;
                setDraft(d);
              }}
            >
              {t("seedDemo")} · cấu hình, không có lệnh
            </button>
          )}
        </>
      )}
      {tab === "phases" && (
        <>
          {table(
            t("phases"),
            "phases",
            [
              accountColumn,
              n("no", "#"),
              text("name", t("name")),
              n("from", "Từ số dư"),
              p("pct", "Target %"),
              p("rmin", "Risk min %"),
              p("rmax", "Risk max %"),
            ],
            {
              acc: first,
              no: 1,
              name: "Tăng trưởng",
              from: 0,
              pct: 0.1,
              rmin: 0.01,
              rmax: 0.02,
            },
          )}
          {table(
            "Botcamp",
            "botcamps",
            [
              accountColumn,
              n("no", "#"),
              n("level", t("balance")),
              { key: "type", label: t("type"), options: ["Cố định", "% lãi"] },
              n("value", "Tiền rút / tỷ lệ (0.3 = 30%)"),
            ],
            { acc: first, no: 1, level: 1000, type: "Cố định", value: 200 },
          )}
        </>
      )}
      {tab === "contracts" &&
        table(
          t("contracts"),
          "instruments",
          [
            text("sym", t("symbol")),
            {
              key: "market",
              label: t("market"),
              options: ["XAUUSD", "FX", "STOCK_VN"],
            },
            { key: "cur", label: t("currency"), options: ["USD", "VND"] },
            n("tick", "Pip / tick"),
            n("tickVal", "Giá trị tick / lot"),
            n("minLot", "KL tối thiểu"),
            n("lotStep", "Bước KL"),
            text("note", t("note")),
          ],
          {
            sym: "",
            market: "FX",
            cur: "USD",
            tick: 0.0001,
            tickVal: 10,
            minLot: 0.01,
            lotStep: 0.01,
            note: "",
          },
        )}
      {tab === "rates" && (
        <>
          {table(
            "VND / 1 USD",
            "rates",
            [
              { key: "date", label: t("from"), kind: "date" },
              n("rate", "VND / USD"),
            ],
            { date: vnNow().slice(0, 10), rate: 26000 },
          )}
          {table(
            t("rates"),
            "rounding",
            [
              { key: "cur", label: t("currency"), options: ["USD", "VND"] },
              n("from", "Từ số dư"),
              n("step", "Bước làm tròn"),
            ],
            { cur: "USD", from: 0, step: 10 },
          )}
        </>
      )}
      {tab === "sessions" && (
        <>
          {table(
            "XAUUSD / FX · New York",
            "sessFX",
            [n("t", "Giờ bắt đầu (3.5 = 03:30)"), text("n", t("session"))],
            { t: 0, n: "" },
          )}
          {table(
            "STOCK_VN · VN",
            "sessStock",
            [n("t", "Giờ bắt đầu (9.25 = 09:15)"), text("n", t("session"))],
            { t: 0, n: "" },
          )}
          <Panel title={t("setup")}>
            <div className="setup-chips">
              {draft.setups.map((s, i) => (
                <span className="badge" key={i}>
                  {s}
                  <button
                    className="text-button negative"
                    onClick={() => {
                      const d = structuredClone(draft);
                      d.setups.splice(i, 1);
                      setDraft(d);
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                if (!setup.trim()) return;
                setDraft({ ...draft, setups: [...draft.setups, setup.trim()] });
                setSetup("");
              }}
            >
              <input
                aria-label={t("setup")}
                value={setup}
                onChange={(e) => setSetup(e.target.value)}
              />
              <button className="secondary" type="submit">
                <Plus size={16} />
              </button>
            </form>
          </Panel>
        </>
      )}
      {tab === "sync" && (
        <>
          <Panel title={t("sync")}>
            <Field label="Google Sheet URL">
              <input
                value={draft.general.sheetUrl}
                placeholder="https://docs.google.com/spreadsheets/d/…"
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    general: { ...draft.general, sheetUrl: e.target.value },
                  })
                }
              />
            </Field>
            <p className="muted">
              Chia sẻ Sheet riêng cho Service Account trong cấu hình Vercel.
              Dùng file có đúng 5 sheet và tên cột tại dòng 5.
            </p>
            <ol className="sync-steps">
              <li>
                Đọc cột nhập trong Trades, Cashflow và Settings; cấp mã cho dòng
                mới.
              </li>
              <li>
                So với lần đồng bộ trước. Nếu cả DB và Sheet cùng sửa một dòng,
                giữ DB và ghi log.
              </li>
              <li>
                Lưu database, sau đó đẩy bản dữ liệu chuẩn về Sheet. Xoá dòng
                trên Sheet không xoá dữ liệu trong app.
              </li>
            </ol>
            <div className="row">
              <button
                className="secondary"
                disabled={busy}
                onClick={() => commit(draft)}
              >
                {t("apply")}
              </button>
              <button
                className="primary"
                disabled={
                  syncing ||
                  busy ||
                  data.general.sheetUrl !== draft.general.sheetUrl
                }
                onClick={sync}
              >
                {syncing ? t("saving") : t("syncNow")}
              </button>
            </div>
            <p className="small muted">
              Lưu link trước khi đồng bộ. Các tab Dashboard và Lo_Trinh sẽ được
              cập nhật từ database.
            </p>
          </Panel>
          <Panel title="Log">
            {logs.length ? (
              logs.map((s, i) => <p key={i}>{s}</p>)
            ) : (
              <p className="muted">{t("noData")}</p>
            )}
          </Panel>
        </>
      )}
      {tab === "general" && (
        <Panel title={t("general")}>
          <div className="form-grid three">
            <Field label="Cắt ngày XAUUSD / FX (VN)">
              <input
                type="number"
                min={0}
                max={23}
                value={draft.general.cutFX}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    general: { ...draft.general, cutFX: +e.target.value },
                  })
                }
              />
            </Field>
            <Field label="Cắt ngày chứng khoán (VN)">
              <input
                type="number"
                min={0}
                max={23}
                value={draft.general.cutStock}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    general: { ...draft.general, cutStock: +e.target.value },
                  })
                }
              />
            </Field>
            <Field label="Language">
              <select
                value={draft.general.lang}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    general: {
                      ...draft.general,
                      lang: e.target.value as AppData["general"]["lang"],
                    },
                  })
                }
              >
                <option value="vi">Tiếng Việt</option>
                <option value="en">English</option>
                <option value="zh-CN">简体中文</option>
              </select>
            </Field>
          </div>
          <p className="muted">
            Asia/Ho_Chi_Minh · America/New_York · Risk theo vốn đầu bậc
          </p>
          <a href="/setup" target="_blank" rel="noreferrer">
            Hướng dẫn kết nối Neon, Google OAuth và Google Sheet
          </a>
          {mode === "demo" && (
            <p>
              <button
                className="secondary"
                onClick={() => commit(sampleData())}
              >
                {t("resetDemo")}
              </button>
            </p>
          )}
        </Panel>
      )}
    </>
  );
}
