import assert from "node:assert/strict";
import test from "node:test";
import type { ClientSession, Db } from "mongodb";
import {
  DEFAULT_INVOICE_TEMPLATE,
  ensureDefaultInvoiceTemplate,
  invoiceTemplateInputSchema,
} from "../lib/invoice-templates";
import {
  DEFAULT_RECEIPT_TEMPLATE,
  ensureDefaultReceiptTemplate,
  receiptTemplateInputSchema,
} from "../lib/receipt-templates";
import { customBlockKey, normaliseTemplateBlockOrder, normaliseTemplateBlockStyles } from "../lib/document-template-blocks";

type Document = Record<string, unknown>;
type Filter = Document & { $or?: Filter[] };

function matches(document: Document, filter: Filter): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === "$or") return (expected as Filter[]).some(option => matches(document, option));
    if (expected && typeof expected === "object" && "$exists" in expected) {
      return Object.hasOwn(document, key) === (expected as { $exists: boolean }).$exists;
    }
    return document[key] === expected;
  });
}

function templateDb(collectionName: string, existing: Document[] = []) {
  const documents = structuredClone(existing);
  const sessions: unknown[] = [];
  const db = {
    collection: (name: string) => {
      assert.equal(name, collectionName);
      return {
        updateOne: async (
          filter: Filter,
          update: { $set?: Document; $setOnInsert?: Document },
          options: { upsert?: boolean; session?: ClientSession } = {},
        ) => {
          sessions.push(options.session);
          let document = documents.find(candidate => matches(candidate, filter));
          if (!document && options.upsert) {
            document = { ...update.$setOnInsert };
            documents.push(document);
          }
          if (document) Object.assign(document, update.$set);
          return { acknowledged: true };
        },
      };
    },
  } as unknown as Db;
  return { db, documents, sessions };
}

test("reading the starter invoice repeatedly preserves saved address and design preferences", async () => {
  const existing = {
    ...DEFAULT_INVOICE_TEMPLATE,
    systemKey: "starter-invoice-template",
    showBusinessAddress: true,
    showCustomerAddress: true,
    accentColor: "#aabbcc",
    footerText: "Custom invoice footer",
    isDefault: false,
    updatedAt: new Date("2026-09-01T00:00:00Z"),
  };
  const { db, documents } = templateDb("invoiceTemplates", [existing]);
  await ensureDefaultInvoiceTemplate(db);
  await ensureDefaultInvoiceTemplate(db);
  assert.deepEqual(documents, [existing]);
});

test("reading the starter receipt repeatedly preserves saved address and design preferences", async () => {
  const existing = {
    ...DEFAULT_RECEIPT_TEMPLATE,
    systemKey: "starter-receipt-template",
    showBusinessAddress: true,
    paperWidth: "58MM",
    footerText: "Custom receipt footer",
    active: false,
    isDefault: false,
    updatedAt: new Date("2026-09-01T00:00:00Z"),
  };
  const { db, documents } = templateDb("receiptTemplates", [existing]);
  await ensureDefaultReceiptTemplate(db);
  await ensureDefaultReceiptTemplate(db);
  assert.deepEqual(documents, [existing]);
});

test("legacy invoice backfill only supplies the missing visibility field", async () => {
  for (const missingField of ["showBusinessAddress", "showCustomerAddress"] as const) {
    const existing: Document = {
      ...DEFAULT_INVOICE_TEMPLATE,
      nameNormalized: DEFAULT_INVOICE_TEMPLATE.name.toLocaleLowerCase("en-SG"),
      showBusinessAddress: true,
      showCustomerAddress: true,
    };
    delete existing[missingField];
    const { db, documents } = templateDb("invoiceTemplates", [existing]);
    await ensureDefaultInvoiceTemplate(db);
    assert.equal(documents.length, 1);
    assert.deepEqual(documents[0], {
      ...existing,
      systemKey: "starter-invoice-template",
      [missingField]: false,
    });
  }
});

test("legacy receipt backfill supplies missing visibility without changing custom templates", async () => {
  const existing: Document = {
    ...DEFAULT_RECEIPT_TEMPLATE,
    nameNormalized: DEFAULT_RECEIPT_TEMPLATE.name.toLocaleLowerCase("en-SG"),
  };
  delete existing.showBusinessAddress;
  const custom = { ...DEFAULT_RECEIPT_TEMPLATE, name: "My receipt", showBusinessAddress: true };
  const { db, documents } = templateDb("receiptTemplates", [existing, custom]);
  await ensureDefaultReceiptTemplate(db);
  assert.deepEqual(documents, [
    { ...existing, systemKey: "starter-receipt-template", showBusinessAddress: false },
    custom,
  ]);
});

test("new templates retain privacy defaults, are idempotent and use the caller's transaction", async () => {
  const session = { testSession: true } as unknown as ClientSession;
  const invoice = templateDb("invoiceTemplates");
  const receipt = templateDb("receiptTemplates");
  for (let pass = 0; pass < 2; pass += 1) {
    await ensureDefaultInvoiceTemplate(invoice.db, "test-owner", session);
    await ensureDefaultReceiptTemplate(receipt.db, "test-owner", session);
  }
  assert.equal(invoice.documents.length, 1);
  assert.equal(receipt.documents.length, 1);
  assert.equal(invoice.documents[0].showBusinessAddress, false);
  assert.equal(invoice.documents[0].showCustomerAddress, false);
  assert.equal(receipt.documents[0].showBusinessAddress, false);
  assert.equal(invoice.documents[0].createdBy, "test-owner");
  assert.equal(receipt.documents[0].createdBy, "test-owner");
  assert.ok([...invoice.sessions, ...receipt.sessions].every(value => value === session));
});

