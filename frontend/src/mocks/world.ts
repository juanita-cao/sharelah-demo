// Stateful mock of the backend (view-model fixtures). Every number is a fixture placeholder for the UI, not a result of any solver.
import { COMPANIES } from "../data/companies";
import { placeName } from "../data/places";
import type {
  ApplyResult, ApprovalPreviewVM, AssumptionVM, CapacityOfferVM, CapacityPostVM, FreeSpaceVM, ExcludedVM, JobVM, KpiVM, LoadVM, OfferVM, OptionRowVM, OptionsVM, PlanDiffVM,
  Geometry, ParticipationPointVM, PriceTableVM, Profile, QuoteEstimateVM, SensitivityRowVM, ReasonVM, ScenarioVM, Segment, TrajectoryVM, StateVM, TempClass, VehicleVM,
} from "../api/types";

export { COMPANIES };

/** Whole-truck price = shared price x this (an assumption of the backend rate card; the mock uses the same value). */
export const EXCLUSIVE_MULTIPLIER = 1.6;
/** A coded refusal, as the backend gives for an offer it cannot accept (backend contract: OFFER_EXCEEDS_FREE_CAPACITY, OFFER_WINDOW_INVALID, VEHICLE_NOT_PERMITTED). */
export class MockRejection extends Error { constructor(public code: string) { super(code); } }
const SHIFT = { start: 360, end: 1320 }, KG_PER_PALLET = 500;

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967295; };
const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

const VEHICLES: VehicleVM[] = [
  ["V-01", "C-1", "DRY_VAN", 22, false, "N-SG-JURONG"], ["V-02", "C-1", "DRY_VAN", 22, true, "N-SG-TUAS"], ["V-03", "C-1", "REEFER_SINGLE", 18, false, "N-SG-PPWC"],
  ["V-04", "C-2", "REEFER_DUAL", 18, false, "N-SG-PPWC"], ["V-05", "C-2", "REEFER_SINGLE", 16, false, "N-MY-JB"], ["V-06", "C-2", "REEFER_DUAL", 20, true, "N-SG-WOODLANDS"],
  ["V-07", "C-2", "REEFER_DUAL", 18, false, "N-MY-JB"], ["V-08", "C-3", "DRY_VAN", 24, false, "N-MY-JB"], ["V-09", "C-3", "REEFER_SINGLE", 16, false, "N-MY-SENAI"],
  ["V-10", "C-3", "REEFER_DUAL", 18, false, "N-MY-KULAI"], ["V-11", "C-4", "REEFER_SINGLE", 18, false, "N-MY-KL"], ["V-12", "C-4", "DRY_VAN", 24, true, "N-MY-MELAKA"],
].map(([vehicleId, carrierId, type, palletCap, dgCapable, position]) => ({ vehicleId, carrierId, type, palletCap, dgCapable, position, freePallets: palletCap, shared: true, weeklyGain: Math.round((type === "DRY_VAN" ? 120 : type === "REEFER_SINGLE" ? 190 : 260) * (0.8 + hash(String(vehicleId)) * 0.5)) } as VehicleVM));

const WEIGHTS: Record<Profile, { cost: number; empty: number; co2: number }> = { PROFIT: { cost: 1, empty: 0.05, co2: 0.1 }, BALANCED: { cost: 0.5, empty: 0.3, co2: 0.3 }, GREEN: { cost: 0.1, empty: 0.4, co2: 3 } };

interface Job { id: string; startedAt: number; floor: boolean; cancelled: boolean; changes: PlanDiffVM["changes"]; candidateId: string; applied: boolean }
interface Preview { candidateId: string; loadId: string; optionId: string; epoch: number; after: KpiVM }

export class MockWorld {
  epoch = 1; declined = new Map<string, Set<string>>(); version = new Map<string, number>(); loads: LoadVM[] = []; offers: (OfferVM & { createdAt: number })[] = []; posts: CapacityPostVM[] = []; capacityOffers: CapacityOfferVM[] = [];
  vehicles: VehicleVM[] = []; price: PriceTableVM; jobs = new Map<string, Job>(); previews = new Map<string, Preview>(); private seq = 108; private t0 = Date.now(); private improvement = 0; private pinned: KpiVM | null = null; private trend = seedTrend(); private lastKey = ""; private matchedAt = new Map<string, number>();  // after an apply the KPIs equal the preview's "after" until something else changes
  constructor() { this.price = defaultPrice(); this.reset(); }

