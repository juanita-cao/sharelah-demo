import { useTranslation } from "react-i18next";

// Safeguard 3: permanent and unhideable while mock mode is on.
export function MockBanner() {
  const { t } = useTranslation();
  return (
    <div className="mock-banner" role="alert">
      {t("banner.mock")}
    </div>
  );
}
