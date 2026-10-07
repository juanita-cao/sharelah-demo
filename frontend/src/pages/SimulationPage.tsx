import { Alert, Button, InputNumber, Segmented, Select, Slider, Tag } from "antd";
import { CaretRightOutlined, PauseOutlined, ReloadOutlined, CameraOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApi, useSession } from "../app/contexts";
import { KpiCard, SectionTitle, hhmm, money } from "../components/common";
import { Sized } from "../components/charts";
import { CARRIER_COLOR, ReplayMap } from "../components/ReplayMap";
import { COMPANIES } from "../data/companies";
import { placeName } from "../data/places";
import { positionsAt } from "../lib/replay";
import { LIVE_SERVER } from "../config/live";
import { STEPS_PER_DAY, appendDay, axisTicks, emptyLive, firstDays, liveLimit, loadSimulation, planFor, recentJobs, routesToTrajectory, sharedOnRoad, stepOf, streamSimulation, totalSteps, viewAt, type SimData } from "../lib/sim";

const COLORS = ["#7C3AED", "#DB2777", "#0E7490", "#92400E", "#16A34A", "#2563EB"];
const SPEEDS = [{ label: "1×", value: 6 }, { label: "4×", value: 24 }, { label: "16×", value: 96 }];   // clock steps (simulated hours) per second
const GOOD = "#16A34A", MUTE = "#667085", INK = "#1D2939", GRID = "#EEF1F5";

interface Snap { step: number; label?: string }

// The investor view: a simulated month that plays on its own. All numbers come from the backend simulation (scripts/demo_simulation.py); nothing is invented here.
export function SimulationPage() {
  const { t } = useTranslation();
  const { company } = useSession();
  const q = useQuery({ queryKey: ["simulation"], queryFn: () => loadSimulation(), staleTime: Infinity, retry: false });
  if (q.isLoading) return <div className="page-pad muted">{t("sim.loading")}</div>;
  if (q.isError || !q.data) return <div className="page-pad"><Alert type="warning" showIcon message={t("sim.missing")} /></div>;
  const home = company.kind === "CARRIER" ? company.id : null;
  if (home && !q.data.world.carriers.some((c) => c.id === home)) return <div className="page-pad"><Alert type="info" showIcon message={t("sim.noData")} /></div>;   // a carrier sees its own data only; none here
  return <Demo recorded={q.data} home={home} />;
}

const LIVE_MAX_DAYS = 90, LIVE_SEED = 1, LIVE_LOADS = 150;   // the recorded month is exactly seed 1 with 150 loads a day, so a live run continues the same month