  reset(): number {
    this.epoch += 1; this.t0 = Date.now(); this.seq = 108; this.jobs.clear(); this.previews.clear(); this.improvement = 0; this.pinned = null; this.matchedAt.clear();
    this.vehicles = VEHICLES.map((v) => ({ ...v })); this.offers = []; this.declined = new Map(); this.posts = []; this.capacityOffers = [];
    const mk = (n: number, o: string, d: string, p: number, kg: number, t: TempClass, status: LoadVM["status"], co: string, extra: Partial<LoadVM> = {}): LoadVM => ({
      loadId: `L-0${n}`, companyId: co, origin: o, destination: d, lane: `${placeName(o)} → ${placeName(d)}`, pallets: p, weightKg: kg, tempClass: t, hazardClass: null, flags: [],
      status, urgent: false, ageSec: 30 + n * 7, pickupFromMin: 600, deliverByMin: 1080, etaMin: null, quote: null, vehicleId: null, reasonCode: null, exclusive: false, homeCarrierId: null, customer: null, ...extra,
    });
    this.loads = [
      mk(107, "N-MY-KL", "N-MY-IPOH", 12, 3200, "FROZEN", "RECEIVED", "S-3"), mk(106, "N-SG-PPWC", "N-MY-JB", 6, 1500, "CHILL", "RECEIVED", "S-1", { urgent: true, ageSec: 14 }),
      mk(105, "N-MY-JB", "N-SG-JURONG", 2, 400, "AMB", "UNSERVED", "S-1", { reasonCode: "NO_FEASIBLE_VEHICLE" }),
      mk(103, "N-SG-JFP", "N-SG-WOODLANDS", 5, 1200, "CHILL", "CONFIRMED", "S-1", { vehicleId: "V-04", etaMin: 990, quote: 142 }),
      mk(102, "N-SG-CHANGI", "N-MY-JB", 3, 620, "PHARMA", "IN_TRANSIT", "S-2", { vehicleId: "V-06", etaMin: 930, quote: 210 }),
      mk(101, "N-MY-MELAKA", "N-MY-SEREMBAN", 8, 2100, "AMB", "DONE", "S-3", { vehicleId: "V-12", etaMin: 700, quote: 168 }),
    ];
    return this.epoch;
  }

  nowMin(): number { return 8 * 60 + Math.round(((Date.now() - this.t0) / 1000) * 100) / 100; }   // one real second = one simulated minute (the demo clock)

  kpis(): KpiVM {
    if (this.pinned) return this.pinned;
    const served = this.loads.filter((l) => ["MATCHED", "CONFIRMED", "IN_TRANSIT", "DONE"].includes(l.status));
    const revenue = served.reduce((s, l) => s + (l.quote ?? 0), 0);
    const cost = served.reduce((s, l) => s + 70 + hash(l.loadId) * 40, 0) * (1 - this.improvement);
    const emptyKm = round(180 - served.length * 6 - this.improvement * 400, 0);
    const co2 = round(520 - served.length * 12 - this.improvement * 900, 0);
    return {
      modeledSurplus: round(revenue - cost, 0), operatingCost: round(cost, 0), emptyKm, co2Kg: co2, unserved: this.loads.filter((l) => l.status === "UNSERVED").length, avgSlackMin: 38,
      deltaVsBaseline: { surplus: round(revenue * 0.09 + this.improvement * 900, 0), emptyKm: -round(served.length * 3 + this.improvement * 300, 0), co2Kg: -round(served.length * 5 + this.improvement * 600, 0) },
    };
  }

  state(): StateVM {
    const now = Date.now();
    const k = this.kpis();
    const key = `${k.modeledSurplus}|${k.operatingCost}|${k.emptyKm}|${k.co2Kg}`;
    if (key !== this.lastKey) { this.lastKey = key; for (const [name, v] of [["surplus", k.modeledSurplus], ["cost", k.operatingCost], ["emptyKm", k.emptyKm], ["co2Kg", k.co2Kg]] as const) { this.trend[name].push(v); if (this.trend[name].length > 14) this.trend[name].shift(); } }
    const offers = this.offers.map((o) => {
      const left = Math.max(0, o.expiresInSec - Math.floor((now - o.createdAt) / 1000));
      const status = o.status === "SHOWN" && left === 0 ? "EXPIRED" : o.status;
      return { offerId: o.offerId, loadId: o.loadId, companyId: o.companyId, lane: o.lane, originId: o.originId, destinationId: o.destinationId, pallets: o.pallets, tempClass: o.tempClass, detourKm: o.detourKm, extraMin: o.extraMin, earningsEstimate: o.earningsEstimate, tempFit: o.tempFit, isBackhaul: o.isBackhaul, expiresInSec: left, status, version: o.version } as OfferVM;
    });
    const loads = this.loads.map((l) => ({ ...l, ageSec: l.ageSec + Math.floor((now - this.t0) / 1000) }));
    return {
      kpiTrend: this.trend, epoch: this.epoch, worldHash: "demo-1", queue: loads.filter((l) => l.status === "RECEIVED"), loads, offers, capacityPosts: this.posts, capacityOffers: this.capacityOffers.map((o) => ({ ...o })), vehicles: this.vehicles, kpis: this.kpis(), nowMin: this.nowMin(),
    };
  }

