import { describe, expect, it } from "vitest";
import { SOUNDS, playAlert, setSoundEnabled, soundEnabled } from "./alerts";

describe("alerts", () => {
  const store = (): Storage => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } as unknown as Storage; };
  it("sound is on by default and the mute choice is remembered", () => {
    const s = store();
    expect(soundEnabled(s)).toBe(true);
    setSoundEnabled(false, s); expect(soundEnabled(s)).toBe(false);
    setSoundEnabled(true, s); expect(soundEnabled(s)).toBe(true);
  });
  it("stays silent when muted, and when the browser has not allowed audio yet (no throw)", () => {
    const s = store();
    setSoundEnabled(false, s); expect(playAlert("request", s)).toBe(false);
    setSoundEnabled(true, s); expect(playAlert("accepted", s)).toBe(false);
  });
  it("a new order is the longest and loudest sound; every alert has a vibration for phones", () => {
    const end = (k: keyof typeof SOUNDS) => Math.max(...SOUNDS[k].tones.map((t) => t.at + t.dur));
    for (const k of ["sent", "accepted", "declined"] as const) expect(end("request")).toBeGreaterThan(end(k));
    for (const k of Object.keys(SOUNDS) as (keyof typeof SOUNDS)[]) expect(SOUNDS[k].vibrate.length).toBeGreaterThan(0);
  });
});
