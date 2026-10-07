import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Geometry, TrajectoryVM } from "../api/types";
import { decodePolyline } from "../lib/polyline";
import { pathFor, travelled, type Pos } from "../lib/replay";

// Fleet colours avoid the three role colours (orange, green, blue) so a route is never mistaken for a role.
export const CARRIER_COLOR: Record<string, string> = { "C-1": "#7C3AED", "C-2": "#DB2777", "C-3": "#0E7490", "C-4": "#92400E", "C-5": "#4D7C0F", "C-6": "#334155" };
const colorOf = (c: string) => CARRIER_COLOR[c] ?? "#555";
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

interface Props {
  geo: Geometry; tr: TrajectoryVM; t: number; pos: Pos[]; selected: string | null; showRoutes: boolean; showTrails: boolean; height: number | string; onOffline?: (offline: boolean) => void;
  highlight?: { from: number; to: number } | null;   // a load to show: its road from origin to destination, and the map zooms to it
  fitToTrucks?: boolean;
  marked?: Set<string>;                                // trucks to ring (the simulated earnings page marks the trucks that carry a shared job)                               // with no highlight: zoom to where the trucks are (default: the whole network)
}

/** Real map (OpenStreetMap tiles through Leaflet) with our own canvas on top: the real road polylines, the places and the moving trucks.
 *  When the tiles cannot be loaded (no network) the canvas still draws everything on a plain background. */
