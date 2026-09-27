import type { Metadata } from "next";
import { PaymentDisplay } from "@/components/payment-display";
import { PublicPlatformBoundary } from "@/components/platform-lock-screen";
import { readPublicBranding } from "@/lib/public-branding";

export const metadata: Metadata = {
  title: "Customer payment display",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

export default async function CustomerPaymentDisplayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const branding = await readPublicBranding();
  return <PublicPlatformBoundary><PaymentDisplay token={token} branding={branding} /></PublicPlatformBoundary>;
}
