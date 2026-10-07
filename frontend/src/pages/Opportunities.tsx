import { Alert, Button, Empty, Tag } from "antd";
import { useTranslation } from "react-i18next";
import type { CarrierDay, SimJob } from "../lib/sim";
import { TempBadge, hhmm, money } from "../components/common";
import { placeName } from "../data/places";
import type { OfferVM, TempClass } from "../api/types";

// What the platform found for the carrier's spare capacity (Opportunity). Money first: what the job adds to the carrier's pocket, then what it costs
// (the detour) and what it does to the carrier's own deliveries. The carrier decides; nothing is taken for it.
export function OpportunityCard({ j, active, onPick, onTake, onDecline, toleranceMin }: { j: SimJob; active: boolean; onPick: () => void; onTake: () => void; onDecline: () => void; toleranceMin: number }) {
  const { t } = useTranslation();
  const delay = j.delay_max_min ?? 0, negative = j.net_incremental < 0;
  return (
    <div className={`job-card${active ? " active" : ""}`} onClick={onPick}>
      <div className="job-top">
        <div><div className="job-route">{placeName(j.origin)} <span>→</span> {placeName(j.destination)}</div><div className="muted">{j.load_id} · {j.pallets} {t("unit.pallets")} · {t("opp.pickupAt", { time: hhmm(j.pickup_min) })}</div></div>
        <div style={{ textAlign: "right" }}><div className="muted">{t("opp.youEarn")}</div><b className="opp-net" style={{ color: negative ? "#DC2626" : "#16A34A" }}>{money(j.net_incremental)}</b></div>
      </div>
      <div className="muted opp-math">{t("opp.math", { pay: money(j.payout), cost: money(j.marginal_cost) })}</div>
      <div className="job-chips">
        {j.temp_class && <TempBadge temp={j.temp_class as TempClass} />}
        {j.detour_km !== undefined && <Tag>{t("opp.detour", { km: Math.round(j.detour_km), min: j.detour_min ?? 0 })}</Tag>}
        {delay === 0 ? <Tag color="green">✓ {t("opp.noDelay")}</Tag> : <Tag color="orange">{t("opp.delay", { min: delay, limit: toleranceMin })}</Tag>}
        {negative ? <Tag color="red">{t("opp.notRecommended")}</Tag> : <Tag color="green">{t("opp.recommended")}</Tag>}
      </div>
      <div className="job-actions" style={{ display: "flex", gap: 8 }}>
        <Button type="primary" size="large" style={{ flex: 1 }} onClick={(e) => { e.stopPropagation(); onTake(); }}>{t("opp.take")} · {money(j.net_incremental)}</Button>
        <Button size="large" onClick={(e) => { e.stopPropagation(); onDecline(); }}>{t("opp.decline")}</Button>
      </div>
    </div>
  );
}

export function OpportunitiesTab({ cd, online, pick, setPick, onTake, onDecline, toleranceMin, dayLabel, live, replay, liveServer, nowMin, onFastForward }: {
  cd: CarrierDay | null; online: boolean; pick: string | null; setPick: (id: string) => void; onTake: (j: SimJob) => void; onDecline: (j: SimJob) => void; toleranceMin: number; dayLabel: string;
  live: boolean; replay: boolean; liveServer: boolean; nowMin: number | null; onFastForward: () => void;
}) {
  const { t } = useTranslation();
  if (!online) return <Alert type="info" showIcon message={t("opp.offline")} />;
  if (!cd) return <Empty description={t("sim.loading")} />;
  return (
    <div>
      {replay && (liveServer ? <Alert type="warning" showIcon style={{ marginBottom: 8 }} message={t("opp.replayNote")} /> : <Alert type="info" showIcon style={{ marginBottom: 8 }} message={t("opp.replayStatic")} />)}
      {live && nowMin !== null
        ? <div className="muted" style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}><span>{t("opp.liveIntro", { time: hhmm(nowMin) })}</span><Button size="small" onClick={onFastForward}>{t("opp.ffwd")}</Button></div>
        : <div className="muted" style={{ marginBottom: 8 }}>{t("opp.intro", { day: dayLabel })}</div>}
      {cd.pending.length === 0 ? <Empty description={t("opp.waiting")} /> : [...cd.pending].reverse().map((j) => (
        <OpportunityCard key={j.load_id} j={j} active={pick === j.load_id} onPick={() => setPick(j.load_id)} onTake={() => onTake(j)} onDecline={() => onDecline(j)} toleranceMin={toleranceMin} />
      ))}
      {cd.taken.length > 0 && <div className="sect">{t("opp.taken", { n: cd.taken.length })}</div>}
      {[...cd.taken].reverse().map((j) => (
        <div key={j.load_id} className="shipment" onClick={() => setPick(j.load_id)}>
          <div className="shipment-top"><b>{j.load_id}</b><Tag color={cd.done.some((d) => d.load_id === j.load_id) ? "green" : "blue"}>{cd.done.some((d) => d.load_id === j.load_id) ? t("opp.delivered") : t("opp.onTheRoad")}</Tag></div>
          <div className="shipment-route">{placeName(j.origin)} <span>→</span> {placeName(j.destination)}</div>
          <div className="muted">{j.pallets} {t("unit.pallets")} · {hhmm(j.pickup_min)}–{hhmm(j.drop_min)} · {t("opp.netShort", { v: money(j.net_incremental) })}</div>
        </div>
      ))}
      {cd.declinedCount > 0 && <div className="muted" style={{ marginTop: 10 }}>{t("opp.declinedN", { n: cd.declinedCount })}</div>}
    </div>
  );
}

