import Link from "next/link";
import { ArrowRight, LockKeyhole, Scale, ShieldAlert } from "lucide-react";
import { getPlatformRestriction } from "@/lib/platform-restriction";
import type { PlatformRestriction } from "@/lib/platform-trust";
import styles from "./platform-lock-screen.module.css";

export async function PublicPlatformBoundary({ children }: { children: React.ReactNode }) {
  let restriction: PlatformRestriction | null;
  try {
    restriction = await getPlatformRestriction();
  } catch {
    restriction = { status: "SUSPENDED", reason: "This deployment cannot verify its operating status right now.", appealPath: "/appeal" };
  }
  if (!restriction) return children;
  return <main className={styles.page}>
    <header><span>KŌN-KŌN / TRUST CONTROL</span><b><LockKeyhole /> LOCKED</b></header>
    <section className={styles.content}>
      <div className={styles.seal}><ShieldAlert /></div>
      <p className={styles.kicker}>MANAGED DEPLOYMENT · {restriction.status}</p>
      <h1>This site is temporarily unavailable.</h1>
      <p className={styles.reason}>{restriction.reason}</p>
      <div className={styles.actions}>
        <Link href={restriction.appealPath}><Scale />Owner appeal<ArrowRight /></Link>
        <Link href="/terms">Review platform terms</Link>
      </div>
      <small>The storefront, customer links and operational services remain locked until a human reviewer restores access.</small>
    </section>
    <footer><span>POLICY ENFORCEMENT</span><span>NO CUSTOMER DATA IS SHARED WITH THE PLATFORM AUTHORITY</span></footer>
  </main>;
}
