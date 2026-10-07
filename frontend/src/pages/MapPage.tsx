import { PauseCircleFilled, PlayCircleFilled, ReloadOutlined, StepForwardOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Select, Segmented, Skeleton, Slider, Switch, Tag } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApi } from "../app/contexts";
import { CARRIER_COLOR, ReplayMap } from "../components/ReplayMap";
import { hhmm } from "../components/common";
import { countersAt, nextEventTime, positionsAt } from "../lib/replay";

const SPEEDS = [1, 5, 15, 60];   // simulated minutes per real second

export function MapPage() {
  const { t } = useTranslation();
  const api = useApi();
  const geoQ = useQuery({ queryKey: ["geometry"], queryFn: api.geometry, staleTime: Infinity });
  const trQ = useQuery({ queryKey: ["trajectories", "OP"], queryFn: () => api.trajectories("OP") });
  const geo = geoQ.data, full = trQ.data;
  const [now, setNow] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(15);
  const [showRoutes, setShowRoutes] = useState(true);
  const [showTrails, setShowTrails] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const raf = useRef<number | null>(null), last = useRef(0);

  const start = full?.startMin ?? 0, end = full?.endMin ?? 1;
  const tNow = now ?? start;
  const tr = useMemo(() => (full && focus ? { ...full, vehicles: full.vehicles.filter((v) => v.vehicleId === focus), events: full.events.filter((e) => e.vehicleId === focus) } : full), [full, focus]);

  useEffect(() => {
    if (!playing || !full) return;
    const loop = (ts: number) => {
      if (!last.current) last.current = ts;
      const dt = (ts - last.current) / 1000; last.current = ts;
      setNow((cur) => { const n = (cur ?? start) + dt * speed; if (n >= end) { setPlaying(false); return end; } return n; });
      raf.current = requestAnimationFrame(loop);
    };
    last.current = 0; raf.current = requestAnimationFrame(loop);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [playing, speed, end, start, full]);

  const pos = useMemo(() => (tr && geo ? positionsAt(tr, geo, tNow) : []), [tr, geo, tNow]);
  const cnt = useMemo(() => (tr ? countersAt(tr, tNow, pos) : null), [tr, tNow, pos]);
  const log = useMemo(() => (tr ? tr.events.filter((e) => e.t <= tNow).slice(-8).reverse() : []), [tr, tNow]);
  const placeName = (n: number) => geo?.nodes[n].name ?? "";

  if (geoQ.isError || trQ.isError) return <Alert type="error" showIcon message={t("error.loadFailed")} />;
  if (!geo || !full || !tr || !cnt) return <Skeleton active paragraph={{ rows: 8 }} />;
  const trips = full.vehicles.filter((v) => v.segments.length > 0);
  return (
    <div>
      <div className="page-head"><div><h2>{t("map.title")}</h2><div className="muted">{t("map.subtitle")}</div></div></div>
      <Card size="small" className="map-toolbar-card">
        <div className="map-toolbar">
          <div className="tb-group">
            <span className="tb-label">{t("map.plan")}</span><Tag>{full.planLabel}</Tag><Tag color="orange">{t("map.mock")}</Tag>
            <span className="clock">{hhmm(Math.floor(tNow))}</span>
          </div>
          <div className="tb-group">
            <Button type="primary" shape="circle" icon={playing ? <PauseCircleFilled /> : <PlayCircleFilled />} aria-label={playing ? t("map.pause") : t("map.play")} onClick={() => { if (tNow >= end) setNow(start); setPlaying(!playing); }} />
            <Button shape="circle" icon={<ReloadOutlined />} aria-label={t("map.restart")} onClick={() => { setNow(start); setPlaying(false); }} />
            <Button shape="circle" icon={<StepForwardOutlined />} aria-label={t("map.nextEvent")} onClick={() => { const n = nextEventTime(tr, tNow); if (n !== null) setNow(n); }} />
            <span className="tb-label">{t("map.speed")}</span><Segmented size="small" value={speed} onChange={(v) => setSpeed(Number(v))} options={SPEEDS.map((s) => ({ value: s, label: `${s}×` }))} /><span className="muted">{t("map.speedUnit")}</span>
          </div>
          <div className="tb-group">
            <span className="tb-label">{t("map.vehicle")}</span><Select size="small" style={{ width: 170 }} value={focus ?? "ALL"} onChange={(v) => setFocus(v === "ALL" ? null : v)}
              options={[{ value: "ALL", label: t("map.allTrucks") }, ...trips.map((v) => ({ value: v.vehicleId, label: `${v.vehicleId} (${v.carrierId})` }))]} />
            <Switch size="small" checked={showRoutes} onChange={setShowRoutes} /> {t("map.showRoutes")}
            <Switch size="small" checked={showTrails} onChange={setShowTrails} /> {t("map.showTrails")}
          </div>
        </div>
        <Slider style={{ marginTop: 8 }} min={start} max={end} step={1} value={Math.floor(tNow)} onChange={(v) => setNow(Number(v))} tooltip={{ formatter: (v) => hhmm(Number(v ?? 0)) }} />
      </Card>
      {offline && <Alert type="info" showIcon style={{ marginBottom: 12 }} message={t("map.offline")} />}
      <div className="replay-wrap">
        <div>
          <ReplayMap geo={geo} tr={tr} t={tNow} pos={pos} selected={focus} showRoutes={showRoutes} showTrails={showTrails} height="clamp(420px, calc(100vh - 360px), 900px)" onOffline={setOffline} />
          <div className="legend">
            {Object.entries(CARRIER_COLOR).map(([c, col]) => <span key={c}><i style={{ background: col }} />{c}</span>)}
            <span><i className="filled" />{t("map.legend.loaded")}</span><span><i className="hollow" />{t("map.legend.empty")}</span><span className="dot sg" />{t("map.legend.sg")}<span className="dot my" />{t("map.legend.my")}
          </div>
        </div>
        <div className="side-col">
          <Card size="small" title={t("map.counters")}>
            <div className="counter-list">
              <div>{t("map.moving")}: <b>{cnt.active}</b> / {trips.length}</div><div>{t("map.onboard")}: <b>{cnt.onboard}</b></div><div>{t("map.delivered")}: <b>{cnt.doneLoads}</b></div>
              <div>{t("map.emptyKm")}: <b>{Math.round(cnt.emptyKm)} km</b></div><div>{t("map.co2")}: <b>{Math.round(cnt.co2Kg)} kg</b></div>
            </div>
          </Card>
          <Card size="small" title={t("map.log")}>
            {log.length === 0 && <div className="muted">{t("map.noEvents")}</div>}
            {log.map((e, i) => <div key={i} className="log-row"><span className="muted">{hhmm(e.t)}</span> <span style={{ color: CARRIER_COLOR[full.vehicles.find((v) => v.vehicleId === e.vehicleId)?.carrierId ?? ""] }}>●</span> {t(`map.event.${e.kind}`, { vehicle: e.vehicleId, place: placeName(e.node), load: e.loadId })}</div>)}
          </Card>
        </div>
      </div>
    </div>
  );
}
