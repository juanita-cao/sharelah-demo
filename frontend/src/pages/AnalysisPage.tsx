import { Alert, Card, Skeleton, Table, Tag } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useApi } from "../app/contexts";
import { Bars, LineBand, SignedBars } from "../components/charts";
import { money } from "../components/common";

const pct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : 0);

// Operator analysis: the headline numbers first, then the charts, then how robust the conclusions are, then the assumptions behind every number.
export function AnalysisPage() {
  const { t } = useTranslation();
  const api = useApi();
  const sc = useQuery({ queryKey: ["scenarios"], queryFn: api.scenarios });
  const part = useQuery({ queryKey: ["participation"], queryFn: api.participation });
  const sens = useQuery({ queryKey: ["sensitivity"], queryFn: api.sensitivity });
  const assumptions = useQuery({ queryKey: ["assumptions"], queryFn: api.assumptions });
  if (sc.isError) return <Alert type="error" showIcon message={t("error.loadFailed")} />;
  const d = sc.data;
  if (!d) return <Skeleton active paragraph={{ rows: 10 }} />;
  const A = d.columns.find((c) => c.id === "A")!, C = d.columns.find((c) => c.id === "C")!;
  const losers = d.perCarrier.filter((c) => c.deltaVsA < 0).length;
  const name = (id: string) => t(`scenario.${id}`).split(" ")[0];
  const head = (label: string, value: string, sub: string, good: boolean) => <div className="kpi-card"><div className="kpi-label">{label}</div><div className={`kpi-value ${good ? "pos" : "neg"}`}>{value}</div><div className="kpi-foot"><span className="muted">{sub}</span></div></div>;
  return (
    <div className="console">
      <div className="page-head"><div><h2>{t("nav.analysis")}</h2><div className="muted">{t("analysis.subtitle")}</div></div></div>
      <div className="kpi-grid four">
        {head(t("analysis.kpi.surplus"), `${pct(C.surplus, A.surplus) >= 0 ? "+" : ""}${pct(C.surplus, A.surplus)}%`, `${money(A.surplus)} → ${money(C.surplus)}`, C.surplus >= A.surplus)}
        {head(t("analysis.kpi.empty"), `${pct(C.emptyKm, A.emptyKm)}%`, `${A.emptyKm} → ${C.emptyKm} km`, C.emptyKm <= A.emptyKm)}
        {head(t("analysis.kpi.co2"), `${pct(C.co2Kg, A.co2Kg)}%`, `${A.co2Kg} → ${C.co2Kg} kg`, C.co2Kg <= A.co2Kg)}
        {head(t("analysis.kpi.losers"), `${losers} / ${d.perCarrier.length}`, t("analysis.kpi.losersNote"), losers === 0)}
      </div>

      <div className="chart-grid three">
        <Card title={t("analysis.chart.surplus")}><Bars better="high" items={d.columns.map((c) => ({ label: name(c.id), value: c.surplus }))} /></Card>
        <Card title={t("analysis.chart.empty")}><Bars better="low" items={d.columns.map((c) => ({ label: name(c.id), value: c.emptyKm }))} /></Card>
        <Card title={t("analysis.chart.co2")}><Bars better="low" items={d.columns.map((c) => ({ label: name(c.id), value: c.co2Kg }))} /></Card>
      </div>
      <div className="muted legend-line">{t("analysis.scenarioKey")}</div>

      <div className="chart-grid two">
        <Card title={t("analysis.chart.effects")}>
          <SignedBars items={[{ label: t("analysis.sharing"), value: d.effects.sharing }, { label: t("analysis.optimization"), value: d.effects.optimization }, { label: t("analysis.ownFleet"), value: d.effects.ownFleet }, { label: t("analysis.beyondOwn"), value: d.effects.sharingBeyondOwn }]} prefix="S$" />
        </Card>
        <Card title={t("analysis.chart.carriers")} extra={losers > 0 ? <Tag color="red">⚠ {t("analysis.worse")}: {losers}</Tag> : null}>
          <SignedBars items={d.perCarrier.map((c) => ({ label: c.carrierId, value: c.deltaVsA }))} prefix="S$" />
        </Card>
      </div>

      <div className="chart-grid two">
        <Card title={t("analysis.chart.partEmpty")} loading={part.isLoading}>{part.data && <LineBand xLabel={t("analysis.axis.participation")} yLabel={t("analysis.axis.emptyKm")} points={part.data.map((p) => ({ x: p.ratePct, y: p.emptyKm.mean, lo: p.emptyKm.lo, hi: p.emptyKm.hi }))} />}<div className="muted">{t("analysis.bandNote")}</div></Card>
        <Card title={t("analysis.chart.partCost")} loading={part.isLoading}>{part.data && <LineBand color="#64748B" xLabel={t("analysis.axis.participation")} yLabel={t("analysis.axis.cost")} points={part.data.map((p) => ({ x: p.ratePct, y: p.cost.mean, lo: p.cost.lo, hi: p.cost.hi }))} />}<div className="muted">{t("analysis.bandNote")}</div></Card>
      </div>

      <Card title={t("analysis.sens.title")} loading={sens.isLoading}>
        <Table size="middle" pagination={false} rowKey="code" dataSource={sens.data ?? []}
          columns={[{ title: t("analysis.sens.conclusion"), render: (_: unknown, r) => <b>{t(`sens.${r.code}.title`)}</b> },
            { title: t("analysis.sens.verdict"), width: 150, render: (_: unknown, r) => <Tag color={r.holds ? "green" : "red"}>{r.holds ? t("analysis.holds") : t("analysis.fails")}</Tag> },
            { title: t("analysis.sens.flips"), render: (_: unknown, r) => <span className="muted">{t(`sens.${r.code}.flips`, { v: r.threshold })}</span> }]} />
      </Card>

      <Card title={t("analysis.assumptions")} style={{ marginTop: 16 }} loading={assumptions.isLoading}>
        {assumptions.data?.map((a) => <div key={a.key} className="assumption"><Tag color={a.kind === "SOURCED" ? "green" : "orange"}>{a.kind}</Tag><b>{a.label}</b> — {a.value}{a.source ? ` (${a.source})` : ""}</div>)}
        <div className="muted" style={{ marginTop: 10 }}>{t("analysis.mockNote")}</div>
      </Card>
    </div>
  );
}
