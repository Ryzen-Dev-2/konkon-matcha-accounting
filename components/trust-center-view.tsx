"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, ArrowUpRight, CheckCircle2, CloudCog, Fingerprint, Gavel, LoaderCircle, RefreshCw, Scale, Server, ShieldCheck, ShieldOff } from "lucide-react";
import { apiRequest, LoadingPanel, Notice, PageHeader, StatusPill } from "@/components/ui";
import { OFFICIAL_TERMS_URL } from "@/lib/platform-public";
import styles from "./trust-center-view.module.css";

type Enrollment = { instanceId: string; domain: string; provider: string; releaseSha: string; status: string; statusReason: string; lastSyncAt?: string; latestReleaseSha?: string; updateUrl?: string };
type Instance = { _id: string; domain: string; businessLabel: string; provider: string; releaseSha: string; appVersion: string; sourceIp: string; lastSeenIp?: string; status: string; statusReason: string; version: number; createdAt: string; lastSeenAt?: string; termsVersion: string; risk: { score: number; band: string; signals: string[] }; reportCount: number; openReportCount: number };
type Report = { _id: string; reportNo: string; instanceId: string; domain: string; category: string; summary: string; details: string; orderReference?: string; evidenceUrls?: string[]; reporterEmailHint?: string; status: string; reviewNote?: string; version: number; createdAt: string };
type ClonePayload = { authority: false; enrollment: Enrollment | null; syncError: string; localRelease: { sha: string; appVersion: string; updateUrl: string }; authorityUrl: string; termsVersion: string; disclosureVersion: string; disclosure: string[]; neverCollected: string[] };
type AuthorityPayload = { authority: true; release: { sha: string; appVersion: string; updateUrl: string } };
type Overview = { instances: Instance[]; reports: Report[]; release: { sha: string; updateUrl: string } };

