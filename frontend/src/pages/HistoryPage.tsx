import { SearchOutlined } from "@ant-design/icons";
import { Card, Input, Segmented, Table, Tag } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LoadVM, OfferVM } from "../api/types";
import { useApi, useSession } from "../app/contexts";
import { useStateQuery } from "../app/hooks";
import { HazardBadge, TempBadge, hhmm, money } from "../components/common";

type Filter = "ALL" | "ACTIVE" | "DONE" | "UNSERVED";
const matches = (l: LoadVM, f: Filter) => f === "ALL" || (f === "DONE" && l.status === "DONE") || (f === "UNSERVED" && l.status === "UNSERVED") || (f === "ACTIVE" && ["RECEIVED", "MATCHED", "CONFIRMED", "IN_TRANSIT"].includes(l.status));

// History: every shipment (shipper) or every job and offer (carrier) of this company, newest first, with a status filter and a search box.
export function HistoryPage() {
  const { t } = useTranslation();
  const api = useApi();
  const { company } = useSession();
  const state = useStateQuery();
  const price = useQuery({ queryKey: ["price"], queryFn: api.priceTable });
  const [filter, setFilter] = useState<Filter>("ALL");
  const [q, setQ] = useState("");
  const d = state.data;
  const take = (price.data?.takeRate ?? 0.1) + (price.data?.referralRate ?? 0);
  const ids = useMemo(() => new Set((d?.vehicles ?? []).filter((v) => v.carrierId === company.id).map((v) => v.vehicleId)), [d, company.id]);
  const byNewest = <T extends { loadId: string }>(xs: T[]) => [...xs].sort((a, b) => b.loadId.localeCompare(a.loadId));
  const needle = q.trim().toLowerCase();
  const pass = (l: LoadVM) => matches(l, filter) && (!needle || `${l.loadId} ${l.lane}`.toLowerCase().includes(needle));
  const loadCols = [
    { title: t("hist.load"), dataIndex: "loadId", render: (v: string) => <b>{v}</b> }, { title: t("hist.lane"), dataIndex: "lane" }, { title: t("field.pallets"), dataIndex: "pallets", align: "right" as const },
    { title: t("field.temp"), render: (_: unknown, l: LoadVM) => <span><TempBadge temp={l.tempClass} /><HazardBadge hazard={l.hazardClass} /></span> },
    { title: t("hist.status"), render: (_: unknown, l: LoadVM) => <Tag color={l.status === "DONE" ? "green" : l.status === "UNSERVED" ? "red" : "orange"}>{t(`status.${l.status}`)}</Tag> },
  ];
  const toolbar = (
    <div className="hist-toolbar">
      <Segmented value={filter} onChange={(v) => setFilter(v as Filter)} options={[{ value: "ALL", label: t("hist.filter.ALL") }, { value: "ACTIVE", label: t("hist.filter.ACTIVE") }, { value: "DONE", label: t("hist.filter.DONE") }, { value: "UNSERVED", label: t("hist.filter.UNSERVED") }]} />
      <Input allowClear variant="filled" prefix={<SearchOutlined />} placeholder={t("hist.search")} value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280 }} />
    </div>
  );
  if (!d) return <div className="page-pad muted">{t("loading")}</div>;
  if (company.kind === "SHIPPER") {
    const rows = byNewest(d.loads.filter((l) => l.companyId === company.id)).filter(pass);
    return (
      <div className="page-pad"><div className="page-head"><h2>{t("nav.history")}</h2></div>{toolbar}
        <Card><Table size="middle" rowKey="loadId" dataSource={rows} pagination={{ pageSize: 10, hideOnSinglePage: true }}
          columns={[...loadCols, { title: t("shipper.quote"), align: "right" as const, render: (_: unknown, l: LoadVM) => (l.quote === null ? "—" : money(l.quote)) }, { title: t("shipper.eta"), render: (_: unknown, l: LoadVM) => (l.etaMin === null ? "—" : hhmm(l.etaMin)) }]} /></Card>
      </div>
    );
  }
  const jobs = byNewest(d.loads.filter((l) => l.vehicleId && ids.has(l.vehicleId))).filter(pass);
  const offers = byNewest(d.offers.filter((o) => o.companyId === company.id));
  return (
    <div className="page-pad"><div className="page-head"><h2>{t("nav.history")}</h2></div>{toolbar}
      <Card title={t("hist.jobs")}><Table size="middle" rowKey="loadId" dataSource={jobs} pagination={{ pageSize: 10, hideOnSinglePage: true }}
        columns={[...loadCols, { title: t("hist.vehicle"), dataIndex: "vehicleId" }, { title: t("dash.earnings"), align: "right" as const, render: (_: unknown, l: LoadVM) => (l.quote === null ? "—" : money(l.quote * (1 - take))) }]} /></Card>
      <Card title={t("hist.offers")} style={{ marginTop: 20 }}><Table size="middle" rowKey="offerId" dataSource={offers} pagination={{ pageSize: 10, hideOnSinglePage: true }}
        columns={[{ title: t("hist.load"), dataIndex: "loadId", render: (v: string) => <b>{v}</b> }, { title: t("hist.lane"), dataIndex: "lane" }, { title: t("driver.earnings"), align: "right" as const, render: (_: unknown, o: OfferVM) => money(o.earningsEstimate) },
          { title: t("hist.status"), render: (_: unknown, o: OfferVM) => <Tag>{t(`offerStatus.${o.status}`)}</Tag> }]} /></Card>
    </div>
  );
}
