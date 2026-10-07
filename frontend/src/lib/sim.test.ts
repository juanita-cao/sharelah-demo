import { describe, expect, it, vi } from "vitest";
import { appendDay, axisTicks, carrierDay, fromSession, liveLimit, cursorOf, planFor, routesToTrajectory, sharedOnRoad, emptyLive, firstDays, splitLines, streamSimulation, stepOf, totalSteps, viewAt, STEPS_PER_DAY, type SimData, type SimDay, type SimTick } from "./sim";

const tick = (t: number, extra: Record<string, number>, accepted = 0): SimTick => ({ t, loads_arrived: t, loads_confirmed: t, commitments: 0, offers_active: 3, shared_accepted: accepted, offers_shrunk: 0, offers_withdrawn: 0, realised_extra: extra });
const car = (served: number, viol = 0) => ({ contribution: 0, earnings: 0, fixed_cost: 0, loads_served: served, km: 0, empty_km: 0, utilization: 0, extra_earnings_realised: 0, accepted_opportunities: 0, share_negative_net: 0, delay_imposed_max: 0, delay_imposed_mean: 0, commitment_violations: viol, offers_shrunk: 0, offers_withdrawn_by_own_commitment: 0 });
const net = (served: number, unserved: number, per: Record<string, ReturnType<typeof car>> = {}) => ({ contribution: 0, loads_served: served, unserved, total_km: 0, empty_km: 0, utilization: 0, co2_kg: 0, vehicles_used: 0, shipper_payment: 0, platform_revenue: 0, exclusive_load_share: 0, shared_jobs: 0, commitment_violations: 0, per_carrier: per });

function day(d: number, jobs: { id: string; carrier: string; at: number; drop: number; net: number }[]): SimDay {
  const rows = Array.from({ length: 25 }, (_, k) => {
    const extra: Record<string, number> = {};
    for (const j of jobs) if (j.drop <= k * 60) extra[j.carrier] = (extra[j.carrier] ?? 0) + j.net;
    return tick(k * 60, extra, jobs.filter((j) => j.at <= k * 60).length);
  });
  return { day: d, seed: d, A: net(10, 5, { "C-1": car(6), "C-2": car(4) }), B: net(12, 3, { "C-1": car(8, d === 1 ? 1 : 0), "C-2": car(4) }), delta: { network: { contribution: 100, loads_served: 2, unserved: -2, total_km: 0, empty_km: 0, co2_kg: 0 }, per_carrier: { "C-1": { contribution: 60 }, "C-2": { contribution: 40 } } },
    shared_jobs: jobs.map((j) => ({ load_id: j.id, carrier_id: j.carrier, vehicle_id: "V", accepted_at: j.at, pickup_min: j.at, drop_min: j.drop, origin: "N-A", destination: "N-B", pallets: 1, payout: 0, marginal_cost: 0, net_incremental: j.net })),
    timeline: { A: rows, B: rows } };
}
const DATA: SimData = {
  meta: { label: "SIMULATION", note: "", seed: 1, days: 2, method: "", scenario_A: "", scenario_B: "", contribution: "" },
  world: { carriers: [{ id: "C-1", name: "One", vehicles: 1 }, { id: "C-2", name: "Two", vehicles: 1 }], vehicles: [] },
  days: [day(0, [{ id: "L-1", carrier: "C-1", at: 120, drop: 300, net: 50 }, { id: "L-2", carrier: "C-2", at: 600, drop: 900, net: 20 }]), day(1, [{ id: "L-3", carrier: "C-1", at: 60, drop: 180, net: 30 }])],
  cumulative: [{ day: 0, realised_extra: { "C-1": 50, "C-2": 20 }, delta_contribution: { "C-1": 60, "C-2": 40 } }, { day: 1, realised_extra: { "C-1": 80, "C-2": 20 }, delta_contribution: { "C-1": 120, "C-2": 80 } }],
  totals: { per_carrier: {}, network: {} },
};
const IDS = ["C-1", "C-2"];

