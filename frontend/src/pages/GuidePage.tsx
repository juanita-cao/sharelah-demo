import { Button, Card, List, Steps } from "antd";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSession } from "../app/contexts";

// Each step names who does it; the button signs in as that actor and opens the page.
const STEPS = [{ key: "1", actor: "S-1", to: "/shipper" }, { key: "2", actor: "OP", to: "/control-tower" }, { key: "3", actor: "C-2", to: "/driver" }, { key: "4", actor: "OP", to: "/control-tower" }, { key: "5", actor: "OP", to: "/analysis" }];

export function GuidePage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { companies, setCompanyId } = useSession();
  const go = (actor: string, to: string) => { setCompanyId(actor); nav(to); };
  return (
    <div>
      <div className="page-head"><h2>{t("nav.guide")}</h2></div>
      <Card title={t("guide.start")}>
        <Steps direction="vertical" size="small" current={-1} items={STEPS.map((s) => ({ title: t(`guide.s${s.key}.title`), description: <div><div>{t(`guide.s${s.key}.body`)}</div>
          <Button size="small" type="link" onClick={() => go(s.actor, s.to)}>{t("guide.openAs", { name: companies.find((c) => c.id === s.actor)?.name ?? s.actor })}</Button></div> }))} />
      </Card>
      <Card title={t("guide.notYet")} style={{ marginTop: 16 }}>
        <List size="small" dataSource={t("guide.notYetItems", { returnObjects: true }) as unknown as string[]} renderItem={(x) => <List.Item>{x}</List.Item>} />
      </Card>
    </div>
  );
}
