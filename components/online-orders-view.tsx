"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Boxes,
  Check,
  FileText,
  ImagePlus,
  Mail,
  MessageCircle,
  PackageSearch,
  RefreshCw,
  Save,
  Send,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Truck,
} from "lucide-react";
import {
  apiRequest,
  EmptyState,
  LoadingPanel,
  Notice,
  PageHeader,
  StatusPill,
  useNotice,
} from "@/components/ui";
import { currencyFractionDigits } from "@/lib/international";

type OrderItem = {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  listPrice: number;
  total?: number;
  discountPercent?: number;
};
type Order = {
  _id: string;
  orderNo: string;
  status: string;
  version: number;
  customer: { name: string; email: string; phone: string; address: string };
  items: OrderItem[];
  offer?: { items: OrderItem[]; subtotal: number; discount: number; total: number };
  currency: string;
  subtotal: number;
  discount: number;
  total: number;
  sensitive?: boolean;
  sensitiveAnswers?: Array<{ key: string; value: string }>;
  steps?: Array<{ _id: string; label: string; status: string }>;
  messages?: Array<{
    _id: string;
    sender: string;
    text: string;
    staffName?: string;
    attachment?: { id: string; name: string; mimeType: string; size: number };
    createdAt: string;
  }>;
  linkedInvoice?: { invoiceNo: string; status: string };
  linkedReceipt?: { receiptNo: string; publicUrl: string };
  paymentRequest?: { methodName: string; status: string };
  shipping?: { carrier: string; trackingReference: string; status: string };
  lastEmailError?: string;
  updatedAt: string;
};
type Product = {
  _id: string;
  sku: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  onlineEnabled?: boolean;
  onlineDescription?: string;
  onlineImage?: string;
  sensitiveGood?: boolean;
};
type StoreSettings = {
  enabled: boolean;
  storeTitle: string;
  storeSubtitle: string;
  termsNotice: string;
  publicSiteUrl: string;
  sensitiveFields: Array<{ key: string; label: string; required: boolean }>;
  abandonedRetentionDays: number;
  completedRetentionEnabled: boolean;
  completedRetentionDays: number;
  retentionReminderDays: number;
};
type CommerceData = {
  orders: Order[];
  products: Product[];
  documents: {
    invoices: Array<{
      _id: string;
      invoiceNo: string;
      customerName: string;
      customerEmail: string;
      total: number;
      status: string;
    }>;
    receipts: Array<{
      _id: string;
      receiptNo: string;
      memberName?: string;
      total: number;
      status: string;
    }>;
  };
  store: StoreSettings;
  smtp: { configured: boolean; email?: string; senderName?: string; passwordLast4?: string };
  storageConfigured: boolean;
  currency: string;
  locale: string;
  permissions: { manage: boolean; owner: boolean };
};