describe("simulation cursor", () => {
  it("maps steps to day and hour and back", () => {
    expect(cursorOf(0, 2)).toEqual({ day: 0, tick: 0 });
    expect(cursorOf(STEPS_PER_DAY + 5, 2)).toEqual({ day: 1, tick: 5 });
    expect(cursorOf(totalSteps(2), 2)).toEqual({ day: 1, tick: STEPS_PER_DAY });
    expect(cursorOf(999, 2)).toEqual({ day: 1, tick: STEPS_PER_DAY });
    expect(stepOf({ day: 1, tick: 5 })).toBe(STEPS_PER_DAY + 5);
  });
});

describe("what the screen shows", () => {
  it("starts empty", () => {
    const v = viewAt(DATA, 0, IDS);
    expect(v.realisedTotal).toBe(0); expect(v.sharedJobsDone).toBe(0); expect(v.completedDays).toBe(0); expect(v.deltaContributionTotal).toBe(0);
  });
  it("counts a job only after it is completed, money accumulates within the day", () => {
    expect(viewAt(DATA, 4, IDS).realisedTotal).toBe(0);                          // 04:00: L-1 accepted at 02:00 but its drop is at 05:00
    expect(viewAt(DATA, 4, IDS).sharedAccepted).toBe(1);
    expect(viewAt(DATA, 5, IDS).realisedByCarrier["C-1"]).toBe(50);              // 05:00: done
    expect(viewAt(DATA, 15, IDS).realisedTotal).toBe(70);                        // 15:00: L-2 done too
    expect(viewAt(DATA, 15, IDS).sharedJobsDone).toBe(2);
  });
  it("adds earlier days and only completed days count for the estimate", () => {
    const v = viewAt(DATA, STEPS_PER_DAY + 3, IDS);                              // day 2, 03:00
    expect(v.completedDays).toBe(1); expect(v.realisedTotal).toBe(70 + 30);      // day-1 total 70 + L-3 (drop 03:00)
    expect(v.deltaContributionTotal).toBe(100); expect(v.servedB).toBe(12); expect(v.servedA).toBe(10);
    expect(v.recent[0].load_id).toBe("L-3");                                     // newest first
  });
  it("ends at the month totals", () => {
    const v = viewAt(DATA, totalSteps(2), IDS);
    expect(v.realisedTotal).toBe(100); expect(v.completedDays).toBe(2); expect(v.deltaContributionTotal).toBe(200); expect(v.sharedJobsDone).toBe(3);
  });
  it("never goes backwards when the clock moves forward", () => {
    let prev = -1;
    for (let s = 0; s <= totalSteps(2); s++) { const r = viewAt(DATA, s, IDS).realisedTotal; expect(r).toBeGreaterThanOrEqual(prev); prev = r; }
  });

  it("keeps every figure of one carrier separate from the others", () => {
    const v = viewAt(DATA, STEPS_PER_DAY + 3, IDS);                             // day 2, 03:00: day 1 complete, L-3 (C-1) done
    expect(v.byCarrier["C-1"]).toEqual({ servedA: 6, servedB: 8, accepted: 2, done: 2, violations: 0 });
    expect(v.byCarrier["C-2"]).toEqual({ servedA: 4, servedB: 4, accepted: 1, done: 1, violations: 0 });
    const end = viewAt(DATA, totalSteps(2), IDS);
    expect(end.byCarrier["C-1"]).toMatchObject({ servedA: 12, servedB: 16, accepted: 2, done: 2, violations: 1 });
    expect(end.byCarrier["C-2"].accepted).toBe(1);
  });
});

