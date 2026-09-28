"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  FileText,
  ImagePlus,
  LoaderCircle,
  LockKeyhole,
  PackageCheck,
  ReceiptText,
  Send,
  ShieldCheck,
  Truck,
} from "lucide-react";
import styles from "./storefront.module.css";
import type { PublicBranding } from "@/lib/business-settings";
import { OFFICIAL_REPORT_URL } from "@/lib/platform-public";

type Message = {
  _id: string;
  sender: "CUSTOMER" | "STAFF" | "SYSTEM";
  text: string;
  type: string;
  staffName?: string;
  attachment?: { id: string; name: string; mimeType: string; size: number } | null;
  createdAt: string;
};

type Order = {
  _id: string;
  orderNo: string;
  status: string;
  customer: { name: string; email: string; phone: string; address: string };
  items: Array<{
    productId: string;
    sku: string;
    name: string;
    unit: string;
    quantity: number;
    listPrice: number;
    total?: number;
    lineTotal?: number;
    discountPercent?: number;
  }>;
  currency: string;
  subtotal: number;
  discount: number;
  total: number;
  paymentRequest?: {
    methodName: string;
    instructions: string;
    paymentUrl?: string;
    amount: number;
    currency: string;
    status: string;
  } | null;
  linkedInvoice?: {
    invoiceNo: string;
    status: string;
    total: number;
    paidAmount: number;
    dueDate: string;
  } | null;
  linkedReceipt?: {
    receiptNo: string;
    total: number;
    publicUrl: string;
  } | null;
  shipping?: {
    carrier: string;
    trackingReference: string;
    status: string;
    note?: string;
    trackingUrl?: string;
  } | null;
  steps: Array<{ _id: string; label: string; status: string }>;
  messages: Message[];
  updatedAt: string;
};

async function api<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = (await response.json()) as { ok: boolean; data?: T; error?: string };
  if (!response.ok || !body.ok) throw new Error(body.error || "Request failed.");
  return body.data as T;
}

const stages = [
  "ACCEPTED",
  "QUOTED",
  "AWAITING_PAYMENT",
  "PAID",
  "FULFILLING",
  "SHIPPED",
  "COMPLETED",
];

function BrandBadge({ branding }: { branding: PublicBranding }) {
  return branding.workspaceLogoDataUrl
    ? <img src={branding.workspaceLogoDataUrl} alt={`${branding.businessName} logo`} />
    : <b>{branding.businessName.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase()}</b>;
}

