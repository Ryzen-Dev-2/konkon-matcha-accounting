import Link from "next/link";
import { ArrowRight, LockKeyhole, Scale } from "lucide-react";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { getPlatformRestriction } from "@/lib/platform-restriction";
import styles from "./appeal.module.css";

export const metadata = { title: "Appeal a platform restriction", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AppealPage() {
  const session = await readSession();
  if (session?.role === "OWNER" && !session.mustChangePassword) redirect("/trust-center");
  let restriction = null;
  let unavailable = false;
  try { restriction = await getPlatformRestriction(); } catch { unavailable = true; }
  return <main className={styles.page}>
    <section>
      <span><LockKeyhole /> RESTRICTION APPEAL</span>
      <h1>The Owner can ask for a human review.</h1>
      <p>{restriction?.reason || (unavailable ? "The deployment status is temporarily unavailable. The Owner can still sign in and open Trust & safety." : "No active platform restriction was found on this deployment.")}</p>
      <ol><li>Sign in using the workspace Owner account.</li><li>Open Trust & safety and submit the facts and remediation.</li><li>The site stays locked until the platform reviewer records a decision.</li></ol>
      <div><Link href="/login"><Scale />Owner sign in<ArrowRight /></Link><Link href="/terms">Platform terms</Link></div>
    </section>
  </main>;
}
