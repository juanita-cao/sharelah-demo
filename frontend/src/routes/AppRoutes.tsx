import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useSession } from "../app/contexts";
import { HOME } from "../data/access";
import { AppShell } from "../layouts/AppShell";
import { AnalysisPage } from "../pages/AnalysisPage";
import { ControlTowerPage } from "../pages/ControlTowerPage";
import { DashboardPage } from "../pages/DashboardPage";
import { CarrierHome } from "../pages/CarrierHome";
import { GuidePage } from "../pages/GuidePage";
import { HistoryPage } from "../pages/HistoryPage";
const MapPage = lazy(() => import("../pages/MapPage").then((m) => ({ default: m.MapPage })));   // the map library loads only when this page opens
import { SettingsPage } from "../pages/SettingsPage";
import { SimulationPage } from "../pages/SimulationPage";
import { ShipperHome } from "../pages/ShipperHome";

function Home() {
  const { company } = useSession();
  return <Navigate to={HOME[company.kind]} replace />;
}

// A page outside the signed-in actor's menu redirects home (AppShell enforces it); the menu itself comes from data/access.ts.
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Home />} />
        <Route path="/shipper" element={<ShipperHome />} />
        <Route path="/driver" element={<CarrierHome />} />
        <Route path="/simulation" element={<SimulationPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/control-tower" element={<ControlTowerPage />} />
        <Route path="/analysis" element={<AnalysisPage />} />
        <Route path="/map" element={<Suspense fallback={null}><MapPage /></Suspense>} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/guide" element={<GuidePage />} />
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  );
}