export function ReplayMap({ geo, tr, t, pos, selected, showRoutes, showTrails, height, onOffline, highlight = null, fitToTrucks = false, marked }: Props) {
  const box = useRef<HTMLDivElement>(null), cv = useRef<HTMLCanvasElement>(null), mapRef = useRef<L.Map | null>(null);
  const latest = useRef({ geo, tr, t, pos, selected, showRoutes, showTrails, highlight, marked });
  latest.current = { geo, tr, t, pos, selected, showRoutes, showTrails, highlight, marked };
  const [, bump] = useState(0);
  const base = useMemo(() => Object.entries(geo.pairs).map(([k, enc]) => ({ key: k, pts: decodePolyline(enc) })), [geo]);

  const draw = () => {
    const map = mapRef.current, c = cv.current, el = box.current;
    if (!map || !c || !el) return;
    const { geo: g, tr: trj, t: now, pos: ps, selected: sel, showRoutes: routes, showTrails: trails, highlight: hl, marked: ring } = latest.current;
    const dpr = window.devicePixelRatio || 1, W = el.clientWidth, H = el.clientHeight;
    if (c.width !== W * dpr || c.height !== H * dpr) { c.width = W * dpr; c.height = H * dpr; }
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const P = (lon: number, lat: number): [number, number] => { const p = map.latLngToContainerPoint([lat, lon]); return [p.x, p.y]; };
    const stroke = (pts: [number, number][]) => { ctx.beginPath(); pts.forEach((q, i) => { const [x, y] = P(q[0], q[1]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke(); };
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(60,72,88,0.35)"; ctx.lineWidth = 1.1;           // the whole road network, faint
    for (const b of base) stroke(b.pts);
    if (routes) {                                                           // the legs the committed plan drives, in carrier colours
      const carrierOfLeg = new Map<string, string>();
      for (const v of trj.vehicles) for (const sg of v.segments) if (sg.kind === "travel" && sg.from !== sg.to && (sel === null || sel === v.vehicleId)) carrierOfLeg.set(`${sg.from}-${sg.to}`, v.carrierId);
      ctx.lineWidth = 3; ctx.globalAlpha = 0.8;
      for (const [k, car] of carrierOfLeg) { const [a, b] = k.split("-").map(Number); ctx.strokeStyle = colorOf(car); stroke(pathFor(g, a, b).pts); }
      ctx.globalAlpha = 1;
    }
    if (trails) {
      for (const p of ps) {
        if (p.state === "idle" || (sel !== null && sel !== p.vehicleId)) continue;
        ctx.strokeStyle = colorOf(p.carrierId); ctx.lineWidth = sel === p.vehicleId ? 5 : 4;
        for (let i = 0; i < 5; i++) {
          const pts = travelled(trj, g, p.vehicleId, Math.max(0, now - (i + 1) * 3), Math.max(0, now - i * 3));
          if (pts.length < 2) continue;
          ctx.globalAlpha = 0.85 * (1 - i / 5); stroke(pts);
        }
        ctx.globalAlpha = 1;
      }
    }
    if (hl) {                                                               // the selected load: its real road, dashed, with origin and destination
      const pts = pathFor(g, hl.from, hl.to).pts;
      ctx.strokeStyle = "#163A5F"; ctx.lineWidth = 4; ctx.setLineDash([9, 6]); stroke(pts); ctx.setLineDash([]);
      const [ox, oy] = P(pts[0][0], pts[0][1]), [dx, dy] = P(pts[pts.length - 1][0], pts[pts.length - 1][1]);
      ctx.fillStyle = "#163A5F"; ctx.beginPath(); ctx.arc(ox, oy, 8, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.strokeStyle = "#163A5F"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(dx, dy, 8, 0, 7); ctx.fill(); ctx.stroke();
    }
    const zoom = map.getZoom();                                             // places: dots, names of the busy ones
    const busy = new Set<number>(); for (const e of trj.events) busy.add(e.node);
    if (hl) { busy.add(hl.from); busy.add(hl.to); }
    g.nodes.forEach((n, i) => {
      const [x, y] = P(n.lon, n.lat);
      ctx.fillStyle = n.country === "SG" ? "#e11d48" : "#475569"; ctx.beginPath(); ctx.arc(x, y, busy.has(i) ? 4.5 : 3, 0, 7); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.2; ctx.stroke();
      if (busy.has(i) || zoom >= 10) { ctx.fillStyle = "#1d2129"; ctx.font = "11px sans-serif"; ctx.fillText(n.name, x + 7, y + 4); }
    });
    for (const p of ps) {                                                   // trucks: filled = loaded, hollow = empty, ring = loading or unloading
      if (sel !== null && sel !== p.vehicleId) continue;
      const [x, y] = P(p.x, p.y), col = colorOf(p.carrierId);
      const h = p.heading ? -p.heading : 0;
      ctx.save(); ctx.translate(x, y); ctx.rotate(p.state === "moving" ? h : 0);
      if (ring?.has(p.vehicleId)) { ctx.strokeStyle = "#F59E0B"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 17, 0, 7); ctx.stroke(); }
      if (sel === p.vehicleId) { ctx.strokeStyle = "#1d2129"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 14, 0, 7); ctx.stroke(); }
      ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.fillStyle = p.loaded ? col : "#ffffff";
      ctx.fillRect(-11, -5, 15, 10); ctx.strokeRect(-11, -5, 15, 10);
      ctx.fillStyle = col; ctx.fillRect(5, -4, 6, 8);
      if (p.state === "dwelling") { ctx.strokeStyle = "#1d2129"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, 11, 0, 7); ctx.stroke(); }
      ctx.restore();
    }
  };

  useEffect(() => {
    const el = box.current; if (!el) return;
    const map = L.map(el, { zoomControl: true, attributionControl: true, preferCanvas: true, zoomSnap: 0.25 });
    mapRef.current = map;
    let ok = 0, bad = 0;
    const layer = L.tileLayer(TILES, { maxZoom: 18, attribution: geo.attribution || "© OpenStreetMap contributors" }).addTo(map);
    layer.on("tileload", () => { ok += 1; if (ok === 1) onOffline?.(false); });
    layer.on("tileerror", () => { bad += 1; if (ok === 0 && bad >= 3) onOffline?.(true); });   // no tile ever arrived: the plain background stays
    const b = L.latLngBounds(geo.nodes.map((n) => [n.lat, n.lon] as [number, number]));
    map.fitBounds(b.pad(0.08));
    const redraw = () => draw();
    map.on("move zoom resize viewreset", redraw);
    const ro = new ResizeObserver(() => { map.invalidateSize(); bump((n) => n + 1); }); ro.observe(el);
    redraw();
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo]);
  // zoom to the selected load's road whenever the selection changes
  useEffect(() => {
    const map = mapRef.current; if (!map || !highlight) return;
    const pts = pathFor(geo, highlight.from, highlight.to).pts.map(([lon, lat]) => [lat, lon] as [number, number]);
    map.fitBounds(L.latLngBounds(pts).pad(0.25), { maxZoom: 11, animate: false });
  }, [highlight?.from, highlight?.to, geo]);   // eslint-disable-line react-hooks/exhaustive-deps
  const truckKey = pos.map((p) => p.vehicleId).join(",");
  useEffect(() => {
    const map = mapRef.current; if (!map || highlight || !fitToTrucks || pos.length === 0) return;
    const pts = pos.map((p) => [p.y, p.x] as [number, number]);
    if (pts.length === 1) map.setView(pts[0], 10, { animate: false });
    else map.fitBounds(L.latLngBounds(pts).pad(0.35), { maxZoom: 11, animate: false });
  }, [truckKey, highlight?.from, highlight?.to, geo]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { draw(); });   // every change of time, selection or switches

  return (
    <div style={{ position: "relative", height, borderRadius: 8, overflow: "hidden", border: "1px solid var(--line)", background: "#f7f8fa" }}>
      <div ref={box} style={{ position: "absolute", inset: 0 }} />
      <canvas ref={cv} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 500 }} />
    </div>
  );
}