// Two ways to see the same simulation: the recorded month (instant result or replay) and a live run that the backend computes day by day, for any number of days.
function Demo({ recorded, home }: { recorded: SimData; home: string | null }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"recorded" | "live">("recorded");
  const [live, setLive] = useState<SimData | null>(null);
  const [computing, setComputing] = useState(false);
  const [target, setTarget] = useState(60);
  const [typed, setTyped] = useState(recorded.days.length);                // the number in the days box: the period the viewer wants to see
  const [shown, setShown] = useState(recorded.days.length);                // days of the recording on screen
  const timer = useRef<number | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState(0);
  const [atEnd, setAtEnd] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => { abort.current?.abort(); window.clearTimeout(timer.current); }, []);

  const showRecorded = useCallback(() => {
    window.clearTimeout(timer.current);
    abort.current?.abort(); setComputing(false); setError(null); setMode("recorded"); setLive(null); setShown(recorded.days.length); setTyped(recorded.days.length); setAtEnd(true); setRun((r) => r + 1);
  }, [recorded.days.length]);
  const runLive = useCallback(async (n: number) => {
    abort.current?.abort();
    const ctl = new AbortController(); abort.current = ctl;
    setError(null); setMode("live"); setLive(null); setAtEnd(false); setTarget(n); setComputing(true); setRun((r) => r + 1);
    try {
      await streamSimulation({ days: n, seed: LIVE_SEED, loads: LIVE_LOADS }, ctl.signal, (m) => {
        if (m.type === "meta") setLive(emptyLive(m.meta, m.world));
        else if (m.type === "day") setLive((d) => (d ? appendDay(d, m.row, m.cumulative) : d));
      });
    } catch (e) {
      if (ctl.signal.aborted) return;
      const msg = e instanceof Error ? e.message : String(e);
      setError(/already running/.test(msg) ? t("sim.busy") : t("sim.needServer"));
      setMode("recorded"); setLive(null); setShown(recorded.days.length); setTyped(recorded.days.length); setAtEnd(true); setRun((r) => r + 1);
    } finally { if (abort.current === ctl) setComputing(false); }
  }, [t, recorded.days.length]);

  // The days box and the screen are one thing: a number up to the recorded days shows that many recorded days at once, a larger one starts a live run.
  const apply = useCallback((n: number) => {
    window.clearTimeout(timer.current);
    const plan = planFor(n, recorded.days.length, liveLimit(LIVE_SERVER, recorded.days.length, LIVE_MAX_DAYS));
    setTyped(plan.days);
    if (plan.kind === "live") { void runLive(plan.days); return; }
    abort.current?.abort(); setComputing(false); setError(null); setMode("recorded"); setLive(null); setShown(plan.days); setAtEnd(false); setRun((r) => r + 1);
  }, [recorded.days.length, runLive]);
  const onType = useCallback((n: number) => { setTyped(n); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => apply(n), 700); }, [apply]);

  const data = mode === "live" ? live : firstDays(recorded, shown);
  return (
    <>
      {error && <div className="page-pad" style={{ paddingBottom: 0 }}><Alert type="warning" showIcon closable message={error} onClose={() => setError(null)} /></div>}
      {!data || data.days.length === 0
        ? <div className="page-pad muted">{t("sim.waiting")}</div>
        : <Player key={`${mode}-${run}`} data={data} home={home} mode={mode} computing={computing} target={target} startAtEnd={atEnd && mode === "recorded"}
                  recordedDays={recorded.days.length} typed={typed} onType={onType} onApply={apply} onRecorded={showRecorded} onRunLive={runLive} />}
    </>
  );
}

interface PlayerProps { data: SimData; home: string | null; mode: "recorded" | "live"; computing: boolean; target: number; startAtEnd: boolean; recordedDays: number; typed: number; onType: (n: number) => void; onApply: (n: number) => void; onRecorded: () => void; onRunLive: (n: number) => void }