// The headline of the carrier page: what sharing has earned today (realised, no assumptions) and, separately and labelled, the estimate for the month.
export function EarningsCard({ realised, delivered, onRoad, pending, estimate, trucksOpen, trucks }: { realised: number; delivered: number; onRoad: number; pending: number; estimate: number | null; trucksOpen: number; trucks: number }) {
  const { t } = useTranslation();
  return (
    <div className="earn-card">
      <div className="muted">{t("earn.realised")}</div>
      <div className="earn-amount">{money(realised)}</div>
      <div className="earn-sub"><span>{t("earn.jobs", { done: delivered, road: onRoad })}</span>{pending > 0 && <span>{t("earn.waiting", { n: pending })}</span>}<span>{t("carrier.sharingCount", { n: trucksOpen, m: trucks })}</span></div>
      {estimate !== null && (
        <div className="earn-estimate" title={t("earn.estimateHow")}>
          <span>{t("earn.estimate")}</span><b>{money(estimate)}</b><span className="earn-tag">{t("earn.estimateTag")}</span>
        </div>
      )}
      <div className="earn-note">{t("earn.estimateHow")}</div>
    </div>
  );
}

// A load a shipper posted and the operator approved for this carrier: it arrives as a request to answer within a few minutes (the same offer the operator's approval created).
export function DirectRequests({ offers, onAnswer, busy }: { offers: OfferVM[]; onAnswer: (o: OfferVM, response: "ACCEPT" | "DECLINE") => void; busy: boolean }) {
  const { t } = useTranslation();
  if (offers.length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="sect">{t("direct.title", { n: offers.length })}</div>
      {offers.map((o) => (
        <div key={o.offerId} className="job-card">
          <div className="job-top">
            <div><div className="job-route">{placeName(o.originId)} <span>→</span> {placeName(o.destinationId)}</div><div className="muted">{o.loadId} · {o.pallets} {t("unit.pallets")} · {t("direct.expires", { s: o.expiresInSec })}</div></div>
            <div style={{ textAlign: "right" }}><div className="muted">{t("opp.youEarn")}</div><b className="opp-net" style={{ color: "#16A34A" }}>{money(o.earningsEstimate)}</b></div>
          </div>
          <div className="job-chips"><TempBadge temp={o.tempClass} /><Tag>{t("opp.detour", { km: Math.round(o.detourKm), min: o.extraMin })}</Tag>{o.isBackhaul && <Tag color="green">{t("direct.backhaul")}</Tag>}</div>
          <div className="job-actions" style={{ display: "flex", gap: 8 }}>
            <Button type="primary" size="large" style={{ flex: 1 }} loading={busy} onClick={() => onAnswer(o, "ACCEPT")}>{t("opp.take")} · {money(o.earningsEstimate)}</Button>
            <Button size="large" disabled={busy} onClick={() => onAnswer(o, "DECLINE")}>{t("opp.decline")}</Button>
          </div>
        </div>
      ))}
    </div>
  );
}
