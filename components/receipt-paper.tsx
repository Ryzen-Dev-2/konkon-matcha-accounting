"use client";

import { Fragment, type CSSProperties, type ReactNode } from "react";
import { Leaf } from "lucide-react";
import { QrImage } from "./qr-image";
import { DEFAULT_RECEIPT_TEMPLATE, type ReceiptTemplateInput } from "@/lib/receipt-templates";
import { customBlockKey, normaliseTemplateBlockOrder, normaliseTemplateBlockStyles, templateBlockClassName, type TemplateCustomBlock } from "@/lib/document-template-blocks";

export type ReceiptPaperDocument = {
  _id?: string;
  receiptNo: string;
  publicReceiptUrl?: string;
  status?: string;
  createdAt: string | Date;
  cashierName?: string;
  counterCode?: string;
  counterName?: string;
  locationName?: string;
  memberName?: string;
  memberNo?: string;
  pointsEarned?: number;
  pointsBalance?: number;
  items: Array<{ sku?: string; name: string; quantity: number; price: number; lineTotal: number; batchAllocations?: Array<{ lotNo: string; expiryDate: string; quantity: number }> }>;
  subtotal: number;
  discount: number;
  taxRate: number;
  taxMode?: "EXCLUSIVE" | "INCLUSIVE";
  tax: number;
  total: number;
  refundedAmount?: number;
  paymentMethod: string;
  paymentMethodName?: string;
  paymentKind?: "CASH" | "NON_CASH";
  paymentReference?: string;
  paymentProvider?: string;
  paymentVerificationMode?: "NONE" | "REFERENCE" | "PROVIDER";
  tenderCurrency?: string;
  tenderTotal?: number;
  exchangeRate?: number;
  tenderedAmount?: number;
  changeDue?: number;
  saleNote?: string;
  businessSnapshot?: {
    businessName?: string;
    registrationNo?: string;
    email?: string;
    phone?: string;
    address?: string;
    currency?: string;
    taxName?: string;
    locale?: string;
    timeZone?: string;
    countryCode?: string;
    franchiseBrand?: string;
    franchiseCode?: string;
    workspaceLogoDataUrl?: string;
  };
};

function customBlockContent(block: TemplateCustomBlock) {
  if (block.kind === "IMAGE") return <img src={block.content} alt={block.label} />;
  if (block.kind === "HEADING") return <h3>{block.content}</h3>;
  if (block.kind === "QR") return <div className="document-custom-qr-code"><QrImage value={block.content} label={block.label} width={112} /><span>{block.label}</span></div>;
  if (block.kind === "SIGNATURE") return <div className="document-custom-signature"><span /><strong>{block.content}</strong></div>;
  if (block.kind === "DIVIDER") return <hr aria-label={block.label} />;
  if (block.kind === "SPACER") return <span className="document-spacer" aria-label={block.label} />;
  return <p>{block.content}</p>;
}

