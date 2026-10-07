import { EnvironmentFilled, EnvironmentOutlined } from "@ant-design/icons";
import { Alert, App, Button, Empty, Form, InputNumber, Segmented, Select, Steps, Tag, TimePicker } from "antd";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { lazy, Suspense, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CargoFlag, HazardClass, LoadVM, TempClass } from "../api/types";
import { useApi, useSession } from "../app/contexts";
import { useApiMutation, useStateQuery } from "../app/hooks";
import { useAnnouncer } from "../app/useAnnouncer";
import { Chips, MultiChips, Stepper } from "../components/inputs";
import { HazardBadge, TempBadge, hhmm, money } from "../components/common";
import { COMPANIES } from "../data/companies";
import { PLACES, placeName } from "../data/places";

const RoleMap = lazy(() => import("../components/RoleMap"));   // the map library loads only when this page is opened
const TEMPS: { value: TempClass; dot: string }[] = [{ value: "AMB", dot: "#9CA3AF" }, { value: "COOL", dot: "#22D3EE" }, { value: "CHILL", dot: "#3B82F6" }, { value: "PHARMA", dot: "#A855F7" }, { value: "FROZEN", dot: "#6366F1" }];
const HAZARDS: HazardClass[] = ["CL3", "CL5_1", "CL6_1", "CL8"];
const STEP_OF: Record<LoadVM["status"], number> = { RECEIVED: 0, MATCHED: 1, CONFIRMED: 2, IN_TRANSIT: 3, DONE: 4, UNSERVED: 0 };
const toMin = (d: Dayjs) => d.hour() * 60 + d.minute();
const dur = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min` : `${min} min`);

interface FormValues { exclusive?: boolean; origin?: string; destination?: string; pallets: number; weightKg: number; tempClass: TempClass; hazardClass?: HazardClass; flags: CargoFlag[]; pickup: Dayjs; deliver: Dayjs }

// Consumer-style booking: the map is the hero; the left panel is "where to, what, when, how much" and then "my shipments".
export function ShipperHome() {
  const { t } = useTranslation();
  const api = useApi();
  const { message } = App.useApp();
  const { company } = useSession();
  const state = useStateQuery();
  const [tab, setTab] = useState<"SEND" | "SHIPMENTS">("SEND");
  const [pick, setPick] = useState<string | null>(null);
  const [form] = Form.useForm<FormValues>();
  const v = Form.useWatch([], form) as FormValues | undefined;

  const ready = !!v?.origin && !!v?.destination && v.origin !== v.destination;
  const est = useQuery({
    queryKey: ["estimate", v?.origin, v?.destination, v?.pallets, v?.tempClass, v?.hazardClass ?? null, v?.exclusive ?? false], enabled: ready, placeholderData: keepPreviousData,
    queryFn: () => api.quoteEstimate({ origin: v!.origin!, destination: v!.destination!, pallets: v!.pallets, tempClass: v!.tempClass, hazardClass: v!.hazardClass ?? null, exclusive: v?.exclusive ?? false }),
  });
  const { announce } = useAnnouncer();
  const post = useApiMutation((f: FormValues) => api.postLoad({ exclusive: f.exclusive ?? false, companyId: company.id, origin: f.origin!, destination: f.destination!, pallets: f.pallets, weightKg: f.weightKg, tempClass: f.tempClass, hazardClass: f.hazardClass ?? null, flags: f.flags ?? [], pickupFromMin: toMin(f.pickup), deliverByMin: toMin(f.deliver) }));

  const mine = useMemo(() => (state.data?.loads ?? []).filter((l) => l.companyId === company.id).sort((a, b) => b.loadId.localeCompare(a.loadId)), [state.data, company.id]);
  const shown = mine.find((l) => l.loadId === pick) ?? mine.find((l) => l.status !== "UNSERVED" && l.status !== "DONE") ?? mine[0] ?? null;
  const vehicle = shown?.vehicleId ? state.data?.vehicles.find((x) => x.vehicleId === shown.vehicleId) : undefined;
  const carrier = vehicle ? COMPANIES.find((c) => c.id === vehicle.carrierId) : undefined;
  const placeOptions = PLACES.map((p) => ({ value: p.id, label: `${p.name} (${p.country})` }));
  const windowMin = v?.pickup && v?.deliver ? toMin(v.deliver) - toMin(v.pickup) : null;
  const tight = est.data && windowMin !== null && windowMin < est.data.driveMin + 30;

  const submit = (f: FormValues) => post.mutate(f, { onSuccess: (r) => { announce("sent", r.loadId, t("alert.sentTitle"), t("alert.sentText", { id: r.loadId })); setPick(r.loadId); setTab("SHIPMENTS"); }, onError: () => void message.error(t("error.generic")) });
  const mapPlaces = tab === "SEND" ? (ready ? { origin: v!.origin!, destination: v!.destination! } : null) : shown ? { origin: shown.origin, destination: shown.destination } : null;

  return (
    <div className="ship-layout">
      <div className="ship-left">
        <Segmented block className="ship-tabs" value={tab} onChange={(x) => setTab(x as "SEND" | "SHIPMENTS")} options={[{ value: "SEND", label: t("ship.tab.send") }, { value: "SHIPMENTS", label: `${t("ship.tab.shipments")} (${mine.length})` }]} />
        {tab === "SEND" ? (
          <Form form={form} layout="vertical" onFinish={submit} requiredMark={false}
            initialValues={{ exclusive: false, pallets: 3, weightKg: 800, tempClass: "CHILL", flags: [], pickup: dayjs().hour(10).minute(0), deliver: dayjs().hour(18).minute(0) }}>
            <div className="route-box">
              <div className="route-line"><EnvironmentFilled className="pin from" /><i /><EnvironmentOutlined className="pin to" /></div>
              <div className="route-fields">
                <Form.Item name="origin" rules={[{ required: true, message: t("ship.needPickup") }]}><Select size="large" variant="filled" showSearch optionFilterProp="label" placeholder={t("ship.pickupPh")} options={placeOptions} /></Form.Item>
                <Form.Item name="destination" dependencies={["origin"]} rules={[{ required: true, message: t("ship.needDropoff") }, ({ getFieldValue }) => ({ validator: (_, x) => (x && x === getFieldValue("origin") ? Promise.reject(new Error(t("field.sameOD"))) : Promise.resolve()) })]}><Select size="large" variant="filled" showSearch optionFilterProp="label" placeholder={t("ship.dropoffPh")} options={placeOptions} /></Form.Item>
              </div>
            </div>
            <div className="sect">{t("ship.truckChoice")}</div>
            <Form.Item name="exclusive" style={{ marginBottom: 8 }}>
              <TruckChoice sharedLabel={t("ship.shared")} sharedNote={t("ship.sharedNote")} dedicatedLabel={t("ship.dedicated")} dedicatedNote={t("ship.dedicatedNote")} />
            </Form.Item>
            <div className="sect">{t("ship.cargo")}</div>
            <div className="cargo-row">
              <Form.Item name="pallets" label={t("field.pallets")}><Stepper /></Form.Item>
              <Form.Item name="weightKg" label={t("field.weight")} rules={[{ required: true, type: "number", min: 1, max: 24000 }]}><InputNumber size="large" min={1} max={24000} suffix="kg" style={{ width: "100%" }} /></Form.Item>
            </div>
            <Form.Item name="tempClass" label={t("field.temp")}><Chips<TempClass> options={TEMPS.map((x) => ({ value: x.value, dot: x.dot, label: t(`temp.${x.value}`) }))} /></Form.Item>
            <Form.Item name="hazardClass" label={t("field.hazard")}><Select size="large" variant="filled" allowClear placeholder={t("field.none")} options={HAZARDS.map((x) => ({ value: x, label: `${x.replace("_", ".")} · ${t(`hazard.${x}`)}` }))} /></Form.Item>
            <Form.Item name="flags" label={t("ship.special")}><MultiChips<CargoFlag> options={[{ value: "FOOD", label: t("flag.FOOD") }, { value: "HALAL", label: t("flag.HALAL") }, { value: "NON_HALAL", label: t("flag.NON_HALAL") }]} /></Form.Item>
            <div className="sect">{t("ship.when")}</div>
            <div className="cargo-row">
              <Form.Item name="pickup" label={t("ship.pickupFrom")}><TimePicker size="large" variant="filled" format="HH:mm" minuteStep={15} allowClear={false} style={{ width: "100%" }} /></Form.Item>
              <Form.Item name="deliver" label={t("ship.deliverBy")} dependencies={["pickup"]} rules={[({ getFieldValue }) => ({ validator: (_, x: Dayjs) => (x && getFieldValue("pickup") && toMin(x) <= toMin(getFieldValue("pickup")) ? Promise.reject(new Error(t("field.windowOrder"))) : Promise.resolve()) })]}><TimePicker size="large" variant="filled" format="HH:mm" minuteStep={15} allowClear={false} style={{ width: "100%" }} /></Form.Item>
            </div>
            {est.data && ready && (
              <div className="price-card">
                <div className="price-head"><span>{t("ship.estimate")}</span><b>{money(est.data.price)}</b></div>
                <div className="muted">{t("ship.distance", { km: est.data.distanceKm, time: dur(est.data.driveMin) })}</div>
                <div className="price-lines">{est.data.lines.map((l) => <span key={l.code}>{t(`ship.line.${l.code}`)} <b>{money(l.amount)}</b></span>)}</div>
                {est.data.exclusive && <div className="muted" style={{ marginTop: 4 }}>{t("ship.dedicatedDiff", { shared: money(est.data.sharedPrice), extra: money(est.data.price - est.data.sharedPrice) })}</div>}
                {tight ? <Alert type="warning" showIcon style={{ marginTop: 8 }} message={t("ship.windowTooShort", { time: dur(est.data.driveMin) })} /> : windowMin !== null && <div className="ok-note">{t("ship.windowOk", { time: dur(est.data.driveMin) })}</div>}
                <div className="muted" style={{ marginTop: 6 }}>{t("ship.estimateNote")}</div>
              </div>
            )}
            <Button type="primary" htmlType="submit" size="large" block className="cta" loading={post.isPending}>{est.data && ready ? t("ship.ctaPrice", { price: Math.round(est.data.price) }) : t("ship.cta")}</Button>
          </Form>
        ) : (
          <div>
            {state.isError && <Alert type="error" showIcon message={t("error.loadFailed")} />}
            {mine.length === 0 && <Empty description={t("ship.empty")} />}
            {mine.map((l) => (
              <div key={l.loadId} className={`shipment${shown?.loadId === l.loadId ? " active" : ""}`} onClick={() => setPick(l.loadId)}>
                <div className="shipment-top"><b>{l.loadId}</b><span>{l.exclusive && <Tag color="purple">{t("ship.dedicated")}</Tag>}<Tag color={l.status === "DONE" ? "green" : l.status === "UNSERVED" ? "red" : "orange"}>{t(`status.${l.status}`)}</Tag></span></div>
                <div className="shipment-route">{placeName(l.origin)} <span>→</span> {placeName(l.destination)}</div>
                <div className="muted">{l.pallets} {t("unit.pallets")} · <TempBadge temp={l.tempClass} /><HazardBadge hazard={l.hazardClass} /> {l.quote !== null ? `· ${money(l.quote)}` : `· ${t("shipper.noQuote")}`}{l.etaMin !== null ? ` · ${t("shipper.eta")} ${hhmm(l.etaMin)}` : ""}</div>
                {shown?.loadId === l.loadId && (l.status === "UNSERVED"
                  ? <Alert type="warning" showIcon style={{ marginTop: 10 }} message={t(`reason.${l.reasonCode ?? "NO_FEASIBLE_VEHICLE"}`)} />
                  : <>
                    <Steps className="ship-steps" progressDot size="small" current={STEP_OF[l.status]} items={[{ title: t("status.RECEIVED") }, { title: t("status.MATCHED") }, { title: t("status.CONFIRMED") }, { title: t("status.IN_TRANSIT") }, { title: t("status.DONE") }]} />
                    {vehicle && <div className="truck-card"><b>{vehicle.vehicleId}</b> · {vehicle.type} · {carrier?.name ?? vehicle.carrierId}</div>}
                  </>)}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="ship-map">
        <Suspense fallback={null}><RoleMap highlightPlaces={mapPlaces} height="100%" /></Suspense>
        <div className="map-note">{t("map.shipperNote")}</div>
      </div>
    </div>
  );
}

// The two ways to book a truck (dedicated truck): a shared truck (default) or a dedicated one ("only your cargo is on the truck from pickup to delivery").
function TruckChoice({ value = false, onChange, sharedLabel, sharedNote, dedicatedLabel, dedicatedNote }: { value?: boolean; onChange?: (v: boolean) => void; sharedLabel: string; sharedNote: string; dedicatedLabel: string; dedicatedNote: string }) {
  const card = (on: boolean, label: string, note: string) => (
    <button type="button" role="radio" aria-checked={value === on} className={`mode-card${value === on ? " on" : ""}`} onClick={() => onChange?.(on)}><b>{label}</b><span>{note}</span></button>
  );
  return <div className="mode-cards" role="radiogroup">{card(false, sharedLabel, sharedNote)}{card(true, dedicatedLabel, dedicatedNote)}</div>;
}

