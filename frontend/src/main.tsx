import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "antd/dist/reset.css";
import "./styles.css";
import { AppProviders } from "./app/AppProviders";
import { createI18n } from "./i18n";
import { loadUiPrefs } from "./prefs/uiPrefs";
import { AppRoutes } from "./routes/AppRoutes";

// A demo build answers its API calls in the browser (mock backend), so its API origin is the site itself; a real build talks to the backend.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.MODE === "demo" ? window.location.origin : "http://localhost:8000");

async function start() {
  // Written as literals so Vite removes this whole block, dynamic import included, from production builds. The mock runs in development and in a demo build (`--mode demo`) only.
  if ((import.meta.env.DEV || import.meta.env.MODE === "demo") && import.meta.env.VITE_USE_MOCK === "1") {
    const { startMockWorker } = await import("./mocks/browser");
    await startMockWorker(API_BASE_URL);
  }
  const i18n = await createI18n(loadUiPrefs().language);
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <AppProviders baseUrl={API_BASE_URL} i18n={i18n}>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppRoutes />
        </BrowserRouter>
      </AppProviders>
    </React.StrictMode>,
  );
}

void start();