  postLoad(body: Partial<LoadVM> & { origin: string; destination: string }, urgent = false): { loadId: string } {
    this.seq += 1;   // a queued load changes no committed number
    const l: LoadVM = {
      loadId: `L-0${this.seq}`, companyId: body.companyId ?? "S-1", origin: body.origin, destination: body.destination, lane: `${placeName(body.origin)} → ${placeName(body.destination)}`,
      pallets: body.pallets ?? 4, weightKg: body.weightKg ?? 900, tempClass: body.tempClass ?? "CHILL", hazardClass: body.hazardClass ?? null, flags: body.flags ?? [], status: "RECEIVED", urgent,
      ageSec: 0, pickupFromMin: body.pickupFromMin ?? 600, deliverByMin: body.deliverByMin ?? 1080, etaMin: null, quote: null, vehicleId: null, reasonCode: null, exclusive: body.exclusive ?? false,
      homeCarrierId: body.homeCarrierId ?? null, customer: body.customer ?? null,
    };
    this.loads.unshift(l); this.version.set(l.loadId, 1);
    return { loadId: l.loadId };
  }

  urgent(): { loadId: string } {
    return this.postLoad({ origin: "N-SG-PPWC", destination: "N-MY-KL", pallets: 8, weightKg: 1900, tempClass: "FROZEN", companyId: "S-2", flags: ["FOOD"] }, true);
  }

  /** What a truck still has free in a window: capacity minus the peak of what its committed jobs (confirmed or on the road) have on board while the window overlaps them. */
  freeSpace(vehicleId: string, fromMin: number, toMin: number): FreeSpaceVM {
    const v = this.vehicles.find((x) => x.vehicleId === vehicleId);
    if (!v) throw new MockRejection("VEHICLE_NOT_PERMITTED");
    const jobs = this.loads.filter((l) => l.vehicleId === vehicleId && (l.status === "CONFIRMED" || l.status === "IN_TRANSIT") && l.pickupFromMin < toMin && l.deliverByMin > fromMin);
    let peakP = 0, peakKg = 0;
    for (const t of new Set([fromMin, ...jobs.map((l) => Math.max(l.pickupFromMin, fromMin))])) {
      const on = jobs.filter((l) => l.pickupFromMin <= t && t < l.deliverByMin);
      peakP = Math.max(peakP, on.reduce((s, l) => s + l.pallets, 0)); peakKg = Math.max(peakKg, on.reduce((s, l) => s + l.weightKg, 0));
    }
    const capKg = v.palletCap * KG_PER_PALLET;
    return { vehicleId, capacityPallets: v.palletCap, capacityKg: capKg, freePallets: v.palletCap - peakP, freeKg: capKg - peakKg, commitments: jobs.length };
  }

  /** Post a capacity offer. WHOLE_TRUCK means the values are the truck's capacity (so it is refused when the truck has a commitment in the window); PARTIAL carries the entered values. */
  postOffer(b: { companyId: string; vehicleId: string; from: string; to: string; fromMin: number; toMin: number; mode: CapacityOfferVM["mode"]; freePallets: number; freeKg: number; maxDetourKm: number; maxDetourMin: number; toleranceMin: number }): { offerId: string } {
    const v = this.vehicles.find((x) => x.vehicleId === b.vehicleId);
    if (!v || v.carrierId !== b.companyId || !v.shared) throw new MockRejection("VEHICLE_NOT_PERMITTED");
    if (b.fromMin >= b.toMin || b.fromMin < SHIFT.start || b.toMin > SHIFT.end) throw new MockRejection("OFFER_WINDOW_INVALID");
    const free = this.freeSpace(b.vehicleId, b.fromMin, b.toMin);
    const pallets = b.mode === "WHOLE_TRUCK" ? free.capacityPallets : b.freePallets, kg = b.mode === "WHOLE_TRUCK" ? free.capacityKg : b.freeKg;
    if (pallets > free.freePallets || kg > free.freeKg || pallets < 1 || kg <= 0) throw new MockRejection("OFFER_EXCEEDS_FREE_CAPACITY");
    const o: CapacityOfferVM = { offerId: `CO-${this.capacityOffers.length + 1}`, companyId: b.companyId, vehicleId: b.vehicleId, from: b.from, to: b.to, fromMin: b.fromMin, toMin: b.toMin, mode: b.mode,
      freePallets: pallets, freeKg: kg, maxDetourKm: b.maxDetourKm, maxDetourMin: b.maxDetourMin, toleranceMin: b.toleranceMin, status: "ACTIVE", version: 0, adjustments: [] };
    this.capacityOffers.push(o);
    return { offerId: o.offerId };
  }

