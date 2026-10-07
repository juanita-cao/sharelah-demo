import type { Geometry, Segment, SessionOpportunityVM, SessionStateVM, TrajectoryVM } from "../api/types";

// The simulated month (backend `scripts/demo_simulation.py` → public/demo/simulation.json). Everything in it is a SIMULATION on fictional data.
// This file only types the JSON and derives "what the screen shows at step n"; it has no React in it, so it can be tested on its own.

export interface SimCarrierDay {
  contribution: number; earnings: number; fixed_cost: number; loads_served: number; km: number; empty_km: number; utilization: number;
  extra_earnings_realised: number; accepted_opportunities: number; share_negative_net: number; delay_imposed_max: number; delay_imposed_mean: number;
  commitment_violations: number; offers_shrunk: number; offers_withdrawn_by_own_commitment: number;
}
export interface SimNetworkDay {
  contribution: number; loads_served: number; unserved: number; total_km: number; empty_km: number; utilization: number; co2_kg: number; vehicles_used: number;
  shipper_payment: number; platform_revenue: number; exclusive_load_share: number; shared_jobs: number; commitment_violations: number;
  per_carrier: Record<string, SimCarrierDay>;
}
export interface SimTick {
  t: number; loads_arrived: number; loads_confirmed: number; commitments: number; offers_active: number; shared_accepted: number; offers_shrunk: number; offers_withdrawn: number;
  realised_extra: Record<string, number>;
}
export interface SimJob {
  load_id: string; carrier_id: string; vehicle_id: string; accepted_at: number; pickup_min: number; drop_min: number; origin: string; destination: string; pallets: number;
  payout: number; marginal_cost: number; net_incremental: number;
  // the opportunity as the carrier was shown it (present in data recorded after the opportunity details were added)
  temp_class?: string; detour_km?: number; detour_min?: number; delay_max_min?: number; delay_imposed?: { commitment_id: string; stop_index: number; minutes: number }[];
  recommended?: boolean; reasons?: string[];
  opportunity_id?: string;     // the live session's id for the opportunity (what the backend wants back when the carrier answers)
}
export interface SimStop { node: string; kind: "PICKUP" | "DROP"; load_id: string; arrive_min: number; depart_min: number }
export interface SimLoad { origin: string; destination: string; pallets: number; weight_kg: number; temp_class: string; exclusive: boolean; kind: "OWN" | "MARKET" | "OVERFLOW"; home_carrier_id: string; shared: boolean }
export interface SimDay {
  day: number; seed: number; A: SimNetworkDay; B: SimNetworkDay; shared_jobs: SimJob[];
  routes?: { A: Record<string, SimStop[]>; B: Record<string, SimStop[]> }; loads?: Record<string, SimLoad>;   // present when the run carried the routes (for the map)
  delta: { network: Record<"contribution" | "loads_served" | "unserved" | "total_km" | "empty_km" | "co2_kg", number>; per_carrier: Record<string, { contribution: number }> };
  timeline: { A: SimTick[]; B: SimTick[] };
}
export interface SimData {
  meta: { label: "SIMULATION"; note: string; seed: number; days: number; method: string; scenario_A: string; scenario_B: string; contribution: string };
  world: { carriers: { id: string; name: string; vehicles: number }[]; vehicles: { id: string; carrier_id: string; type: string; base_node: string; pallets: number }[] };
  days: SimDay[];
  cumulative: { day: number; realised_extra: Record<string, number>; delta_contribution: Record<string, number> }[];
  totals: { per_carrier: Record<string, { contribution_A: number; contribution_B: number; delta_contribution: number; realised_extra: number; accepted_opportunities: number; loads_served_A: number; loads_served_B: number }>;
            network: Record<string, number> };
}

export const TICKS_PER_DAY = 25;                 // hourly ticks 0..24 of a day
export const STEPS_PER_DAY = TICKS_PER_DAY - 1;  // the clock moves 24 steps per day; the 25th tick is the same instant as the next day's first

export interface Cursor { day: number; tick: number }
export const cursorOf = (step: number, days: number): Cursor => {
  const s = Math.max(0, Math.min(step, days * STEPS_PER_DAY));
  return s >= days * STEPS_PER_DAY ? { day: days - 1, tick: STEPS_PER_DAY } : { day: Math.floor(s / STEPS_PER_DAY), tick: s % STEPS_PER_DAY };
};
export const stepOf = (c: Cursor) => c.day * STEPS_PER_DAY + c.tick;
export const totalSteps = (days: number) => days * STEPS_PER_DAY;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export interface SimView {
  cursor: Cursor;
  realisedByCarrier: Record<string, number>;   // realised extra earnings so far (completed days + the part of today already completed)
  realisedTotal: number;
  sharedJobsDone: number;                      // jobs whose drop is before now
  sharedAccepted: number;                      // jobs accepted so far, today included
  completedDays: number;
  deltaContributionByCarrier: Record<string, number>;   // B − A over the days completed so far
  deltaContributionTotal: number;
  servedA: number; servedB: number; unservedA: number; unservedB: number;   // completed days
  today: SimTick;
  recent: SimJob[];                            // last accepted jobs, newest first
  byCarrier: Record<string, { servedA: number; servedB: number; accepted: number; done: number; violations: number }>;   // one carrier's own figures (completed days for served and violations)
}

