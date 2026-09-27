import type { ClientSession, Db } from "mongodb";
import { z } from "zod";
import { templateBlockStyleSchema, templateCustomBlockSchema, validateTemplateBlocks, validateTemplateBlockStyles } from "@/lib/document-template-blocks";

export const INVOICE_LAYOUTS = ["CEREMONIAL", "LEDGER", "MINIMAL"] as const;
export const INVOICE_PAPER_TONES = ["RICE", "WHITE", "MIST"] as const;
export const INVOICE_TEMPLATE_BLOCKS = ["HEADER", "CUSTOMER", "ITEMS", "TOTALS", "FOOTER"] as const;

const logoDataUrlSchema = z.string().max(350_000).refine(
  (value) => value === "" || /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(value),
  "Upload a PNG, JPEG or WebP logo under 250 KB.",
);

export const invoiceTemplateInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  layout: z.enum(INVOICE_LAYOUTS),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Choose a six-digit hex colour."),
  paperTone: z.enum(INVOICE_PAPER_TONES),
  logoDataUrl: logoDataUrlSchema.default(""),
  headerText: z.string().trim().max(120).default(""),
  documentTitle: z.string().trim().min(2).max(50).default("INVOICE"),
  footerText: z.string().trim().max(300).default(""),
  paymentInstructions: z.string().trim().max(500).default(""),
  termsDays: z.coerce.number().int().min(0).max(365).default(14),
  showBusinessAddress: z.boolean().default(false),
  showCustomerAddress: z.boolean().default(false),
  showRegistrationNo: z.boolean().default(true),
  showTaxBreakdown: z.boolean().default(true),
  showNotes: z.boolean().default(true),
  blockOrder: z.array(z.string().max(80)).max(20).default([...INVOICE_TEMPLATE_BLOCKS]),
  customBlocks: z.array(templateCustomBlockSchema).max(12).default([]),
  blockStyles: z.array(templateBlockStyleSchema).max(20).default([]),
  isDefault: z.boolean().default(false),
}).superRefine((value, context) => {
  const issue = validateTemplateBlocks(value.blockOrder, value.customBlocks, INVOICE_TEMPLATE_BLOCKS);
  if (issue) context.addIssue({ code: "custom", path: ["blockOrder"], message: issue });
  const styleIssue = validateTemplateBlockStyles(value.blockStyles, value.blockOrder);
  if (styleIssue) context.addIssue({ code: "custom", path: ["blockStyles"], message: styleIssue });
});

export type InvoiceTemplateInput = z.infer<typeof invoiceTemplateInputSchema>;
export type InvoiceTemplateRecord = InvoiceTemplateInput & {
  _id: string;
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_INVOICE_TEMPLATE: InvoiceTemplateInput = {
  name: "Ceremonial paper",
  layout: "CEREMONIAL",
  accentColor: "#173f2a",
  paperTone: "RICE",
  logoDataUrl: "",
  headerText: "ACCOUNTING & OPERATIONS",
  documentTitle: "INVOICE",
  footerText: "Prepared with care for your records.",
  paymentInstructions: "Please include the invoice number with your payment using the agreed payment method.",
  termsDays: 14,
  showBusinessAddress: false,
  showCustomerAddress: false,
  showRegistrationNo: true,
  showTaxBreakdown: true,
  showNotes: true,
  blockOrder: [...INVOICE_TEMPLATE_BLOCKS],
  customBlocks: [],
  blockStyles: [],
  isDefault: true,
};

export function normaliseInvoiceTemplate(value: unknown): InvoiceTemplateInput {
  const parsed = invoiceTemplateInputSchema.safeParse(value);
  return parsed.success ? parsed.data : { ...DEFAULT_INVOICE_TEMPLATE };
}

export async function ensureDefaultInvoiceTemplate(db: Db, createdBy: unknown = null, session?: ClientSession) {
  const now = new Date();
  await db.collection("invoiceTemplates").updateOne(
    {
      $or: [
        { systemKey: "starter-invoice-template" },
        { nameNormalized: DEFAULT_INVOICE_TEMPLATE.name.toLocaleLowerCase("en-SG") },
      ],
    },
    {
      $set: { systemKey: "starter-invoice-template" },
      $setOnInsert: {
        ...DEFAULT_INVOICE_TEMPLATE,
        nameNormalized: DEFAULT_INVOICE_TEMPLATE.name.toLocaleLowerCase("en-SG"),
        createdBy,
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true, ...(session ? { session } : {}) },
  );
  // Backfill older templates without undoing an owner's explicit visibility choices.
  for (const field of ["showBusinessAddress", "showCustomerAddress"] as const) {
    await db.collection("invoiceTemplates").updateOne(
      { systemKey: "starter-invoice-template", [field]: { $exists: false } },
      { $set: { [field]: false } },
      session ? { session } : {},
    );
  }
}