export function ReceiptPaper({ document, template = DEFAULT_RECEIPT_TEMPLATE, compact = false, editorMode = false }: {
  document: ReceiptPaperDocument;
  template?: ReceiptTemplateInput;
  compact?: boolean;
  editorMode?: boolean;
}) {
  const business = document.businessSnapshot || {};
  const currency = /^[A-Z]{3}$/.test(business.currency || "") ? business.currency! : "SGD";
  const locale = business.locale || "en-SG";
  const timeZone = business.timeZone || "Asia/Singapore";
  const tenderCurrency = /^[A-Z]{3}$/.test(document.tenderCurrency || "") ? document.tenderCurrency! : currency;
  const money = new Intl.NumberFormat(locale, { style: "currency", currency });
  const tenderMoney = new Intl.NumberFormat(locale, { style: "currency", currency: tenderCurrency });
  const dateTime = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone });
  const style = { "--receipt-accent": template.accentColor } as CSSProperties;
  const isCash = document.paymentKind ? document.paymentKind === "CASH" : document.paymentMethod === "CASH";
  const customBlocks = template.customBlocks || [];
  const logoSrc = template.logoDataUrl || business.workspaceLogoDataUrl || "";
  const blockOrder = normaliseTemplateBlockOrder(template.blockOrder, DEFAULT_RECEIPT_TEMPLATE.blockOrder, customBlocks);
  const hasCanvasLayout = editorMode || Boolean(template.blockStyles?.length);
  const blockStyles = normaliseTemplateBlockStyles(template.blockStyles, blockOrder);
  const customByKey = new Map(customBlocks.map(block => [customBlockKey(block.id), block]));
  const blocks: Record<string, ReactNode> = {
    HEADER: <header className="receipt-paper-header">
      {logoSrc ? <img src={logoSrc} alt={`${business.businessName || "Business"} logo`} /> : <span className="receipt-leaf-mark"><Leaf size={18} /></span>}
      <strong>{business.businessName || "Kōn-Kōn Matchā"}</strong>
      {business.franchiseCode ? <span>{business.franchiseBrand || "Franchise"} · {business.franchiseCode}</span> : null}
      {template.headerText ? <small>{template.headerText}</small> : null}
      {template.showBusinessAddress && business.address ? <p>{business.address}</p> : null}
      <span>{[business.phone, business.email].filter(Boolean).join(" · ")}</span>
      {template.showRegistrationNo && business.registrationNo ? <span>REG {business.registrationNo}</span> : null}
    </header>,
    DOCUMENT: <><section className="receipt-paper-title">
      <strong>{template.receiptTitle}</strong><span>{document.receiptNo}</span><time>{dateTime.format(new Date(document.createdAt))}</time>
    </section>{document.status && document.status !== "COMPLETED" ? <div className="receipt-refund-stamp"><strong>{document.status.replaceAll("_", " ")}</strong>{document.refundedAmount ? <span>{money.format(document.refundedAmount)} refunded</span> : null}</div> : null}</>,
    SERVICE: (template.showCashier || template.showMember || document.counterName) ? <dl className="receipt-paper-meta">
      {document.counterName ? <div><dt>Counter</dt><dd>{document.counterCode ? `${document.counterCode} · ` : ""}{document.counterName}{document.locationName ? ` · ${document.locationName}` : ""}</dd></div> : null}
      {template.showCashier && document.cashierName ? <div><dt>Cashier</dt><dd>{document.cashierName}</dd></div> : null}
      {template.showMember && document.memberName ? <div><dt>Customer</dt><dd>{document.memberName}{document.memberNo ? ` · ${document.memberNo}` : ""}</dd></div> : null}
    </dl> : null,
    ITEMS: <div className="receipt-paper-items">
      {document.items.map((item, index) => <div className="receipt-paper-item" key={`${item.name}-${index}`}>
        <div><strong>{item.name}</strong>{template.showSku && item.sku ? <small>{item.sku}</small> : null}{item.batchAllocations?.length ? <small>{item.batchAllocations.map((batch) => `LOT ${batch.lotNo} · EXP ${batch.expiryDate}${item.batchAllocations!.length > 1 ? ` · ${batch.quantity}` : ""}`).join(" / ")}</small> : null}</div>
        <span>{item.quantity} × {money.format(item.price)}</span><b>{money.format(item.lineTotal)}</b>
      </div>)}
    </div>,
    TOTALS: <dl className="receipt-paper-totals">
      <div><dt>Subtotal</dt><dd>{money.format(document.subtotal)}</dd></div>
      {document.discount > 0 ? <div><dt>Discount</dt><dd>−{money.format(document.discount)}</dd></div> : null}
      {template.showTaxBreakdown ? <div><dt>{business.taxName || "Tax"} {document.taxRate}%{document.taxMode === "INCLUSIVE" ? " · included" : ""}</dt><dd>{money.format(document.tax)}</dd></div> : null}
      <div className="receipt-paper-grand"><dt>Total</dt><dd>{money.format(document.total)}</dd></div>
      {document.refundedAmount ? <><div><dt>Refunded</dt><dd>−{money.format(document.refundedAmount)}</dd></div><div><dt>Net retained</dt><dd>{money.format(Math.max(0, document.total - document.refundedAmount))}</dd></div></> : null}
    </dl>,
    PAYMENT: template.showPaymentDetails ? <dl className="receipt-paper-payment">
      <div><dt>Paid by</dt><dd>{document.paymentMethodName || document.paymentMethod}</dd></div>
      {document.paymentReference ? <div><dt>Reference</dt><dd>{document.paymentReference}</dd></div> : null}
      {document.paymentVerificationMode === "PROVIDER" ? <div><dt>Verification</dt><dd>{document.paymentProvider || "Provider"} confirmed</dd></div> : null}
      {tenderCurrency !== currency ? <><div><dt>Settlement</dt><dd>{tenderMoney.format(document.tenderTotal || 0)}</dd></div><div><dt>FX rate</dt><dd>1 {currency} = {document.exchangeRate} {tenderCurrency}</dd></div></> : null}
      {isCash ? <><div><dt>Cash received</dt><dd>{tenderMoney.format(document.tenderedAmount || document.tenderTotal || document.total)}</dd></div><div><dt>Change</dt><dd>{tenderMoney.format(document.changeDue || 0)}</dd></div></> : null}
    </dl> : null,
    LOYALTY: <>{template.showPoints && document.pointsEarned ? <section className="receipt-points"><Leaf size={13} /><span><strong>+{document.pointsEarned} points</strong>{document.pointsBalance !== undefined ? ` · Balance ${document.pointsBalance}` : ""}</span></section> : null}{document.saleNote ? <p className="receipt-sale-note"><strong>Order note</strong>{document.saleNote}</p> : null}</>,
    FOOTER: <footer className="receipt-paper-footer">
      {document.publicReceiptUrl ? <div className="receipt-access-qr" data-receipt-qr><QrImage value={document.publicReceiptUrl} label="Scan to view and export this receipt" width={148} /><strong>Scan for your digital receipt</strong><small>View · save · show for returns</small></div> : null}
      {template.thankYouText ? <strong>{template.thankYouText}</strong> : null}
      {template.returnPolicy ? <p>{template.returnPolicy}</p> : null}
      {template.website ? <span>{template.website}</span> : null}
      {template.footerText ? <small>{template.footerText}</small> : null}
    </footer>,
  };

  return <article className={`thermal-receipt receipt-width-${template.paperWidth.toLowerCase()} receipt-density-${template.density.toLowerCase()} ${hasCanvasLayout ? "document-layout-enabled" : ""} ${compact ? "thermal-receipt-compact" : ""}`} style={style}>
    {blockOrder.map(key => {
      const custom = customByKey.get(key);
      const content = blocks[key] || (custom ? <section className={`document-custom-block document-custom-${custom.kind.toLowerCase()} align-${custom.alignment.toLowerCase()}`}>{customBlockContent(custom)}</section> : null);
      if (!hasCanvasLayout) return <Fragment key={key}>{content}</Fragment>;
      const baseStyle = blockStyles.find(blockStyle => blockStyle.key === key)!;
      return <div className={templateBlockClassName({ ...baseStyle, width: "FULL" })} key={key} data-document-block={key}>{content}</div>;
    })}
  </article>;
}