export function PublicOrderView({ token, branding }: { token: string; branding: PublicBranding }) {
  const endpoint = `/api/storefront/${encodeURIComponent(token)}`;
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reportHref, setReportHref] = useState(OFFICIAL_REPORT_URL);
  const fileRef = useRef<HTMLInputElement>(null);
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setReportHref(`${OFFICIAL_REPORT_URL}?instance=${encodeURIComponent(window.location.origin)}`);
  }, []);

  const load = useCallback(async () => {
    try {
      setOrder(await api<Order>(endpoint));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Order unavailable.");
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 3_000);
    const visible = () => { if (!document.hidden) void load(); };
    document.addEventListener("visibilitychange", visible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [load]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [order?.messages.length]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    setBusy(true);
    try {
      setOrder(
        await api<Order>(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "MESSAGE", text: form.get("text") }),
        }),
      );
      target.reset();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send the message.");
    } finally {
      setBusy(false);
    }
  }

  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    form.set("file", file);
    try {
      await api(`${endpoint}/attachments`, { method: "POST", body: form });
      await load();
      if (fileRef.current) fileRef.current.value = "";
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not upload the file.");
    } finally {
      setBusy(false);
    }
  }

  if (!order)
    return (
      <main className={styles.portalPage}>
        <section className={styles.portalLoading}>
          <div className={styles.portalLoadingBrand}><i><BrandBadge branding={branding} /></i><strong>{branding.businessName}</strong></div>
          {error ? <><LockKeyhole /><h1>Private order unavailable</h1><p>{error}</p><Link href="/shop">Return to catalogue</Link></> : <><LoaderCircle className={styles.spin} /><p>Opening your private order workspace…</p></>}
        </section>
      </main>
    );

  const money = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: order.currency,
  });
  const currentStage = Math.max(0, stages.indexOf(order.status));
  const closed = ["REJECTED", "CANCELLED"].includes(order.status);

  return (
    <main className={styles.portalPage}>
      <header className={styles.portalHeader}>
        <div className={styles.portalBrand}><i><BrandBadge branding={branding} /></i><span><strong>{branding.businessName}</strong><small>PRIVATE ORDER WORKSPACE</small></span></div>
        <strong>{order.orderNo}</strong>
        <span className={styles.portalStatus}>{order.status.replaceAll("_", " ")}</span>
      </header>

      <section className={styles.progressRail} aria-label="Order progress">
        {stages.map((stage, index) => (
          <div className={index <= currentStage ? styles.stageDone : ""} key={stage}>
            <i>{index < currentStage ? <Check size={13} /> : index + 1}</i>
            <span>{stage.replaceAll("_", " ")}</span>
          </div>
        ))}
      </section>

      <div className={styles.portalGrid}>
        <aside className={styles.orderSummary}>
          <section>
            <span className={styles.signal}>ORDER SUMMARY</span>
            <h1>{order.customer.name}</h1>
            <p>{order.customer.address}</p>
          </section>
          <div className={styles.portalItems}>
            {order.items.map((item) => (
              <article key={String(item.productId)}>
                <div><strong>{item.name}</strong><small>{item.sku} · {item.quantity} {item.unit}</small></div>
                <b>{money.format(Number(item.total ?? item.lineTotal ?? item.listPrice * item.quantity))}</b>
              </article>
            ))}
          </div>
          <dl className={styles.portalTotals}>
            <div><dt>Subtotal</dt><dd>{money.format(order.subtotal)}</dd></div>
            <div><dt>Discount</dt><dd>− {money.format(order.discount)}</dd></div>
            <div><dt>Total</dt><dd>{money.format(order.total)}</dd></div>
          </dl>

          {order.steps.length ? (
            <section className={styles.orderSteps}>
              <h2><ShieldCheck size={17} />Order requirements</h2>
              {order.steps.map((step) => <div key={step._id}><i className={step.status === "COMPLETED" ? styles.stepComplete : ""}>{step.status === "COMPLETED" ? <Check size={12} /> : null}</i><span>{step.label}</span><small>{step.status}</small></div>)}
            </section>
          ) : null}

          {order.paymentRequest ? (
            <section className={styles.paymentCard}>
              <span className={styles.signal}>PAYMENT REQUEST</span>
              <h2>{money.format(order.paymentRequest.amount)}</h2>
              <strong>{order.paymentRequest.methodName}</strong>
              <p>{order.paymentRequest.instructions}</p>
              {order.paymentRequest.paymentUrl ? <a href={order.paymentRequest.paymentUrl} target="_blank" rel="noreferrer">Open secure payment page <ArrowUpRight size={15} /></a> : null}
              <small>Payment is confirmed only when a paid invoice or official receipt appears here.</small>
            </section>
          ) : null}

          {order.linkedInvoice ? (
            <section className={styles.documentCard}>
              <FileText /><div><span>INVOICE</span><strong>{order.linkedInvoice.invoiceNo}</strong><small>{order.linkedInvoice.status} · {money.format(order.linkedInvoice.total)}</small></div>
            </section>
          ) : null}
          {order.linkedReceipt ? (
            <a className={styles.documentCard} href={order.linkedReceipt.publicUrl} target="_blank" rel="noreferrer">
              <ReceiptText /><div><span>RECEIPT</span><strong>{order.linkedReceipt.receiptNo}</strong><small>{money.format(order.linkedReceipt.total)} · Open receipt</small></div><ArrowUpRight />
            </a>
          ) : null}
          {order.shipping ? (
            <section className={styles.shippingCard}>
              <Truck /><div><span>{order.shipping.carrier}</span><strong>{order.shipping.status.replaceAll("_", " ")}</strong><small>{order.shipping.trackingReference || "Tracking reference pending"}</small>{order.shipping.note ? <p>{order.shipping.note}</p> : null}</div>
              {order.shipping.trackingUrl && order.shipping.trackingReference ? <a href={order.shipping.trackingUrl} target="_blank" rel="noreferrer">Track <ArrowUpRight size={14} /></a> : null}
            </section>
          ) : null}
        </aside>

        <section className={styles.chatPanel}>
          <header><div className={styles.chatIdentity}><i><BrandBadge branding={branding} /></i><span><strong>{branding.businessName} order care</strong><small><b />Live · updates automatically</small></span></div><div className={styles.chatSecurity}><LockKeyhole size={14} />Private</div></header>
          <div className={styles.messages} aria-live="polite">
            {order.messages.map((message) => (
              <article className={`${styles.message} ${styles[`message${message.sender}`]} ${styles[`messageType${message.type}`] || ""}`} key={message._id}>
                <header><strong>{message.sender === "CUSTOMER" ? "You" : message.sender === "STAFF" ? message.staffName || "Order team" : "Order update"}</strong><time>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(message.createdAt))}</time></header>
                <p>{message.text}</p>
                {message.attachment ? <a className={styles.attachmentLink} href={`${endpoint}/attachments/${message.attachment.id}`} target="_blank" rel="noreferrer"><PackageCheck size={16} /><span>{message.attachment.name}<small>{Math.ceil(message.attachment.size / 1024)} KB</small></span><ArrowUpRight size={14} /></a> : null}
              </article>
            ))}
            <div ref={chatEnd} />
          </div>
          {error ? <p className={styles.chatError}>{error}</p> : null}
          {!closed ? (
            <form className={styles.chatComposer} onSubmit={send}>
              <input ref={fileRef} type="file" hidden accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,application/pdf" onChange={(event) => void upload(event.target.files?.[0])} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} aria-label="Share image or PDF"><ImagePlus /></button>
              <textarea name="text" required maxLength={2000} rows={2} placeholder={`Message ${branding.businessName} order care`} />
              <button disabled={busy} aria-label="Send message">{busy ? <LoaderCircle className={styles.spin} /> : <Send />}</button>
            </form>
          ) : <p className={styles.closedChat}>This conversation is closed.</p>}
        </section>
      </div>
      <a className={styles.trustReportLink} href={reportHref}>Report a managed-store concern</a>
    </main>
  );
}
