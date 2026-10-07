import type { Geometry, Segment, TrajectoryVM } from "../api/types";
import { decodePolyline } from "./polyline";

export interface Pos { vehicleId: string; carrierId: string; x: number; y: number; loaded: boolean; state: "moving" | "dwelling" | "idle"; heading: number }
type Path = { pts: [number, number][]; cum: number[]; total: number };
const cache = new WeakMap<Geometry, Map<string, Path>>();

function build(pts: [number, number][]): Path {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, total: cum[cum.length - 1] };
}

/** The road from place `from` to place `to` as a polyline; the geometry stores each unordered pair once, so the other direction is walked backwards. */
export function pathFor(g: Geometry, from: number, to: number): Path {
  let m = cache.get(g);
  if (!m) { m = new Map(); cache.set(g, m); }
  const key = `${from}-${to}`;
  const hit = m.get(key);
  if (hit) return hit;
  const enc = g.pairs[from < to ? `${from}-${to}` : `${to}-${from}`];
  let pts: [number, number][] = enc ? decodePolyline(enc) : [[g.nodes[from].lon, g.nodes[from].lat], [g.nodes[to].lon, g.nodes[to].lat]];
  if (from > to && enc) pts = [...pts].reverse();
  const p = build(pts);
  m.set(key, p);
  return p;
}

/** Point at fraction f (0..1) of the polyline length, with the heading of the road there. */
export function along(p: Path, f: number): { x: number; y: number; heading: number } {
  if (p.total === 0) return { x: p.pts[0][0], y: p.pts[0][1], heading: 0 };
  const target = Math.min(1, Math.max(0, f)) * p.total;
  let i = 1;
  while (i < p.cum.length - 1 && p.cum[i] < target) i++;
  const a = p.pts[i - 1], b = p.pts[i];
  const seg = p.cum[i] - p.cum[i - 1] || 1, u = (target - p.cum[i - 1]) / seg;
  return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, heading: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}

/** Where every vehicle is at time t (minutes of the day): interpolated along the stored road; the frontend never invents times. */
export function positionsAt(tr: TrajectoryVM, g: Geometry, t: number): Pos[] {
  return tr.vehicles.map((v) => {
    const node = (n: number) => [g.nodes[n].lon, g.nodes[n].lat] as [number, number];
    const segs = v.segments;
    const base = { vehicleId: v.vehicleId, carrierId: v.carrierId };
    if (!segs.length) { const [x, y] = node(v.homeNode); return { ...base, x, y, loaded: false, state: "idle" as const, heading: 0 }; }
    if (t <= segs[0].t0) { const [x, y] = node(segs[0].from); return { ...base, x, y, loaded: false, state: "idle" as const, heading: 0 }; }
    const last = segs[segs.length - 1];
    if (t >= last.t1) { const [x, y] = node(last.to); return { ...base, x, y, loaded: false, state: "idle" as const, heading: 0 }; }
    let lo = 0, hi = segs.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (segs[mid].t0 <= t) lo = mid; else hi = mid - 1; }
    const s = segs[lo];
    if (s.kind === "dwell" || s.from === s.to || s.t1 === s.t0) { const [x, y] = node(s.from); return { ...base, x, y, loaded: s.loaded, state: s.kind === "dwell" ? "dwelling" as const : "moving" as const, heading: 0 }; }
    const a = along(pathFor(g, s.from, s.to), (t - s.t0) / (s.t1 - s.t0));
    return { ...base, x: a.x, y: a.y, loaded: s.loaded, state: "moving" as const, heading: a.heading };
  });
}

export interface Counters { active: number; onboard: number; emptyKm: number; co2Kg: number; doneLoads: number }
export const CO2_EMPTY = 0.55, CO2_LOADED = 0.85;   // kg per km, fixture values of the mock (the real backend sends the numbers)

/** Counters up to time t from the stored segments (distance walked so far, split by empty and loaded). */
export function countersAt(tr: TrajectoryVM, t: number, pos: Pos[]): Counters {
  let emptyKm = 0, loadedKm = 0;
  for (const v of tr.vehicles) for (const s of v.segments) {
    if (s.kind !== "travel" || s.t0 >= t || s.t1 === s.t0) continue;
    const km = s.t1 <= t ? s.km : s.km * ((t - s.t0) / (s.t1 - s.t0));
    if (s.loaded) loadedKm += km; else emptyKm += km;
  }
  return { active: pos.filter((p) => p.state === "moving").length, onboard: pos.filter((p) => p.loaded && p.state !== "idle").length, emptyKm, co2Kg: emptyKm * CO2_EMPTY + loadedKm * CO2_LOADED, doneLoads: tr.events.filter((e) => e.kind === "drop" && e.t <= t).length };
}

export function nextEventTime(tr: TrajectoryVM, t: number): number | null {
  for (const e of tr.events) if (e.t > t) return e.t;
  return null;
}

/** The polyline a vehicle walked between ta and tb (for the trail), following the real road. */
export function travelled(tr: TrajectoryVM, g: Geometry, vehicleId: string, ta: number, tb: number): [number, number][] {
  const v = tr.vehicles.find((x) => x.vehicleId === vehicleId);
  if (!v || tb <= ta) return [];
  const out: [number, number][] = [];
  for (const s of v.segments as Segment[]) {
    if (s.kind !== "travel" || s.from === s.to || s.t1 <= ta || s.t0 >= tb || s.t1 === s.t0) continue;
    const p = pathFor(g, s.from, s.to);
    const f0 = (Math.max(s.t0, ta) - s.t0) / (s.t1 - s.t0), f1 = (Math.min(s.t1, tb) - s.t0) / (s.t1 - s.t0);
    const a = f0 * p.total, b = f1 * p.total;
    const at = (d: number): [number, number] => { const r = along(p, d / (p.total || 1)); return [r.x, r.y]; };
    out.push(at(a));
    for (let i = 0; i < p.cum.length; i++) if (p.cum[i] > a && p.cum[i] < b) out.push(p.pts[i]);
    out.push(at(b));
  }
  return out;
}
