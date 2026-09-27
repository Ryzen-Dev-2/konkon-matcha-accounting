import type { ClientSession, Db } from "mongodb";
import { z } from "zod";
import { templateBlockStyleSchema, templateCustomBlockSchema, validateTemplateBlocks, validateTemplateBlockStyles } from "@/lib/document-template-blocks";

export const RECEIPT_PAPER_WIDTHS = ["58MM", "80MM"] as const;
export const RECEIPT_DENSITIES = ["COMPACT", "COMFORTABLE"] as const;
export const RECEIPT_TEMPLATE_BLOCKS = ["HEADER", "DOCUMENT", "SERVICE", "ITEMS", "TOTALS", "PAYMENT", "LOYALTY", "FOOTER"] as const;

const logoDataUrlSchema = z.string().max(350_000).refine(
  (value) => value === "" || /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(value),
  "Upload a PNG, JPEG or WebP logo under 250 KB.",
);

export const receiptTemplateInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  paperWidth: z.enum(RECEIPT_PAPER_WIDTHS),
  density: z.enum(RECEIPT_DENSITIES),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Choose a six-digit hex colour."),
  logoDataUrl: logoDataUrlSchema.default(""),
  receiptTitle: z.string().trim().min(2).max(50).default("SALES RECEIPT"),
  headerText: z.string().trim().max(160).default(""),
  thankYouText: z.string().trim().max(180).default(""),
  footerText: z.string().trim().max(300).default(""),
  returnPolicy: z.string().trim().max(400).default(""),
  website: z.string().trim().max(160).default(""),
  showBusinessAddress: z.boolean().default(false),
  showRegistrationNo: z.boolean().default(true),
  showTaxBreakdown: z.boolean().default(true),
  showSku: z.boolean().default(false),
  showCashier: z.boolean().default(true),
  showMember: z.boolean().default(true),
  showPaymentDetails: z.boolean().default(true),
  showPoints: z.boolean().default(true),
  blockOrder: z.array(z.string().max(80)).max(24).default([...RECEIPT_TEMPLATE_BLOCKS]),
  customBlocks: z.array(templateCustomBlockSchema).max(12).default([]),
  blockStyles: z.array(templateBlockStyleSchema).max(24).default([]),
  isDefault: z.boolean().default(false),
}).superRefine((value, context) => {
  const issue = validateTemplateBlocks(value.blockOrder, value.customBlocks, RECEIPT_TEMPLATE_BLOCKS);
  if (issue) context.addIssue({ code: "custom", path: ["blockOrder"], message: issue });
  const styleIssue = validateTemplateBlockStyles(value.blockStyles, value.blockOrder);
  if (styleIssue) context.addIssue({ code: "custom", path: ["blockStyles"], message: styleIssue });
});

export type ReceiptTemplateInput = z.infer<typeof receiptTemplateInputSchema>;
export type ReceiptTemplateRecord = ReceiptTemplateInput & {
  _id: string;
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_RECEIPT_TEMPLATE: ReceiptTemplateInput = {
  name: "Matcha counter",
  paperWidth: "80MM",
  density: "COMFORTABLE",
  accentColor: "#173f2a",
  logoDataUrl: "",
  receiptTitle: "SALES RECEIPT",
  headerText: "SALES COUNTER",
  thankYouText: "Thank you for sharing a bowl with us.",
  footerText: "Prepared at the counter.",
  returnPolicy: "Please keep this receipt for exchanges. Sealed goods may be exchanged within 7 days.",
  website: "konkonmatcha.com",
  showBusinessAddress: false,
  showRegistrationNo: true,
  showTaxBreakdown: true,
  showSku: false,
  showCashier: true,
  showMember: true,
  showPaymentDetails: true,
  showPoints: true,
  blockOrder: [...RECEIPT_TEMPLATE_BLOCKS],
  customBlocks: [],
  blockStyles: [],
  isDefault: true,
};

export function normaliseReceiptTemplate(value: unknown): ReceiptTemplateInput {
  const parsed = receiptTemplateInputSchema.safeParse(value);
  return parsed.success ? parsed.data : { ...DEFAULT_RECEIPT_TEMPLATE };
}

export async function ensureDefaultReceiptTemplate(db: Db, createdBy: unknown = null, session?: ClientSession) {
  const now = new Date();
  await db.collection("receiptTemplates").updateOne(
    {
      $or: [
        { systemKey: "starter-receipt-template" },
        { nameNormalized: DEFAULT_RECEIPT_TEMPLATE.name.toLocaleLowerCase("en-SG") },
      ],
    },
    {
      $set: { systemKey: "starter-receipt-template" },
      $setOnInsert: {
        ...DEFAULT_RECEIPT_TEMPLATE,
        nameNormalized: DEFAULT_RECEIPT_TEMPLATE.name.toLocaleLowerCase("en-SG"),
        active: true,
        createdBy,
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true, ...(session ? { session } : {}) },
  );
  await db.collection("receiptTemplates").updateOne(
    // Only backfill older templates; saved visibility choices must survive reads.
    { systemKey: "starter-receipt-template", showBusinessAddress: { $exists: false } },
    { $set: { showBusinessAddress: false } },
    session ? { session } : {},
  );
}
