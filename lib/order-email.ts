import "server-only";
import type { Db } from "mongodb";
import { normaliseBusinessSettings } from "@/lib/business-settings";
import { readGoogleSmtp, sendGoogleSmtp } from "@/lib/google-smtp";
import { decryptMemberToken } from "@/lib/member-cards";
import { normaliseCommerceSettings, onlineOrderTokenContext } from "@/lib/online-orders";
import { resolvePublicOrigin } from "@/lib/public-origin";

export type OrderEmailKind = "RECEIVED" | "ACCEPTED" | "REJECTED" | "MESSAGE" | "OFFER" | "PAYMENT" | "INVOICE" | "RECEIPT" | "SHIPPING" | "RETENTION" | "UPDATE";

function escapeHtml(value: unknown) {
  return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function workspaceLogo(dataUrl: string) {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return null;
  return {
    cid: "workspace-logo",
    contentType: `image/${match[1]}` as "image/png" | "image/jpeg" | "image/webp",
    filename: `workspace-logo.${match[1] === "jpeg" ? "jpg" : match[1]}`,
    content: Buffer.from(match[2], "base64"),
  };
}

function palette(theme: string) {
  if (theme === "PROFESSIONAL") return { ink: "#10244d", accent: "#315fdd", wash: "#edf3ff", soft: "#dce7ff" };
  if (theme === "FOCUS") return { ink: "#101114", accent: "#343941", wash: "#f2f3f5", soft: "#e4e6e9" };
  return { ink: "#10281b", accent: "#638b36", wash: "#f1f6e8", soft: "#dcedbd" };
}

function accessUrl(order: Record<string, any>, origin: string) {
  if (!origin || !order.encryptedPublicToken) return "";
  try {
    const token = decryptMemberToken(String(order.encryptedPublicToken), onlineOrderTokenContext(String(order._id)));
    return `${origin}/order/${encodeURIComponent(token)}`;
  } catch {
    return "";
  }
}

function renderOrderEmail(input: {
  business: ReturnType<typeof normaliseBusinessSettings>;
  order: Record<string, any>;
  subject: string;
  message: string;
  kind: OrderEmailKind;
  destination: string;
  hasLogo: boolean;
}) {
  const { business, order } = input;
  const colors = palette(business.workspaceTheme);
  const customerName = escapeHtml(order.customer?.name || "Customer");
  const orderNo = escapeHtml(order.orderNo);
  const status = escapeHtml(String(order.status || "REQUESTED").replaceAll("_", " "));
  const initials = escapeHtml(business.businessName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "WS");
  const money = new Intl.NumberFormat(business.locale, { style: "currency", currency: String(order.currency || business.currency) });
  const items = (Array.isArray(order.offer?.items) ? order.offer.items : Array.isArray(order.items) ? order.items : []).slice(0, 6);
  const itemRows = items.map((item: Record<string, unknown>) => `<tr><td style="padding:11px 0;border-bottom:1px solid #e7e9ed;color:${colors.ink};font-size:13px"><strong>${escapeHtml(item.name)}</strong><br><span style="color:#7a818d;font-size:11px">${escapeHtml(item.sku)} · ${escapeHtml(item.quantity)} ${escapeHtml(item.unit)}</span></td><td align="right" style="padding:11px 0;border-bottom:1px solid #e7e9ed;color:${colors.ink};font-size:13px;font-weight:700">${escapeHtml(money.format(Number(item.total ?? item.lineTotal ?? Number(item.listPrice || 0) * Number(item.quantity || 0))))}</td></tr>`).join("");
  const more = Math.max(0, (order.offer?.items || order.items || []).length - items.length);
  const logo = input.hasLogo
    ? `<img src="cid:workspace-logo" width="46" height="46" alt="${escapeHtml(business.businessName)}" style="display:block;width:46px;height:46px;border-radius:14px;object-fit:contain;background:#fff">`
    : `<div style="width:46px;height:46px;border-radius:14px;background:${colors.soft};color:${colors.ink};font:700 14px Arial,sans-serif;line-height:46px;text-align:center">${initials}</div>`;
  const cta = input.destination ? `<tr><td style="padding:4px 34px 30px"><a href="${escapeHtml(input.destination)}" style="display:inline-block;padding:14px 21px;border-radius:999px;background:${colors.accent};color:#fff;font:700 13px Arial,sans-serif;text-decoration:none">${order.encryptedPublicToken ? "Open private order chat" : "Visit online shop"} &nbsp;→</a></td></tr>` : "";
  const documentLine = [order.linkedInvoice?.invoiceNo ? `Invoice ${escapeHtml(order.linkedInvoice.invoiceNo)}` : "", order.linkedReceipt?.receiptNo ? `Receipt ${escapeHtml(order.linkedReceipt.receiptNo)}` : ""].filter(Boolean).join(" &nbsp;·&nbsp; ");
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#eef0f3"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(input.message).slice(0, 130)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef0f3"><tr><td align="center" style="padding:30px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;border-radius:24px;overflow:hidden;background:#fff;box-shadow:0 18px 55px rgba(20,32,48,.12)"><tr><td style="padding:24px 28px;background:${colors.ink}"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td width="58">${logo}</td><td style="color:#fff;font-family:Arial,sans-serif"><strong style="display:block;font-size:15px">${escapeHtml(business.businessName)}</strong><span style="font-size:10px;letter-spacing:.14em;color:${colors.soft}">ORDER CARE · ${escapeHtml(input.kind)}</span></td><td align="right"><span style="display:inline-block;padding:7px 10px;border:1px solid rgba(255,255,255,.24);border-radius:999px;color:#fff;font:700 10px Arial,sans-serif">${status}</span></td></tr></table></td></tr><tr><td style="padding:32px 34px 16px"><span style="display:inline-block;padding:6px 9px;border-radius:999px;background:${colors.wash};color:${colors.accent};font:700 10px Arial,sans-serif;letter-spacing:.12em">${orderNo}</span><h1 style="margin:18px 0 10px;color:${colors.ink};font:700 30px/1.15 Arial,sans-serif">${escapeHtml(input.subject)}</h1><p style="margin:0 0 10px;color:#69717d;font:400 15px/1.75 Arial,sans-serif">Hello ${customerName},</p><p style="margin:0;color:#3f4855;font:400 15px/1.75 Arial,sans-serif">${escapeHtml(input.message).replaceAll("\n", "<br>")}</p></td></tr>${itemRows ? `<tr><td style="padding:8px 34px 18px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${itemRows}${more ? `<tr><td colspan="2" style="padding-top:10px;color:#7a818d;font:400 11px Arial,sans-serif">+ ${more} more item${more === 1 ? "" : "s"}</td></tr>` : ""}<tr><td style="padding-top:15px;color:#7a818d;font:700 11px Arial,sans-serif">CURRENT TOTAL</td><td align="right" style="padding-top:15px;color:${colors.ink};font:700 18px Arial,sans-serif">${escapeHtml(money.format(Number(order.total || 0)))}</td></tr></table></td></tr>` : ""}${documentLine ? `<tr><td style="padding:0 34px 20px;color:${colors.accent};font:700 12px Arial,sans-serif">${documentLine}</td></tr>` : ""}${cta}<tr><td style="padding:20px 34px;background:${colors.wash};color:#687169;font:400 11px/1.6 Arial,sans-serif">This is a transactional update for order <strong>${orderNo}</strong>. Private links should not be forwarded.${business.email ? `<br>Contact: ${escapeHtml(business.email)}` : ""}<br><span style="color:#8a918b">Authenticated Google SMTP · plain-text alternative · no tracking pixels</span></td></tr></table></td></tr></table></body></html>`;
  const itemText = items.map((item: Record<string, unknown>) => `- ${String(item.name)} × ${String(item.quantity)}`).join("\n");
  const text = `${business.businessName}\n${input.subject}\n\nHello ${String(order.customer?.name || "Customer")},\n\n${input.message}\n\nOrder: ${String(order.orderNo)}\nStatus: ${String(order.status || "REQUESTED").replaceAll("_", " ")}\n${itemText ? `${itemText}\n` : ""}Total: ${money.format(Number(order.total || 0))}${input.destination ? `\n\n${order.encryptedPublicToken ? "Open your private order chat" : "Visit the online shop"}:\n${input.destination}` : ""}\n\nThis is a transactional order update. Do not forward private links.`;
  return { html, text };
}

export async function deliverOrderEmail(
  db: Db,
  order: Record<string, any>,
  source: Request | string | undefined,
  subject: string,
  message: string,
  kind: OrderEmailKind = "UPDATE",
) {
  const [smtp, businessRecord, commerceRecord] = await Promise.all([
    readGoogleSmtp(db),
    db.collection("settings").findOne({ key: "business" }),
    db.collection("settings").findOne({ key: "commerce" }),
  ]);
  const commerce = normaliseCommerceSettings(commerceRecord);
  const publicOrigin = resolvePublicOrigin(source, commerce.publicSiteUrl);
  const privateUrl = accessUrl(order, publicOrigin);
  const destination = privateUrl || (publicOrigin ? `${publicOrigin}/shop` : "");
  if (!smtp) {
    const error = "Owner has not connected Google SMTP.";
    await db.collection("onlineOrders").updateOne({ _id: order._id }, { $set: { lastEmailError: error, lastEmailAttemptAt: new Date(), lastEmailKind: kind } });
    return { sent: false, error, accessUrl: privateUrl };
  }
  const business = normaliseBusinessSettings(businessRecord);
  const logo = workspaceLogo(business.workspaceLogoDataUrl);
  const rendered = renderOrderEmail({ business, order, subject, message, kind, destination, hasLogo: Boolean(logo) });
  try {
    await sendGoogleSmtp(smtp, {
      to: String(order.customer?.email || ""),
      subject: `${business.businessName} · ${subject}`,
      replyTo: smtp.email,
      ...rendered,
      ...(logo ? { inlineImages: [logo] } : {}),
    });
    await db.collection("onlineOrders").updateOne(
      { _id: order._id },
      { $set: { lastEmailSentAt: new Date(), lastEmailAttemptAt: new Date(), lastEmailKind: kind }, $unset: { lastEmailError: "" } },
    );
    return { sent: true, error: "", accessUrl: privateUrl };
  } catch (reason) {
    const error = reason instanceof Error ? reason.message : "Google SMTP could not send the message.";
    await db.collection("onlineOrders").updateOne(
      { _id: order._id },
      { $set: { lastEmailError: error, lastEmailAttemptAt: new Date(), lastEmailKind: kind } },
    );
    return { sent: false, error, accessUrl: privateUrl };
  }
}
