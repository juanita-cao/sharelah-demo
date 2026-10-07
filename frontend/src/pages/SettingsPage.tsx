import { Alert, App, Button, Card, Form, InputNumber } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PriceTableVM } from "../api/types";
import { useApi } from "../app/contexts";
import { useApiMutation } from "../app/hooks";

// Price table of the operator: grouped in cards, calm filled inputs, and a save bar that appears only when something changed.
export function SettingsPage() {
  const { t } = useTranslation();
  const api = useApi();
  const { message } = App.useApp();
  const q = useQuery({ queryKey: ["price"], queryFn: api.priceTable });
  const [form] = Form.useForm<PriceTableVM>();
  const [errors, setErrors] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (q.data) { form.setFieldsValue(q.data); setDirty(false); } }, [q.data, form]);
  const save = useApiMutation((p: PriceTableVM) => api.putPriceTable(p), ["price", "state"]);
  const submit = (v: PriceTableVM) => save.mutate({ ...q.data!, ...v }, { onSuccess: (r) => { setErrors(r.errorCodes); if (r.errorCodes.length === 0) { setDirty(false); void message.success(t("settings.saved")); } } });
  const n = (name: (string | number)[], label: string, step = 0.1, suffix?: string) => <Form.Item name={name} label={label}><InputNumber variant="filled" size="large" min={0} step={step} suffix={suffix} style={{ width: "100%" }} /></Form.Item>;
  return (
    <div className="console">
      <div className="page-head"><div><h2>{t("nav.settings")}</h2><div className="muted">{t("settings.priceTable")} · v{q.data?.version ?? "…"}</div></div></div>
      <Alert type="info" showIcon style={{ marginBottom: 16 }} message={t("settings.assumptionNote")} />
      {errors.map((e) => <Alert key={e} type="error" showIcon style={{ marginBottom: 8 }} message={t(`guard.${e}`)} />)}
      <Form form={form} layout="vertical" onFinish={submit} onValuesChange={() => setDirty(true)} requiredMark={false}>
        <div className="chart-grid three">
          <Card title={t("settings.section.vehicle")} loading={q.isLoading}>{n(["perKm", "DRY_VAN"], t("settings.perKmDry"), 0.1, "S$")}{n(["perKm", "REEFER_SINGLE"], t("settings.perKmReeferS"), 0.1, "S$")}{n(["perKm", "REEFER_DUAL"], t("settings.perKmReeferD"), 0.1, "S$")}</Card>
          <Card title={t("settings.section.driver")} loading={q.isLoading}>{n(["perMinDriver"], t("settings.perMin"), 0.05, "S$")}{n(["fixedPerVehicle"], t("settings.fixed"), 5, "S$")}{n(["borderFee"], t("settings.border"), 1, "S$")}</Card>
          <Card title={t("settings.section.platform")} loading={q.isLoading}>{n(["takeRate"], t("settings.take"), 0.01)}{n(["referralRate"], t("settings.referral"), 0.01)}<div className="muted">{t("settings.rateNote")}</div></Card>
        </div>
        <div className={`save-bar${dirty ? " show" : ""}`}>
          <span>{t("settings.unsaved")}</span>
          <span><Button onClick={() => { form.setFieldsValue(q.data!); setDirty(false); setErrors([]); }}>{t("settings.revert")}</Button> <Button type="primary" htmlType="submit" loading={save.isPending}>{t("settings.save")}</Button></span>
        </div>
      </Form>
    </div>
  );
}
