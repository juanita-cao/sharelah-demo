import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PLACES, placeName } from "./places";

// A place is always shown by its full name: the first word alone is ambiguous ("Port" is Port Dickson and Port Klang, "Pasir" is Pasir Panjang and Pasir Gudang).
describe("place names", () => {
  it("are complete and unique", () => {
    expect(placeName("N-MY-PDICKSON")).toBe("Port Dickson");
    expect(placeName("N-MY-PKLANG")).toBe("Port Klang (Northport)");
    expect(placeName("N-SG-PPWC")).toBe("Pasir Panjang Wholesale Centre");
    expect(new Set(PLACES.map((p) => p.name)).size).toBe(PLACES.length);
    expect(placeName("N-UNKNOWN")).toBe("N-UNKNOWN");
  });

  it("the first word alone would have been ambiguous (the reason for showing everything)", () => {
    const first = PLACES.map((p) => p.name.split(/[ /(]/)[0]);
    expect(new Set(first).size).toBeLessThan(PLACES.length);
  });

  it("no screen cuts a name down to its first word", () => {
    const files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts")) files.push(p); } };
    walk(join(__dirname, ".."));
    const offenders = files.filter((f) => /shortName|split\(\/\[ \/\(\]\/\)\[0\]/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
