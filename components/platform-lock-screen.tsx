import { headers } from "next/headers";
import { ArrowRight, FileWarning, LockKeyhole, Scale, ShieldAlert } from "lucide-react";
import { getPlatformRestriction } from "@/lib/platform-restriction";
import type { PlatformRestriction } from "@/lib/platform-trust";
import { OFFICIAL_APPEAL_URL, OFFICIAL_REPORT_URL, OFFICIAL_TERMS_URL } from "@/lib/platform-public";
import styles from "./platform-lock-screen.module.css";

export async function PublicPlatformBoundary({ children }: { children: React.ReactNode }) {
  let restriction: PlatformRestriction | null;
  try {
    restriction = await getPlatformRestriction();
  } catch {
    restriction = { status: "VERIFICATION_REQUIRED", reason: "This deployment cannot verify its operating status right now.", appealUrl: OFFICIAL_APPEAL_URL, ownerAction: "CONSENT" };
  }
  if (!restriction) return children;
  const requestHeaders = await headers();
  const host = (requestHeaders.get("host") || "").split(",")[0].trim();
  const protocol = (requestHeaders.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https")).split(",")[0].trim();
  const instance = host ? `${protocol}://${host}` : "";
  const query = instance ? `?instance=${encodeURIComponent(instance)}` : "";
  const ownerHref = restriction.ownerAction === "APPEAL" ? `${restriction.appealUrl}${query}` : "/trust-center";
  const ownerLabel = restriction.ownerAction === "APPEAL" ? "Owner appeal" : restriction.ownerAction === "WAIT" ? "Owner review status" : "Owner consent";
  return <main className={styles.page}>
    <header><span>KŌN-KŌN / TRUST CONTROL</span><b><LockKeyhole /> LOCKED</b></header>
    <section className={styles.content}>
      <div className={styles.seal}><ShieldAlert /></div>
      <p className={styles.kicker}>MANAGED DEPLOYMENT · {restriction.status}</p>
      <h1>This site is temporarily unavailable.</h1>
      <p className={styles.reason}>{restriction.reason}</p>
      <div className={styles.actions}>
        <a href={ownerHref}><Scale />{ownerLabel}<ArrowRight /></a>
        <a href={`${OFFICIAL_REPORT_URL}${query}`}><FileWarning />Buyer complaint</a>
        <a href={OFFICIAL_TERMS_URL}>Review platform terms</a>
      </div>
      <small>The storefront, customer links and operational services remain locked until current terms are accepted and a valid signed operating policy permits access.</small>
    </section>
    <footer><span>MANDATORY POLICY ENFORCEMENT</span><span>NO CUSTOMER DATA IS SHARED WITH THE PLATFORM AUTHORITY</span></footer>
  </main>;
}
