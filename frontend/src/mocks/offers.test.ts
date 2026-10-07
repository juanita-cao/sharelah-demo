// The two things a user does that the old screens could not: a carrier offers spare capacity (whole truck or part of it, then the values) and a shipper chooses a
// dedicated truck ("Capacity input mode" and the dedicated-truck option). The mock backend follows the backend contract.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXCLUSIVE_MULTIPLIER, MockRejection, MockWorld } from "./world";

const geo = JSON.parse(readFileSync(join(__dirname, "../../public/network_geometry.json"), "utf8"));
const offer = (over: Record<string, unknown> = {}) => ({ companyId: "C-2", vehicleId: "V-05", from: "N-MY-JB", to: "N-SG-PPWC", fromMin: 480, toMin: 1080, mode: "PARTIAL" as const, freePallets: 6, freeKg: 1500, maxDetourKm: 150, maxDetourMin: 300, toleranceMin: 15, ...over });
const code = (f: () => unknown) => { try { f(); } catch (e) { return e instanceof MockRejection ? e.code : `other: ${String(e)}`; } return null; };

describe("free space of a truck in a window", () => {
  const w = new MockWorld();
  it("an empty truck is free as a whole", () => {
    expect(w.freeSpace("V-05", 480, 1080)).toEqual({ vehicleId: "V-05", capacityPallets: 16, capacityKg: 8000, freePallets: 16, freeKg: 8000, commitments: 0 });
  });
  it("a committed job reduces it while the window overlaps the job, and only then", () => {
    const f = w.freeSpace("V-04", 480, 1080);                       // L-0103: 5 pallets, 1200 kg, 600-1080, confirmed
    expect(f).toMatchObject({ capacityPallets: 18, freePallets: 13, freeKg: 9000 - 1200, commitments: 1 });
    expect(w.freeSpace("V-04", 300, 590)).toMatchObject({ freePallets: 18, commitments: 0 });          // ends before the job starts
    expect(w.freeSpace("V-04", 1080, 1300)).toMatchObject({ freePallets: 18, commitments: 0 });        // starts when the job is delivered
  });
  it("a delivered job no longer occupies the truck", () => {
    expect(w.freeSpace("V-12", 480, 1080)).toMatchObject({ freePallets: 24, commitments: 0 });         // L-0101 is DONE
  });
});

