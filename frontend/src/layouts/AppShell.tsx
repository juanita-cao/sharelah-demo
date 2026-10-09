import { MutedOutlined, SoundOutlined, BarChartOutlined, CarOutlined, LineChartOutlined, DashboardOutlined, DeploymentUnitOutlined, DownOutlined, EnvironmentOutlined, HistoryOutlined, MenuFoldOutlined, MenuUnfoldOutlined, ReadOutlined, SettingOutlined, ShopOutlined, SyncOutlined } from "@ant-design/icons";
import { useIsFetching } from "@tanstack/react-query";
import { App, Button, Dropdown, Tooltip } from "antd";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import type { ActorKind } from "../api/types";
import { HOME, allowed } from "../data/access";
import { useApi, useSession } from "../app/contexts";
import { useApiMutation, useStateQuery } from "../app/hooks";
import { useRoleAlerts } from "../app/useRoleAlerts";
import { installAudioUnlock, setSoundEnabled, soundEnabled, playAlert } from "../lib/alerts";
import { LanguageSwitch } from "../components/LanguageSwitch";
import { MockBanner } from "../components/MockBanner";
import { USE_MOCK } from "../config/featureFlags";
import { loadUiPrefs, saveUiPrefs } from "../prefs/uiPrefs";

const NAV: Record<ActorKind, { to: string; key: string; icon: ReactNode }[]> = {
  SHIPPER: [{ to: "/shipper", key: "nav.myLoads", icon: <ShopOutlined /> }, { to: "/dashboard", key: "nav.dashboard", icon: <DashboardOutlined /> }, { to: "/history", key: "nav.history", icon: <HistoryOutlined /> }, { to: "/guide", key: "nav.guide", icon: <ReadOutlined /> }],
  CARRIER: [{ to: "/driver", key: "nav.jobs", icon: <CarOutlined /> }, { to: "/dashboard", key: "nav.dashboard", icon: <DashboardOutlined /> }, { to: "/history", key: "nav.history", icon: <HistoryOutlined /> }, { to: "/guide", key: "nav.guide", icon: <ReadOutlined /> }, { to: "/simulation", key: "nav.simulation", icon: <LineChartOutlined /> }],
  OPERATOR: [{ to: "/control-tower", key: "nav.controlTower", icon: <DeploymentUnitOutlined /> }, { to: "/analysis", key: "nav.analysis", icon: <BarChartOutlined /> }, { to: "/map", key: "nav.map", icon: <EnvironmentOutlined /> }, { to: "/settings", key: "nav.settings", icon: <SettingOutlined /> }, { to: "/guide", key: "nav.guide", icon: <ReadOutlined /> }, { to: "/simulation", key: "nav.simulation", icon: <LineChartOutlined /> }],
};

function SoundSwitch() {
  const { t } = useTranslation();
  const [on, setOn] = useState(soundEnabled());
  useEffect(() => installAudioUnlock(), []);
  return <Tooltip title={on ? t("sound.on") : t("sound.off")}><Button type="text" aria-label={on ? t("sound.on") : t("sound.off")} aria-pressed={on} icon={on ? <SoundOutlined /> : <MutedOutlined />} onClick={() => { const n = !on; setOn(n); setSoundEnabled(n); if (n) playAlert("sent"); }} /></Tooltip>;
}

function SyncIndicator() {
  const { t } = useTranslation();
  const q = useStateQuery();
  const [, tick] = useState(0);
  useEffect(() => { const id = window.setInterval(() => tick((n) => n + 1), 1000); return () => window.clearInterval(id); }, []);
  const ago = q.dataUpdatedAt ? Math.max(0, Math.round((Date.now() - q.dataUpdatedAt) / 1000)) : null;
  const fetching = useIsFetching({ queryKey: ["state"] }) > 0;
  return <span className="sync-indicator" aria-live="polite"><SyncOutlined spin={fetching} /> {q.isError ? t("shell.syncFailed") : ago === null ? t("shell.syncing") : t("shell.synced", { s: ago })}</span>;
}

