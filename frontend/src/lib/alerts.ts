// Sounds and alerts for the moments that matter (a new order for a carrier; "sent" and "accepted" for a shipper). Best practice followed here:
//  - tones are synthesised (Web Audio), so there is no audio file to load or license;
//  - browsers refuse sound before the person has touched the page, so the audio context is unlocked on the first tap or key press;
//  - one mute switch, remembered, because a sound the person cannot silence gets the whole app muted at the OS;
//  - every sound has a visible twin (a notification card and the tab title) and a vibration on phones, so nothing depends on sound alone;
//  - each alert fires once per event (callers de-duplicate by id).
export type AlertKind = "request" | "sent" | "accepted" | "declined";
export interface Tone { f: number; at: number; dur: number; gain?: number }

// A request must be hard to miss (ring-like, three bursts); the others are short and friendly.
export const SOUNDS: Record<AlertKind, { tones: Tone[]; vibrate: number[] }> = {
  request: { tones: [0, 0.45, 0.9].flatMap((s) => [{ f: 880, at: s, dur: 0.16, gain: 0.5 }, { f: 1175, at: s + 0.17, dur: 0.2, gain: 0.5 }]), vibrate: [200, 100, 200, 100, 200] },
  sent: { tones: [{ f: 660, at: 0, dur: 0.1 }, { f: 880, at: 0.11, dur: 0.16 }], vibrate: [60] },
  accepted: { tones: [{ f: 659, at: 0, dur: 0.14 }, { f: 831, at: 0.15, dur: 0.14 }, { f: 988, at: 0.3, dur: 0.14 }, { f: 1319, at: 0.45, dur: 0.3 }], vibrate: [100, 60, 100] },
  declined: { tones: [{ f: 440, at: 0, dur: 0.16 }, { f: 330, at: 0.18, dur: 0.28 }], vibrate: [150] },
};

export const SOUND_KEY = "sfn.ui.sound";
export function soundEnabled(storage: Storage | null = safeStorage()): boolean { try { return storage?.getItem(SOUND_KEY) !== "off"; } catch { return true; } }
export function setSoundEnabled(on: boolean, storage: Storage | null = safeStorage()): void { try { storage?.setItem(SOUND_KEY, on ? "on" : "off"); } catch { /* convenience only */ } }
function safeStorage(): Storage | null { try { return window.localStorage; } catch { return null; } }

let ctx: AudioContext | null = null;
export function unlockAudio(): void {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = ctx ?? new AC();
    if (ctx.state === "suspended") void ctx.resume();
  } catch { /* no audio: the visible alert still shows */ }
}
export function installAudioUnlock(): () => void {
  const f = () => unlockAudio();
  window.addEventListener("pointerdown", f, { once: true }); window.addEventListener("keydown", f, { once: true });
  return () => { window.removeEventListener("pointerdown", f); window.removeEventListener("keydown", f); };
}

/** Plays the sound of an alert; returns false when it stays silent (muted, or the browser has not allowed audio yet). */
export function playAlert(kind: AlertKind, storage: Storage | null = safeStorage()): boolean {
  const on = soundEnabled(storage);
  try { if (navigator.vibrate && on) navigator.vibrate(SOUNDS[kind].vibrate); } catch { /* not supported */ }
  if (!on || !ctx || ctx.state !== "running") return false;
  const t0 = ctx.currentTime + 0.02;
  for (const tone of SOUNDS[kind].tones) {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = "sine"; osc.frequency.value = tone.f;
    const peak = tone.gain ?? 0.35, s = t0 + tone.at;
    g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(peak, s + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, s + tone.dur);
    osc.connect(g).connect(ctx.destination); osc.start(s); osc.stop(s + tone.dur + 0.02);
  }
  return true;
}

// The tab title carries the alert while the person is on another tab, and clears when they come back.
let baseTitle: string | null = null;
export function flashTitle(text: string): void {
  if (typeof document === "undefined" || !document.hidden) return;
  baseTitle = baseTitle ?? document.title; document.title = `● ${text} · ${baseTitle}`;
  const back = () => { if (!document.hidden && baseTitle) { document.title = baseTitle; baseTitle = null; document.removeEventListener("visibilitychange", back); } };
  document.addEventListener("visibilitychange", back);
}
