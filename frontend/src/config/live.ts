// A static demo (the public site) has no Python server behind it: live runs and real answers to opportunities are switched off with VITE_LIVE_SERVER=off (see .env.demo).
export const LIVE_SERVER = import.meta.env.VITE_LIVE_SERVER !== "off";
