import { App, Alert, Button, InputNumber, Select, Switch, Tag, TimePicker } from "antd";
import { useQuery } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CapacityOfferVM, OfferMode, VehicleVM } from "../api/types";
import { useApi } from "../app/contexts";
import { useApiMutation } from "../app/hooks";
import { hhmm } from "../components/common";
import { Stepper } from "../components/inputs";
import { PLACES, placeName } from "../data/places";

const toMin = (d: Dayjs) => d.hour() * 60 + d.minute();
const TOLERANCES = [0, 10, 15, 30];

// "Share spare capacity" ("Capacity input mode"): the carrier first says WHAT it has available, the whole truck or only part of it, and only then enters the
// values. The unit that is shared is the capacity offer; the switch on a truck is only a permission ("the platform may recommend opportunities for it").
export function ShareCapacity({ companyId, fleet, offers }: { companyId: string; fleet: VehicleVM[]; offers: CapacityOfferVM[] }) {
  const { t } = useTranslation();
  const api = useApi();
  const { message } = App.useApp();
  const [vehicleId, setVehicleId] = useState<string | null>(fleet.find((v) => v.shared)?.vehicleId ?? fleet[0]?.vehicleId ?? null);
  const [mode, setMode] = useState<OfferMode | null>(null);                        // the first thing the carrier decides
  const [from, setFrom] = useState<Dayjs>(dayjs().hour(8).minute(0)), [to, setTo] = useState<Dayjs>(dayjs().hour(18).minute(0));
  const [origin, setOrigin] = useState("N-MY-JB"), [destination, setDestination] = useState("N-SG-PPWC");
  const [pallets, setPallets] = useState(1), [kg, setKg] = useState(100);
  const [detourKm, setDetourKm] = useState(150), [detourMin, setDetourMin] = useState(300), [tolerance, setTolerance] = useState(15);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const vehicle = fleet.find((v) => v.vehicleId === vehicleId) ?? null;
  const fromMin = toMin(from), toMinute = toMin(to);
  const windowOk = toMinute > fromMin;
  const free = useQuery({ queryKey: ["freeSpace", vehicleId, fromMin, toMinute], enabled: !!vehicleId && windowOk, queryFn: () => api.freeSpace(vehicleId as string, fromMin, toMinute) });
  const f = free.data;
  const wholeFree = !!f && f.commitments === 0;

  // Whole truck is not available when the truck already has a job in the window: the choice falls back to the second one.
  useEffect(() => { if (mode === "WHOLE_TRUCK" && f && !wholeFree) setMode(null); }, [mode, f, wholeFree]);
  // The values of the second choice start at what is really free (the carrier may only lower them).
  useEffect(() => { if (mode === "PARTIAL" && f) { setPallets((p) => Math.min(Math.max(1, p), f.freePallets) || 1); setKg((k) => Math.min(Math.max(100, k), f.freeKg)); } }, [mode, f?.freePallets, f?.freeKg]);   // eslint-disable-line react-hooks/exhaustive-deps
  const choose = (m: OfferMode) => { setErrorCode(null); setMode(m); if (m === "PARTIAL" && f) { setPallets(f.freePallets); setKg(f.freeKg); } };

  const permission = useApiMutation((v: { id: string; on: boolean }) => api.setSharing(v.id, v.on));
  const post = useApiMutation((m: OfferMode) => api.postOffer({ companyId, vehicleId: vehicleId as string, from: origin, to: destination, fromMin, toMin: toMinute, mode: m, freePallets: m === "WHOLE_TRUCK" ? f?.capacityPallets ?? 1 : pallets,
    freeKg: m === "WHOLE_TRUCK" ? f?.capacityKg ?? 100 : kg, maxDetourKm: detourKm, maxDetourMin: detourMin, toleranceMin: tolerance }), ["state", "freeSpace"]);
  const withdraw = useApiMutation((id: string) => api.withdrawOffer(id));

  const submit = () => {
    if (!mode) return;
    setErrorCode(null);
    post.mutate(mode, {
      onSuccess: () => { void message.success(t("offer.posted")); setMode(null); },
      onError: (e) => { const code = (e as { response?: { data?: { code?: string } } }).response?.data?.code ?? "GENERIC"; setErrorCode(code); },
    });
  };

  const sameOD = origin === destination;
  const mine = useMemo(() => [...offers].sort((a, b) => b.offerId.localeCompare(a.offerId, undefined, { numeric: true })), [offers]);
  const placeOptions = PLACES.map((p) => ({ value: p.id, label: `${p.name} (${p.country})` }));

  return (
    <div className="share-capacity">
      <div className="sect">{t("offer.truck")}</div>
      {fleet.length === 0 ? <Alert type="info" showIcon message={t("offer.noFleet")} /> : (
        <>
          <Select size="large" variant="filled" style={{ width: "100%" }} value={vehicleId} onChange={(id) => { setVehicleId(id); setMode(null); setErrorCode(null); }}
            options={fleet.map((v) => ({ value: v.vehicleId, label: `${v.vehicleId} · ${t(`vehicle.${v.type}`, { defaultValue: v.type })} · ${v.palletCap} ${t("unit.pallets")}` }))} />
          {vehicle && (
            <label className="permission-row">
              <Switch checked={vehicle.shared} loading={permission.isPending} onChange={(on) => permission.mutate({ id: vehicle.vehicleId, on })} />
              <span><b>{t("offer.permission")}</b><span className="muted"> — {t("offer.permissionNote")}</span></span>
            </label>
          )}
        </>
      )}

      {vehicle && vehicle.shared && (
        <>
          <div className="sect">{t("offer.what")}</div>
          <div className="mode-cards" role="radiogroup" aria-label={t("offer.what")}>
            <button type="button" role="radio" aria-checked={mode === "WHOLE_TRUCK"} className={`mode-card${mode === "WHOLE_TRUCK" ? " on" : ""}`} disabled={!wholeFree} onClick={() => choose("WHOLE_TRUCK")}>
              <b>{t("offer.whole")}</b>
              <span>{f ? t("offer.wholeValues", { p: f.capacityPallets, kg: f.capacityKg.toLocaleString("en-US") }) : "…"}</span>
              {f && !wholeFree && <span className="mode-why">{t("offer.wholeBlocked", { n: f.commitments })}</span>}
            </button>
            <button type="button" role="radio" aria-checked={mode === "PARTIAL"} className={`mode-card${mode === "PARTIAL" ? " on" : ""}`} disabled={!f || f.freePallets < 1} onClick={() => choose("PARTIAL")}>
              <b>{t("offer.part")}</b>
              <span>{f ? t("offer.partFree", { p: f.freePallets, kg: f.freeKg.toLocaleString("en-US") }) : "…"}</span>
            </button>
          </div>

          {mode && (
            <>
              <div className="sect">{mode === "WHOLE_TRUCK" ? t("offer.detailsWhole") : t("offer.detailsPart")}</div>
              {mode === "PARTIAL" && f && (
                <div className="cargo-row">
                  <div><div className="field-label">{t("field.freePallets")}</div><Stepper value={pallets} min={1} max={Math.max(1, f.freePallets)} onChange={setPallets} /><div className="muted">{t("offer.upTo", { n: f.freePallets, unit: t("unit.pallets") })}</div></div>
                  <div><div className="field-label">{t("field.freeKg")}</div><InputNumber size="large" min={100} max={f.freeKg} step={100} value={kg} suffix="kg" style={{ width: "100%" }} onChange={(x) => setKg(Number(x ?? 100))} /><div className="muted">{t("offer.upTo", { n: f.freeKg.toLocaleString("en-US"), unit: "kg" })}</div></div>
                </div>
              )}
              {mode === "WHOLE_TRUCK" && f && <div className="truck-card">{t("offer.wholeSummary", { p: f.capacityPallets, kg: f.capacityKg.toLocaleString("en-US") })}</div>}

              <div className="cargo-row" style={{ marginTop: 12 }}>
                <div><div className="field-label">{t("offer.availableFrom")}</div><TimePicker size="large" variant="filled" format="HH:mm" minuteStep={15} allowClear={false} value={from} onChange={(v) => v && setFrom(v)} style={{ width: "100%" }} /></div>
                <div><div className="field-label">{t("offer.availableUntil")}</div><TimePicker size="large" variant="filled" format="HH:mm" minuteStep={15} allowClear={false} value={to} onChange={(v) => v && setTo(v)} style={{ width: "100%" }} /></div>
              </div>
              {!windowOk && <Alert type="warning" showIcon style={{ marginTop: 8 }} message={t("offer.windowOrder")} />}
              <div className="cargo-row" style={{ marginTop: 12 }}>
                <div><div className="field-label">{t("field.from")}</div><Select size="large" variant="filled" showSearch optionFilterProp="label" style={{ width: "100%" }} value={origin} onChange={setOrigin} options={placeOptions} /></div>
                <div><div className="field-label">{t("field.to")}</div><Select size="large" variant="filled" showSearch optionFilterProp="label" style={{ width: "100%" }} value={destination} onChange={setDestination} options={placeOptions} status={sameOD ? "error" : undefined} /></div>
              </div>
              {sameOD && <Alert type="warning" showIcon style={{ marginTop: 8 }} message={t("field.sameOD")} />}
              <div className="cargo-row" style={{ marginTop: 12 }}>
                <div><div className="field-label">{t("offer.detourKm")}</div><InputNumber size="large" min={0} max={500} value={detourKm} suffix="km" style={{ width: "100%" }} onChange={(x) => setDetourKm(Number(x ?? 0))} /></div>
                <div><div className="field-label">{t("offer.detourMin")}</div><InputNumber size="large" min={0} max={600} value={detourMin} suffix="min" style={{ width: "100%" }} onChange={(x) => setDetourMin(Number(x ?? 0))} /></div>
              </div>
              <div className="field-label" style={{ marginTop: 12 }}>{t("offer.tolerance")}</div>
              <Select size="large" variant="filled" style={{ width: "100%" }} value={tolerance} onChange={setTolerance} options={TOLERANCES.map((m) => ({ value: m, label: m === 0 ? t("offer.tolerance0") : t("offer.toleranceN", { n: m }) }))} />
              <div className="muted">{t("offer.toleranceNote")}</div>

              {errorCode && <Alert type="error" showIcon style={{ marginTop: 12 }} message={t(`offerError.${errorCode}`, { defaultValue: t("error.generic") })} />}
              <Button type="primary" size="large" block className="cta" loading={post.isPending} disabled={!windowOk || sameOD || !f} onClick={submit}>{t("offer.post")}</Button>
              <div className="muted" style={{ marginTop: 6 }}>{t("offer.note")}</div>
            </>
          )}
        </>
      )}
      {vehicle && !vehicle.shared && <Alert type="info" showIcon style={{ marginTop: 12 }} message={t("offer.permissionOff")} />}

      <div className="sect">{t("offer.mine")}</div>
      {mine.length === 0 && <div className="muted">{t("offer.none")}</div>}
      {mine.map((o) => (
        <div key={o.offerId} className="shipment">
          <div className="shipment-top"><b>{o.offerId} · {o.vehicleId}</b><Tag color={o.status === "ACTIVE" ? "green" : o.status === "MATCHED" ? "blue" : "default"}>{t(`offerState.${o.status}`)}</Tag></div>
          <div className="shipment-route">{placeName(o.from)} <span>→</span> {placeName(o.to)}</div>
          <div className="muted">{hhmm(o.fromMin)}–{hhmm(o.toMin)} · {o.mode === "WHOLE_TRUCK" ? t("offer.whole") : t("offer.part")} · {o.freePallets} {t("unit.pallets")} · {o.freeKg.toLocaleString("en-US")} kg · {t("offer.detourShort", { km: o.maxDetourKm, min: o.maxDetourMin })}</div>
          {o.adjustments.map((a, i) => <Alert key={i} type="warning" showIcon style={{ marginTop: 8 }} message={t(`offerAdjust.${a.reason}`, { from: a.oldFreePallets, to: a.newFreePallets })} />)}
          {o.status === "ACTIVE" && <Button size="small" style={{ marginTop: 8 }} loading={withdraw.isPending} onClick={() => withdraw.mutate(o.offerId, { onSuccess: () => void message.info(t("offer.withdrawn")) })}>{t("offer.withdraw")}</Button>}
        </div>
      ))}
    </div>
  );
}
