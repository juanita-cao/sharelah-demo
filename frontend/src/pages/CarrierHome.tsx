import { Alert, App, Button, Empty, Form, Input, InputNumber, Segmented, Select, Switch, Tag, TimePicker } from "antd";
import { useQuery } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CargoFlag, LoadVM, OfferVM, TempClass } from "../api/types";
import { useApi, useSession } from "../app/contexts";
import { useApiMutation, useSimNow, useStateQuery } from "../app/hooks";
import { TempBadge, money } from "../components/common";
import { Chips, Stepper } from "../components/inputs";
import { PLACES, placeName } from "../data/places";
import { LIVE_SERVER } from "../config/live";
import { carrierDay, fromSession, loadSimulation, type SimJob } from "../lib/sim";
import { DirectRequests, EarningsCard, OpportunitiesTab } from "./Opportunities";
import { ShareCapacity } from "./ShareCapacity";

const RoleMap = lazy(() => import("../components/RoleMap"));   // the map library loads only when this page is opened
const DAY_SHOWN = 14;            // the recorded day the carrier's demo day replays (day 15 of the simulated month)
const TOLERANCE_MIN = 15;        // the carrier's own-delivery tolerance of the demo 
const TEMPS: { value: TempClass; dot: string }[] = [{ value: "AMB", dot: "#9CA3AF" }, { value: "COOL", dot: "#22D3EE" }, { value: "CHILL", dot: "#3B82F6" }, { value: "PHARMA", dot: "#A855F7" }, { value: "FROZEN", dot: "#6366F1" }];
const toMin = (d: Dayjs) => d.hour() * 60 + d.minute();

interface ReferValues { customer: string; origin: string; destination: string; pallets: number; weightKg: number; tempClass: TempClass; pickup: Dayjs; deliver: Dayjs }
type Tab = "OPPS" | "SHARING" | "REFER" | "JOBS";

