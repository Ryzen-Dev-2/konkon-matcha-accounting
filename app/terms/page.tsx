import Link from "next/link";
import { ArrowLeft, DatabaseZap, EyeOff, Scale, ShieldCheck } from "lucide-react";
import { PLATFORM_DISCLOSURE_VERSION, PLATFORM_TERMS_VERSION } from "@/lib/platform-trust";
import styles from "./terms.module.css";

export const metadata = { title: "Platform terms & privacy" };

export default function TermsPage() {
  return <main className={styles.page}>
    <nav><Link href="/"><ArrowLeft size={16} />Back</Link><span>KŌN-KŌN PLATFORM / POLICY</span></nav>
    <header>
      <span>VERSION {PLATFORM_TERMS_VERSION}</span>
      <h1>Managed trust,<br />without data surveillance.</h1>
      <p>These product terms explain first-use responsibilities and the optional managed-instance programme. They are a product policy summary, not jurisdiction-specific legal advice.</p>
    </header>
    <section className={styles.grid}>
      <article><ShieldCheck /><b>Workspace responsibility</b><p>The deploying Owner is responsible for lawful use, truthful storefront conduct, staff access, accounting records and local compliance.</p></article>
      <article><DatabaseZap /><b>Optional supervision</b><p>Joining central supervision requires a separate Owner application. A managed instance can be approved, suspended after human review, appealed and reopened.</p></article>
      <article><EyeOff /><b>Data boundary</b><p>The platform authority never receives customer, member, order, receipt, invoice, payroll, inventory or staff-login data through this programme.</p></article>
      <article><Scale /><b>Fair review</b><p>Automated signals only prioritise review. They do not prove wrongdoing or trigger a suspension without a recorded human decision.</p></article>
    </section>
    <section className={styles.disclosure}>
      <div><span>MANAGED-INSTANCE DISCLOSURE / {PLATFORM_DISCLOSURE_VERSION}</span><h2>What an enrolled deployment sends</h2></div>
      <ul>
        <li>Deployment origin and business display name</li>
        <li>Hosting provider, app version and release identifier</li>
        <li>Observed server connection IP, which can be a shared hosting or proxy address</li>
        <li>Check-in time, review status and Owner-submitted appeal text</li>
      </ul>
      <p>A buyer report may include an optional contact email, order reference, narrative and up to three HTTPS evidence links. Connection addresses are kept only as one-way abuse-prevention fingerprints; optional contact email is encrypted at rest.</p>
    </section>
    <footer><strong>No hidden telemetry.</strong><span>Supervision begins only after the workspace Owner reviews the disclosure and applies.</span></footer>
  </main>;
}