function Player({ data, home, mode, computing, target, startAtEnd, recordedDays, typed, onType, onApply, onRecorded, onRunLive }: PlayerProps) {
  const { t } = useTranslation();
  const days = data.days.length, last = totalSteps(days);
  const axisDays = mode === "live" ? Math.max(days, target) : days;
  const carriers = useMemo(() => data.world.carriers.map((c) => c.id), [data]);
  const name = (id: string) => COMPANIES.find((c) => c.id === id)?.name ?? (data.world.carriers.find((c) => c.id === id)?.name ?? id).replace(/\s*\(fictio[^)]*\)\s*$/i, "");
  const color = (id: string) => CARRIER_COLOR[id] ?? COLORS[carriers.indexOf(id) % COLORS.length];
  const [step, setStep] = useState(startAtEnd ? last : 0);
  const [playing, setPlaying] = useState(!startAtEnd);
  const [speed, setSpeed] = useState(SPEEDS[0].value);
  const own = home;                                   // a carrier sees its own figures only; the operator sees every carrier and the network
  const [focus, setFocus] = useState<string>(own ?? carriers[0]);
  const [mine, setMine] = useState<Snap[]>([]);
  const acc = useRef(0);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      acc.current += speed / 10;
      const whole = Math.floor(acc.current);
      if (whole > 0) { acc.current -= whole; setStep((s) => Math.min(last, s + whole)); }
    }, 100);
    return () => window.clearInterval(id);
  }, [playing, speed, last]);
  useEffect(() => { if (step >= last && !computing) setPlaying(false); }, [step, last, computing]);   // a live run keeps going when it catches up with the computing

  const v = useMemo(() => viewAt(data, step, carriers), [data, step, carriers]);
  const c = v.cursor, clockMin = c.tick * 60;
  const focusCar = data.world.carriers.find((x) => x.id === focus)!;
  const viol = data.days.slice(0, v.completedDays).reduce((s, d) => s + d.A.commitment_violations + d.B.commitment_violations, 0);
  const maxBar = Math.max(1, ...carriers.map((id) => v.realisedByCarrier[id] ?? 0));
  const perCarrierSeries = useMemo(() => carriers.map((id) => ({ id, values: data.cumulative.map((x) => x.realised_extra[id] ?? 0) })), [data, carriers]);
  const netSeries = useMemo(() => data.cumulative.map((x) => Object.values(x.realised_extra).reduce((a, b) => a + b, 0)), [data]);
  const snapshotOf = (s: number) => {
    const w = viewAt(data, s, carriers), m = own ? w.byCarrier[own] : null;
    return { step: s, extra: own ? w.realisedByCarrier[own] ?? 0 : w.realisedTotal, servedA: m ? m.servedA : w.servedA, servedB: m ? m.servedB : w.servedB, jobs: m ? m.accepted : w.sharedAccepted, at: w.cursor };
  };
  const feed = own ? recentJobs(data, step, own) : v.recent;
  const mineNow = own ? v.byCarrier[own] : null;
  const daily = useMemo(() => Array.from({ length: days }, (_, d) => snapshotOf(stepOf({ day: d, tick: STEPS_PER_DAY }))), [data]);   // eslint-disable-line react-hooks/exhaustive-deps
  const shown = daily.filter((s) => s.step <= step).slice(-6).reverse();

  return (
    <div className="page-pad sim-page">
      <div className="sim-head">
        <div>
          <h2 style={{ margin: 0 }}>{t("sim.title")} <Tag color="orange" style={{ verticalAlign: "middle" }}>{t("sim.badge")}</Tag> <Tag color={mode === "live" ? "green" : "blue"} style={{ verticalAlign: "middle" }}>{mode === "live" ? (computing ? t("sim.liveProgress", { k: days, n: target }) : t("sim.liveDone", { n: days })) : t("sim.recordedTag")}</Tag></h2>
          <div className="muted" style={{ maxWidth: 760 }}>{t("sim.subtitle")}</div>
        </div>
        <div className="sim-controls">
          <Button type="primary" icon={playing ? <PauseOutlined /> : <CaretRightOutlined />} onClick={() => { if (step >= last) setStep(0); setPlaying(!playing); }}>{playing ? t("sim.pause") : t("sim.play")}</Button>
          <Button icon={<ReloadOutlined />} onClick={() => { setStep(0); setPlaying(true); }}>{t("sim.restart")}</Button>
          <Button onClick={onRecorded} disabled={mode === "recorded" && days === recordedDays && step >= last && !playing}>{t("sim.recorded", { n: recordedDays })}</Button>
          <span className="sim-days"><span className="muted">{t("sim.daysLabel")}</span>
            <InputNumber size="small" min={1} max={liveLimit(LIVE_SERVER, recordedDays, LIVE_MAX_DAYS)} step={1} precision={0} value={typed} style={{ width: 74 }} onChange={(x) => { if (typeof x === "number" && x >= 1) onType(Math.min(Math.floor(x), liveLimit(LIVE_SERVER, recordedDays, LIVE_MAX_DAYS))); }} onPressEnter={() => onApply(typed)} />
            <span className="muted">{LIVE_SERVER ? t("sim.daysUnit", { max: LIVE_MAX_DAYS }) : t("sim.daysUnitStatic", { max: recordedDays })}</span></span>
          {LIVE_SERVER && <Button onClick={() => onRunLive(typed)} disabled={computing}>{t("sim.runLive")}</Button>}
          <Segmented size="small" options={SPEEDS.map((s) => ({ label: s.label, value: s.value }))} value={speed} onChange={(x) => setSpeed(Number(x))} />
        </div>
      </div>

      <div className="sim-clock">
        <b>{t("sim.day", { d: c.day + 1 })}</b> <span className="muted">{t("sim.of", { n: days })}</span> · <b>{c.tick >= 24 ? "24:00" : hhmm(clockMin)}</b>
        <Slider min={0} max={last} value={step} tooltip={{ open: false }} onChange={(x) => { setStep(x); acc.current = 0; }} marks={Object.fromEntries(Array.from({ length: Math.ceil(days / Math.max(1, Math.round(days / 4))) }, (_, k) => k * Math.max(1, Math.round(days / 4))).filter((d) => d < days).map((d) => [d * STEPS_PER_DAY, `${d + 1}`]))} />
      </div>

      <div className="kpi-grid four">
        <KpiCard label={own ? t("sim.kpi.extraMine") : t("sim.kpi.extra")} value={money(own ? v.realisedByCarrier[own] ?? 0 : v.realisedTotal)} foot={t("sim.kpi.extraFoot", { n: mineNow ? mineNow.done : v.sharedJobsDone })} color={GOOD} tone="good" />
        <KpiCard label={own ? t("sim.kpi.servedMine") : t("sim.kpi.served")} value={(mineNow ? mineNow.servedB : v.servedB).toLocaleString("en-US")} foot={t("sim.kpi.servedFoot", { a: (mineNow ? mineNow.servedA : v.servedA).toLocaleString("en-US") })} tone={(mineNow ? mineNow.servedB >= mineNow.servedA : v.servedB >= v.servedA) ? "good" : "bad"} />
        <KpiCard label={own ? t("sim.kpi.jobsMine") : t("sim.kpi.jobs")} value={(mineNow ? mineNow.accepted : v.sharedAccepted).toLocaleString("en-US")} foot={t("sim.kpi.jobsFoot", { v: mineNow ? mineNow.violations : viol })} />
        <KpiCard label={own ? t("sim.kpi.upliftMine") : t("sim.kpi.uplift")} value={money(own ? v.deltaContributionByCarrier[own] ?? 0 : v.deltaContributionTotal)} foot={t("sim.kpi.upliftFoot")} tone={(own ? v.deltaContributionByCarrier[own] ?? 0 : v.deltaContributionTotal) >= 0 ? "good" : "bad"} />
      </div>

      {data.days[Math.min(c.day, days - 1)].routes && (
        <DayMap data={data} home={own} dayIndex={Math.min(c.day, days - 1)} minute={c.tick >= STEPS_PER_DAY ? 1440 : clockMin} playing={playing} speed={speed} name={name} />
      )}

      <div className="sim-grid">
        {!own && <section className="card">
          <SectionTitle extra={<span className="muted">{t("sim.perCarrierHint")}</span>}>{t("sim.perCarrier")}</SectionTitle>
          {carriers.map((id) => (
            <div key={id} className={`sim-bar${id === focus ? " on" : ""}`} onClick={() => setFocus(id)} role="button" tabIndex={0}>
              <span className="sim-bar-name">{name(id)}</span>
              <span className="sim-bar-track"><span className="sim-bar-fill" style={{ width: `${((v.realisedByCarrier[id] ?? 0) / maxBar) * 100}%`, background: color(id) }} /></span>
              <b className="sim-bar-val">{money(v.realisedByCarrier[id] ?? 0)}</b>
            </div>
          ))}
        </section>}

        <section className="card" style={own ? { gridColumn: "1 / span 2" } : undefined}>
          <SectionTitle extra={own ? null : <Select size="small" value={focus} style={{ width: 210 }} onChange={setFocus} options={carriers.map((id) => ({ value: id, label: name(id) }))} />}>{own ? t("sim.mine") : t("sim.focus")}</SectionTitle>
          <div className="sim-focus-title" style={{ color: color(focus) }}>{name(focus)} <span className="muted">· {t("sim.focus.fleet", { n: focusCar.vehicles })}</span></div>
          <div className="sim-focus-row">
            <div><div className="muted">{t("sim.focus.extra")}</div><div className="sim-big" style={{ color: GOOD }}>{money(v.realisedByCarrier[focus] ?? 0)}</div></div>
            <div><div className="muted">{t("sim.focus.uplift")}</div><div className="sim-big">{money(v.deltaContributionByCarrier[focus] ?? 0)}</div></div>
            <div><div className="muted">{t("sim.focus.jobs")}</div><div className="sim-big">{data.days.slice(0, c.day).reduce((s, d) => s + d.shared_jobs.filter((j) => j.carrier_id === focus).length, 0) + data.days[c.day].shared_jobs.filter((j) => j.carrier_id === focus && j.accepted_at <= clockMin).length}</div></div>
          </div>
          <div className="muted" style={{ marginTop: 8 }}>{t("sim.focus.note")}</div>
        </section>

        <section className="card" style={{ gridColumn: "1 / span 2" }}>
          <SectionTitle>{t("sim.chart")}</SectionTitle>
          <Chart days={axisDays} step={step} all={own ? null : netSeries} focus={perCarrierSeries.find((s) => s.id === focus)!.values} focusColor={color(focus)} labels={{ all: t("sim.chart.network"), focus: name(focus), day: t("sim.chart.day") }} />
        </section>

        <section className="card">
          <SectionTitle>{t("sim.today")} · {t("sim.day", { d: c.day + 1 })}</SectionTitle>
          <div className="sim-today">
            {(own ? [["sim.today.myJobs", data.days[c.day].shared_jobs.filter((j) => j.carrier_id === own && j.accepted_at <= clockMin).length], ["sim.today.myExtra", money(v.today.realised_extra[own] ?? 0)]] : [["sim.today.arrived", v.today.loads_arrived], ["sim.today.confirmed", v.today.loads_confirmed], ["sim.today.offers", v.today.offers_active], ["sim.today.shrunk", v.today.offers_shrunk], ["sim.today.withdrawn", v.today.offers_withdrawn]]).map(([k, n]) => (
              <div key={String(k)}><b>{n}</b><span className="muted">{t(String(k))}</span></div>
            ))}
          </div>
          <SectionTitle>{t("sim.feed")}</SectionTitle>
          {feed.length === 0 && <div className="muted">{t("sim.feed.empty")}</div>}
          {feed.map((j) => (
            <div key={`${j.load_id}-${j.accepted_at}`} className="sim-feed">
              <span className="dot" style={{ background: color(j.carrier_id) }} />
              <span>{t("sim.feed.line", { carrier: name(j.carrier_id), load: j.load_id, lane: `${placeName(j.origin)} → ${placeName(j.destination)}`, pallets: t(j.pallets === 1 ? "sim.pallet1" : "sim.palletN", { n: j.pallets }) })}</span>
              <b style={{ color: j.net_incremental >= 0 ? GOOD : "#DC2626" }}>{t("sim.feed.net", { v: money(j.net_incremental) })}</b>
            </div>
          ))}
        </section>

        <section className="card">
          <SectionTitle extra={<Button size="small" icon={<CameraOutlined />} onClick={() => setMine((m) => [{ step }, ...m])}>{t("sim.snap.save")}</Button>}>{t("sim.snap")}</SectionTitle>
          <SnapTable rows={mine.map((m) => snapshotOf(m.step))} title={t("sim.snap.mine")} empty={t("sim.snap.empty")} onOpen={(s) => { setStep(s); setPlaying(false); }} />
          <SnapTable rows={shown} title={t("sim.snap.auto")} onOpen={(s) => { setStep(s); setPlaying(false); }} />
        </section>
      </div>
      <div className="muted" style={{ marginTop: 10 }}>{t("sim.method")}: {data.meta.method.split(" (")[0]}. {t("sim.methodNote")}</div>
    </div>
  );
}

