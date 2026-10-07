import { useEffect, useId, useRef, useState, type ReactNode } from "react";

// Small dependency-free SVG charts for the operator console. They are drawn at the real pixel width of their container (fixed font sizes, capped bar
// widths, fixed row heights), so they look the same on a laptop and on a very wide screen instead of scaling up with it.
const GOOD = "#16A34A", BAD = "#DC2626", INK = "#1D2939", MUTE = "#667085", GRID = "#EEF1F5";

export function Sized({ height, children }: { height: number; children: (w: number) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.floor(el.clientWidth)));
    ro.observe(el); setW(Math.floor(el.clientWidth));
    return () => ro.disconnect();
  }, []);
  return <div ref={ref} style={{ width: "100%", height }}>{w > 0 && children(w)}</div>;
}

export function Sparkline({ values, color = "var(--primary)", width = 84, height = 28 }: { values: number[]; color?: string; width?: number; height?: number }) {
  const id = useId();
  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (width - 4) + 2, height - 3 - ((v - min) / span) * (height - 8)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.28" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`${line} L${pts[pts.length - 1][0]},${height} L${pts[0][0]},${height} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.6" fill={color} />
    </svg>
  );
}

/** One bar per category; the best one (highest or lowest, as `better` says) is green. */
export function Bars({ items, better, height = 176 }: { items: { label: string; value: number }[]; better: "high" | "low"; height?: number }) {
  const best = better === "high" ? Math.max(...items.map((i) => i.value)) : Math.min(...items.map((i) => i.value));
  return (
    <Sized height={height}>{(W) => {
      const pad = { l: 12, r: 12, t: 22, b: 26 }, slot = (W - pad.l - pad.r) / items.length, bw = Math.min(72, slot * 0.5), max = Math.max(...items.map((i) => i.value)) * 1.05 || 1;
      return (
        <svg width={W} height={height} role="img">
          {[0.5, 1].map((f) => <line key={f} x1={pad.l} x2={W - pad.r} y1={height - pad.b - (height - pad.t - pad.b) * f / 1.05} y2={height - pad.b - (height - pad.t - pad.b) * f / 1.05} stroke={GRID} strokeDasharray="3 4" />)}
          <line x1={pad.l} x2={W - pad.r} y1={height - pad.b} y2={height - pad.b} stroke="#E4E7EC" />
          {items.map((it, i) => {
            const h = Math.max(2, ((height - pad.t - pad.b) * it.value) / max), cx = pad.l + slot * (i + 0.5), y = height - pad.b - h, isBest = it.value === best;
            return (
              <g key={it.label}>
                <rect x={cx - bw / 2} y={y} width={bw} height={h} rx="6" fill={isBest ? GOOD : "#CBD5E1"} />
                <text x={cx} y={y - 6} textAnchor="middle" fontSize="12" fontWeight="700" fill={INK}>{Math.round(it.value).toLocaleString("en-US")}</text>
                <text x={cx} y={height - 8} textAnchor="middle" fontSize="11" fill={MUTE}>{it.label}</text>
              </g>
            );
          })}
        </svg>
      );
    }}</Sized>
  );
}

/** A line over a numeric x axis with a min-max band (the spread between random seeds). */
export function LineBand({ points, xLabel, yLabel, color = "var(--primary)", height = 216 }: { points: { x: number; y: number; lo: number; hi: number }[]; xLabel: string; yLabel: string; color?: string; height?: number }) {
  return (
    <Sized height={height}>{(W) => {
      const p = { l: 44, r: 10, t: 28, b: 34 };
      const xs = points.map((q) => q.x), ys = points.flatMap((q) => [q.lo, q.hi]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys) * 0.97, y1 = Math.max(...ys) * 1.03;
      const X = (x: number) => p.l + ((x - x0) / (x1 - x0 || 1)) * (W - p.l - p.r), Y = (y: number) => height - p.b - ((y - y0) / (y1 - y0 || 1)) * (height - p.t - p.b);
      const line = points.map((q, i) => `${i ? "L" : "M"}${X(q.x).toFixed(1)},${Y(q.y).toFixed(1)}`).join(" ");
      const band = `${points.map((q, i) => `${i ? "L" : "M"}${X(q.x).toFixed(1)},${Y(q.hi).toFixed(1)}`).join(" ")} ${[...points].reverse().map((q) => `L${X(q.x).toFixed(1)},${Y(q.lo).toFixed(1)}`).join(" ")} Z`;
      return (
        <svg width={W} height={height} role="img">
          {[0, 0.5, 1].map((f) => { const v = y0 + f * (y1 - y0); return <g key={f}><line x1={p.l} x2={W - p.r} y1={Y(v)} y2={Y(v)} stroke={GRID} /><text x={p.l - 6} y={Y(v) + 4} textAnchor="end" fontSize="11" fill={MUTE}>{Math.round(v).toLocaleString("en-US")}</text></g>; })}
          <path d={band} fill={color} opacity="0.14" />
          <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
          {points.map((q) => <circle key={q.x} cx={X(q.x)} cy={Y(q.y)} r="2.8" fill={color} />)}
          {points.filter((_, i) => i % 2 === 0).map((q) => <text key={q.x} x={X(q.x)} y={height - 18} textAnchor="middle" fontSize="11" fill={MUTE}>{q.x}%</text>)}
          <text x={(p.l + W - p.r) / 2} y={height - 3} textAnchor="middle" fontSize="11" fill={MUTE}>{xLabel}</text>
          <text x={4} y={11} fontSize="11" fill={MUTE}>{yLabel}</text>
        </svg>
      );
    }}</Sized>
  );
}

/** Signed horizontal bars: a gain goes right in green, a loss goes left in red. */
export function SignedBars({ items, prefix = "" }: { items: { label: string; value: number }[]; prefix?: string }) {
  const rowH = 32, h = items.length * rowH + 6, max = Math.max(...items.map((i) => Math.abs(i.value))) || 1;
  const hasNeg = items.some((i) => i.value < 0);
  return (
    <Sized height={h}>{(W) => {
      const labelW = Math.min(190, W * 0.42), x0 = labelW + 8, x1 = W - 8, mid = hasNeg ? x0 + (x1 - x0) * 0.35 : x0 + 4, room = (side: number) => Math.max(20, side - 62);
      return (
        <svg width={W} height={h} role="img">
          <line x1={mid} x2={mid} y1={2} y2={h - 2} stroke="#D0D5DD" />
          {items.map((it, i) => {
            const pos = it.value >= 0, w = (Math.abs(it.value) / max) * room(pos ? x1 - mid : mid - x0), y = i * rowH + 7;
            return (
              <g key={it.label}>
                <text x={0} y={y + 11} fontSize="12" fontWeight="600" fill={INK}>{it.label}</text>
                <rect x={pos ? mid : mid - w} y={y} width={w} height={14} rx="4" fill={pos ? GOOD : BAD} opacity={pos ? 0.85 : 1} />
                <text x={pos ? mid + w + 6 : mid - w - 6} y={y + 11} textAnchor={pos ? "start" : "end"} fontSize="12" fontWeight="700" fill={pos ? GOOD : BAD}>{pos ? "+" : "−"}{prefix}{Math.abs(Math.round(it.value)).toLocaleString("en-US")}</text>
              </g>
            );
          })}
        </svg>
      );
    }}</Sized>
  );
}