// Driver-app style: you are online, offers arrive as big cards with the money first; you decide which trucks go into the shared pool and you can send in
// loads you cannot serve yourself (you earn the referral when another carrier serves them).
export function CarrierHome() {
  const { t } = useTranslation();
  const api = useApi();
  const { message } = App.useApp();
  const { company } = useSession();
  const state = useStateQuery();
  const price = useQuery({ queryKey: ["price"], queryFn: api.priceTable });
  const [tab, setTab] = useState<Tab>("OPPS");
  const [online, setOnline] = useState(true);
  const [pick, setPick] = useState<string | null>(null);
  const d = state.data;
  const takeRate = (price.data?.takeRate ?? 0.1) + (price.data?.referralRate ?? 0);
  const referralRate = price.data?.referralRate ?? 0;
  const fleet = (d?.vehicles ?? []).filter((v) => v.carrierId === company.id);
  const ids = new Set(fleet.map((v) => v.vehicleId));
  const jobs = useMemo(() => (d?.loads ?? []).filter((l) => l.vehicleId && ids.has(l.vehicleId) && ["CONFIRMED", "IN_TRANSIT", "DONE"].includes(l.status)).sort((a, b) => b.loadId.localeCompare(a.loadId)), [d, fleet.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const referred = useMemo(() => (d?.loads ?? []).filter((l) => l.homeCarrierId === company.id).sort((a, b) => b.loadId.localeCompare(a.loadId)), [d, company.id]);
  const sharedTrucks = fleet.filter((v) => v.shared);
  // Opportunities and the realised money. With the demo server running they come from a LIVE session: the platform shows opportunities hour by hour and the carrier's answer is
  // applied by the backend (E7 / E8). Without the server the page replays the recorded day and keeps the answers on the screen only (a banner says so).
  const sim = useQuery({ queryKey: ["simulation"], queryFn: () => loadSimulation(), staleTime: Infinity, retry: false });
  const [started, setStarted] = useState(false), [liveFailed, setLiveFailed] = useState(false);
  useEffect(() => { setStarted(false); setLiveFailed(!LIVE_SERVER); if (!LIVE_SERVER) return; api.sessionStart({ carrier: company.id }).then(() => setStarted(true)).catch(() => setLiveFailed(true)); }, [company.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  const liveQ = useQuery({ queryKey: ["session", company.id], enabled: started && !liveFailed, queryFn: () => api.sessionOpportunities(company.id), refetchInterval: 2000, retry: false });
  const live = started && !liveFailed && !liveQ.isError;
  const liveCd = useMemo(() => (liveQ.data && live ? fromSession(liveQ.data) : null), [liveQ.data, live]);
  const replay = !live && (liveFailed || liveQ.isError);
  const now = useSimNow();
  const [taken, setTaken] = useState<Set<string>>(new Set()), [declined, setDeclined] = useState<Set<string>>(new Set());
  const dayIndex = sim.data ? Math.min(DAY_SHOWN, sim.data.days.length - 1) : 0;
  const simDay = sim.data?.days[dayIndex];
  const replayCd = useMemo(() => (replay && simDay && now !== null ? carrierDay(simDay, company.id, now, taken, declined) : null), [replay, simDay, now, company.id, taken, declined]);
  const cd = liveCd ?? replayCd;
  const estimate = sim.data?.totals.per_carrier[company.id]?.delta_contribution ?? null;
  const shown = cd ? cd.arrived.find((j) => j.load_id === pick) ?? cd.pending[cd.pending.length - 1] ?? null : null;
  const capacityOffers = useMemo(() => (d?.capacityOffers ?? []).filter((o) => o.companyId === company.id), [d, company.id]);
  const placeOptions = PLACES.map((p) => ({ value: p.id, label: `${p.name} (${p.country})` }));

  const refer = useApiMutation((f: ReferValues) => api.postLoad({ companyId: company.id, homeCarrierId: company.id, customer: f.customer, origin: f.origin, destination: f.destination, pallets: f.pallets, weightKg: f.weightKg, tempClass: f.tempClass, hazardClass: null, flags: [] as CargoFlag[], pickupFromMin: toMin(f.pickup), deliverByMin: toMin(f.deliver) }));
  const answer = (j: SimJob, response: "ACCEPT" | "DECLINE") => {
    if (!live || !j.opportunity_id) {                                          // replay: the answer stays on this page
      if (response === "ACCEPT") { setTaken((x) => new Set(x).add(j.load_id)); void message.success(t("opp.taken1")); } else { setDeclined((x) => new Set(x).add(j.load_id)); void message.info(t("opp.declined1")); }
      return;
    }
    api.sessionRespond(j.opportunity_id, company.id, response).then((r) => {
      const s = r.result.status;
      if (s === "ACCEPTED") void message.success(t("opp.taken1"));
      else if (s === "DECLINED_RELEASED") void message.info(t("opp.declined1"));
      else if (s === "STALE_OFFER") void message.warning(t("opp.stale"));
      else if (s === "OFFER_EXPIRED") void message.info(t("opp.expired"));
      else if (s === "STALE_EPOCH") void message.info(t("opp.reset"));
      else void message.info(t(`opp.result.${s}`, { defaultValue: s }));
      void liveQ.refetch();
    }).catch(() => void message.error(t("error.generic")));
  };
  const direct = (d?.offers ?? []).filter((o) => o.companyId === company.id && o.status === "SHOWN");
  const reply = useApiMutation((v: { o: OfferVM; response: "ACCEPT" | "DECLINE" }) => api.respond(v.o.offerId, { response: v.response, expectedVersion: v.o.version, epoch: d?.epoch ?? 1 }).then((r) => ({ ...r, response: v.response })));
  const answerDirect = (o: OfferVM, response: "ACCEPT" | "DECLINE") => reply.mutate({ o, response }, { onSuccess: (r) => void (r.status === "ACCEPTED" ? message.success(t("opp.taken1")) : r.status === "DECLINED" ? message.info(t("opp.declined1")) : message.warning(t("direct.stale", { s: r.status }))) });
  const fastForward = () => { if (liveQ.data) void api.sessionAdvance(liveQ.data.now_min + 60).then(() => liveQ.refetch()); };

  return (
    <div className="ship-layout carrier">
      <div className="ship-left">
        <div className="driver-head">
          <div><div className="muted">{t("carrier.welcome")}</div><b className="driver-name">{company.name}</b></div>
          <label className="online-switch"><span className={online ? "on" : ""}>{online ? t("carrier.online") : t("carrier.offline")}</span><Switch checked={online} onChange={setOnline} /></label>
        </div>
        <EarningsCard realised={cd?.realised ?? 0} delivered={cd?.done.length ?? 0} onRoad={cd?.inProgress.length ?? 0} pending={cd?.pending.length ?? 0} estimate={estimate} trucksOpen={sharedTrucks.length} trucks={fleet.length} />
        <Segmented block className="ship-tabs" value={tab} onChange={(x) => setTab(x as Tab)}
          options={[{ value: "OPPS", label: `${t("carrier.tab.opportunities")}${(cd?.pending.length ?? 0) + direct.length ? ` (${(cd?.pending.length ?? 0) + direct.length})` : ""}` }, { value: "SHARING", label: t("carrier.tab.sharing") }, { value: "REFER", label: t("carrier.tab.refer") }, { value: "JOBS", label: t("carrier.tab.jobs") }]} />

        {tab === "OPPS" && <DirectRequests offers={direct} onAnswer={answerDirect} busy={reply.isPending} />}
        {tab === "OPPS" && <OpportunitiesTab cd={cd} online={online} pick={shown?.load_id ?? null} setPick={setPick} onTake={(j) => answer(j, "ACCEPT")} onDecline={(j) => answer(j, "DECLINE")} toleranceMin={TOLERANCE_MIN} dayLabel={t("sim.day", { d: dayIndex + 1 })} live={live} replay={replay} liveServer={LIVE_SERVER} nowMin={liveQ.data?.now_min ?? null} onFastForward={fastForward} />}

        {tab === "SHARING" && <ShareCapacity companyId={company.id} fleet={fleet} offers={capacityOffers} />}

        {tab === "REFER" && (
          <div>
            <Alert type={referralRate > 0 ? "success" : "warning"} showIcon style={{ marginBottom: 14 }} message={referralRate > 0 ? t("refer.rateOn", { pct: Math.round(referralRate * 100) }) : t("refer.rateOff")} />
            <Form layout="vertical" requiredMark={false} onFinish={(f: ReferValues) => refer.mutate(f, { onSuccess: () => void message.success(t("refer.sent")) })}
              initialValues={{ origin: "N-MY-KL", destination: "N-MY-IPOH", pallets: 6, weightKg: 1500, tempClass: "AMB", pickup: dayjs().hour(10).minute(0), deliver: dayjs().hour(18).minute(0) }}>
              <Form.Item name="customer" label={t("refer.customer")} rules={[{ required: true, message: t("refer.needCustomer") }]}><Input size="large" variant="filled" placeholder={t("refer.customerPh")} /></Form.Item>
              <div className="cargo-row">
                <Form.Item name="origin" label={t("field.from")}><Select size="large" variant="filled" showSearch optionFilterProp="label" options={placeOptions} /></Form.Item>
                <Form.Item name="destination" label={t("field.to")} dependencies={["origin"]} rules={[({ getFieldValue }) => ({ validator: (_, x) => (x && x === getFieldValue("origin") ? Promise.reject(new Error(t("field.sameOD"))) : Promise.resolve()) })]}><Select size="large" variant="filled" showSearch optionFilterProp="label" options={placeOptions} /></Form.Item>
                <Form.Item name="pallets" label={t("field.pallets")}><Stepper /></Form.Item>
                <Form.Item name="weightKg" label={t("field.weight")}><InputNumber size="large" min={1} max={24000} suffix="kg" style={{ width: "100%" }} /></Form.Item>
              </div>
              <Form.Item name="tempClass" label={t("field.temp")}><Chips<TempClass> options={TEMPS.map((x) => ({ value: x.value, dot: x.dot, label: t(`temp.${x.value}`) }))} /></Form.Item>
              <div className="cargo-row">
                <Form.Item name="pickup" label={t("ship.pickupFrom")}><TimePicker size="large" variant="filled" format="HH:mm" minuteStep={15} allowClear={false} style={{ width: "100%" }} /></Form.Item>
                <Form.Item name="deliver" label={t("ship.deliverBy")}><TimePicker size="large" variant="filled" format="HH:mm" minuteStep={15} allowClear={false} style={{ width: "100%" }} /></Form.Item>
              </div>
              <Button type="primary" htmlType="submit" size="large" block className="cta" loading={refer.isPending}>{t("refer.cta")}</Button>
            </Form>
            {referred.length > 0 && <div className="sect">{t("refer.mine")}</div>}
            {referred.map((l) => (
              <div key={l.loadId} className="shipment">
                <div className="shipment-top"><b>{l.loadId}</b><Tag color={l.status === "DONE" ? "green" : l.status === "UNSERVED" ? "red" : "orange"}>{t(`status.${l.status}`)}</Tag></div>
                <div className="shipment-route">{placeName(l.origin)} <span>→</span> {placeName(l.destination)}</div>
                <div className="muted">{l.customer} · {l.pallets} {t("unit.pallets")} · {l.vehicleId ? (ids.has(l.vehicleId) ? t("refer.servedByMe") : t("refer.servedByOther", { amount: money((l.quote ?? 0) * referralRate) })) : t("refer.waiting")}</div>
              </div>
            ))}
          </div>
        )}

        {tab === "JOBS" && (jobs.length === 0 ? <Empty description={t("carrier.noJobs")} /> : jobs.map((l: LoadVM) => (
          <div key={l.loadId} className="shipment">
            <div className="shipment-top"><b>{l.loadId}</b><Tag color={l.status === "DONE" ? "green" : "orange"}>{t(`status.${l.status}`)}</Tag></div>
            <div className="shipment-route">{placeName(l.origin)} <span>→</span> {placeName(l.destination)}</div>
            <div className="muted">{l.vehicleId} · {l.pallets} {t("unit.pallets")} · <TempBadge temp={l.tempClass} /> · {money((l.quote ?? 0) * (1 - takeRate))}</div>
          </div>
        )))}
      </div>
      <div className="ship-map">
        <Suspense fallback={null}><RoleMap highlightPlaces={shown ? { origin: shown.origin, destination: shown.destination } : null} height="100%" /></Suspense>
        <div className="map-note">{t("map.carrierNote")}</div>
      </div>
    </div>
  );
}