export function TrustCenterView() {
  const [entry, setEntry] = useState<ClonePayload | AuthorityPayload | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ message: string; tone: "success" | "error" } | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await apiRequest<ClonePayload | AuthorityPayload>("/api/platform/enrollment");
      setEntry(next);
      if (next.authority) {
        const data = await apiRequest<Overview>("/api/platform/instances");
        setOverview(data);
        setSelectedId(current => current || data.instances[0]?._id || "");
      }
    } catch (reason) { setNotice({ message: reason instanceof Error ? reason.message : "Could not load the trust centre.", tone: "error" }); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const selected = overview?.instances.find(item => item._id === selectedId) || null;
  const reports = useMemo(() => overview?.reports.filter(report => report.instanceId === selectedId) || [], [overview, selectedId]);

  async function enroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("enroll"); setNotice(null);
    const form = new FormData(event.currentTarget);
    try {
      const result = await apiRequest<{ message: string }>("/api/platform/enrollment", { method: "POST", body: JSON.stringify({ action: "ENROLL", termsAccepted: form.get("terms") === "on", privacyAccepted: form.get("privacy") === "on" }) });
      setNotice({ message: result.message, tone: "success" }); await load();
    } catch (reason) { setNotice({ message: reason instanceof Error ? reason.message : "Enrollment failed.", tone: "error" }); }
    finally { setBusy(""); }
  }

  async function cloneAction(action: "SYNC" | "APPEAL", message = "") {
    setBusy(action); setNotice(null);
    try {
      const result = await apiRequest<{ message?: string; status?: string }>("/api/platform/enrollment", { method: "POST", body: JSON.stringify({ action, ...(message ? { message } : {}) }) });
      setNotice({ message: result.message || `Status refreshed: ${result.status}.`, tone: "success" }); await load();
    } catch (reason) { setNotice({ message: reason instanceof Error ? reason.message : "The action failed.", tone: "error" }); }
    finally { setBusy(""); }
  }

  async function decideInstance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return;
    const form = new FormData(event.currentTarget); const action = String(form.get("action")); setBusy(`instance-${selected._id}`); setNotice(null);
    try {
      await apiRequest("/api/platform/instances", { method: "PATCH", body: JSON.stringify({ instanceId: selected._id, action, reason: form.get("reason"), version: selected.version }) });
      setNotice({ message: `Instance action recorded: ${action}.`, tone: "success" }); await load();
    } catch (reason) { setNotice({ message: reason instanceof Error ? reason.message : "The review action failed.", tone: "error" }); }
    finally { setBusy(""); }
  }

  async function decideReport(event: FormEvent<HTMLFormElement>, report: Report) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(`report-${report._id}`); setNotice(null);
    try {
      await apiRequest("/api/platform/reports", { method: "PATCH", body: JSON.stringify({ reportId: report._id, status: form.get("status"), note: form.get("note"), version: report.version }) });
      setNotice({ message: `${report.reportNo} review saved.`, tone: "success" }); await load();
    } catch (reason) { setNotice({ message: reason instanceof Error ? reason.message : "The report decision failed.", tone: "error" }); }
    finally { setBusy(""); }
  }

  if (!entry) return <LoadingPanel label="Verifying the trust chain…" />;
  if (!entry.authority) {
    const updateAvailable = entry.enrollment?.latestReleaseSha && entry.enrollment.latestReleaseSha !== "unknown" && entry.enrollment.latestReleaseSha !== entry.localRelease.sha;
    return <div className={styles.page}>
      <PageHeader eyebrow="MANAGED INSTANCE" title="Trust & safety" description="Opt-in supervision with signed status checks, human review and a documented appeal path." />
      {notice ? <Notice {...notice} /> : null}
      {entry.syncError ? <Notice message={`Last policy refresh failed: ${entry.syncError}`} tone="error" /> : null}
      {!entry.enrollment ? <div className={styles.cloneGrid}>
        <section className={styles.enrollLead}><span>OPTIONAL / OWNER CONTROLLED</span><h2>Apply for managed supervision.</h2><p>Your operating data stays inside this workspace. The authority receives only the deployment metadata listed beside this form.</p><div><ShieldCheck /><span><b>Human decisions only</b><small>Risk signals prioritise attention. They cannot issue a suspension.</small></span></div><div><Fingerprint /><span><b>Signed control policy</b><small>Status changes are verified with a per-instance secret encrypted at both ends.</small></span></div></section>
        <form className={styles.enrollForm} onSubmit={enroll}><header><Server /><div><span>DISCLOSURE {entry.disclosureVersion}</span><h3>Metadata sent on enrollment</h3></div></header><ul>{entry.disclosure.map(item => <li key={item}>{item}</li>)}</ul><h4>Never collected by this programme</h4><ul className={styles.never}>{entry.neverCollected.map(item => <li key={item}>{item}</li>)}</ul><label><input name="terms" type="checkbox" required /><span>I accept the <a href={OFFICIAL_TERMS_URL} target="_blank" rel="noreferrer">platform terms {entry.termsVersion}</a>.</span></label><label><input name="privacy" type="checkbox" required /><span>I authorise this limited metadata disclosure and managed status checks.</span></label><button className="button button-primary" disabled={busy === "enroll"}>{busy === "enroll" ? <LoaderCircle className="spin" /> : <ShieldCheck />}Apply for review</button></form>
      </div> : <div className={styles.managedGrid}>
        <section className={styles.statusPanel}><header><span>MANAGED INSTANCE</span><StatusPill value={entry.enrollment.status} /></header><h2>{entry.enrollment.domain}</h2><p>{entry.enrollment.statusReason}</p><dl><div><dt>Instance ID</dt><dd>{entry.enrollment.instanceId}</dd></div><div><dt>Provider</dt><dd>{entry.enrollment.provider}</dd></div><div><dt>Local release</dt><dd>{entry.localRelease.sha.slice(0, 12)}</dd></div><div><dt>Last policy check</dt><dd>{entry.enrollment.lastSyncAt ? new Date(entry.enrollment.lastSyncAt).toLocaleString() : "Pending"}</dd></div></dl><button className="button button-secondary" onClick={() => void cloneAction("SYNC")} disabled={busy === "SYNC"}><RefreshCw className={busy === "SYNC" ? "spin" : ""} />Refresh signed status</button></section>
        <section className={styles.controlPanel}>{updateAvailable ? <div className={styles.update}><CloudCog /><div><span>UPDATE AVAILABLE</span><h3>A newer signed release is available.</h3><p>Review upstream changes before merging. Automatic source mutation is disabled until a GitHub App is explicitly authorised.</p><a className="button button-primary" href={entry.enrollment.updateUrl || entry.localRelease.updateUrl} target="_blank" rel="noreferrer">Review update <ArrowUpRight /></a></div></div> : <div className={styles.current}><CheckCircle2 /><div><span>RELEASE STATUS</span><h3>{entry.localRelease.sha === "unknown" ? "Build identifier unavailable" : "Current authority release detected"}</h3></div></div>}{["SUSPENDED", "APPEAL"].includes(entry.enrollment.status) ? <form onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); void cloneAction("APPEAL", String(data.get("message"))); }}><h3>Submit an appeal</h3><p>Explain the facts, remediation and why access should be restored. Restrictions remain until human review is complete.</p><textarea name="message" minLength={30} maxLength={2000} rows={6} required /><button className="button button-primary" disabled={busy === "APPEAL"}><Scale />Send appeal</button></form> : null}</section>
      </div>}
    </div>;
  }

  if (!overview) return <LoadingPanel label="Loading the authority control room…" />;
  const active = overview.instances.filter(item => item.status === "ACTIVE").length;
  const pending = overview.instances.filter(item => item.status === "PENDING").length;
  const suspended = overview.instances.filter(item => ["SUSPENDED", "APPEAL"].includes(item.status)).length;
  return <div className={styles.page}>
    <PageHeader eyebrow="PLATFORM AUTHORITY" title="Trust control room" description="Review managed deployments, investigate buyer reports and record proportionate actions with an appeal trail." />
    {notice ? <Notice {...notice} /> : null}
    <section className={styles.metrics}><article><Activity /><span>ACTIVE</span><b>{active}</b></article><article><Server /><span>PENDING REVIEW</span><b>{pending}</b></article><article><ShieldOff /><span>RESTRICTED / APPEAL</span><b>{suspended}</b></article><article><AlertTriangle /><span>OPEN REPORTS</span><b>{overview.reports.filter(item => ["OPEN", "IN_REVIEW"].includes(item.status)).length}</b></article></section>
    <div className={styles.authorityGrid}>
      <section className={styles.instanceList}><header><span>INSTANCE REGISTRY</span><b>{overview.instances.length}</b></header>{overview.instances.length ? overview.instances.map(instance => <button className={selectedId === instance._id ? styles.selected : ""} key={instance._id} onClick={() => setSelectedId(instance._id)}><i className={styles[`risk${instance.risk.band}`]}>{instance.risk.score}</i><span><strong>{instance.businessLabel}</strong><small>{instance.domain}</small></span><em>{instance.status}</em></button>) : <p>No managed-instance applications yet.</p>}</section>
      <section className={styles.casePanel}>{selected ? <><header><div><span>CASE FILE / {selected._id.slice(0, 8).toUpperCase()}</span><h2>{selected.businessLabel}</h2><a href={selected.domain} target="_blank" rel="noreferrer">{selected.domain}<ArrowUpRight /></a></div><StatusPill value={selected.status} /></header><div className={styles.facts}><div><span>Observed enrollment IP</span><b>{selected.sourceIp || "Unavailable"}</b><small>May be a shared proxy or hosting egress address.</small></div><div><span>Latest observed IP</span><b>{selected.lastSeenIp || "Unavailable"}</b><small>{selected.lastSeenAt ? new Date(selected.lastSeenAt).toLocaleString() : "No signed check-in"}</small></div><div><span>Build</span><b>{selected.releaseSha.slice(0, 16)}</b><small>{selected.provider} · app {selected.appVersion}</small></div><div><span>Terms</span><b>{selected.termsVersion}</b><small>{new Date(selected.createdAt).toLocaleString()}</small></div></div><section className={styles.riskBox}><div><span>AUTOMATED TRIAGE / NOT A VERDICT</span><h3>{selected.risk.band} · {selected.risk.score}/100</h3></div><ul>{selected.risk.signals.length ? selected.risk.signals.map(signal => <li key={signal}>{signal}</li>) : <li>No current heuristic signals.</li>}</ul></section><form className={styles.decision} onSubmit={decideInstance}><select name="action" defaultValue={selected.status === "PENDING" ? "APPROVE" : ["SUSPENDED", "APPEAL"].includes(selected.status) ? "REOPEN" : "SUSPEND"}><option value="APPROVE">Approve enrollment</option><option value="SUSPEND">Ban & lock entire instance</option><option value="REOPEN">Lift restriction</option><option value="REJECT">Reject enrollment</option></select><input name="reason" maxLength={500} placeholder="Ban reason shown on the locked site (required for ban/reject)" /><button className="button button-primary" disabled={busy === `instance-${selected._id}`}><Gavel />Record human decision</button></form><section className={styles.reportStack}><header><h3>Buyer reports</h3><span>{reports.length}</span></header>{reports.length ? reports.map(report => <article key={report._id}><header><div><b>{report.reportNo}</b><span>{report.category.replaceAll("_", " ")} · {new Date(report.createdAt).toLocaleString()}</span></div><StatusPill value={report.status} /></header><h4>{report.summary}</h4><p>{report.details}</p>{report.orderReference ? <small>Order reference: {report.orderReference}</small> : null}{report.reporterEmailHint ? <small>Contact: {report.reporterEmailHint}</small> : null}{report.evidenceUrls?.length ? <div className={styles.evidence}>{report.evidenceUrls.map((url, index) => <a href={url} target="_blank" rel="noreferrer" key={url}>Evidence {index + 1}<ArrowUpRight /></a>)}</div> : null}<form onSubmit={event => void decideReport(event, report)}><select name="status" defaultValue={report.status === "OPEN" ? "IN_REVIEW" : report.status}><option value="IN_REVIEW">In review</option><option value="SUBSTANTIATED">Substantiated</option><option value="DISMISSED">Dismissed</option></select><input name="note" defaultValue={report.reviewNote} minLength={10} maxLength={1000} required placeholder="Evidence-based review note" /><button disabled={busy === `report-${report._id}`}>Save</button></form></article>) : <p>No buyer reports are linked to this instance.</p>}</section></> : <div className={styles.empty}><Server /><h2>Select an instance</h2><p>Its deployment evidence and review history will appear here.</p></div>}</section>
    </div>
  </div>;
}
