import { Tag } from "antd";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { HazardClass, KpiTrendVM, KpiVM, TempClass } from "../api/types";
import { Sparkline } from "./charts";

const TEMP_COLOR: Record<TempClass, string> = { AMB: "default", COOL: "cyan", CHILL: "blue", PHARMA: "purple", FROZEN: "geekblue" };
export function TempBadge({ temp }: { temp: TempClass }) { return <Tag color={TEMP_COLOR[temp]}>{temp}</Tag>; }
export function HazardBadge({ hazard }: { hazard: HazardClass | null }) { return hazard ? <Tag color="volcano">{hazard.replace("_", ".")}</Tag> : null; }

export const money = (x: number) => `S$${Math.round(x).toLocaleString("en-US")}`;
export const signed = (x: number, unit = "") => `${x > 0 ? "▲ +" : x < 0 ? "▼ " : ""}${Math.round(x).toLocaleString("en-US")}${unit}`;
export const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
export const ageText = (sec: number) => (sec < 120 ? `${sec} s` : `${Math.round(sec / 60)} min`);
export const mmss = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;

export function MetricCard({ label, children, hint, tone }: { label: string; children: ReactNode; hint?: ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className={`metric-card${tone ? ` ${tone}` : ""}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{children}</div>
      {hint && <div className="metric-hint">{hint}</div>}
    </div>
  );
}

// Money first (design principle: money first): surplus, cost, empty km, CO2, unserved, each with its change against the live baseline and a short trend.
function Delta({ value, goodWhen, unit = "" }: { value: number; goodWhen: "up" | "down"; unit?: string }) {
  if (Math.round(value) === 0) return <span className="delta flat">0{unit}</span>;
  const good = goodWhen === "up" ? value > 0 : value < 0;
  return <span className={`delta ${good ? "good" : "bad"}`}>{value > 0 ? "▲" : "▼"} {Math.abs(Math.round(value)).toLocaleString("en-US")}{unit}</span>;
}

export function KpiStrip({ kpis, trend }: { kpis: KpiVM; trend?: KpiTrendVM }) {
  const { t } = useTranslation();
  const d = kpis.deltaVsBaseline;
  const card = (label: string, value: ReactNode, delta: ReactNode, spark?: number[], color?: string) => (
    <div className="kpi-card"><div className="kpi-label">{label}</div><div className="kpi-value">{value}</div><div className="kpi-foot">{delta}{spark && <Sparkline values={spark} color={color} />}</div></div>
  );
  return (
    <div className="kpi-grid">
      {card(t("kpi.surplus"), money(kpis.modeledSurplus), <span className="kpi-delta"><Delta value={d.surplus} goodWhen="up" /> <span className="muted">{t("kpi.vsBaseline")}</span></span>, trend?.surplus, "#16A34A")}
      {card(t("kpi.cost"), money(kpis.operatingCost), <span className="muted">{t("kpi.costNote")}</span>, trend?.cost, "#64748B")}
      {card(t("kpi.emptyKm"), `${Math.round(kpis.emptyKm)} km`, <span className="kpi-delta"><Delta value={d.emptyKm} goodWhen="down" /> <span className="muted">{t("kpi.vsBaseline")}</span></span>, trend?.emptyKm, "var(--primary)")}
      {card(t("kpi.co2"), `${Math.round(kpis.co2Kg)} kg`, <span className="kpi-delta"><Delta value={d.co2Kg} goodWhen="down" /> <span className="muted">{t("kpi.vsBaseline")}</span></span>, trend?.co2Kg, "#0E7490")}
      <div className={`kpi-card${kpis.unserved > 0 ? " alert" : ""}`}><div className="kpi-label">{t("kpi.unserved")}</div><div className="kpi-value">{kpis.unserved}</div><div className="kpi-foot"><span className="muted">{kpis.unserved > 0 ? t("kpi.unservedNote") : t("kpi.allServed")}</span></div></div>
    </div>
  );
}

export function KpiCard({ label, value, foot, spark, color, tone }: { label: string; value: ReactNode; foot?: ReactNode; spark?: number[]; color?: string; tone?: "good" | "bad" }) {
  return (
    <div className={`kpi-card${tone === "bad" ? " alert" : ""}`}>
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value${tone === "good" ? " pos" : tone === "bad" ? " neg" : ""}`}>{value}</div>
      <div className="kpi-foot"><span className="muted">{foot}</span>{spark && <Sparkline values={spark} color={color} />}</div>
    </div>
  );
}

export function SectionTitle({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return <div className="section-title"><span>{children}</span>{extra}</div>;
}