  withdrawOffer(offerId: string): CapacityOfferVM {
    const o = this.capacityOffers.find((x) => x.offerId === offerId);
    if (!o) throw new MockRejection("OFFER_NOT_FOUND");
    if (o.status !== "ACTIVE") throw new MockRejection("OFFER_NOT_ACTIVE");
    o.status = "WITHDRAWN"; o.version += 1;
    return { ...o };
  }

  postCapacity(b: Partial<CapacityPostVM> & { vehicleId: string; from: string; to: string }): { postId: string } {
    const p: CapacityPostVM = { postId: `P-${this.posts.length + 1}`, companyId: b.companyId ?? "C-2", vehicleId: b.vehicleId, from: b.from, to: b.to, departMin: b.departMin ?? 840, freePallets: b.freePallets ?? 12, freeKg: b.freeKg ?? 3000 };
    this.posts.push(p);
    return { postId: p.postId };
  }

  options(loadId: string, profile: Profile): OptionsVM {
    const load = this.loads.find((l) => l.loadId === loadId);
    if (!load) throw new Error("unknown load");
    const w = WEIGHTS[profile];
    const rows: OptionRowVM[] = []; const excluded: ExcludedVM[] = [];
    for (const v of this.vehicles) {
      const codes: string[] = [];
      if (v.type === "DRY_VAN" && load.tempClass !== "AMB") codes.push("TEMP_INCOMPATIBLE");
      if (load.hazardClass && !v.dgCapable) codes.push("VEHICLE_NOT_DG_CAPABLE");
      if (!v.shared && v.carrierId !== load.homeCarrierId) codes.push("NOT_SHARED");   // a truck the carrier keeps out of the pool serves only that carrier's own customers
      if (this.declined.get(loadId)?.has(v.carrierId)) codes.push("CARRIER_DECLINED");   // a carrier that said no to this load is not offered it again
      if (v.freePallets < load.pallets) codes.push("CAPACITY_PALLETS");
      if (hash(load.loadId + v.vehicleId + "w") < 0.1) codes.push("TIME_WINDOW");
      if (codes.length) { excluded.push({ vehicleId: v.vehicleId, codes }); continue; }
      const r = hash(load.loadId + v.vehicleId);
      const extraKm = round(4 + r * 55, 1), extraCost = round(extraKm * (v.type === "DRY_VAN" ? 1.1 : 1.6) + 30 + hash(load.loadId + v.vehicleId + "k") * 60, 0);
      const co2 = round(extraKm * (v.type === "DRY_VAN" ? 0.19 : 0.27) * (0.5 + hash(load.loadId + v.vehicleId + "c") * 1.3), 1);
      rows.push({ optionId: `O-${load.loadId}-${v.vehicleId}`, rank: 0, vehicleId: v.vehicleId, carrierId: v.carrierId, extraKm, extraCost, co2, utilDelta: round(0.1 + r * 0.35, 2),
        slackMin: Math.round(15 + (1 - r) * 80), isBackhaul: r < 0.28, quote: round(extraCost * 1.35 + 20, 0), scoreParts: { cost: extraCost, emptyKm: extraKm, co2 } });
    }
    const score = (o: OptionRowVM) => w.cost * o.extraCost + w.empty * o.extraKm * 2 + w.co2 * o.co2 * 5 - (o.isBackhaul ? 12 : 0);
    rows.sort((a, b) => score(a) - score(b) || a.optionId.localeCompare(b.optionId));
    rows.forEach((o, i) => { o.rank = i + 1; });
    const top = rows.slice(0, 5);
    const reasons: ReasonVM[] = top[0] ? [{ code: "TEMP_COMPATIBLE" }, { code: "SLACK_BEFORE_DEADLINE", params: { min: top[0].slackMin } }, (top[1]?.extraCost ?? 0) - top[0].extraCost > 0 ? { code: "LOWER_COST_THAN_NEXT", params: { amount: round(top[1].extraCost - top[0].extraCost, 0) } } : { code: "BEST_SCORE" }, ...(top[0].isBackhaul ? [{ code: "BACKHAUL" }] : [])] : [];
    return { decision: top.length ? "RECOMMEND" : "NO_FEASIBLE_OPTION", recommendedId: top[0]?.optionId ?? null, rows: top, excluded, reasons, loadVersion: this.version.get(loadId) ?? 1 };
  }

