import { CardWriter } from "@/components/card-writer";
import { PublicPlatformBoundary } from "@/components/platform-lock-screen";
import { readPublicBranding } from "@/lib/public-branding";
export const metadata = { title: "Write member NFC card", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export const dynamic = "force-dynamic";
export default async function CardWritePage() {
  const branding = await readPublicBranding();
  return <PublicPlatformBoundary><CardWriter branding={branding} /></PublicPlatformBoundary>;
}
