export function computeUseMock(env: { DEV: boolean; VITE_USE_MOCK?: string }): boolean {
  return env.DEV && env.VITE_USE_MOCK === "1";
}

// Default off. In a production build DEV is false, so this is false whatever the environment says.
export const USE_MOCK: boolean = computeUseMock(import.meta.env);