export function viewAt(data: SimData, step: number, carriers: string[]): SimView {
  const c = cursorOf(step, data.days.length);
  const day = data.days[c.day];
  const tick = day.timeline.B[Math.min(c.tick, day.timeline.B.length - 1)];
  const atEnd = c.tick >= STEPS_PER_DAY;                        // only the very last step of the month
  const finished = atEnd ? c.day + 1 : c.day;                    // days fully completed
  const prev = finished > 0 ? data.cumulative[finished - 1] : null;
  const realisedByCarrier: Record<string, number> = {};
  for (const id of carriers) realisedByCarrier[id] = (prev?.realised_extra[id] ?? 0) + (atEnd ? 0 : tick.realised_extra[id] ?? 0);
  const deltaBy: Record<string, number> = {};
  for (const id of carriers) deltaBy[id] = prev?.delta_contribution[id] ?? 0;
  const done = data.days.slice(0, finished);
  const doneJobs = sum(done.map((d) => d.shared_jobs.length)) + (atEnd ? 0 : day.shared_jobs.filter((j) => j.drop_min <= tick.t).length);
  const accepted = sum(done.map((d) => d.shared_jobs.length)) + (atEnd ? 0 : tick.shared_accepted);
  const recent = recentJobs(data, step, null);
  const byCarrier: SimView["byCarrier"] = {};
  for (const id of carriers) {
    const jobsOf = (d: SimDay) => d.shared_jobs.filter((j) => j.carrier_id === id);
    byCarrier[id] = {
      servedA: sum(done.map((d) => d.A.per_carrier[id]?.loads_served ?? 0)), servedB: sum(done.map((d) => d.B.per_carrier[id]?.loads_served ?? 0)),
      accepted: sum(done.map((d) => jobsOf(d).length)) + (atEnd ? 0 : jobsOf(day).filter((j) => j.accepted_at <= tick.t).length),
      done: sum(done.map((d) => jobsOf(d).length)) + (atEnd ? 0 : jobsOf(day).filter((j) => j.drop_min <= tick.t).length),
      violations: sum(done.map((d) => (d.A.per_carrier[id]?.commitment_violations ?? 0) + (d.B.per_carrier[id]?.commitment_violations ?? 0))),
    };
  }
  return {
    cursor: c, realisedByCarrier, realisedTotal: sum(Object.values(realisedByCarrier)), sharedJobsDone: doneJobs, sharedAccepted: accepted, completedDays: finished,
    deltaContributionByCarrier: deltaBy, deltaContributionTotal: sum(Object.values(deltaBy)),
    servedA: sum(done.map((d) => d.A.loads_served)), servedB: sum(done.map((d) => d.B.loads_served)), unservedA: sum(done.map((d) => d.A.unserved)), unservedB: sum(done.map((d) => d.B.unserved)),
    today: tick, recent, byCarrier,
  };
}

const BORDER_MIN = 60;   // the crossing allowance of the backend (SG <-> MY), per leg that changes country