test("template preference fixes do not relax logo upload validation", () => {
  for (const [schema, defaults] of [
    [invoiceTemplateInputSchema, DEFAULT_INVOICE_TEMPLATE],
    [receiptTemplateInputSchema, DEFAULT_RECEIPT_TEMPLATE],
  ] as const) {
    assert.equal(schema.safeParse({ ...defaults, logoDataUrl: "data:image/png;base64,AAAA" }).success, true);
    assert.equal(schema.safeParse({ ...defaults, logoDataUrl: "data:image/svg+xml;base64,AAAA" }).success, false);
    assert.equal(schema.safeParse({ ...defaults, logoDataUrl: "https://example.com/logo.png" }).success, false);
    assert.equal(schema.safeParse({ ...defaults, logoDataUrl: `data:image/png;base64,${"A".repeat(350_000)}` }).success, false);
  }
});

test("document builders preserve every required financial block while allowing ordered safe components", () => {
  const textBlock = { id: "delivery-note", kind: "TEXT" as const, label: "Delivery note", content: "Leave with the receiving team.", alignment: "LEFT" as const };
  const order = ["HEADER", customBlockKey(textBlock.id), "CUSTOMER", "ITEMS", "TOTALS", "FOOTER"];
  assert.equal(invoiceTemplateInputSchema.safeParse({ ...DEFAULT_INVOICE_TEMPLATE, blockOrder: order, customBlocks: [textBlock] }).success, true);
  assert.equal(invoiceTemplateInputSchema.safeParse({ ...DEFAULT_INVOICE_TEMPLATE, blockOrder: order.filter(key => key !== "TOTALS"), customBlocks: [textBlock] }).success, false);
  assert.equal(receiptTemplateInputSchema.safeParse({ ...DEFAULT_RECEIPT_TEMPLATE, customBlocks: [{ ...textBlock, kind: "IMAGE", content: "https://example.com/tracker.png" }] }).success, false);
  assert.deepEqual(
    normaliseTemplateBlockOrder(["FOOTER", "HEADER"], DEFAULT_INVOICE_TEMPLATE.blockOrder, []),
    ["FOOTER", "HEADER", "CUSTOMER", "ITEMS", "TOTALS"],
  );
  const styled = invoiceTemplateInputSchema.safeParse({
    ...DEFAULT_INVOICE_TEMPLATE,
    blockStyles: [{ key: "HEADER", width: "HALF", surface: "TINT", spacing: "RELAXED", alignment: "CENTER" }],
  });
  assert.equal(styled.success, true);
  assert.equal(invoiceTemplateInputSchema.safeParse({
    ...DEFAULT_INVOICE_TEMPLATE,
    blockStyles: [
      { key: "HEADER", width: "FULL", surface: "PLAIN", spacing: "STANDARD", alignment: "LEFT" },
      { key: "HEADER", width: "HALF", surface: "TINT", spacing: "RELAXED", alignment: "CENTER" },
    ],
  }).success, false);
  assert.equal(receiptTemplateInputSchema.safeParse({
    ...DEFAULT_RECEIPT_TEMPLATE,
    blockStyles: [{ key: "MISSING", width: "FULL", surface: "PLAIN", spacing: "STANDARD", alignment: "LEFT" }],
  }).success, false);
  assert.equal(invoiceTemplateInputSchema.safeParse({
    ...DEFAULT_INVOICE_TEMPLATE,
    blockOrder: [...DEFAULT_INVOICE_TEMPLATE.blockOrder, "CUSTOM:section-divider"],
    customBlocks: [{ id: "section-divider", kind: "DIVIDER", label: "Section divider", content: "", alignment: "CENTER" }],
  }).success, true);
  const richBlocks = [
    { id: "heading-block", kind: "HEADING" as const, label: "Heading", content: "Delivery details", alignment: "LEFT" as const },
    { id: "qr-code-block", kind: "QR" as const, label: "Track order", content: "https://example.com/orders/123", alignment: "CENTER" as const },
    { id: "signature-block", kind: "SIGNATURE" as const, label: "Approval", content: "Authorised signature", alignment: "LEFT" as const },
  ];
  assert.equal(invoiceTemplateInputSchema.safeParse({
    ...DEFAULT_INVOICE_TEMPLATE,
    blockOrder: [...DEFAULT_INVOICE_TEMPLATE.blockOrder, ...richBlocks.map(block => customBlockKey(block.id))],
    customBlocks: richBlocks,
  }).success, true);
  assert.equal(invoiceTemplateInputSchema.safeParse({
    ...DEFAULT_INVOICE_TEMPLATE,
    blockOrder: [...DEFAULT_INVOICE_TEMPLATE.blockOrder, "CUSTOM:unsafe-qr"],
    customBlocks: [{ id: "unsafe-qr", kind: "QR", label: "Unsafe QR", content: "javascript:alert(1)", alignment: "CENTER" }],
  }).success, false);
  assert.equal(normaliseTemplateBlockStyles([], ["HEADER"])[0]?.width, "FULL");
});