describe("choosing the number of days", () => {
  it("keeps the first n days and ends at that day's cumulative figures", () => {
    const one = firstDays(DATA, 1);
    expect(one.days).toHaveLength(1); expect(one.cumulative).toHaveLength(1);
    const v = viewAt(one, totalSteps(1), IDS);
    expect(v.realisedTotal).toBe(70); expect(v.completedDays).toBe(1); expect(v.deltaContributionTotal).toBe(100);
    expect(viewAt(firstDays(DATA, 2), totalSteps(2), IDS).realisedTotal).toBe(100);
  });
  it("clamps to what was recorded and to at least one day", () => {
    expect(firstDays(DATA, 99).days).toHaveLength(2);
    expect(firstDays(DATA, 0).days).toHaveLength(1);
    expect(firstDays(DATA, 1.7).days).toHaveLength(1);
  });
  it("does not change the original data", () => { firstDays(DATA, 1); expect(DATA.days).toHaveLength(2); });
});

describe("live stream", () => {
  it("splits lines across chunk boundaries and keeps the unfinished tail", () => {
    expect(splitLines("", '{"a":1}\n{"b"')).toEqual({ lines: ['{"a":1}'], rest: '{"b"' });
    expect(splitLines('{"b"', ':2}\n\n{"c":3}\n')).toEqual({ lines: ['{"b":2}', '{"c":3}'], rest: "" });
    expect(splitLines("", "no newline yet")).toEqual({ lines: [], rest: "no newline yet" });
  });

  it("builds the data day by day without touching what it already had", () => {
    const start = emptyLive(DATA.meta, DATA.world);
    expect(start.days).toHaveLength(0);
    const one = appendDay(start, DATA.days[0], DATA.cumulative[0]);
    const two = appendDay(one, DATA.days[1], DATA.cumulative[1]);
    expect(start.days).toHaveLength(0); expect(one.days).toHaveLength(1); expect(two.days).toHaveLength(2);
    expect(viewAt(two, totalSteps(2), IDS).realisedTotal).toBe(100);
    expect(viewAt(one, totalSteps(1), IDS).realisedTotal).toBe(70);
  });

  const body = (text: string, chunk: number) => new ReadableStream<Uint8Array>({
    start(ctl) { const bytes = new TextEncoder().encode(text); for (let i = 0; i < bytes.length; i += chunk) ctl.enqueue(bytes.slice(i, i + chunk)); ctl.close(); },
  });

  it("reads every message of the stream, whatever the chunk size", async () => {
    const msgs = [{ type: "meta", meta: DATA.meta, world: DATA.world }, { type: "day", row: DATA.days[0], cumulative: DATA.cumulative[0] }, { type: "totals", totals: DATA.totals }];
    const text = msgs.map((m) => JSON.stringify(m)).join("\n") + "\n";
    for (const chunk of [7, 64, 100000]) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(body(text, chunk), { status: 200 })));
      const got: string[] = [];
      await streamSimulation({ days: 1, seed: 1, loads: 150 }, new AbortController().signal, (m) => got.push(m.type));
      expect(got).toEqual(["meta", "day", "totals"]);
    }
    vi.unstubAllGlobals();
  });

  it("asks the server for exactly the chosen settings", async () => {
    const f = vi.fn(async () => new Response(body("", 8), { status: 200 }));
    vi.stubGlobal("fetch", f);
    await streamSimulation({ days: 45, seed: 2, loads: 120 }, new AbortController().signal, () => {});
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("/api/simulate?days=45&seed=2&loads=120");
    vi.unstubAllGlobals();
  });

  it("turns a refusal into an error that carries the server's message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "a simulation is already running" }), { status: 503 })));
    await expect(streamSimulation({ days: 1, seed: 1, loads: 150 }, new AbortController().signal, () => {})).rejects.toThrow("a simulation is already running");
    vi.unstubAllGlobals();
  });
});

