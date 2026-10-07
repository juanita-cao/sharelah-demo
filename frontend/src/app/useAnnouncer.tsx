import { BellOutlined, CheckCircleFilled, CloseCircleFilled, SendOutlined } from "@ant-design/icons";
import { App } from "antd";
import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { flashTitle, playAlert, type AlertKind } from "../lib/alerts";

const ICON: Record<AlertKind, ReactNode> = {
  request: <BellOutlined style={{ color: "#EA580C" }} />, sent: <SendOutlined style={{ color: "#2563EB" }} />,
  accepted: <CheckCircleFilled style={{ color: "#16A34A" }} />, declined: <CloseCircleFilled style={{ color: "#DC2626" }} />,
};
const seen = new Set<string>();   // one alert per event, however often the screen re-renders or the state is polled

// The pop-up card with its sound: `announce(kind, key, title, text)`. The same key never alerts twice.
export function useAnnouncer() {
  const { notification } = App.useApp();
  const { t } = useTranslation();
  return useMemo(() => ({
    announce(kind: AlertKind, key: string, title: string, text: string) {
      const id = `${kind}:${key}`;
      if (seen.has(id)) return;
      seen.add(id);
      playAlert(kind); flashTitle(title);
      notification.open({ key: id, message: title, description: text, icon: ICON[kind], placement: "topRight", duration: kind === "request" ? 12 : 6, role: "alert", closeIcon: t("alert.dismiss") as string });
    },
  }), [notification, t]);
}
