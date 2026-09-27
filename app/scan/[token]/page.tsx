import type { Metadata } from "next";
import { MobileScanner } from "@/components/mobile-scanner";
import { PublicPlatformBoundary } from "@/components/platform-lock-screen";
import { readPublicBranding } from "@/lib/public-branding";

export const metadata: Metadata = {
  title: "Mobile scanner pass",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

export default async function MobileScannerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const branding = await readPublicBranding();
  return <PublicPlatformBoundary><MobileScanner token={token} branding={branding} /></PublicPlatformBoundary>;
}