describe("chart axis", () => {
  it("picks a round step and always labels the end of the period", () => {
    expect(axisTicks(1)).toEqual([0, 1]);
    expect(axisTicks(7)).toEqual([0, 2, 4, 6, 7]);
    expect(axisTicks(30)).toEqual([0, 5, 10, 15, 20, 25, 30]);
    expect(axisTicks(33)).toEqual([0, 5, 10, 15, 20, 25, 30, 33]);
    expect(axisTicks(70)).toEqual([0, 15, 30, 45, 60, 70]);
    expect(axisTicks(90)).toEqual([0, 15, 30, 45, 60, 75, 90]);
    expect(axisTicks(62)).toEqual([0, 10, 20, 30, 40, 50, 62]);   // 60 would sit on top of 62: dropped
  });
  it("never has more than eight labels, starts at 0, ends at the number of days and increases", () => {
    for (let d = 1; d <= 120; d++) {
      const t = axisTicks(d);
      expect(t.length).toBeLessThanOrEqual(8); expect(t[0]).toBe(0); expect(t[t.length - 1]).toBe(d);
      for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThan(t[i - 1]);
    }
  });
});

describe("what a typed number of days does", () => {
  it("uses the recording for up to the recorded days and a live run beyond", () => {
    expect(planFor(7, 30)).toEqual({ kind: "recorded", days: 7 });
    expect(planFor(30, 30)).toEqual({ kind: "recorded", days: 30 });
    expect(planFor(31, 30)).toEqual({ kind: "live", days: 31 });
    expect(planFor(70, 30)).toEqual({ kind: "live", days: 70 });
  });
  it("keeps the number a whole number of at least one day and at most the live limit", () => {
    expect(planFor(0, 30)).toEqual({ kind: "recorded", days: 1 });
    expect(planFor(7.9, 30)).toEqual({ kind: "recorded", days: 7 });
    expect(planFor(500, 30, 90)).toEqual({ kind: "live", days: 90 });
  });
});

describe("routes on the map", () => {
  // three places: A and B in Singapore, C in Malaysia (60 minutes at the border); A-B 10 min / 5 km, B-C 20 min / 10 km, A-C 30 min / 15 km
  const geo = { nodes: [{ id: "N-A", name: "A", lat: 1.3, lon: 103.8, country: "SG" }, { id: "N-B", name: "B", lat: 1.35, lon: 103.8, country: "SG" }, { id: "N-C", name: "C", lat: 1.5, lon: 103.8, country: "MY" }],
    pairs: {}, dist_km: [[0, 5, 15], [5, 0, 10], [15, 10, 0]], time_min: [[0, 10, 30], [10, 0, 20], [30, 20, 0]], attribution: "" };
  const vehicles = [{ id: "V-1", carrier_id: "C-1", base_node: "N-A" }, { id: "V-2", carrier_id: "C-2", base_node: "N-A" }, { id: "V-3", carrier_id: "C-1", base_node: "N-B" }];
  const stops = (arr: [string, "PICKUP" | "DROP", string, number, number][]) => arr.map(([node, kind, load_id, arrive_min, depart_min]) => ({ node, kind, load_id, arrive_min, depart_min }));
  const routes = { "V-1": stops([["N-B", "PICKUP", "L-1", 20, 30], ["N-C", "DROP", "L-1", 110, 120]]), "V-2": stops([["N-B", "PICKUP", "L-2", 50, 60], ["N-B", "DROP", "L-2", 60, 70]]) };

  it("turns a route into legs and stops with the times the backend computed", () => {
    const tr = routesToTrajectory(routes, vehicles, geo, "x", null);
    const v = tr.vehicles.find((x) => x.vehicleId === "V-1")!;
    expect(v.homeNode).toBe(0);
    expect(v.segments.map((s) => [s.kind, s.from, s.to, s.t0, s.t1, s.loaded])).toEqual([
      ["travel", 0, 1, 10, 20, false],     // leaves the base 10 min before it arrives (the leg takes 10 min)
      ["dwell", 1, 1, 20, 30, true],       // loads: from now on the truck is loaded
      ["travel", 1, 2, 30, 110, true],     // 20 min of road plus 60 min at the border
      ["dwell", 2, 2, 110, 120, false],    // unloads
      ["travel", 2, 0, 120, 210, false],   // back to the base: 30 min plus 60 min at the border
    ]);
    expect(v.km).toBe(5 + 10 + 15);
    expect(tr.events.filter((e) => e.vehicleId === "V-1").map((e) => [e.t, e.kind, e.node, e.loadId])).toEqual([[20, "pickup", 1, "L-1"], [110, "drop", 2, "L-1"]]);
    expect(tr.startMin).toBe(10); expect(tr.endMin).toBe(210);
  });

  it("does not return to the base when the last stop is the base, and leaves out vehicles without a route", () => {
    const tr = routesToTrajectory({ "V-3": stops([["N-A", "PICKUP", "L-3", 30, 40], ["N-B", "DROP", "L-3", 50, 60]]) }, vehicles, geo, "x", null);
    expect(tr.vehicles.map((v) => v.vehicleId)).toEqual(["V-3"]);
    const segs = tr.vehicles[0].segments;
    expect(segs[segs.length - 1]).toMatchObject({ kind: "dwell", from: 1 });      // V-3's base is B, where it ends
    expect(routesToTrajectory(routes, vehicles, geo, "x", null).vehicles.map((v) => v.vehicleId)).toEqual(["V-1", "V-2"]);
  });

  it("shows only one carrier's trucks when asked", () => {
    const tr = routesToTrajectory(routes, vehicles, geo, "x", "C-2");
    expect(tr.vehicles.map((v) => v.vehicleId)).toEqual(["V-2"]); expect(tr.events.every((e) => e.vehicleId === "V-2")).toBe(true);
  });

  it("marks the trucks that carry a shared job right now", () => {
    const day = { shared_jobs: [{ load_id: "L-1", carrier_id: "C-1", vehicle_id: "V-1", pickup_min: 20, drop_min: 110 }, { load_id: "L-2", carrier_id: "C-2", vehicle_id: "V-2", pickup_min: 50, drop_min: 60 }] } as unknown as SimDay;
    expect([...sharedOnRoad(day, 15, null)]).toEqual([]);
    expect([...sharedOnRoad(day, 55, null)].sort()).toEqual(["V-1", "V-2"]);
    expect([...sharedOnRoad(day, 55, "C-2")]).toEqual(["V-2"]);
    expect([...sharedOnRoad(day, 111, null)]).toEqual([]);
  });
});