  approve(loadId: string, optionId: string, mode: "preview" | "apply", epoch: number, expectedVersion: number): ApprovalPreviewVM | ApplyResult {
    const load = this.loads.find((l) => l.loadId === loadId);
    if (!load) return { status: "REJECTED" };
    if (mode === "apply" && epoch !== this.epoch) return { status: "STALE_EPOCH" };
    if (mode === "apply" && load.status !== "RECEIVED") return { status: load.status === "MATCHED" ? "ALREADY_APPLIED" : "CONFLICT" };
    if (mode === "apply" && (this.version.get(loadId) ?? 1) !== expectedVersion) return { status: "CONFLICT" };
    const opt = this.options(loadId, "BALANCED").rows.find((o) => o.optionId === optionId) ?? this.options(loadId, "PROFIT").rows.find((o) => o.optionId === optionId) ?? this.options(loadId, "GREEN").rows.find((o) => o.optionId === optionId);
    if (!opt) return { status: "REJECTED" };
    if (mode === "preview") {
      const before = this.kpis();
      const after: KpiVM = withDelta(before, { ...before, modeledSurplus: round(before.modeledSurplus + opt.quote - opt.extraCost, 0), operatingCost: round(before.operatingCost + opt.extraCost, 0), emptyKm: round(before.emptyKm - 6 + opt.extraKm * 0.2, 0), co2Kg: round(before.co2Kg + opt.co2, 0), unserved: before.unserved });
      const p: Preview = { candidateId: `C-${loadId}-${optionId}`, loadId, optionId, epoch: this.epoch, after };
      this.previews.set(p.candidateId, p);
      return { candidateId: p.candidateId, loadId, option: opt, before, after };
    }
    const pv = [...this.previews.values()].find((x) => x.loadId === loadId && x.optionId === optionId);
    load.status = "MATCHED"; load.vehicleId = opt.vehicleId; load.quote = load.exclusive ? round(opt.quote * EXCLUSIVE_MULTIPLIER, 0) : opt.quote; load.etaMin = load.pickupFromMin + 240 - opt.slackMin;
    this.version.set(loadId, expectedVersion + 1);
    const v = this.vehicles.find((x) => x.vehicleId === opt.vehicleId); if (v) v.freePallets = Math.max(0, v.freePallets - load.pallets);
    this.matchedAt.set(loadId, this.nowMin());
    const offer = { offerId: `F-${loadId}`, loadId, companyId: opt.carrierId, lane: load.lane, originId: load.origin, destinationId: load.destination, pallets: load.pallets, tempClass: load.tempClass, detourKm: opt.extraKm, extraMin: Math.round(opt.extraKm * 2.3), earningsEstimate: round(opt.quote * (1 - this.price.takeRate - this.price.referralRate), 0), tempFit: true, isBackhaul: opt.isBackhaul, expiresInSec: 180, status: "SHOWN" as const, version: 1, createdAt: Date.now() };
    this.offers.unshift(offer);
    this.pinned = pv ? pv.after : null;
    return { status: "APPLIED", offerId: offer.offerId };
  }

  respond(offerId: string, response: "ACCEPT" | "DECLINE", expectedVersion: number, epoch: number): { status: string } {
    const o = this.offers.find((x) => x.offerId === offerId);
    if (!o) return { status: "NOT_FOUND" };
    if (epoch !== this.epoch) return { status: "STALE_EPOCH" };
    if (o.version !== expectedVersion || o.status !== "SHOWN") return { status: "STALE" };
    if (Math.floor((Date.now() - o.createdAt) / 1000) >= o.expiresInSec) { o.status = "EXPIRED"; return { status: "EXPIRED" }; }
    const load = this.loads.find((l) => l.loadId === o.loadId);
    if (response === "DECLINE") this.pinned = null;   // an acceptance changes no number: the approval preview already showed it
    if (response === "ACCEPT") { o.status = "ACCEPTED"; if (load) load.status = "CONFIRMED"; } else { o.status = "DECLINED"; if (load) { const v = this.vehicles.find((x) => x.vehicleId === load.vehicleId); if (v) v.freePallets += load.pallets; load.status = "RECEIVED"; load.vehicleId = null; load.quote = null; load.etaMin = null; this.declined.set(load.loadId, (this.declined.get(load.loadId) ?? new Set()).add(o.companyId)); } }   // back to the operator queue; the truck gets its space back
    o.version += 1;
    return { status: o.status };
  }

  startJob(floor: boolean): { jobId: string } {
    const id = `J-${this.jobs.size + 1}`;
    const rank = (l: LoadVM) => (l.status === "UNSERVED" ? 0 : l.status === "RECEIVED" ? 1 : 2);
    const movable = this.loads.filter((l) => ["MATCHED", "CONFIRMED", "RECEIVED", "UNSERVED"].includes(l.status)).sort((a, b) => rank(a) - rank(b)).slice(0, 3);
    const pickTo = (l: LoadVM, i: number) => ["V-07", "V-09", "V-05", "V-10"].filter((v) => v !== l.vehicleId)[i % 3];
    const changes = movable.map((l, i) => ({ loadId: l.loadId, fromVehicle: l.vehicleId, toVehicle: pickTo(l, i), deltaCost: -round(8 + hash(l.loadId) * 30, 0), reasons: i === 0 ? ["TEMP_COMPATIBLE", "LOWER_COST"] : ["TEMP_COMPATIBLE", "AVOIDS_LATE"] }));
    this.jobs.set(id, { id, startedAt: Date.now(), floor, cancelled: false, changes, candidateId: `K-${id}`, applied: false });
    return { jobId: id };
  }

