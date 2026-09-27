"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertOctagon, ArrowUpRight, CloudCog } from "lucide-react";
import type { UserRole } from "@/lib/types";
import styles from "./platform-status-monitor.module.css";

type Status = { status: string; reason: string; managed: boolean; updateAvailable: boolean; updateUrl: string };

export function PlatformStatusMonitor({ role }: { role: UserRole }) {
  const [state, setState] = useState<Status | null>(null);
  useEffect(() => {
    let active = true;
    const check = () => fetch("/api/platform/status", { cache: "no-store", credentials: "same-origin" })
      .then(response => response.ok ? response.json() : null)
      .then(body => { if (active && body?.ok) setState(body.data); })
      .catch(() => undefined);
    void check();
    const timer = window.setInterval(check, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  if (!state?.managed) return null;
  const restricted = ["SUSPENDED", "APPEAL"].includes(state.status);
  return <>
    {state.updateAvailable && !restricted ? <aside className={styles.update}><CloudCog /><span><b>Managed update available.</b> Review upstream changes before merging.</span><a href={state.updateUrl} target="_blank" rel="noreferrer">Review <ArrowUpRight /></a></aside> : null}
    {restricted ? <div className={styles.blocker} role="alert"><section><i><AlertOctagon /></i><span>MANAGED INSTANCE / {state.status}</span><h1>Workspace access is restricted.</h1><p>{state.reason || "A platform review is in progress."}</p>{role === "OWNER" ? <Link href="/trust-center">Open appeal & review centre</Link> : <small>Ask the workspace Owner to open the Trust & safety centre.</small>}</section></div> : null}
  </>;
}