export function AppShell() {
  const { t } = useTranslation();
  const api = useApi();
  const { message, modal } = App.useApp();
  const { company, companies, setCompanyId, setKind } = useSession();
  const state = useStateQuery();
  useRoleAlerts();
  const [collapsed, setCollapsed] = useState(() => loadUiPrefs().sidebarCollapsed);
  const { pathname } = useLocation();
  const reset = useApiMutation(() => api.reset(), ["state", "options", "job"]);
  const confirmReset = () => modal.confirm({ title: t("shell.resetTitle"), content: t("shell.resetBody"), onOk: () => reset.mutateAsync().then(() => void message.success(t("shell.resetDone"))) });
  const group = (k: ActorKind) => companies.filter((c) => c.kind === k).map((c) => ({ key: c.id, label: k === "OPERATOR" ? c.name : `${c.name} (${c.id})` }));
  const topNav = company.kind !== "OPERATOR";   // shippers and carriers use the consumer-style top navigation, the operator keeps the console sidebar
  return (
    <div className="app-shell" data-role={company.kind}>
      {USE_MOCK && <MockBanner />}
      <header className="app-header">
        <Link to={HOME[company.kind]} className="app-header-brand" aria-label={t("app.name")}><img src="/brand/sharelah-logo.png" alt={t("app.name")} className="brand-logo" /></Link>
        {topNav && <nav className="top-nav" aria-label="main">{NAV[company.kind].map((i) => <NavLink key={i.to} to={i.to} className={({ isActive }) => `top-nav-item${isActive ? " active" : ""}`}>{i.icon}<span>{t(i.key)}</span></NavLink>)}</nav>}
        <div className="app-header-actions">
          <SyncIndicator />
          <SoundSwitch />
          <LanguageSwitch />
          <Dropdown trigger={["click"]} menu={{ selectedKeys: [company.kind], items: (["OPERATOR", "SHIPPER", "CARRIER"] as ActorKind[]).map((k) => ({ key: k, label: t(`shell.role.${k}`) })), onClick: ({ key }) => setKind(key as ActorKind) }}>
            <button type="button" className="role-switch" aria-label={t("shell.pickRole")}>{t(`shell.role.${company.kind}`)} <DownOutlined /></button>
          </Dropdown>
          {company.kind === "OPERATOR" ? <span className="company-name">{company.name}</span> : (
            <Dropdown trigger={["click"]} menu={{ selectedKeys: [company.id], items: group(company.kind), onClick: ({ key }) => setCompanyId(key) }}>
              <Button type="text" className="company-switch">{company.name} <DownOutlined /></Button>
            </Dropdown>
          )}
        </div>
      </header>
      <div className="app-body">
        {!topNav && <nav className={`app-sidebar${collapsed ? " collapsed" : ""}`} aria-label="main">
          <ul>{NAV[company.kind].map((i) => (
            <li key={i.to}><Tooltip title={collapsed ? t(i.key) : undefined} placement="right"><NavLink to={i.to} className={({ isActive }) => `app-nav-item${isActive ? " active" : ""}`}>{i.icon}{!collapsed && <span>{t(i.key)}</span>}</NavLink></Tooltip></li>
          ))}</ul>
          <Button size="small" className="app-sidebar-toggle" aria-label="toggle" icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => { setCollapsed((c) => { saveUiPrefs({ sidebarCollapsed: !c }); return !c; }); }} />
        </nav>}
        <main className="app-main">
          <div className={`app-content${topNav ? " wide" : ""}`} key={`${company.id}${pathname.split("/")[1]}`}>{allowed(company.kind, pathname) ? <Outlet /> : <Navigate to={HOME[company.kind]} replace />}</div>
          <footer className="app-status">
            {t("shell.status", { world: state.data?.worldHash ?? "—", epoch: state.data?.epoch ?? "—" })} · <a onClick={confirmReset}>{t("shell.reset")}</a>
            <div style={{ marginTop: 6 }}>{t("footer.ai")}</div>
            <div style={{ marginTop: 2, opacity: 0.85 }}>© {new Date().getFullYear()} InnerDrive Studio. {t("footer.rights")}</div>
          </footer>
        </main>
      </div>
    </div>
  );
}
