import { PublicReceiptView } from "@/components/public-receipt-view";
import { PublicPlatformBoundary } from "@/components/platform-lock-screen";
import { readPublicBranding } from "@/lib/public-branding";
export const metadata = { title: "Your receipt", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export const dynamic = "force-dynamic";
export default async function ReceiptPage() {
  const branding = await readPublicBranding();
  return <PublicPlatformBoundary><PublicReceiptView branding={branding} /></PublicPlatformBoundary>;
}
