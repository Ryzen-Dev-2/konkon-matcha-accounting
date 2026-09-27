"use client";

import { Fragment, type CSSProperties, type ReactNode } from "react";
import { Leaf } from "lucide-react";
import { QrImage } from "@/components/qr-image";
import { DEFAULT_INVOICE_TEMPLATE, type InvoiceTemplateInput } from "@/lib/invoice-templates";
import { formatCalendarDate } from "@/lib/dates";
import { customBlockKey, normaliseTemplateBlockOrder, normaliseTemplateBlockStyles, templateBlockClassName, type TemplateCustomBlock } from "@/lib/document-template-blocks";

export type InvoicePaperItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type InvoicePaperDocument = {
  invoiceNo: string;
  status?: string;
  createdAt: string | Date;
  dueDate: string | Date;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerReference?: string;
  items: InvoicePaperItem[];
  subtotal: number;
  taxRate: number;
  taxMode?: "EXCLUSIVE" | "INCLUSIVE";
  tax: number;
  total: number;
  notes?: string;
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

export function InvoicePaper({ document, template = DEFAULT_INVOICE_TEMPLATE, compact = false, editorMode = false }: {
  document: InvoicePaperDocument;
  template?: InvoiceTemplateInput;
  compact?: boolean;
  editorMode?: boolean;
}) {
  const business = document.businessSnapshot || {};
  const paperStyle = { "--invoice-accent": template.accentColor } as CSSProperties;
  const currency = /^[A-Z]{3}$/.test(business.currency || "") ? business.currency! : "SGD";
  const locale = business.locale || "en-SG";
  const timeZone = business.timeZone || "Asia/Singapore";
  const money = new Intl.NumberFormat(locale, { style: "currency", currency });
  const shortDate = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric", timeZone });
  const customBlocks = template.customBlocks || [];
  const logoSrc = template.logoDataUrl || business.workspaceLogoDataUrl || "";
  const blockOrder = normaliseTemplateBlockOrder(template.blockOrder, DEFAULT_INVOICE_TEMPLATE.blockOrder, customBlocks);
  const hasCanvasLayout = editorMode || Boolean(template.blockStyles?.length);
  const blockStyles = normaliseTemplateBlockStyles(template.blockStyles, blockOrder);
  const styleByKey = new Map(blockStyles.map(style => [style.key, style]));
  const customByKey = new Map(customBlocks.map(block => [customBlockKey(block.id), block]));
  const blocks: Record<string, ReactNode> = {
    HEADER: <header className="invoice-paper-header">
      <div className="invoice-paper-brand">
        {logoSrc ? <img src={logoSrc} alt={`${business.businessName || "Business"} logo`} /> : <span className="invoice-paper-mark"><Leaf size={18} /></span>}
        <div><small>{template.headerText}</small><strong>{business.businessName || "Kōn-Kōn Matchā"}</strong>{business.franchiseCode ? <span>{business.franchiseBrand || "Franchise"} · {business.franchiseCode}</span> : null}</div>
      </div>
      <div className="invoice-paper-title"><small>{document.status || "DRAFT"}</small><h2>{template.documentTitle}</h2><span>{document.invoiceNo}</span></div>
    </header>,
    CUSTOMER: <section className="invoice-paper-parties">
      <div><small>BILLED TO</small><strong>{document.customerName}</strong>{template.showCustomerAddress && document.customerAddress ? <p>{document.customerAddress}</p> : null}<span>{[document.customerEmail, document.customerPhone].filter(Boolean).join(" · ")}</span></div>
      <dl><div><dt>Issued</dt><dd>{shortDate.format(new Date(document.createdAt))}</dd></div><div><dt>Due</dt><dd>{formatCalendarDate(document.dueDate, locale)}</dd></div>{document.customerReference ? <div><dt>Reference</dt><dd>{document.customerReference}</dd></div> : null}</dl>
    </section>,
    ITEMS: <div className="invoice-paper-lines">
      <div className="invoice-paper-line invoice-paper-line-head"><span>Description</span><span>Qty</span><span>Rate</span><span>Amount</span></div>
      {document.items.map((item, index) => <div className="invoice-paper-line" key={`${item.description}-${index}`}><strong>{item.description}</strong><span>{item.quantity}</span><span>{money.format(item.unitPrice)}</span><b>{money.format(item.lineTotal)}</b></div>)}
    </div>,
    TOTALS: <section className="invoice-paper-summary">
      <div className="invoice-paper-message">
        {template.showNotes && document.notes ? <><small>NOTES</small><p>{document.notes}</p></> : null}
        {template.paymentInstructions ? <><small>PAYMENT</small><p>{template.paymentInstructions}</p></> : null}
      </div>
      <dl><div><dt>Subtotal</dt><dd>{money.format(document.subtotal)}</dd></div>{template.showTaxBreakdown ? <div><dt>{business.taxName || "Tax"} · {document.taxRate}%{document.taxMode === "INCLUSIVE" ? " included" : ""}</dt><dd>{money.format(document.tax)}</dd></div> : null}<div className="invoice-paper-grand-total"><dt>Total</dt><dd>{money.format(document.total)}</dd></div></dl>
    </section>,
    FOOTER: <footer className="invoice-paper-footer">
      <div><strong>{template.footerText}</strong><span>{[business.email, business.phone, template.showBusinessAddress ? business.address : ""].filter(Boolean).join(" · ")}</span>{template.showRegistrationNo && business.registrationNo ? <small>Registration {business.registrationNo}</small> : null}</div>
      <div className="invoice-paper-seal"><Leaf size={13} /><span>KŌN<br />KŌN</span></div>
    </footer>,
  };
  return (
    <article className={`invoice-paper invoice-layout-${template.layout.toLowerCase()} invoice-tone-${template.paperTone.toLowerCase()} ${hasCanvasLayout ? "document-layout-enabled" : ""} ${compact ? "invoice-paper-compact" : ""}`} style={paperStyle}>
      {blockOrder.map(key => {
        const custom = customByKey.get(key);
        const content = blocks[key] || (custom ? <section className={`document-custom-block document-custom-${custom.kind.toLowerCase()} align-${custom.alignment.toLowerCase()}`}>{customBlockContent(custom)}</section> : null);
        if (!hasCanvasLayout) return <Fragment key={key}>{content}</Fragment>;
        const baseStyle = styleByKey.get(key)!;
        const blockStyle = ["ITEMS", "TOTALS"].includes(key) ? { ...baseStyle, width: "FULL" as const } : baseStyle;
        return <div className={templateBlockClassName(blockStyle)} key={key} data-document-block={key}>{content}</div>;
      })}
    </article>
  );
}