  job(id: string): JobVM | null {
    const j = this.jobs.get(id); if (!j) return null;
    if (j.cancelled) return { jobId: id, status: "CANCELLED", progress: 0, diff: null, blockingCarriers: [] };
    const frac = Math.min(1, (Date.now() - j.startedAt) / 3500);
    if (frac < 1) return { jobId: id, status: "RUNNING", progress: round(frac, 2), diff: null, blockingCarriers: [] };
    if (j.floor) return { jobId: id, status: "FLOOR_INFEASIBLE", progress: 1, diff: null, blockingCarriers: ["C-4", "C-1"] };
    const before = this.kpis();
    const gain = j.applied ? 0 : 0.12;
    const after: KpiVM = withDelta(before, { ...before, operatingCost: round(before.operatingCost * (1 - gain), 0), modeledSurplus: round(before.modeledSurplus + before.operatingCost * gain, 0), emptyKm: round(before.emptyKm * 0.82, 0), co2Kg: round(before.co2Kg * 0.88, 0), unserved: Math.max(0, before.unserved - 1) });
    return { jobId: id, status: "COMPLETE", progress: 1, diff: { candidateId: j.candidateId, before, after, changes: j.changes, lockedKept: 4 }, blockingCarriers: [] };
  }

  cancelJob(id: string): { status: string } { const j = this.jobs.get(id); if (!j) return { status: "NOT_FOUND" }; if (Date.now() - j.startedAt >= 3500) return { status: "ALREADY_FINISHED" }; j.cancelled = true; return { status: "CANCELLED" }; }

  applyJob(candidateId: string, epoch: number): ApplyResult {
    if (epoch !== this.epoch) return { status: "STALE_EPOCH" };
    const j = [...this.jobs.values()].find((x) => x.candidateId === candidateId);
    if (!j) return { status: "REJECTED" };
    if (j.applied) return { status: "ALREADY_APPLIED" };
    const after = this.job(j.id)?.diff?.after ?? null;   // computed before the job is marked applied, exactly what the review showed
    j.applied = true; this.improvement = 0.12; this.pinned = after;
    for (const c of j.changes) { const l = this.loads.find((x) => x.loadId === c.loadId); if (l) { l.vehicleId = c.toVehicle; if (l.status === "UNSERVED") { l.status = "CONFIRMED"; l.quote = 120; l.reasonCode = null; } else if (l.status === "RECEIVED") { l.status = "MATCHED"; l.quote = 110; } } }
    return { status: "APPLIED" };
  }

  scenarios(): ScenarioVM {
    return {
      columns: [{ id: "A", surplus: 4120, emptyKm: 1480, co2Kg: 5230, cost: 9650 }, { id: "A2", surplus: 4410, emptyKm: 1390, co2Kg: 4980, cost: 9360 },
        { id: "B", surplus: 5030, emptyKm: 1090, co2Kg: 4310, cost: 8740 }, { id: "C", surplus: 5560, emptyKm: 930, co2Kg: 3920, cost: 8210 }],
      effects: { sharing: 910, optimization: 530, ownFleet: 290, sharingBeyondOwn: 1150 },
      perCarrier: [{ carrierId: "C-1", deltaVsA: 410 }, { carrierId: "C-2", deltaVsA: 620 }, { carrierId: "C-3", deltaVsA: 170 }, { carrierId: "C-4", deltaVsA: -140 }], assumptionRefs: ["price.per_km", "platform.take_rate", "pool.participation"],
    };
  }

  assumptions(): AssumptionVM[] {
    return [
      { key: "price.per_km", label: "Cost per km by vehicle type", value: "dry van 1.1 · reefer 1.6", kind: "ASSUMPTION" },
      { key: "platform.take_rate", label: "Platform take rate", value: `${(this.price.takeRate * 100).toFixed(0)}%`, kind: "ASSUMPTION" },
      { key: "pool.participation", label: "Share of carriers in the shared pool", value: "100% (sweep in Analysis)", kind: "ASSUMPTION" },
      { key: "roads.network", label: "Road network", value: "29 real places, OpenStreetMap roads, directed distances", kind: "SOURCED", source: "OpenStreetMap (ODbL)" },
      { key: "dg.rules", label: "Dangerous-goods segregation", value: "four demo hazard classes, not verified against SG/MY rules", kind: "ASSUMPTION" },
    ];
  }

