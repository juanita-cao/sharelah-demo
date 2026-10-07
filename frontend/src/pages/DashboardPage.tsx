import { Card, Empty, Progress, Tag } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { LoadVM, TempClass } from "../api/types";
import { useApi, useSession } from "../app/contexts";
import { useStateQuery } from "../app/hooks";
import { Bars } from "../components/charts";
import { KpiCard, TempBadge, money } from "../components/common";
import { placeName } from "../data/places";

const SERVED: LoadVM["status"][] = ["MATCHED", "CONFIRMED", "IN_TRANSIT", "DONE"];
const ACTIVE: LoadVM["status"][] = ["MATCHED", "CONFIRMED", "IN_TRANSIT"];
const STATUSES: LoadVM["status"][] = ["RECEIVED", "MATCHED", "CONFIRMED", "IN_TRANSIT", "DONE", "UNSERVED"];
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// Company panel: the numbers of one company only (a shipper's shipments and spend, a carrier's fleet and earnings).
export function DashboardPage() {
  const { t } = useTranslation();
  const api = useApi();
  const { company } = useSession();
  const state = useStateQuery();
  const price = useQuery({ queryKey: ["price"], queryFn: api.priceTable });
  const d = state.data;
  if (!d) return <div className="page-pad muted">{t("loading")}</div>;
  const take = (price.data?.takeRate ?? 0.1) + (price.data?.referralRate ?? 0);
  const recent = (xs: LoadVM[]) => [...xs].sort((a, b) => b.loadId.localeCompare(a.loadId)).slice(0, 5);
  const row = (l: LoadVM, right: string) => (
    <div key={l.loadId} className="recent-row"><div><b>{l.loadId}</b> <span className="muted">{placeName(l.origin)} → {placeName(l.destination)}</span></div><div><TempBadge temp={l.tempClass} /><Tag color={l.status === "DONE" ? "green" : l.status === "UNSERVED" ? "red" : "orange"}>{t(`status.${l.status}`)}</Tag><b>{right}</b></div></div>
  );

  if (company.kind === "SHIPPER") {
    const mine = d.loads.filter((l) => l.companyId === company.id);
    const served = mine.filter((l) => SERVED.includes(l.status));
    const spend = sum(served.map((l) => l.quote ?? 0)), pallets = sum(served.map((l) => l.pallets));
    const mix = (["AMB", "COOL", "CHILL", "PHARMA", "FROZEN"] as TempClass[]).map((c) => ({ c, n: mine.filter((l) => l.tempClass === c).length })).filter((x) => x.n > 0);
    return (
      <div className="page-pad">
        <div className="page-head"><div><h2>{t("nav.dashboard")}</h2><div className="muted">{company.name}</div></div></div>
        <div className="kpi-grid">
          <KpiCard label={t("dash.posted")} value={mine.length} foot={t("dash.allTime")} />
          <KpiCard label={t("dash.inProgress")} value={mine.filter((l) => ACTIVE.includes(l.status)).length} foot={t("dash.onTheRoad")} />
          <KpiCard label={t("dash.delivered")} value={mine.filter((l) => l.status === "DONE").length} tone="good" foot={t("dash.completed")} />
          <KpiCard label={t("dash.notServed")} value={mine.filter((l) => l.status === "UNSERVED").length} tone={mine.some((l) => l.status === "UNSERVED") ? "bad" : "good"} foot={t("kpi.unservedNote")} />
          <KpiCard label={t("dash.spend")} value={money(spend)} foot={pallets ? `${money(spend / pallets)} / ${t("unit.pallets")}` : undefined} />
        </div>
        <div className="chart-grid two">
          <Card title={t("dash.byStatus")}><Bars better="high" items={STATUSES.map((k) => ({ label: t(`status.${k}`), value: mine.filter((l) => l.status === k).length }))} /></Card>
          <Card title={t("dash.tempMix")}>{mix.length === 0 ? <Empty description={t("ship.empty")} /> : mix.map((x) => (
            <div key={x.c} className="mix-row"><span><TempBadge temp={x.c} /></span><Progress percent={Math.round((x.n / mine.length) * 100)} strokeColor="var(--primary)" size="small" format={() => x.n} /></div>
          ))}</Card>
        </div>
        <Card title={t("dash.recent")}>{recent(mine).map((l) => row(l, l.quote === null ? "—" : money(l.quote)))}{mine.length === 0 && <Empty description={t("ship.empty")} />}</Card>
      </div>
    );
  }

  const fleet = d.vehicles.filter((v) => v.carrierId === company.id);
  const ids = new Set(fleet.map((v) => v.vehicleId));
  const jobs = d.loads.filter((l) => l.vehicleId && ids.has(l.vehicleId) && ["CONFIRMED", "IN_TRANSIT", "DONE"].includes(l.status));
  const earnings = sum(jobs.map((l) => (l.quote ?? 0) * (1 - take)));
  const offers = d.offers.filter((o) => o.companyId === company.id);
  const answered = offers.filter((o) => o.status !== "SHOWN"), accepted = offers.filter((o) => o.status === "ACCEPTED");
  const use = (vid: string, cap: number) => Math.min(100, Math.round((sum(jobs.filter((l) => l.vehicleId === vid).map((l) => l.pallets)) / cap) * 100));
  return (
    <div className="page-pad">
      <div className="page-head"><div><h2>{t("nav.dashboard")}</h2><div className="muted">{company.name}</div></div></div>
      <div className="kpi-grid">
        <KpiCard label={t("dash.earnings")} value={money(earnings)} tone="good" foot={t("dash.afterTake", { pct: Math.round(take * 100) })} />
        <KpiCard label={t("dash.jobs")} value={jobs.length} foot={t("dash.allTime")} />
        <KpiCard label={t("dash.fleet")} value={fleet.length} foot={t("dash.fleetNote")} />
        <KpiCard label={t("dash.openOffers")} value={offers.filter((o) => o.status === "SHOWN").length} foot={t("dash.waiting")} />
        <KpiCard label={t("dash.acceptance")} value={answered.length ? `${Math.round((accepted.length / answered.length) * 100)}%` : "—"} foot={t("dash.backhaulShare", { n: accepted.filter((o) => o.isBackhaul).length })} />
      </div>
      <div className="chart-grid two">
        <Card title={t("dash.fleetList")}>{fleet.map((v) => (
          <div key={v.vehicleId} className="mix-row"><span><b>{v.vehicleId}</b> <span className="muted">{v.type} · {v.palletCap} {t("unit.pallets")}</span>{v.dgCapable && <Tag color="volcano" style={{ marginLeft: 6 }}>DG</Tag>}</span><Progress percent={use(v.vehicleId, v.palletCap)} strokeColor="var(--primary)" size="small" /></div>
        ))}</Card>
        <Card title={t("dash.recentJobs")}>{recent(jobs).map((l) => row(l, money((l.quote ?? 0) * (1 - take))))}{jobs.length === 0 && <Empty description={t("carrier.noJobs")} />}</Card>
      </div>
    </div>
  );
}
