import { Chat } from "@/components/Chat";
import { Footer } from "@/components/Footer";
import { CookieBanner } from "@/components/CookieBanner";
import { auth, signOut } from "@/auth";
import { authConfigured } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = authConfigured() ? await auth() : null;
  const userEmail = session?.user?.email ?? undefined;
  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }
  // Flags leídos en el servidor (no se exponen otras variables).
  const adsEnabled = process.env.ADS_ENABLED === "true";
  const analyticsEnabled = process.env.ANALYTICS_ENABLED === "true";
  return (
    <>
      <Chat adsEnabled={adsEnabled} userEmail={userEmail} logout={userEmail ? logout : undefined} />
      <Footer />
      {(adsEnabled || analyticsEnabled) && <CookieBanner />}
    </>
  );
}