  // Timed trips of the committed plan: each vehicle drives to the pickup, loads, drives to the drop, unloads (times from the real road matrix).
  trajectories(g: Pick<Geometry, "nodes" | "dist_km" | "time_min">, companyId = "OP"): TrajectoryVM {
    const idx = new Map(g.nodes.map((n, i) => [n.id, i]));
    const START = 480, LOAD = 20, UNLOAD = 15;
    const vehicles: TrajectoryVM["vehicles"] = []; const events: TrajectoryVM["events"] = []; let end = 1200;
    for (const v of this.vehicles) {
      const home = idx.get(v.position) ?? 0;
      const mine = this.loads.filter((l) => l.vehicleId === v.vehicleId && ["MATCHED", "CONFIRMED", "IN_TRANSIT", "DONE"].includes(l.status)).sort((a, b) => a.pickupFromMin - b.pickupFromMin);
      const segments: Segment[] = []; let t = START, cur = home, km = 0;
      const dwell = (until: number, loaded: boolean, loadId: string | null) => { if (until > t) { segments.push({ t0: t, t1: until, kind: "dwell", from: cur, to: cur, loaded, loadId, temp: null, km: 0 }); t = until; } };
      for (const l of mine) {
        const o = idx.get(l.origin) ?? 0, d = idx.get(l.destination) ?? 0;
        const toO = Math.max(1, Math.round(g.time_min[cur][o]));
        dwell(Math.max(t, l.pickupFromMin - toO, this.matchedAt.get(l.loadId) ?? 0), false, null);
        if (cur !== o) { segments.push({ t0: t, t1: t + toO, kind: "travel", from: cur, to: o, loaded: false, loadId: null, temp: null, km: g.dist_km[cur][o] }); km += g.dist_km[cur][o]; t += toO; cur = o; }
        events.push({ t, vehicleId: v.vehicleId, kind: "pickup", node: o, loadId: l.loadId });
        dwell(t + LOAD, false, l.loadId);
        const trip = Math.max(1, Math.round(g.time_min[o][d]));
        segments.push({ t0: t, t1: t + trip, kind: "travel", from: o, to: d, loaded: true, loadId: l.loadId, temp: l.tempClass, km: g.dist_km[o][d] }); km += g.dist_km[o][d]; t += trip; cur = d;
        events.push({ t, vehicleId: v.vehicleId, kind: "drop", node: d, loadId: l.loadId });
        dwell(t + UNLOAD, false, l.loadId);
      }
      end = Math.max(end, t + 30);
      vehicles.push({ vehicleId: v.vehicleId, carrierId: v.carrierId, homeNode: home, segments, km: round(km, 1) });
    }
    events.sort((a, b) => a.t - b.t);
    return this.visibleTo(companyId, { planLabel: "Committed plan", startMin: START, endMin: end, vehicles, events });
  }

  setShared(vehicleId: string, shared: boolean): { vehicleId: string; shared: boolean } {
    const v = this.vehicles.find((x) => x.vehicleId === vehicleId);
    if (v) v.shared = shared;
    return { vehicleId, shared };
  }

  /** Price shown before booking: base fee + distance by pallet share and cold-chain rate + border fee + dangerous-goods uplift (fixture formula; the backend uses the rate card). */
  estimate(g: Pick<Geometry, "nodes" | "dist_km" | "time_min">, q: { origin: string; destination: string; pallets: number; tempClass: string; hazardClass: string | null; exclusive?: boolean }): QuoteEstimateVM {
    const idx = new Map(g.nodes.map((n, i) => [n.id, i]));
    const o = idx.get(q.origin) ?? 0, d = idx.get(q.destination) ?? 0;
    const km = g.dist_km[o][d], min = Math.round(g.time_min[o][d]);
    const share = Math.min(1, Math.max(0.25, q.pallets / 18)), perKm = q.tempClass === "AMB" ? this.price.perKm.DRY_VAN : this.price.perKm.REEFER_DUAL;
    const lines: QuoteEstimateVM["lines"] = [{ code: "BASE", amount: round(this.price.fixedPerVehicle * 0.5, 0) }, { code: "DISTANCE", amount: round(km * perKm * (0.4 + 0.6 * share), 0) }];
    if (g.nodes[o].country !== g.nodes[d].country) lines.push({ code: "BORDER", amount: this.price.borderFee });
    const sub = lines.reduce((s, l) => s + l.amount, 0);
    if (q.hazardClass) lines.push({ code: "HAZARD", amount: round(sub * 0.15, 0) });
    const shared = lines.reduce((s, l) => s + l.amount, 0);
    if (!q.exclusive) return { price: shared, sharedPrice: shared, exclusive: false, distanceKm: round(km, 0), driveMin: min, lines };
    const price = Math.round(shared * EXCLUSIVE_MULTIPLIER);                  // the whole truck is paid for, whatever the pallets
    return { price, sharedPrice: shared, exclusive: true, distanceKm: round(km, 0), driveMin: min, lines: [...lines, { code: "DEDICATED", amount: price - shared }] };
  }