/** The routes of one day as the trajectories the map component draws: legs with the times the backend computed (the frontend never invents times). */
export function routesToTrajectory(routes: Record<string, SimStop[]>, vehicles: { id: string; carrier_id: string; base_node: string }[], geo: Geometry, planLabel: string, onlyCarrier: string | null): TrajectoryVM {
  const idx = new Map(geo.nodes.map((n, i) => [n.id, i] as const));
  const leg = (a: number, b: number) => (a === b ? 0 : geo.time_min[a][b] + (geo.nodes[a].country !== geo.nodes[b].country ? BORDER_MIN : 0));
  const out: TrajectoryVM["vehicles"] = [], events: TrajectoryVM["events"] = [];
  for (const v of vehicles) {
    const stops = routes[v.id];
    if (!stops || stops.length === 0 || (onlyCarrier !== null && v.carrier_id !== onlyCarrier)) continue;
    const home = idx.get(v.base_node)!, onboard = new Set<string>(), segments: Segment[] = [];
    let at = home, t = Math.max(0, stops[0].arrive_min - Math.ceil(leg(home, idx.get(stops[0].node)!))), km = 0;
    const travel = (to: number, t1: number) => {
      if (to === at) return;
      const d = geo.dist_km[at][to];
      segments.push({ t0: t, t1: Math.max(t, t1), kind: "travel", from: at, to, loaded: onboard.size > 0, loadId: onboard.size ? [...onboard][0] : null, temp: null, km: d });
      km += d; at = to; t = Math.max(t, t1);
    };
    for (const s of stops) {
      const to = idx.get(s.node)!;
      travel(to, s.arrive_min);
      if (s.kind === "PICKUP") onboard.add(s.load_id); else onboard.delete(s.load_id);
      segments.push({ t0: Math.max(t, s.arrive_min), t1: Math.max(t, s.depart_min), kind: "dwell", from: to, to, loaded: onboard.size > 0, loadId: s.load_id, temp: null, km: 0 });
      t = Math.max(t, s.depart_min);
      events.push({ t: s.arrive_min, vehicleId: v.id, kind: s.kind === "PICKUP" ? "pickup" : "drop", node: to, loadId: s.load_id });
    }
    travel(home, t + Math.ceil(leg(at, home)));           // back to the base after the last stop
    out.push({ vehicleId: v.id, carrierId: v.carrier_id, homeNode: home, segments, km });
  }
  const all = out.flatMap((v) => v.segments);
  events.sort((a, b) => a.t - b.t);
  return { planLabel, startMin: all.length ? Math.min(...all.map((s) => s.t0)) : 0, endMin: all.length ? Math.max(...all.map((s) => s.t1)) : 0, vehicles: out, events };
}

/** The trucks that carry a shared job at minute t of this day (optionally only one carrier's). */
export function sharedOnRoad(day: SimDay, t: number, carrier: string | null): Set<string> {
  return new Set(day.shared_jobs.filter((j) => j.pickup_min <= t && t <= j.drop_min && (carrier === null || j.carrier_id === carrier)).map((j) => j.vehicle_id));
}

/** Day labels for a chart axis: a round step, always starting at 0 and ending at the number of days (a label that would sit on top of the end is dropped). */
export function axisTicks(days: number): number[] {
  const step = [1, 2, 5, 10, 15, 20, 25, 30, 50].find((s) => Math.floor(days / s) + 1 <= 7) ?? 50;
  const ticks = Array.from({ length: Math.floor(days / step) + 1 }, (_, k) => k * step);
  if (ticks[ticks.length - 1] !== days) {
    if (days - ticks[ticks.length - 1] < step / 2) ticks.pop();
    ticks.push(days);
  }
  return ticks;
}

/** How many days may be typed: the live limit when a live server exists, otherwise only what was recorded. */
export const liveLimit = (liveServer: boolean, recordedDays: number, max = 90): number => (liveServer ? max : recordedDays);

/** What a typed number of days means: up to the recorded days the recording is shown at once, beyond it the backend computes live. */
export function planFor(n: number, recordedDays: number, liveMax = 90): { kind: "recorded" | "live"; days: number } {
  const days = Math.max(1, Math.min(Math.floor(n) || 1, liveMax));
  return { kind: days <= recordedDays ? "recorded" : "live", days };
}

export interface CarrierDay { arrived: SimJob[]; pending: SimJob[]; taken: SimJob[]; declined: SimJob[]; declinedCount: number; inProgress: SimJob[]; done: SimJob[]; realised: number; pendingNet: number }

/** One carrier's opportunities of a day at minute `now`: those the platform has found so far, split by what the carrier decided. Realised money = net of the taken jobs already delivered. */
export function carrierDay(day: SimDay, carrier: string, now: number, taken: Set<string>, declined: Set<string>): CarrierDay {
  const arrived = day.shared_jobs.filter((j) => j.carrier_id === carrier && j.accepted_at <= now).sort((a, b) => a.accepted_at - b.accepted_at || a.load_id.localeCompare(b.load_id));
  const takenJobs = arrived.filter((j) => taken.has(j.load_id)), pending = arrived.filter((j) => !taken.has(j.load_id) && !declined.has(j.load_id));
  const done = takenJobs.filter((j) => j.drop_min <= now);
  return { arrived, pending, taken: takenJobs, declined: arrived.filter((j) => declined.has(j.load_id) && !taken.has(j.load_id)), inProgress: takenJobs.filter((j) => j.drop_min > now), done,
    declinedCount: arrived.filter((j) => declined.has(j.load_id) && !taken.has(j.load_id)).length,
    realised: Math.round(done.reduce((s, j) => s + j.net_incremental, 0) * 100) / 100, pendingNet: Math.round(pending.reduce((s, j) => s + j.net_incremental, 0) * 100) / 100 };
}

