"use client";

import { FormEvent, useState } from "react";
import { ArrowLeft, ArrowRight, Check, FileWarning, LoaderCircle, LockKeyhole, ShieldAlert } from "lucide-react";
import { apiRequest } from "@/components/ui";
import { OFFICIAL_PLATFORM_ORIGIN, OFFICIAL_TERMS_URL } from "@/lib/platform-public";
import styles from "./platform-report-form.module.css";

const categories = [
  ["FRAUD", "Suspected fraud"], ["IMPERSONATION", "Impersonation"], ["NON_DELIVERY", "Goods not delivered"],
  ["PAYMENT_ABUSE", "Payment abuse"], ["CONTROLLED_GOODS", "Controlled goods concern"], ["OTHER", "Other serious conduct"],
] as const;

export function PlatformReportForm({ initialDomain }: { initialDomain: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ reportNo: string; message: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const result = await apiRequest<{ reportNo: string; message: string }>("/api/platform/reports", { method: "POST", body: JSON.stringify({
        domain: data.get("domain"), category: data.get("category"), summary: data.get("summary"), details: data.get("details"),
        orderReference: data.get("orderReference"), reporterEmail: data.get("reporterEmail"),
        evidenceUrls: String(data.get("evidenceUrls") || "").split(/\r?\n/).map(value => value.trim()).filter(Boolean),
        privacyAccepted: data.get("privacyAccepted") === "on",
      }) });
      setSuccess(result);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The report could not be sent."); }
    finally { setBusy(false); }
  }

  return <main className={styles.page}>
    <nav><a href={OFFICIAL_PLATFORM_ORIGIN}><ArrowLeft size={16} />Platform home</a><span>TRUST DESK / BUYER REPORT</span></nav>
    <div className={styles.layout}>
      <aside>
        <span className={styles.kicker}>INDEPENDENT REVIEW</span>
        <h1>Raise a concern.<br />Keep the facts intact.</h1>
        <p>Reports are reviewed by a person. An allegation alone never proves misconduct and never triggers an automatic shutdown.</p>
        <dl><div><dt>01</dt><dd>Describe what happened</dd></div><div><dt>02</dt><dd>Preserve receipts and messages</dd></div><div><dt>03</dt><dd>Reviewer checks the evidence</dd></div></dl>
      </aside>
      <section className={styles.formPanel}>
        {success ? <div className={styles.success}><i><Check /></i><span>REPORT RECEIVED</span><h2>{success.reportNo}</h2><p>{success.message}</p><a href={OFFICIAL_PLATFORM_ORIGIN}>Done</a></div> : <form onSubmit={submit}>
          <header><ShieldAlert /><div><span>SECURE INTAKE</span><h2>Buyer conduct report</h2></div></header>
          <label><span>Store deployment origin</span><input name="domain" defaultValue={initialDomain} placeholder="https://store.example.com" required /></label>
          <div className={styles.pair}><label><span>Concern type</span><select name="category" defaultValue="FRAUD">{categories.map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label><label><span>Order reference · optional</span><input name="orderReference" maxLength={100} /></label></div>
          <label><span>Short summary</span><input name="summary" minLength={10} maxLength={180} required placeholder="What is the central issue?" /></label>
          <label><span>Detailed account</span><textarea name="details" minLength={30} maxLength={4000} rows={7} required placeholder="Include dates, what was promised, what happened and what resolution you sought." /></label>
          <label><span>Evidence links · optional, one HTTPS URL per line</span><textarea name="evidenceUrls" rows={3} placeholder="https://…" /></label>
          <label><span>Contact email · optional</span><input name="reporterEmail" type="email" maxLength={254} /><small>Encrypted at rest and used only if a reviewer needs clarification.</small></label>
          <label className={styles.consent}><input name="privacyAccepted" type="checkbox" required /><span><LockKeyhole size={16} /><b>I confirm this report is honest and acknowledge the <a href={OFFICIAL_TERMS_URL} target="_blank" rel="noreferrer">privacy disclosure</a>.</b></span></label>
          {error ? <p className={styles.error}>{error}</p> : null}
          <button disabled={busy}>{busy ? <LoaderCircle className={styles.spin} /> : <FileWarning />}{busy ? "Securing report…" : "Submit for human review"}<ArrowRight /></button>
        </form>}
      </section>
    </div>
  </main>;
}