  /** What an actor may see on the map: the operator everything, a carrier its own vehicles, a shipper only the trips of its own loads (nothing of other shippers). */
  private visibleTo(companyId: string, tr: TrajectoryVM): TrajectoryVM {
    const co = COMPANIES.find((c) => c.id === companyId);
    if (!co || co.kind === "OPERATOR") return tr;
    if (co.kind === "CARRIER") {
      const own = tr.vehicles.filter((v) => v.carrierId === companyId);
      const ids = new Set(own.map((v) => v.vehicleId));
      return { ...tr, vehicles: own, events: tr.events.filter((e) => ids.has(e.vehicleId)) };
    }
    const mine = new Set(this.loads.filter((l) => l.companyId === companyId).map((l) => l.loadId));
    const vehicles = tr.vehicles.map((v) => ({ ...v, segments: v.segments.filter((s) => s.loadId !== null && mine.has(s.loadId)) })).filter((v) => v.segments.length > 0);
    return { ...tr, vehicles, events: tr.events.filter((e) => mine.has(e.loadId)) };
  }

  /** Participation sweep : mean and seed spread of empty km and cost as more carriers join the pool (fixture curves). */
  participation(): ParticipationPointVM[] {
    return Array.from({ length: 11 }, (_, i) => {
      const r = i / 10, gain = 1 - Math.exp(-3.2 * r), spread = 0.045 * (1 - r) + 0.012;
      const empty = 1480 - 560 * gain, cost = 9650 - 1380 * gain;
      return { ratePct: i * 10, emptyKm: { mean: round(empty, 0), lo: round(empty * (1 - spread), 0), hi: round(empty * (1 + spread), 0) }, cost: { mean: round(cost, 0), lo: round(cost * (1 - spread * 0.7), 0), hi: round(cost * (1 + spread * 0.7), 0) } };
    });
  }

  /** Which conclusions hold and where they flip . The threshold is the value of the tested lever at which the verdict changes. */
  sensitivity(): SensitivityRowVM[] {
    return [
      { code: "SHARING_LOWERS_EMPTY_KM", holds: true, threshold: 12 },
      { code: "OPTIMIZATION_ADDS_VALUE", holds: true, threshold: 5 },
      { code: "ALL_CARRIERS_GAIN", holds: false, threshold: 6 },
      { code: "STABLE_UNDER_TAKE_RATE", holds: true, threshold: 18 },
      { code: "COLD_CHAIN_PREMIUM_HOLDS", holds: true, threshold: 1.3 },
    ];
  }

  putPrice(p: PriceTableVM): PriceTableVM {
    const errors: string[] = [];
    if (p.takeRate + p.referralRate >= 1) errors.push("TAKE_PLUS_REFERRAL_TOO_HIGH");
    if (p.perKm.DRY_VAN <= 0 || p.perKm.REEFER_SINGLE <= 0 || p.perKm.REEFER_DUAL <= 0) errors.push("PRICE_MUST_BE_POSITIVE");
    if (p.perKm.REEFER_SINGLE < p.perKm.DRY_VAN) errors.push("REEFER_BELOW_DRY_VAN");
    if (errors.length) return { ...p, errorCodes: errors };
    this.price = { ...p, version: this.price.version + 1, errorCodes: [] };
    return this.price;
  }
}

// "vs baseline" moves with the plan: the baseline (scenario A) is fixed, so the difference changes by the change in the metric itself.
export function withDelta(before: KpiVM, after: KpiVM): KpiVM {
  return { ...after, deltaVsBaseline: { surplus: round(before.deltaVsBaseline.surplus + after.modeledSurplus - before.modeledSurplus, 0), emptyKm: round(before.deltaVsBaseline.emptyKm + after.emptyKm - before.emptyKm, 0), co2Kg: round(before.deltaVsBaseline.co2Kg + after.co2Kg - before.co2Kg, 0) } };
}

function seedTrend() {
  const mk = (a: number, b: number) => Array.from({ length: 10 }, (_, i) => Math.round(a + ((b - a) * i) / 9 + Math.sin(i * 1.7) * Math.abs(b - a) * 0.12));
  return { surplus: mk(180, 272), cost: mk(300, 248), emptyKm: mk(200, 162), co2Kg: mk(560, 484) };
}

export function defaultPrice(): PriceTableVM {
  return { version: 1, perKm: { DRY_VAN: 1.1, REEFER_SINGLE: 1.5, REEFER_DUAL: 1.7 }, perMinDriver: 0.45, fixedPerVehicle: 60, takeRate: 0.1, referralRate: 0, borderFee: 12, errorCodes: [] };
}
