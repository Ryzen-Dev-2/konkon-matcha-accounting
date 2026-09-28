import { ArrowRight, LockKeyhole, Scale } from "lucide-react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { normaliseOrigin } from "@/lib/platform-trust";
import { OFFICIAL_APPEAL_URL, OFFICIAL_PLATFORM_ORIGIN, OFFICIAL_TERMS_URL } from "@/lib/platform-public";
import styles from "./appeal.module.css";

export const metadata = { title: "Appeal a platform restriction", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AppealPage({ searchParams }: { searchParams: Promise<{ instance?: string }> }) {
  const params = await searchParams;
  const requestHeaders = await headers();
  const host = (requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "").split(",")[0].trim().toLowerCase();
  const officialHost = new URL(OFFICIAL_PLATFORM_ORIGIN).host;
  const currentOrigin = normaliseOrigin(`${(requestHeaders.get("x-forwarded-proto") || "https").split(",")[0]}://${host}`, false);
  const instance = normaliseOrigin(String(params.instance || ""), false) || (host !== officialHost ? currentOrigin : "");
  if (process.env.NODE_ENV === "production" && host && host !== officialHost) {
    redirect(`${OFFICIAL_APPEAL_URL}${instance ? `?instance=${encodeURIComponent(instance)}` : ""}`);
  }
  const ownerLogin = instance ? `${instance}/login` : "";
  return <main className={styles.page}>
    <section>
      <span><LockKeyhole /> RESTRICTION APPEAL</span>
      <h1>The Owner can ask for a human review.</h1>
      <p>Appeals start from this official portal, but the signed request must be sent from the affected workspace so its private Owner credential never leaves that deployment.</p>
      <ol><li>Open the affected workspace and sign in using its Owner account.</li><li>Open Trust &amp; safety and submit the facts and remediation.</li><li>The site stays locked until the platform reviewer records a decision.</li></ol>
      <div>{ownerLogin ? <a href={ownerLogin}><Scale />Open Owner sign in<ArrowRight /></a> : <a href={OFFICIAL_PLATFORM_ORIGIN}><Scale />Official platform home<ArrowRight /></a>}<a href={OFFICIAL_TERMS_URL}>Platform terms</a></div>
    </section>
  </main>;
}