describe("one carrier's day of opportunities", () => {
  const job = (id: string, carrier: string, at: number, pick: number, drop: number, net: number, extra: Record<string, unknown> = {}) =>
    ({ load_id: id, carrier_id: carrier, vehicle_id: "V", accepted_at: at, pickup_min: pick, drop_min: drop, origin: "N-A", destination: "N-B", pallets: 2, payout: net + 30, marginal_cost: 30, net_incremental: net, ...extra });
  const day = { shared_jobs: [job("L-1", "C-1", 480, 500, 600, 50), job("L-2", "C-1", 540, 560, 700, 20), job("L-3", "C-2", 540, 560, 700, 99), job("L-4", "C-1", 720, 740, 800, -5)] } as unknown as SimDay;

  it("an opportunity arrives when the platform finds it and not before, and only the carrier's own are listed", () => {
    expect(carrierDay(day, "C-1", 479, new Set(), new Set()).arrived.map((j) => j.load_id)).toEqual([]);
    expect(carrierDay(day, "C-1", 480, new Set(), new Set()).arrived.map((j) => j.load_id)).toEqual(["L-1"]);
    expect(carrierDay(day, "C-1", 1000, new Set(), new Set()).arrived.map((j) => j.load_id)).toEqual(["L-1", "L-2", "L-4"]);     // L-3 belongs to C-2
  });
  it("what is waiting for a decision, what was taken and what was declined", () => {
    const v = carrierDay(day, "C-1", 1000, new Set(["L-1"]), new Set(["L-2"]));
    expect(v.taken.map((j) => j.load_id)).toEqual(["L-1"]); expect(v.declined.map((j) => j.load_id)).toEqual(["L-2"]); expect(v.pending.map((j) => j.load_id)).toEqual(["L-4"]);
  });
  it("the realised money is the net of the taken jobs that are already delivered, nothing earlier and nothing for declined or waiting ones", () => {
    expect(carrierDay(day, "C-1", 650, new Set(["L-1", "L-2"]), new Set()).realised).toBe(50);       // L-1 delivered at 600, L-2 still on the road
    expect(carrierDay(day, "C-1", 650, new Set(["L-1", "L-2"]), new Set()).inProgress.map((j) => j.load_id)).toEqual(["L-2"]);
    expect(carrierDay(day, "C-1", 1000, new Set(["L-1", "L-2"]), new Set()).realised).toBe(70);
    expect(carrierDay(day, "C-1", 1000, new Set(["L-1"]), new Set(["L-2"])).realised).toBe(50);
    expect(carrierDay(day, "C-1", 1000, new Set(), new Set()).realised).toBe(0);
  });
  it("the earnings a pending opportunity would add (taken now) are not counted before the decision", () => {
    expect(carrierDay(day, "C-1", 1000, new Set(), new Set()).pendingNet).toBe(65);               // 50 + 20 - 5 waiting
  });
});

