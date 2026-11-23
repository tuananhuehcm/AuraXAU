import type { ReactNode } from "react";
export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <div className="panel-heading">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Metric({
  label,
  value,
  detail,
  accent = false,
}: {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={`metric ${accent ? "accent" : ""}`}>
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
      {detail && <div className="metric-detail">{detail}</div>}
    </div>
  );
}
export function Field({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">◇</span>
      <p>{children}</p>
    </div>
  );
}
export const number = (v: number | null | undefined, d = 2) =>
  v == null || !Number.isFinite(v)
    ? "—"
    : new Intl.NumberFormat("en-US", {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      }).format(v);
export const money = (
  v: number | null | undefined,
  cur = "USD",
  sign = false,
) =>
  v == null || !Number.isFinite(v)
    ? "—"
    : `${v < 0 ? "−" : sign && v > 0 ? "+" : ""}${cur === "VND" ? "" : "$"}${number(Math.abs(v), cur === "VND" ? 0 : 2)}${cur === "VND" ? " ₫" : ""}`;
export const percent = (v: number | null | undefined, d = 1) =>
  v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(d)}%`;
export const tone = (v: number) =>
  v > 0 ? "positive" : v < 0 ? "negative" : "";
export const shortDate = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
export function Num({
  name,
  value,
  step = "any",
  required = false,
  min,
  max,
}: {
  name: string;
  value?: number | string;
  step?: string;
  required?: boolean;
  min?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      name={name}
      defaultValue={value}
      step={step}
      required={required}
      min={min}
      max={max}
    />
  );
}
