import type { Metadata } from "next";
import { PublicOrderView } from "@/components/public-order-view";
import { PublicPlatformBoundary } from "@/components/platform-lock-screen";
import { readPublicBranding } from "@/lib/public-branding";

export const metadata: Metadata = {
  title: "Private order workspace",
  robots: { index: false, follow: false, noarchive: true },
};
export const dynamic = "force-dynamic";

export default async function OrderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const branding = await readPublicBranding();
  return <PublicPlatformBoundary><PublicOrderView token={token} branding={branding} /></PublicPlatformBoundary>;
}
