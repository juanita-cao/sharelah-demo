import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { en } from "./en";
import { zh } from "./zh";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !f.endsWith(".test.ts") ? [p] : []; });
}

// Dynamic keys of the form t(`prefix.${x}`): every value that can occur must exist.
const DYNAMIC: Record<string, string[]> = {
  "temp.": ["AMB", "COOL", "CHILL", "PHARMA", "FROZEN"], "hazard.": ["CL3", "CL5_1", "CL6_1", "CL8"], "status.": ["RECEIVED", "MATCHED", "CONFIRMED", "IN_TRANSIT", "DONE", "UNSERVED"],
  "reason.": ["NO_FEASIBLE_VEHICLE", "TEMP_COMPATIBLE", "SLACK_BEFORE_DEADLINE", "LOWER_COST_THAN_NEXT", "BACKHAUL", "LOWER_COST", "AVOIDS_LATE", "BEST_SCORE"],
  "exclude.": ["TEMP_INCOMPATIBLE", "VEHICLE_NOT_DG_CAPABLE", "CAPACITY_PALLETS", "TIME_WINDOW", "NOT_SHARED"], "profile.": ["PROFIT", "BALANCED", "GREEN"],
  "job.": ["RUNNING", "COMPLETE", "TIME_LIMIT", "FLOOR_INFEASIBLE", "VERIFICATION_REJECTED", "NO_SOLUTION", "CANCELLED", "ERROR"],
  "apply.": ["APPLIED", "CONFLICT", "STALE_EPOCH", "ALREADY_APPLIED", "REJECTED"], "scenario.": ["A", "A2", "B", "C"], "offerStatus.": ["SHOWN", "ACCEPTED", "DECLINED", "EXPIRED", "STALE"],
  "shell.role.": ["OPERATOR", "SHIPPER", "CARRIER"], "ship.line.": ["BASE", "DISTANCE", "BORDER", "HAZARD"], "sens.": ["SHARING_LOWERS_EMPTY_KM.title", "SHARING_LOWERS_EMPTY_KM.flips", "OPTIMIZATION_ADDS_VALUE.title", "OPTIMIZATION_ADDS_VALUE.flips", "ALL_CARRIERS_GAIN.title", "ALL_CARRIERS_GAIN.flips", "STABLE_UNDER_TAKE_RATE.title", "STABLE_UNDER_TAKE_RATE.flips", "COLD_CHAIN_PREMIUM_HOLDS.title", "COLD_CHAIN_PREMIUM_HOLDS.flips"], "guard.": ["TAKE_PLUS_REFERRAL_TOO_HIGH", "PRICE_MUST_BE_POSITIVE", "REEFER_BELOW_DRY_VAN"], "guide.s": ["1.title", "1.body", "2.title", "2.body", "3.title", "3.body", "4.title", "4.body", "5.title", "5.body"],
};

describe("dictionaries", () => {
  it("have the same keys in both languages", () => { expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort()); });
  it("contain every key the code asks for", () => {
    const used = new Set<string>();
    for (const f of files(join(__dirname, ".."))) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/\bt\(\s*"([^"]+)"/g)) used.add(m[1]);
    }
    const missing = [...used].filter((k) => !(k in en));
    expect(missing).toEqual([]);
    for (const [prefix, vals] of Object.entries(DYNAMIC)) for (const v of vals) expect(en[`${prefix}${v}`], `${prefix}${v}`).toBeTruthy();
  });
  it("reason codes carry the parameters their text uses", () => {
    expect(String(en["reason.SLACK_BEFORE_DEADLINE"])).toContain("{{min}}");
    expect(String(zh["reason.SLACK_BEFORE_DEADLINE"])).toContain("{{min}}");
  });
});