/** The live session of one carrier as the same day view the replay gives. The money figure is the server's own (it counts a job when it is delivered). */
export function fromSession(s: SessionStateVM): CarrierDay {
  const job = (o: SessionOpportunityVM): SimJob => ({ opportunity_id: o.opportunity_id, load_id: o.load_id, carrier_id: s.carrier_id, vehicle_id: o.vehicle_id, accepted_at: o.shown_at, pickup_min: o.pickup_min, drop_min: o.drop_min,
    origin: o.origin, destination: o.destination, pallets: o.pallets, payout: o.payout, marginal_cost: o.marginal_cost, net_incremental: o.net_incremental, temp_class: o.temp_class, detour_km: o.detour_km,
    detour_min: o.detour_min, delay_max_min: o.delay_max_min, delay_imposed: o.delay_imposed, recommended: o.recommended, reasons: o.reasons });
  const pending = s.pending.map(job), taken = s.taken.map(job), done = s.taken.filter((o) => o.delivered).map(job);
  return { arrived: [...taken, ...pending], pending, taken, declined: [], declinedCount: s.declined, inProgress: s.taken.filter((o) => !o.delivered).map(job), done, realised: s.realised.amount,
    pendingNet: Math.round(pending.reduce((a, j) => a + j.net_incremental, 0) * 100) / 100 };
}

/** The first n recorded days (whole days, at least one, at most what was recorded). The recording is fixed, so a longer period needs a new run of the backend simulation. */
export function firstDays(data: SimData, n: number): SimData {
  const k = Math.max(1, Math.min(Math.floor(n) || 1, data.days.length));
  return { ...data, meta: { ...data.meta, days: k }, days: data.days.slice(0, k), cumulative: data.cumulative.slice(0, k) };
}

/** The last accepted shared jobs up to this step, newest first; with a carrier id only that carrier's own jobs. */
export function recentJobs(data: SimData, step: number, carrier: string | null, n = 8): SimJob[] {
  const c = cursorOf(step, data.days.length), day = data.days[c.day], tick = day.timeline.B[Math.min(c.tick, day.timeline.B.length - 1)];
  const mine = (j: SimJob) => carrier === null || j.carrier_id === carrier;
  return [...data.days.slice(0, c.day).flatMap((d) => d.shared_jobs.filter(mine).map((j) => ({ ...j, _day: d.day }))), ...day.shared_jobs.filter((j) => mine(j) && j.accepted_at <= tick.t).map((j) => ({ ...j, _day: day.day }))]
    .sort((a, b) => (a._day - b._day) || (a.accepted_at - b.accepted_at)).slice(-n).reverse();
}

// ---- live: the backend streams one line of JSON per message (scripts/demo_server.py); the data grows day by day
export type SimMessage =
  | { type: "meta"; meta: SimData["meta"]; world: SimData["world"] }
  | { type: "day"; row: SimDay; cumulative: SimData["cumulative"][number] }
  | { type: "totals"; totals: SimData["totals"] };

export const emptyLive = (meta: SimData["meta"], world: SimData["world"]): SimData => ({ meta, world, days: [], cumulative: [], totals: { per_carrier: {}, network: {} } });
export const appendDay = (data: SimData, row: SimDay, cumulative: SimData["cumulative"][number]): SimData =>
  ({ ...data, meta: { ...data.meta, days: data.days.length + 1 }, days: [...data.days, row], cumulative: [...data.cumulative, cumulative] });

/** Complete lines of `rest + chunk`, and the unfinished tail to keep for the next chunk. */
export function splitLines(rest: string, chunk: string): { lines: string[]; rest: string } {
  const parts = (rest + chunk).split("\n");
  return { lines: parts.slice(0, -1).filter((l) => l.trim() !== ""), rest: parts[parts.length - 1] };
}

export interface LiveSettings { days: number; seed: number; loads: number }
export async function streamSimulation(s: LiveSettings, signal: AbortSignal, onMessage: (m: SimMessage) => void): Promise<void> {
  const r = await fetch(`/api/simulate?days=${s.days}&seed=${s.seed}&loads=${s.loads}`, { signal });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { msg = ((await r.json()) as { error?: string }).error ?? msg; } catch { /* keep the status */ }
    throw new Error(msg);
  }
  if (!r.body) throw new Error("the server sent no stream");
  const reader = r.body.getReader(), dec = new TextDecoder();
  let rest = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const out = splitLines(rest, dec.decode(value, { stream: true }));
    rest = out.rest;
    for (const line of out.lines) onMessage(JSON.parse(line) as SimMessage);
  }
  if (rest.trim()) onMessage(JSON.parse(rest) as SimMessage);
}

export async function loadSimulation(url = "/demo/simulation.json"): Promise<SimData> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`simulation data not found at ${url} (run scripts/demo_simulation.py and copy the JSON to public/demo/)`);
  return (await r.json()) as SimData;
}
