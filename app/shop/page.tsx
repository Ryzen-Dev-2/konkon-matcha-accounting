import type { Metadata } from "next";
import { StorefrontView } from "@/components/storefront-view";
import { PublicPlatformBoundary } from "@/components/platform-lock-screen";

export const metadata: Metadata = {
  title: "Online order desk",
  description: "Browse available products and request a confirmed online order.",
  robots: { index: true, follow: true },
};
export const dynamic = "force-dynamic";

export default function ShopPage() {
  return <PublicPlatformBoundary><StorefrontView /></PublicPlatformBoundary>;
}