export function OnlineOrdersView() {
  const [data, setData] = useState<CommerceData | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [tab, setTab] = useState<"ORDERS" | "CATALOGUE" | "SETTINGS">("ORDERS");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { notice, show } = useNotice();

  const load = useCallback(async () => {
    try {
      const next = await apiRequest<CommerceData>("/api/online-orders");
      setData(next);
      setSelectedId((current) => current || next.orders[0]?._id || "");
    } catch (reason) {
      show(reason instanceof Error ? reason.message : "Could not load online orders.", "error");
    }
  }, [show]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 10_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!selectedId || tab !== "ORDERS") return;
    let stopped = false;
    const refresh = async () => {
      if (document.hidden || stopped) return;
      try {
        const live = await apiRequest<{ order: Order }>(`/api/online-orders?id=${encodeURIComponent(selectedId)}`);
        if (!stopped) setData(current => current ? { ...current, orders: current.orders.map(item => item._id === live.order._id ? live.order : item) } : current);
      } catch { /* The full refresh keeps the existing visible error path. */ }
    };
    const timer = window.setInterval(() => void refresh(), 2_500);
    const visible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", visible);
    void refresh();
    return () => { stopped = true; window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [selectedId, tab]);

  const order = data?.orders.find((item) => item._id === selectedId) || null;
  const money = useMemo(
    () => new Intl.NumberFormat(data?.locale || "en", { style: "currency", currency: data?.currency || "USD" }),
    [data?.currency, data?.locale],
  );

  async function action(payload: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      await apiRequest("/api/online-orders", { method: "PATCH", body: JSON.stringify(payload) });
      show(success);
      await load();
      return true;
    } catch (reason) {
      show(reason instanceof Error ? reason.message : "Could not update the order.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitAction(event: FormEvent<HTMLFormElement>, build: (form: FormData) => Record<string, unknown>, success: string) {
    event.preventDefault();
    const form = event.currentTarget;
    if (await action(build(new FormData(form)), success)) form.reset();
  }

  async function upload(file?: File) {
    if (!file || !order) return;
    setBusy(true);
    const form = new FormData();
    form.set("orderId", order._id);
    form.set("file", file);
    try {
      await apiRequest("/api/online-orders/attachments", { method: "POST", body: form });
      show("Protected file added to the order chat.");
      await load();
      if (fileRef.current) fileRef.current.value = "";
    } catch (reason) {
      show(reason instanceof Error ? reason.message : "Could not upload the file.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function compressedStoreImage(file: File) {
    if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type) || file.size > 8_000_000)
      throw new Error("Choose a JPEG, PNG or WebP image below 8 MB.");
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
      for (const [edge, quality] of [[1400, .82], [1100, .7], [850, .58]] as const) {
        const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("This browser cannot prepare the product image.");
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", quality));
        if (blob && blob.size <= 240_000) return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("The product image could not be read."));
          reader.readAsDataURL(blob);
        });
      }
    } finally { bitmap.close(); }
    throw new Error("This image is too detailed to fit the protected storefront limit. Use an HTTPS image link instead.");
  }

  async function saveCatalogue(event: FormEvent<HTMLFormElement>, product: Product) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    let onlineImage = product.onlineImage || "";
    try {
      const file = form.get("onlineImageFile");
      const link = String(form.get("onlineImageUrl") || "").trim();
      if (form.get("removeOnlineImage") === "on") onlineImage = "";
      else if (file instanceof File && file.size) onlineImage = await compressedStoreImage(file);
      else if (link) onlineImage = link;
      await action({
        action: "UPDATE_CATALOGUE",
        id: product._id,
        onlineEnabled: form.get("onlineEnabled") === "on",
        sensitiveGood: form.get("sensitiveGood") === "on",
        onlineDescription: form.get("onlineDescription"),
        onlineImage,
      }, `${product.name} online settings saved.`);
    } catch (reason) {
      show(reason instanceof Error ? reason.message : "Could not prepare the product image.", "error");
    }
  }

  if (!data) return <div className="page"><LoadingPanel /></div>;
  const offeredItems = order?.offer?.items || order?.items || [];

  return (
    <div className="page page-enter commerce-page">
      <PageHeader eyebrow="CONNECTED COMMERCE" title="Online orders" description="One controlled route from product request and private chat to accounting documents and shipment tracking." action={<div className="page-actions"><Link className="button button-secondary" href="/shop" target="_blank"><ArrowUpRight size={16} />Open storefront</Link><button className="button button-secondary" onClick={() => void load()}><RefreshCw size={15} />Refresh</button></div>} />
      {notice ? <Notice {...notice} /> : null}
      <div className="commerce-tabs">
        <button className={tab === "ORDERS" ? "active" : ""} onClick={() => setTab("ORDERS")}><ShoppingBag />Orders <b>{data.orders.length}</b></button>
        <button className={tab === "CATALOGUE" ? "active" : ""} onClick={() => setTab("CATALOGUE")}><Boxes />Online catalogue</button>
        {data.permissions.owner ? <button className={tab === "SETTINGS" ? "active" : ""} onClick={() => setTab("SETTINGS")}><Settings2 />Store & email</button> : null}
      </div>

      {tab === "ORDERS" ? (
        <div className="commerce-layout">
          <section className="panel commerce-order-list">
            <header><div><span className="eyebrow">REQUEST INBOX</span><h2>Customer orders</h2></div><small>{data.orders.filter((item) => item.status === "REQUESTED").length} waiting</small></header>
            {data.orders.length ? data.orders.map((item) => <button key={item._id} className={selectedId === item._id ? "active" : ""} onClick={() => setSelectedId(item._id)}><span><strong>{item.orderNo}</strong><small>{item.customer.name} · {item.customer.email}</small></span><span><b>{money.format(item.total)}</b><StatusPill value={item.status} /></span></button>) : <EmptyState title="No online requests" detail="New storefront requests will arrive here." />}
          </section>

          {order ? (
            <section className="commerce-order-detail">
              <header className="panel commerce-order-hero">
                <div><span className="eyebrow">{order.orderNo}</span><h2>{order.customer.name}</h2><p>{order.customer.email} · {order.customer.phone}<br />{order.customer.address}</p></div>
                <div><StatusPill value={order.status} /><strong>{money.format(order.total)}</strong><small>v{order.version}</small></div>
              </header>
              {order.lastEmailError ? <div className="commerce-email-warning"><Mail /><span><strong>Email needs attention</strong><small>{order.lastEmailError}</small></span><button disabled={busy} onClick={() => void action({ action: "RESEND_EMAIL", id: order._id }, "Order email sent.")}>Retry</button></div> : null}

              <div className="commerce-detail-grid">
                <div className="commerce-workflow">
                  {order.status === "REQUESTED" && data.permissions.manage ? <section className="panel commerce-decision"><h3>Review request</h3><p>Accept to create the secure chat link and send it by email. No stock or payment is posted yet.</p><div><button className="button button-primary" disabled={busy} onClick={() => void action({ action: "ACCEPT", id: order._id, expectedVersion: order.version }, "Request accepted and email attempted.")}><Check size={15} />Accept & invite</button><form onSubmit={(event) => void submitAction(event, (form) => ({ action: "REJECT", id: order._id, expectedVersion: order.version, reason: form.get("reason") }), "Request rejected.")}><input name="reason" required minLength={3} placeholder="Reason for declining" /><button disabled={busy}>Reject</button></form></div></section> : null}

                  <section className="panel commerce-lines">
                    <header><div><span className="eyebrow">PRODUCTS</span><h3>Requested goods</h3></div><strong>{money.format(order.total)}</strong></header>
                    {offeredItems.map((item) => <article key={String(item.productId)}><div><strong>{item.name}</strong><small>{item.sku} · {item.quantity} {item.unit}</small></div><span>{item.discountPercent ? `${item.discountPercent}% off` : "List price"}</span><b>{money.format(Number(item.total ?? item.listPrice * item.quantity))}</b></article>)}
                  </section>

                  {data.permissions.manage && !["REQUESTED", "REJECTED", "CANCELLED", "COMPLETED"].includes(order.status) ? <>
                    <form className="panel commerce-action-form" onSubmit={(event) => void submitAction(event, (form) => ({ action: "SEND_OFFER", id: order._id, expectedVersion: order.version, lines: order.items.map((item) => ({ productId: String(item.productId), quantity: form.get(`quantity-${item.productId}`), discountPercent: form.get(`discount-${item.productId}`) })), note: form.get("note") }), "Offer sent to the customer chat.")}>
                      <header><PackageSearch /><div><h3>Prepare offer</h3><p>Adjust quantity and discount like a counter sale. Stock is rechecked on save.</p></div></header>
                      <div className="commerce-offer-lines">{order.items.map((item) => <div key={String(item.productId)}><span><strong>{item.name}</strong><small>{money.format(item.listPrice)} list</small></span><label>Qty<input name={`quantity-${item.productId}`} type="number" min="1" step="1" defaultValue={offeredItems.find((line) => String(line.productId) === String(item.productId))?.quantity || item.quantity} required /></label><label>Discount %<input name={`discount-${item.productId}`} type="number" min="0" max="100" step="0.01" defaultValue={offeredItems.find((line) => String(line.productId) === String(item.productId))?.discountPercent || 0} required /></label></div>)}</div>
                      <label className="field"><span>Offer note</span><input name="note" maxLength={500} placeholder="Availability, lead time or bundle terms" /></label>
                      <button className="button button-primary" disabled={busy}>Send reviewed offer</button>
                    </form>

                    <form className="panel commerce-action-form" onSubmit={(event) => void submitAction(event, (form) => ({ action: "REQUEST_PAYMENT", id: order._id, expectedVersion: order.version, methodName: form.get("methodName"), instructions: form.get("instructions"), paymentUrl: form.get("paymentUrl") }), "Payment request sent by chat and email.")}>
                      <header><ShieldCheck /><div><h3>Request payment</h3><p>Send instructions after the final offer. A request alone never marks settlement.</p></div></header>
                      <div className="form-grid two"><label className="field"><span>Payment method</span><input name="methodName" required placeholder="Bank transfer, card link…" /></label><label className="field"><span>HTTPS payment link · optional</span><input name="paymentUrl" type="url" pattern="https://.*" placeholder="https://" /></label></div>
                      <label className="field"><span>Instructions</span><textarea name="instructions" required rows={3} maxLength={1000} /></label>
                      <button className="button button-primary" disabled={busy || !["QUOTED", "AWAITING_PAYMENT"].includes(order.status)}>Send payment request</button>
                    </form>

                    <section className="panel commerce-document-tools">
                      <header><FileText /><div><h3>Accounting documents</h3><p>Create documents in the controlled POS or invoice desk, then link them here.</p></div></header>
                      <div><Link className="button button-secondary" href="/invoices">Open invoices</Link><Link className="button button-secondary" href="/pos">Open POS</Link></div>
                      <form onSubmit={(event) => void submitAction(event, (form) => ({ action: "LINK_INVOICE", id: order._id, expectedVersion: order.version, invoiceId: form.get("invoiceId") }), "Invoice linked and email attempted.")}><label className="field"><span>Invoice for this email</span><select name="invoiceId" required defaultValue=""><option value="" disabled>Select an invoice</option>{data.documents.invoices.filter((invoice) => invoice.customerEmail.toLowerCase() === order.customer.email.toLowerCase()).map((invoice) => <option key={invoice._id} value={invoice._id}>{invoice.invoiceNo} · {invoice.status} · {money.format(invoice.total)}</option>)}</select></label><button className="button button-secondary" disabled={busy}>Link invoice</button></form>
                      <form onSubmit={(event) => void submitAction(event, (form) => ({ action: "LINK_RECEIPT", id: order._id, expectedVersion: order.version, saleId: form.get("saleId") }), "Receipt linked; payment is now confirmed.")}><label className="field"><span>Completed receipt matching this total</span><select name="saleId" required defaultValue=""><option value="" disabled>Select a receipt</option>{data.documents.receipts.filter((receipt) => Math.abs(receipt.total - order.total) < 0.000001).map((receipt) => <option key={receipt._id} value={receipt._id}>{receipt.receiptNo} · {money.format(receipt.total)}{receipt.memberName ? ` · ${receipt.memberName}` : ""}</option>)}</select></label><button className="button button-secondary" disabled={busy}>Verify & link receipt</button></form>
                      {order.linkedInvoice ? <p>Invoice: <strong>{order.linkedInvoice.invoiceNo}</strong> · {order.linkedInvoice.status}</p> : null}
                      {order.linkedReceipt ? <p>Receipt: <a href={order.linkedReceipt.publicUrl} target="_blank" rel="noreferrer">{order.linkedReceipt.receiptNo} <ArrowUpRight size={12} /></a></p> : null}
                    </section>

                    <form className="panel commerce-action-form" onSubmit={(event) => void submitAction(event, (form) => ({ action: "UPDATE_SHIPPING", id: order._id, expectedVersion: order.version, carrierCode: form.get("carrierCode"), carrier: form.get("carrier"), trackingReference: form.get("trackingReference"), status: form.get("status"), note: form.get("note") }), "Shipment update sent by chat and email.")}>
                      <header><Truck /><div><h3>Shipment tracking</h3><p>Update manually or use a reference returned by a connected carrier API.</p></div></header>
                      <div className="form-grid two"><label className="field"><span>Carrier</span><select name="carrierCode" defaultValue="OTHER"><option value="NINJA_VAN">Ninja Van</option><option value="GDEX">GDEX</option><option value="ABX">ABX Express</option><option value="OTHER">Manual / other</option></select></label><label className="field"><span>Manual carrier name</span><input name="carrier" placeholder="Required for other carrier" /></label></div>
                      <div className="form-grid two"><label className="field"><span>Tracking reference</span><input name="trackingReference" pattern="[A-Za-z0-9][A-Za-z0-9._-]*" /></label><label className="field"><span>Status</span><select name="status"><option value="PREPARING">Preparing</option><option value="DISPATCHED">Dispatched</option><option value="IN_TRANSIT">In transit</option><option value="DELIVERED">Delivered</option></select></label></div>
                      <label className="field"><span>Shipment note</span><input name="note" maxLength={500} /></label><button className="button button-primary" disabled={busy}>Publish shipment update</button>
                    </form>

                    <section className="panel commerce-step-control">
                      <header><ShieldCheck /><div><h3>Custom fulfilment steps</h3><p>Add controlled-item checks, declarations or delivery requirements.</p></div></header>
                      {(order.steps || []).map((step) => <div key={step._id}><span><strong>{step.label}</strong><small>{step.status}</small></span><select value={step.status} onChange={(event) => void action({ action: "SET_STEP", id: order._id, expectedVersion: order.version, stepId: step._id, status: event.target.value }, "Order step updated.")}><option value="PENDING">Pending</option><option value="COMPLETED">Completed</option><option value="WAIVED">Waived</option></select></div>)}
                      <form onSubmit={(event) => void submitAction(event, (form) => ({ action: "ADD_STEP", id: order._id, expectedVersion: order.version, label: form.get("label") }), "Order step added.")}><input name="label" required minLength={2} maxLength={120} placeholder="Example: Confirm machine intended use" /><button disabled={busy}>Add step</button></form>
                    </section>
                  </> : null}
                </div>

                <aside className="panel commerce-chat">
                  <header><MessageCircle /><div><h3>Private order chat</h3><p>{order.messages?.length || 0} messages · max 200</p></div></header>
                  <div className="commerce-messages">{(order.messages || []).map((message) => <article className={`sender-${message.sender.toLowerCase()}`} key={message._id}><header><strong>{message.sender === "CUSTOMER" ? order.customer.name : message.sender === "STAFF" ? message.staffName || "Staff" : "System"}</strong><time>{new Intl.DateTimeFormat(data.locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(message.createdAt))}</time></header><p>{message.text}</p>{message.attachment ? <a href={`/api/order-attachments/${message.attachment.id}`} target="_blank" rel="noreferrer">{message.attachment.name} <ArrowUpRight size={12} /></a> : null}</article>)}</div>
                  {data.permissions.manage && !["REJECTED", "CANCELLED"].includes(order.status) ? <>
                    <form className="commerce-chat-compose" onSubmit={(event) => void submitAction(event, (form) => ({ action: "MESSAGE", id: order._id, text: form.get("text") }), "Message added to the order chat.")}><textarea name="text" required maxLength={2000} rows={3} placeholder="Reply to the customer" /><button disabled={busy}><Send /></button></form>
                    <input ref={fileRef} hidden type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,application/pdf" onChange={(event) => void upload(event.target.files?.[0])} />
                    <button className="commerce-upload" disabled={busy || !data.storageConfigured} onClick={() => fileRef.current?.click()}><ImagePlus size={15} />{data.storageConfigured ? "Share protected image or PDF" : "Connect private GitHub storage first"}</button>
                  </> : null}
                </aside>
              </div>
            </section>
          ) : <EmptyState title="Choose an order" detail="Select a customer request to review its full route." />}
        </div>
      ) : null}

      {tab === "CATALOGUE" ? <section className="panel commerce-catalogue"><header><div><span className="eyebrow">PUBLIC PRODUCTS</span><h2>Online catalogue</h2><p>Choose public products, add a compressed upload or HTTPS image, and preview exactly what customers will see.</p></div><Link className="button button-secondary" href="/inventory">Open inventory</Link></header><div>{data.products.map((product) => <form key={`${product._id}/${product.onlineImage?.slice(-18) || "none"}`} onSubmit={(event) => void saveCatalogue(event, product)}><span className="commerce-product-identity">{product.onlineImage ? <img src={product.onlineImage} alt="" referrerPolicy="no-referrer" /> : <i><ImagePlus /></i>}<span><strong>{product.name}</strong><small>{product.sku} · {product.stock} in stock · {money.format(product.price)}</small></span></span><label><input name="onlineEnabled" type="checkbox" defaultChecked={product.onlineEnabled} />Online</label><label><input name="sensitiveGood" type="checkbox" defaultChecked={product.sensitiveGood} />Controlled</label><input name="onlineDescription" defaultValue={product.onlineDescription || ""} maxLength={500} placeholder="Customer-facing description" /><input name="onlineImageUrl" type="url" defaultValue={product.onlineImage?.startsWith("https://") ? product.onlineImage : ""} placeholder="HTTPS product image link" /><label className="commerce-image-upload"><ImagePlus size={14} /><span>Upload image</span><input name="onlineImageFile" type="file" accept="image/jpeg,image/png,image/webp" /></label>{product.onlineImage ? <label><input name="removeOnlineImage" type="checkbox" />Remove image</label> : null}<button disabled={busy}><Save size={14} />Save</button></form>)}</div></section> : null}

      {tab === "SETTINGS" && data.permissions.owner ? <div className="commerce-settings-grid">
        <form className="panel commerce-config" onSubmit={async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const fields = String(form.get("sensitiveFields") || "").split("\n").map((line) => line.trim()).filter(Boolean).map((line, index) => { const [label, required = "yes"] = line.split("|").map((value) => value.trim()); return { key: `field-${index + 1}`, label, required: required.toLowerCase() !== "no" }; }); setBusy(true); try { await apiRequest("/api/commerce-settings", { method: "PATCH", body: JSON.stringify({ action: "SAVE_STORE", enabled: form.get("enabled") === "on", storeTitle: form.get("storeTitle"), storeSubtitle: form.get("storeSubtitle"), termsNotice: form.get("termsNotice"), publicSiteUrl: form.get("publicSiteUrl"), abandonedRetentionDays: form.get("abandonedRetentionDays"), completedRetentionEnabled: form.get("completedRetentionEnabled") === "on", completedRetentionDays: form.get("completedRetentionDays"), retentionReminderDays: form.get("retentionReminderDays"), sensitiveFields: fields }) }); show("Online store settings saved."); await load(); } catch (reason) { show(reason instanceof Error ? reason.message : "Could not save store settings.", "error"); } finally { setBusy(false); } }}>
          <header><ShoppingBag /><div><h2>Storefront controls</h2><p>Owner-only public catalogue and controlled-goods policy.</p></div></header>
          <label className="check-row"><input name="enabled" type="checkbox" defaultChecked={data.store.enabled} /><span><strong>Accept online order requests</strong><small>Turn off to pause new requests without closing existing chats.</small></span></label>
          <label className="field"><span>Store title</span><input name="storeTitle" defaultValue={data.store.storeTitle} required /></label>
          <label className="field"><span>Store description</span><textarea name="storeSubtitle" defaultValue={data.store.storeSubtitle} rows={3} required /></label>
          <label className="field"><span>Request notice</span><textarea name="termsNotice" defaultValue={data.store.termsNotice} rows={4} required /></label>
          <label className="field"><span>Public website URL · optional</span><input name="publicSiteUrl" type="url" pattern="https://.*" defaultValue={data.store.publicSiteUrl} placeholder="https://shop.your-domain.com" /></label>
          <p className="form-hint">Used by scheduled emails after the request has ended. Leave blank to automatically use the domain the customer or staff opened, with Vercel&apos;s production domain as the cron fallback.</p>
          <label className="field"><span>Controlled-item questions · one per line · append |no for optional</span><textarea name="sensitiveFields" defaultValue={data.store.sensitiveFields.map((field) => `${field.label}|${field.required ? "yes" : "no"}`).join("\n")} rows={5} /></label>
          <label className="field"><span>Abandoned/rejected personal-data retention</span><select name="abandonedRetentionDays" defaultValue={data.store.abandonedRetentionDays}><option value="30">30 days</option><option value="60">60 days</option><option value="90">90 days</option><option value="180">180 days</option><option value="365">365 days</option></select></label>
          <label className="check-row"><input name="completedRetentionEnabled" type="checkbox" defaultChecked={data.store.completedRetentionEnabled} /><span><strong>Clean completed-order private data</strong><small>Can be turned off. When enabled, the daily maintenance job emails the customer first, then clears chat, contact data and chat attachments while preserving accounting evidence.</small></span></label>
          <div className="form-grid two"><label className="field"><span>Completed-order retention</span><select name="completedRetentionDays" defaultValue={data.store.completedRetentionDays}><option value="30">30 days</option><option value="60">60 days</option><option value="90">90 days</option><option value="180">180 days</option><option value="365">365 days</option></select></label><label className="field"><span>Email reminder before cleanup</span><select name="retentionReminderDays" defaultValue={data.store.retentionReminderDays}><option value="1">1 day before</option><option value="3">3 days before</option><option value="7">7 days before</option><option value="14">14 days before</option></select></label></div>
          <button className="button button-primary" disabled={busy}><Save size={15} />Save storefront</button>
        </form>
        <form className="panel commerce-config" onSubmit={async (event) => { event.preventDefault(); const target = event.currentTarget; const form = new FormData(target); setBusy(true); try { await apiRequest("/api/commerce-settings", { method: "PATCH", body: JSON.stringify({ action: "SAVE_SMTP", email: form.get("email"), senderName: form.get("senderName"), appPassword: String(form.get("appPassword") || "") || undefined }) }); show("Google SMTP verified and encrypted."); await load(); target.reset(); } catch (reason) { show(reason instanceof Error ? reason.message : "Could not connect Google SMTP.", "error"); } finally { setBusy(false); } }}>
          <header><Mail /><div><h2>Google SMTP email</h2><p>Verified before saving. Credentials remain server-side and encrypted.</p></div><StatusPill value={data.smtp.configured ? "CONNECTED" : "NOT CONNECTED"} /></header>
          <label className="field"><span>Gmail / Google Workspace address</span><input name="email" type="email" defaultValue={data.smtp.email || ""} required /></label>
          <label className="field"><span>Sender name</span><input name="senderName" defaultValue={data.smtp.senderName || ""} required /></label>
          <label className="field"><span>Google app password {data.smtp.passwordLast4 ? `· saved ending ${data.smtp.passwordLast4}` : ""}</span><input name="appPassword" type="password" autoComplete="new-password" minLength={16} placeholder={data.smtp.configured ? "Leave blank to keep the current app password" : "16-character Google app password"} /></label>
          <p className="form-hint">Use a Google App Password, not the normal account password. Messages use authenticated TLS, a plain-text alternative, stable Message-ID and an inline Workspace logo without tracking pixels. For a Google Workspace custom domain, publish Google&apos;s SPF record, enable DKIM in Admin Console and add DMARC; inbox placement can be improved but never guaranteed.</p>
          <button className="button button-primary" disabled={busy}><Mail size={15} />Verify & save email</button>
        </form>
      </div> : null}
    </div>
  );
}
