import { Chat } from "@/components/Chat";
import { Footer } from "@/components/Footer";
import { CookieBanner } from "@/components/CookieBanner";

export const dynamic = "force-dynamic";

export default function Home() {
  // Flags leídos en el servidor (no se exponen otras variables).
  const adsEnabled = process.env.ADS_ENABLED === "true";
  const analyticsEnabled = process.env.ANALYTICS_ENABLED === "true";
  return (
    <>
      <Chat adsEnabled={adsEnabled} />
      <Footer />
      {(adsEnabled || analyticsEnabled) && <CookieBanner />}
    </>
  );
}
