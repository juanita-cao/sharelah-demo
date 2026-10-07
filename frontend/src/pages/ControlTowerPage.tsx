import { Alert, App, Button, Card, Drawer, Empty, Modal, Progress, Segmented, Switch, Table, Tag } from "antd";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ApplyResult, ApprovalPreviewVM, OptionRowVM, PlanDiffVM, Profile } from "../api/types";
import { useApi } from "../app/contexts";
import { useApiMutation, useOptionsQuery, useStateQuery } from "../app/hooks";
import { HazardBadge, KpiStrip, SectionTitle, TempBadge, ageText, hhmm, money, signed } from "../components/common";
import { placeName } from "../data/places";
const LiveMap = lazy(() => import("../components/LiveMap"));   // the map library loads only here

const PROFILES: Profile[] = ["PROFIT", "BALANCED", "GREEN"];
const isApply = (x: ApprovalPreviewVM | ApplyResult): x is ApplyResult => "status" in x;

function ImpactTable({ before, after }: { before: PlanDiffVM["before"]; after: PlanDiffVM["after"] }) {
  const { t } = useTranslation();
  const rows = [["kpi.surplus", before.modeledSurplus, after.modeledSurplus, "$"], ["kpi.cost", before.operatingCost, after.operatingCost, "$"], ["kpi.emptyKm", before.emptyKm, after.emptyKm, "km"], ["kpi.co2", before.co2Kg, after.co2Kg, "kg"], ["kpi.unserved", before.unserved, after.unserved, ""]] as const;
  const f = (v: number, u: string) => (u === "$" ? money(v) : `${Math.round(v)}${u ? ` ${u}` : ""}`);
  return <table className="impact-table"><thead><tr><th /><th>{t("reopt.before")}</th><th>{t("reopt.after")}</th><th>Δ</th></tr></thead><tbody>
    {rows.map(([k, b, a, u]) => <tr key={k}><td>{t(k)}</td><td>{f(b, u)}</td><td>{f(a, u)}</td><td>{signed(a - b)}</td></tr>)}</tbody></table>;
}

