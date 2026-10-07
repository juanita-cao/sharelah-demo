import { setupWorker } from "msw/browser";
import { createHandlers } from "./handlers";

export async function startMockWorker(baseUrl: string): Promise<void> {
  const worker = setupWorker(...createHandlers(baseUrl));
  await worker.start({ onUnhandledRequest: "bypass", serviceWorker: { url: "/mockServiceWorker.js" } });
}