describe("the live session of a carrier (the backend answers, the screen only shows)", () => {
  const vm = (id: string, extra: Record<string, unknown> = {}) => ({ opportunity_id: `OP-${id}`, load_id: id, vehicle_id: "V-1", offer_id: "CO-1", origin: "N-A", destination: "N-B", pallets: 2, weight_kg: 400, temp_class: "AMB", exclusive: false,
    payout: 80, marginal_cost: 30, net_incremental: 50, detour_km: 5, detour_min: 20, delay_max_min: 0, delay_imposed: [], recommended: true, reasons: [], pickup_min: 600, drop_min: 700, shown_at: 540,
    expires_at: 630, status: "SHOWN", epoch: 1, offer_version: 0, vehicle_version: 0, delivered: false, ...extra });
  const state = { now_min: 650, epoch: 1, carrier_id: "C-1", pending: [vm("L-1"), vm("L-2", { net_incremental: 10 })], taken: [vm("L-3", { status: "ACCEPTED", delivered: true, net_incremental: 40 }), vm("L-4", { status: "ACCEPTED", net_incremental: 25 })],
    declined: 2, realised: { amount: 40, delivered: 1, on_road: 1 } };

  it("becomes the same day view the replay gives, with the server's own money figure", () => {
    const cd = fromSession(state as never);
    expect(cd.pending.map((j) => j.load_id)).toEqual(["L-1", "L-2"]);
    expect(cd.taken.map((j) => j.load_id)).toEqual(["L-3", "L-4"]);
    expect(cd.done.map((j) => j.load_id)).toEqual(["L-3"]); expect(cd.inProgress.map((j) => j.load_id)).toEqual(["L-4"]);
    expect(cd.realised).toBe(40); expect(cd.pendingNet).toBe(60); expect(cd.declinedCount).toBe(2);
  });
  it("keeps the id the backend will want back when the carrier answers", () => {
    expect(fromSession(state as never).pending[0].opportunity_id).toBe("OP-L-1");
  });
  it("an empty session is an empty day", () => {
    const cd = fromSession({ ...state, pending: [], taken: [], declined: 0, realised: { amount: 0, delivered: 0, on_road: 0 } } as never);
    expect(cd.arrived).toEqual([]); expect(cd.realised).toBe(0); expect(cd.declinedCount).toBe(0);
  });
});

describe("a static demo has no live server", () => {
  it("limits the number of days to what was recorded when there is no live server, and to the live limit otherwise", () => {
    expect(liveLimit(true, 30)).toBe(90);
    expect(liveLimit(false, 30)).toBe(30);
    expect(planFor(70, 30, liveLimit(false, 30))).toEqual({ kind: "recorded", days: 30 });       // typing 70 in the static demo shows the 30 recorded days, it never asks for a server
    expect(planFor(70, 30, liveLimit(true, 30))).toEqual({ kind: "live", days: 70 });
  });
});