function SnapTable({ rows, title, empty, onOpen }: { rows: { step: number; extra: number; servedA: number; servedB: number; jobs: number; at: { day: number; tick: number } }[]; title: string; empty?: string; onOpen: (s: number) => void }) {
  const { t } = useTranslation();
  if (rows.length === 0 && !empty) return null;
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="muted" style={{ fontWeight: 600 }}>{title}</div>
      {rows.length === 0 && <div className="muted">{empty}</div>}
      {rows.map((r, i) => (
        <div key={`${r.step}-${i}`} className="sim-snap-row">
          <span>{t("sim.snap.at", { d: r.at.day + 1, t: r.at.tick >= 24 ? "24:00" : hhmm(r.at.tick * 60) })}</span>
          <span>{money(r.extra)}</span><span>{r.servedB} / {r.servedA}</span><span>{r.jobs}</span>
          <Button size="small" type="link" onClick={() => onOpen(r.step)}>{t("sim.snap.go")}</Button>
        </div>
      ))}
    </div>
  );
}

// Cumulative extra earnings by day with the playhead; the network line and the selected carrier.
function Chart({ days, step, all, focus, focusColor, labels }: { days: number; step: number; all: number[] | null; focus: number[]; focusColor: string; labels: { all: string; focus: string; day: string } }) {
  const H = 236;
  return (
    <Sized height={H}>{(W) => {
      const p = { l: 56, r: 16, t: 16, b: 44 }, max = Math.max(1, ...(all ?? focus)) * 1.05;
      const X = (d: number) => p.l + (d / days) * (W - p.l - p.r), Y = (y: number) => H - p.b - (y / max) * (H - p.t - p.b);
      const path = (vals: number[]) => [`M${X(0)},${Y(0)}`, ...vals.map((y, i) => `L${X(i + 1).toFixed(1)},${Y(y).toFixed(1)}`)].join(" ");
      const head = X(step / STEPS_PER_DAY);
      const upto = (vals: number[]) => vals.slice(0, Math.floor(step / STEPS_PER_DAY));
      return (
        <svg width={W} height={H} role="img">
          {[0, 0.5, 1].map((f) => <g key={f}><line x1={p.l} x2={W - p.r} y1={Y(max * f)} y2={Y(max * f)} stroke={GRID} /><text x={p.l - 6} y={Y(max * f) + 4} textAnchor="end" fontSize="11" fill={MUTE}>{`S$${Math.round((max * f) / 100) / 10}k`}</text></g>)}
          {axisTicks(days).map((d) => <g key={d}><line x1={X(d)} x2={X(d)} y1={H - p.b} y2={H - p.b + 4} stroke="#CBD5E1" /><text x={X(d)} y={H - p.b + 17} textAnchor={d === 0 ? "start" : "middle"} fontSize="11" fill={MUTE}>{d}</text></g>)}
          <text x={(p.l + W - p.r) / 2} y={H - 6} textAnchor="middle" fontSize="11" fill={MUTE}>{labels.day}</text>
          {all && <path d={path(all)} fill="none" stroke="#CBD5E1" strokeWidth="2" strokeDasharray="4 4" />}
          {all && <path d={path(upto(all))} fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />}
          {!all && <path d={path(focus)} fill="none" stroke="#CBD5E1" strokeWidth="2" strokeDasharray="4 4" />}
          <path d={path(upto(focus))} fill="none" stroke={focusColor} strokeWidth="2.4" strokeLinecap="round" />
          <line x1={head} x2={head} y1={p.t} y2={H - p.b} stroke={GOOD} strokeWidth="1.5" />
          <g transform={`translate(${p.l + 40},${p.t - 6})`}>{all && <><rect width="10" height="3" y="5" fill={INK} /><text x="16" y="10" fontSize="11" fill={INK}>{labels.all}</text></>}<rect x={all ? 120 : 0} width="10" height="3" y="5" fill={focusColor} /><text x={all ? 136 : 16} y="10" fontSize="11" fill={INK}>{labels.focus}</text></g>
        </svg>
      );
    }}</Sized>
  );
}

