import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App as AntApp, ConfigProvider } from "antd";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import type { i18n as I18n } from "i18next";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import { createApi } from "../api/api";
import { createHttpClient } from "../api/http";
import { COMPANIES } from "../data/companies";
import { PALETTE, type Palette } from "../data/theme";
import type { ActorKind } from "../api/types";
import { ApiContext, SessionContext } from "./contexts";

const COMPANY_KEY = "sfn.session.company";
const lastKey = (kind: string) => `sfn.session.last.${kind}`;   // the company last used in each role, so switching role comes back to the same company

function Themed({ palette, children }: { palette: Palette; children: ReactNode }) {
  const { i18n } = useTranslation();
  useEffect(() => {   // the role colour for the plain CSS too
    const r = document.documentElement.style;
    r.setProperty("--primary", palette.primary); r.setProperty("--accent", palette.primary); r.setProperty("--primary-soft", palette.soft); r.setProperty("--primary-ink", palette.ink); r.setProperty("--on-primary", palette.onPrimary);
  }, [palette]);
  return (
    <ConfigProvider
      locale={i18n.language === "zh" ? zhCN : enUS}
      theme={{
        token: { colorPrimary: palette.primary, colorTextLightSolid: palette.onPrimary, colorLink: palette.ink, borderRadius: 12, borderRadiusLG: 18, controlHeight: 40, fontSize: 14, colorBgLayout: "#F6F8FA", colorBorderSecondary: "#D7E0E8", colorText: "#172331", colorTextSecondary: "#66788A",
          fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif' },
        components: { Card: { headerBg: "#FFFFFF" }, Button: { fontWeight: 600, primaryShadow: "none" } },
      }}
    >
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  );
}

function readCompany(): string { try { return window.localStorage.getItem(COMPANY_KEY) ?? "S-1"; } catch { return "S-1"; } }
function readLast(kind: string): string | null { try { return window.localStorage.getItem(lastKey(kind)); } catch { return null; } }

export function AppProviders({ baseUrl, i18n, children }: { baseUrl: string; i18n: I18n; children: ReactNode }) {
  const { queryClient, api } = useMemo(() => ({
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } }),
    api: createApi(createHttpClient(baseUrl)),
  }), [baseUrl]);
  const [companyId, setId] = useState(readCompany);
  const company = COMPANIES.find((c) => c.id === companyId) ?? COMPANIES[0];
  const setCompanyId = (id: string) => {
    setId(id);
    const c = COMPANIES.find((x) => x.id === id);
    try { window.localStorage.setItem(COMPANY_KEY, id); if (c) window.localStorage.setItem(lastKey(c.kind), id); } catch { /* convenience only */ }
  };
  // Step one of the two-step picker: choose the role; the company is the one last used in that role (or the first of it).
  const setKind = (kind: ActorKind) => {
    const remembered = readLast(kind);
    const c = COMPANIES.find((x) => x.id === remembered && x.kind === kind) ?? COMPANIES.find((x) => x.kind === kind)!;
    setCompanyId(c.id);
  };
  return (
    <I18nextProvider i18n={i18n}>
      <Themed palette={PALETTE[company.kind]}>
        <QueryClientProvider client={queryClient}>
          <ApiContext.Provider value={api}>
            <SessionContext.Provider value={{ company, setCompanyId, setKind, companies: COMPANIES }}>{children}</SessionContext.Provider>
          </ApiContext.Provider>
        </QueryClientProvider>
      </Themed>
    </I18nextProvider>
  );
}