export function ControlTowerPage() {
  const { t } = useTranslation();
  const api = useApi();
  const { message } = App.useApp();
  const state = useStateQuery();
  const [profile, setProfile] = useState<Profile>("BALANCED");
  const [selected, setSelected] = useState<string | null>(null);
  const queue = state.data?.queue ?? [];
  const current = queue.find((l) => l.loadId === selected) ?? queue[0] ?? null;
  useEffect(() => { if (selected && !queue.some((l) => l.loadId === selected)) setSelected(null); }, [queue, selected]);
  const options = useOptionsQuery(current?.loadId ?? null, profile);
  const [why, setWhy] = useState<OptionRowVM | null>(null);
  const [preview, setPreview] = useState<ApprovalPreviewVM | null>(null);
  const epoch = state.data?.epoch ?? 0;

  const doPreview = useApiMutation((o: OptionRowVM) => api.approve(current!.loadId, { optionId: o.optionId, epoch, expectedVersion: options.data?.loadVersion ?? 1, mode: "preview" }), []);
  const doApply = useApiMutation((p: ApprovalPreviewVM) => api.approve(p.loadId, { optionId: p.option.optionId, epoch, expectedVersion: options.data?.loadVersion ?? 1, mode: "apply" }), ["state", "options"]);
  const urgent = useApiMutation(() => api.urgent());

  const approve = (o: OptionRowVM) => doPreview.mutate(o, { onSuccess: (r) => { if (!isApply(r)) setPreview(r); else void message.error(t(`apply.${r.status}`)); } });
  const confirm = () => preview && doApply.mutate(preview, { onSuccess: (r) => {
    if (isApply(r)) { setPreview(null); if (r.status === "APPLIED") void message.success(t("apply.APPLIED")); else void message.warning(t(`apply.${r.status}`)); }
  } });

  // ---- re-optimization job
  const [floor, setFloor] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const start = useApiMutation(() => api.optimizePreview({ profile, floor, epoch }), []);
  const job = useQuery({ queryKey: ["job", jobId], queryFn: () => api.job(jobId as string), enabled: jobId !== null, refetchInterval: (q) => (q.state.data?.status === "RUNNING" ? 700 : false) });
  const cancel = useApiMutation(() => api.cancelJob(jobId as string), ["job"]);
  const applyReopt = useApiMutation((candidateId: string) => api.optimizeApply({ candidateId, epoch }), ["state", "options"]);
  const status = job.data?.status;
  useEffect(() => { if (status && status !== "RUNNING") setReviewOpen(true); }, [status]);
  const running = start.isPending || status === "RUNNING";
  const runReopt = () => start.mutate(undefined, { onSuccess: (r) => { setJobId(r.jobId); setReviewOpen(false); } });
  const apply = () => job.data?.diff && applyReopt.mutate(job.data.diff.candidateId, { onSuccess: (r) => { setReviewOpen(false); setJobId(null); void (r.status === "APPLIED" ? message.success(t("apply.APPLIED")) : message.warning(t(`apply.${r.status}`))); } });

  const columns = [
    { title: "#", dataIndex: "rank", width: 48, render: (r: number, o: OptionRowVM) => (o.optionId === options.data?.recommendedId ? `★${r}` : r) },
    { title: t("opt.truck"), render: (_: unknown, o: OptionRowVM) => `${o.vehicleId} · ${o.carrierId}` },
    { title: t("opt.extraKm"), dataIndex: "extraKm", align: "right" as const }, { title: t("opt.extraCost"), dataIndex: "extraCost", align: "right" as const, render: (v: number) => money(v) },
    { title: "CO₂", dataIndex: "co2", align: "right" as const }, { title: t("opt.slack"), dataIndex: "slackMin", align: "right" as const, render: (v: number) => `${v} min` },
    { title: "", render: (_: unknown, o: OptionRowVM) => (o.isBackhaul ? <Tag color="cyan">{t("driver.backhaul")}</Tag> : null) },
    { title: "", render: (_: unknown, o: OptionRowVM) => <span className="row-actions"><a onClick={() => setWhy(o)}>{t("opt.why")}</a><Button size="small" type={o.optionId === options.data?.recommendedId ? "primary" : "default"} loading={doPreview.isPending} onClick={() => approve(o)}>{o.optionId === options.data?.recommendedId ? t("opt.approve") : t("opt.choose")}</Button></span> },
  ];

  return (
    <div>
      <div className="page-head"><h2>{t("nav.controlTower")}</h2><span className="muted">{t("ct.scope")}</span></div>
      {state.data && <KpiStrip kpis={state.data.kpis} trend={state.data.kpiTrend} />}
      <div className="ct-grid">
        <Card size="small" title={`${t("ct.queue")} (${queue.length})`} extra={<Button size="small" danger loading={urgent.isPending} onClick={() => urgent.mutate(undefined, { onSuccess: () => void message.warning(t("ct.urgentInjected")) })}>{t("ct.inject")}</Button>}>
          {queue.length === 0 && <Empty description={t("ct.queueEmpty")} />}
          {queue.map((l) => <div key={l.loadId} className={`queue-row${current?.loadId === l.loadId ? " active" : ""}${l.urgent ? " urgent" : ""}`} onClick={() => setSelected(l.loadId)}>
            <div><b>{l.loadId}</b> {l.urgent && <Tag color="red">{t("ct.urgent")}</Tag>}<TempBadge temp={l.tempClass} /><HazardBadge hazard={l.hazardClass} /></div><div className="muted">{l.lane} · {l.pallets} {t("unit.pallets")} · {t("ct.age", { s: ageText(l.ageSec) })}</div></div>)}
          <div className="glance">
            <div className="detail-title">{t("ct.glance")}</div>
            <div className="glance-grid">
              {(["RECEIVED", "MATCHED", "CONFIRMED", "IN_TRANSIT", "DONE", "UNSERVED"] as const).map((k) => <div key={k} className="glance-cell"><b>{(state.data?.loads ?? []).filter((l) => l.status === k).length}</b><span>{t(`status.${k}`)}</span></div>)}
            </div>
            <div className="muted">{t("ct.fleetCount", { n: state.data?.vehicles.length ?? 0, c: new Set((state.data?.vehicles ?? []).map((v) => v.carrierId)).size })}</div>
          </div>
        </Card>
        <Card size="small" title={t("ct.map")}><div className="map-fill"><Suspense fallback={null}><LiveMap vehicles={state.data?.vehicles ?? []} selected={current} height="100%" /></Suspense></div></Card>
        <Card size="small" title={current ? t("ct.optionsFor", { id: current.loadId }) : t("ct.options")} extra={<Segmented size="small" value={profile} onChange={(v) => setProfile(v as Profile)} options={PROFILES.map((p) => ({ value: p, label: t(`profile.${p}`) }))} />}>
          {!current && <Empty description={t("ct.selectLoad")} />}
          {current && options.isLoading && <div className="muted">{t("loading")}</div>}
          {current && options.isError && <Alert type="error" showIcon message={t("error.loadFailed")} />}
          {options.data?.decision === "NO_FEASIBLE_OPTION" && <Alert type="warning" showIcon message={t("opt.none")} />}
          {options.data && options.data.rows.length > 0 && <Table size="small" rowKey="optionId" pagination={false} scroll={{ x: "max-content" }} columns={columns} dataSource={options.data.rows} rowClassName={(o) => (o.optionId === options.data.recommendedId ? "recommended" : "")} />}
          {options.data && options.data.excluded.length > 0 && <div className="excluded">{t("opt.excluded")}: {options.data.excluded.map((e) => <Tag key={e.vehicleId}>{e.vehicleId} ✕ {e.codes.map((c) => t(`exclude.${c}`)).join(", ")}</Tag>)}</div>}
          {current && (
            <div className="detail-block">
              <div className="detail-title">{t("ct.detail")}</div>
              <div className="detail-grid">
                <span>{t("field.from")}</span><b>{placeName(current.origin)}</b>
                <span>{t("field.to")}</span><b>{placeName(current.destination)}</b>
                <span>{t("field.pallets")}</span><b>{current.pallets} {t("unit.pallets")} · {current.weightKg} kg</b>
                <span>{t("field.temp")}</span><b><TempBadge temp={current.tempClass} /><HazardBadge hazard={current.hazardClass} /></b>
                <span>{t("ship.when")}</span><b>{hhmm(current.pickupFromMin)} – {hhmm(current.deliverByMin)}</b>
              </div>
              {options.data && options.data.reasons.length > 0 && <>
                <div className="detail-title">{t("ct.whyTop")}</div>
                {options.data.reasons.map((r) => <div key={r.code} className="reason">✓ {t(`reason.${r.code}`, r.params as Record<string, string | number>)}</div>)}
              </>}
            </div>
          )}
        </Card>
      </div>
      <Card size="small" className="reopt-bar">
        <div className="reopt-row">
          <Button type="primary" loading={running} onClick={runReopt}>{t("reopt.run")}</Button>
          <span>{t("reopt.floor")} <Switch checked={floor} onChange={setFloor} /></span>
          {status === "RUNNING" && <><Progress percent={Math.round((job.data?.progress ?? 0) * 100)} style={{ width: 200 }} size="small" /><Button size="small" onClick={() => cancel.mutate()}>{t("reopt.cancel")}</Button></>}
          {status && status !== "RUNNING" && <a onClick={() => setReviewOpen(true)}>{t(`job.${status}`)}</a>}
          <span className="muted">{t("reopt.state")}: {status ? t(`job.${status}`) : t("reopt.idle")}</span>
        </div>
      </Card>

      <Drawer open={why !== null} onClose={() => setWhy(null)} title={why ? t("why.title", { id: why.vehicleId }) : ""} width={420}>
        {why && why.optionId === options.data?.recommendedId && options.data.reasons.map((r) => <div key={r.code} className="reason">✓ {t(`reason.${r.code}`, r.params as Record<string, string | number>)}</div>)}
        {why && why.optionId !== options.data?.recommendedId && <div className="reason">{t("why.notBest", { rank: why.rank })}</div>}
        {options.data?.excluded.map((e) => <div key={e.vehicleId} className="reason excluded-reason">✕ {e.vehicleId}: {e.codes.map((c) => t(`exclude.${c}`)).join(", ")}</div>)}
      </Drawer>

      <Modal open={preview !== null} onCancel={() => setPreview(null)} title={t("approve.title")} onOk={confirm} okText={t("approve.confirm")} cancelText={t("approve.cancel")} confirmLoading={doApply.isPending}>
        {preview && <div><p>{preview.loadId} → {preview.option.vehicleId} ({preview.option.carrierId}) · {t("opt.extraCost")} {money(preview.option.extraCost)} · {t("approve.quote")} {money(preview.option.quote)}</p><ImpactTable before={preview.before} after={preview.after} /><p className="muted">{t("approve.note")}</p></div>}
      </Modal>

      <Modal open={reviewOpen && !!status && status !== "RUNNING"} onCancel={() => setReviewOpen(false)} title={t("reopt.reviewTitle")} width={680}
        footer={status === "COMPLETE" || status === "TIME_LIMIT" ? [<Button key="d" onClick={() => { setReviewOpen(false); setJobId(null); }}>{t("reopt.discard")}</Button>, <Button key="a" type="primary" loading={applyReopt.isPending} onClick={apply}>{t("reopt.apply")}</Button>] : [<Button key="c" onClick={() => setReviewOpen(false)}>{t("approve.cancel")}</Button>]}>
        {status === "FLOOR_INFEASIBLE" && <Alert type="warning" showIcon message={t("reopt.floorInfeasible", { carriers: job.data?.blockingCarriers.join(", ") })} />}
        {(status === "VERIFICATION_REJECTED" || status === "NO_SOLUTION" || status === "ERROR" || status === "CANCELLED") && <Alert type="error" showIcon message={t(`job.${status}`)} />}
        {job.data?.diff && <div><ImpactTable before={job.data.diff.before} after={job.data.diff.after} />
          <SectionTitle>{t("reopt.changes", { n: job.data.diff.changes.length, locked: job.data.diff.lockedKept })}</SectionTitle>
          {job.data.diff.changes.map((c) => <div key={c.loadId} className="change-row"><b>{c.loadId}</b> {c.fromVehicle ?? t("reopt.new")} → {c.toVehicle} <span className={c.deltaCost <= 0 ? "good" : "bad"}>{signed(c.deltaCost)}</span> {c.reasons.map((r) => <Tag key={r}>{t(`reason.${r}`)}</Tag>)}</div>)}</div>}
      </Modal>
    </div>
  );
}