// The roads of the day that is playing: the trucks move along the real roads at the minute of the page clock (the page moves in hours, this map smooths the minutes in between).
// A ring marks a truck that carries a shared job. A carrier sees only its own trucks.
function DayMap({ data, home, dayIndex, minute, playing, speed, name }: { data: SimData; home: string | null; dayIndex: number; minute: number; playing: boolean; speed: number; name: (id: string) => string }) {
  const { t } = useTranslation();
  const api = useApi();
  const geoQ = useQuery({ queryKey: ["geometry"], queryFn: api.geometry, staleTime: Infinity });
  const [scenario, setScenario] = useState<"A" | "B">("B");
  const [offline, setOffline] = useState(false);
  const day = data.days[dayIndex];
  const geo = geoQ.data;
  const tr = useMemo(() => (geo && day.routes ? routesToTrajectory(day.routes[scenario], data.world.vehicles, geo, `${scenario}`, home) : null), [geo, day, scenario, data.world.vehicles, home]);
  const [now, setNow] = useState(minute);
  const live = useRef({ t: minute, day: dayIndex, minute, playing, speed });
  live.current = { ...live.current, minute, playing, speed };
  useEffect(() => {                                           // follow the page clock; between its hourly steps move on by the playback speed
    if (live.current.day !== dayIndex || !playing || Math.abs(live.current.t - minute) > 90) live.current.t = minute;
    live.current.day = dayIndex;
    setNow(live.current.t);
  }, [dayIndex, minute, playing]);
  useEffect(() => {
    let raf = 0, last = 0;
    const loop = (ts: number) => {
      const dt = last ? (ts - last) / 1000 : 0; last = ts;
      const L = live.current;
      if (L.playing) { L.t = Math.min(L.t + dt * L.speed * 60, L.minute + 60); setNow(L.t); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const pos = useMemo(() => (tr && geo ? positionsAt(tr, geo, now) : []), [tr, geo, now]);
  const ring = useMemo(() => sharedOnRoad(day, now, home), [day, now, home]);
  if (!geo || !tr) return null;
  const moving = pos.filter((p) => p.state === "moving").length;
  const ids = [...new Set(tr.vehicles.map((v) => v.carrierId))];
  return (
    <section className="card" style={{ marginBottom: 20 }}>
      <SectionTitle extra={<Segmented size="small" value={scenario} onChange={(v) => setScenario(v as "A" | "B")} options={[{ value: "B", label: t("sim.map.with") }, { value: "A", label: t("sim.map.without") }]} />}>{t("sim.map.title", { d: dayIndex + 1 })}</SectionTitle>
      {offline && <Alert type="info" showIcon style={{ marginBottom: 8 }} message={t("map.offline")} />}
      <ReplayMap geo={geo} tr={tr} t={now} pos={pos} selected={null} showRoutes={false} showTrails height="clamp(360px, 46vh, 560px)" onOffline={setOffline} fitToTrucks={home !== null} marked={scenario === "B" ? ring : undefined} />
      <div className="sim-map-legend">
        {ids.map((id) => <span key={id}><i style={{ background: CARRIER_COLOR[id] ?? "#555" }} />{name(id)}</span>)}
        <span><i className="filled" />{t("map.legend.loaded")}</span><span><i className="hollow" />{t("map.legend.empty")}</span>
        {scenario === "B" && <span><i className="ring" />{t("sim.map.shared")}</span>}
        <span className="muted">{t("sim.map.counts", { moving, trucks: tr.vehicles.length, shared: scenario === "B" ? ring.size : 0 })}</span>
      </div>
    </section>
  );
}

