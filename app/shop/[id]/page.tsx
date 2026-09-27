import type { Metadata } from "next";
import { StorefrontView } from "@/components/storefront-view";
import { PublicPlatformBoundary } from "@/components/platform-lock-screen";

export const metadata: Metadata = {
  title: "Product details",
  description: "View live availability and request a confirmed online order.",
  robots: { index: true, follow: true },
};
export const dynamic = "force-dynamic";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PublicPlatformBoundary><StorefrontView productId={id} /></PublicPlatformBoundary>;
}
