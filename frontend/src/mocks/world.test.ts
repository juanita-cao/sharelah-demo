import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MockWorld } from "./world";

const geo = JSON.parse(readFileSync(join(__dirname, "../../public/network_geometry.json"), "utf8"));

describe("what each actor may see on the map (mock backend contract)", () => {
  const w = new MockWorld();
  it("the operator sees every vehicle", () => {
    expect(w.trajectories(geo, "OP").vehicles.length).toBe(12);
  });
  it("a carrier sees only its own vehicles", () => {
    const t = w.trajectories(geo, "C-2");
    expect(t.vehicles.length).toBeGreaterThan(0);
    expect(t.vehicles.every((v) => v.carrierId === "C-2")).toBe(true);
    expect(t.events.every((e) => t.vehicles.some((v) => v.vehicleId === e.vehicleId))).toBe(true);
  });
  it("a shipper sees only the trips of its own loads and nothing of other shippers", () => {
    const t = w.trajectories(geo, "S-1");
    const own = new Set(w.loads.filter((l) => l.companyId === "S-1").map((l) => l.loadId));
    expect(t.vehicles.length).toBeGreaterThan(0);
    for (const v of t.vehicles) for (const s of v.segments) expect(own.has(s.loadId as string)).toBe(true);
    expect(t.events.every((e) => own.has(e.loadId))).toBe(true);
    // S-2's load L-0102 and S-3's load L-0101 are not visible to S-1
    expect(t.events.some((e) => e.loadId === "L-0102" || e.loadId === "L-0101")).toBe(false);
  });
  it("a trip starts no earlier than the approval", () => {
    const w2 = new MockWorld();
    const { loadId } = w2.postLoad({ origin: "N-SG-PPWC", destination: "N-MY-JB", companyId: "S-1", pickupFromMin: 480 });
    const o = w2.options(loadId, "BALANCED").rows[0];
    w2.approve(loadId, o.optionId, "apply", w2.epoch, 1);
    const t = w2.trajectories(geo, "OP");
    const ev = t.events.find((e) => e.loadId === loadId && e.kind === "pickup")!;
    expect(ev.t).toBeGreaterThanOrEqual(w2.nowMin() - 1);
  });
});
