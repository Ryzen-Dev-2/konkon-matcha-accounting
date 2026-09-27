import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import styles from "./index.module.css";
import { CinematicIndexHero } from "@/components/cinematic-index-hero";
import { PublicPlatformBoundary } from "@/components/platform-lock-screen";
import { readPublicBranding } from "@/lib/public-branding";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Meet KONA · Run the Day in One Calm Flow",
  description: "Meet KONA, the interactive guide connecting Kōn-Kōn commerce, operations and accounting.",
  authors: [{ name: "Ryzen Hub Dev", url: "https://github.com/Ryzen-hub-dev" }],
  creator: "Ryzen Hub Dev",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f8f3e8" };
export const dynamic = "force-dynamic";

export default async function IndexPage() {
  const branding = await readPublicBranding();
  return (
    <PublicPlatformBoundary><main className={`${styles.home} ${inter.className}`}>
      <a className={styles.skip} href="#hero-content">Skip to content</a>
      <CinematicIndexHero
        businessName={branding.businessName}
        workspaceLogoDataUrl={branding.workspaceLogoDataUrl}
      />
    </main></PublicPlatformBoundary>
  );
}