describe("posting a capacity offer", () => {
  it("part of the truck: the values are kept and the offer is active", () => {
    const w = new MockWorld();
    const { offerId } = w.postOffer(offer());
    const o = w.state().capacityOffers.find((x) => x.offerId === offerId)!;
    expect(o).toMatchObject({ vehicleId: "V-05", companyId: "C-2", mode: "PARTIAL", freePallets: 6, freeKg: 1500, status: "ACTIVE", version: 0, fromMin: 480, toMin: 1080, toleranceMin: 15 });
  });
  it("the whole truck: the values are the truck's capacity, whatever was sent", () => {
    const w = new MockWorld();
    const { offerId } = w.postOffer(offer({ mode: "WHOLE_TRUCK", freePallets: 1, freeKg: 1 }));
    expect(w.state().capacityOffers.find((x) => x.offerId === offerId)).toMatchObject({ mode: "WHOLE_TRUCK", freePallets: 16, freeKg: 8000 });
  });
  it("the whole truck is refused when the truck has a commitment in the window", () => {
    const w = new MockWorld();
    expect(code(() => w.postOffer(offer({ vehicleId: "V-04", mode: "WHOLE_TRUCK" })))).toBe("OFFER_EXCEEDS_FREE_CAPACITY");
    expect(w.postOffer(offer({ vehicleId: "V-04", mode: "WHOLE_TRUCK", fromMin: 360, toMin: 590 })).offerId).toBeTruthy();   // free before the job starts
  });
  it("a part is refused above the free space, and accepted at exactly the free space", () => {
    const w = new MockWorld();
    expect(code(() => w.postOffer(offer({ vehicleId: "V-04", freePallets: 14, freeKg: 1000 })))).toBe("OFFER_EXCEEDS_FREE_CAPACITY");
    expect(code(() => w.postOffer(offer({ vehicleId: "V-04", freePallets: 5, freeKg: 7801 })))).toBe("OFFER_EXCEEDS_FREE_CAPACITY");
    expect(w.postOffer(offer({ vehicleId: "V-04", freePallets: 13, freeKg: 7800 })).offerId).toBeTruthy();
  });
  it("needs the permission of the truck and a valid window", () => {
    const w = new MockWorld();
    w.setShared("V-05", false);
    expect(code(() => w.postOffer(offer()))).toBe("VEHICLE_NOT_PERMITTED");
    w.setShared("V-05", true);
    expect(code(() => w.postOffer(offer({ fromMin: 900, toMin: 900 })))).toBe("OFFER_WINDOW_INVALID");
    expect(code(() => w.postOffer(offer({ fromMin: 300, toMin: 900 })))).toBe("OFFER_WINDOW_INVALID");      // the shift starts at 06:00
    expect(code(() => w.postOffer(offer({ fromMin: 600, toMin: 1400 })))).toBe("OFFER_WINDOW_INVALID");     // and ends at 22:00
  });
  it("an offer for another carrier's truck is refused", () => {
    expect(code(() => new MockWorld().postOffer(offer({ companyId: "C-1" })))).toBe("VEHICLE_NOT_PERMITTED");
  });
  it("withdrawing makes it WITHDRAWN once; a reset clears the offers", () => {
    const w = new MockWorld();
    const { offerId } = w.postOffer(offer());
    expect(w.withdrawOffer(offerId)).toMatchObject({ status: "WITHDRAWN", version: 1 });
    expect(code(() => w.withdrawOffer(offerId))).toBe("OFFER_NOT_ACTIVE");
    w.postOffer(offer());
    w.reset();
    expect(w.state().capacityOffers).toEqual([]);
  });
});

describe("the shipper's choice between a shared and a dedicated truck", () => {
  const q = { origin: "N-SG-PPWC", destination: "N-MY-JB", pallets: 4, tempClass: "CHILL", hazardClass: null };
  const w = new MockWorld();
  it("the shared truck is the default and the price is the shared price", () => {
    const e = w.estimate(geo, q);
    expect(e).toMatchObject({ exclusive: false, sharedPrice: e.price });
    expect(e.lines.some((l) => l.code === "DEDICATED")).toBe(false);
  });
  it("the dedicated truck costs the whole-truck multiple and the price card names the difference", () => {
    const shared = w.estimate(geo, q), dedicated = w.estimate(geo, { ...q, exclusive: true });
    expect(dedicated.sharedPrice).toBe(shared.price);
    expect(dedicated.price).toBe(Math.round(shared.price * EXCLUSIVE_MULTIPLIER));
    expect(dedicated.price).toBeGreaterThan(shared.price);
    expect(dedicated.lines.find((l) => l.code === "DEDICATED")!.amount).toBe(dedicated.price - shared.price);
    expect(dedicated.lines.reduce((s, l) => s + l.amount, 0)).toBe(dedicated.price);                      // the lines add up to the price
  });
  it("the choice is stored with the load, and a load is shared unless chosen otherwise", () => {
    const x = new MockWorld();
    const a = x.postLoad({ origin: "N-SG-PPWC", destination: "N-MY-JB", companyId: "S-1" }).loadId, b = x.postLoad({ origin: "N-SG-PPWC", destination: "N-MY-JB", companyId: "S-1", exclusive: true }).loadId;
    const loads = x.state().loads;
    expect(loads.find((l) => l.loadId === a)!.exclusive).toBe(false);
    expect(loads.find((l) => l.loadId === b)!.exclusive).toBe(true);
    expect(loads.filter((l) => l.loadId.startsWith("L-010")).every((l) => l.exclusive === false)).toBe(true);   // the seeded loads are shared
  });
});
