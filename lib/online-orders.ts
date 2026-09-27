import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { productImageSchema } from "@/lib/product-images";
import { roundCurrency } from "@/lib/international";
import {
  SHIPPING_PROVIDER_IDS,
  shippingTrackingReferenceSchema,
} from "@/lib/shipping-providers";

const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
const version = z.coerce.number().int().min(1);

export const storefrontProductIdSchema = objectId;

export const DEFAULT_COMMERCE_SETTINGS = {
  enabled: true,
  storeTitle: "Online order desk",
  storeSubtitle:
    "Choose products and send a request. Stock and price are confirmed before payment.",
  termsNotice:
    "Submitting a request does not reserve stock or create a charge. We will confirm availability and the final amount in your private order chat.",
  publicSiteUrl: "",
  sensitiveFields: [
    {
      key: "intended-use",
      label: "Intended use",
      required: true,
    },
  ],
  abandonedRetentionDays: 90,
  completedRetentionEnabled: true,
  completedRetentionDays: 90,
  retentionReminderDays: 7,
} as const;

export const commerceSettingsSchema = z
  .object({
    enabled: z.boolean().default(true),
    storeTitle: z.string().trim().min(2).max(80),
    storeSubtitle: z.string().trim().min(10).max(300),
    termsNotice: z.string().trim().min(10).max(600),
    publicSiteUrl: z
      .union([
        z.string().trim().url().max(300).refine((value) => value.startsWith("https://"), "The public site URL must use HTTPS."),
        z.literal(""),
      ])
      .default(""),
    sensitiveFields: z
      .array(
        z
          .object({
            key: z
              .string()
              .trim()
              .toLowerCase()
              .min(2)
              .max(40)
              .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
            label: z.string().trim().min(2).max(80),
            required: z.boolean().default(true),
          })
          .strict(),
      )
      .max(10)
      .default([]),
    abandonedRetentionDays: z.coerce.number().int().min(30).max(365),
    completedRetentionEnabled: z.boolean().default(true),
    completedRetentionDays: z.coerce.number().int().min(30).max(365).default(90),
    retentionReminderDays: z.coerce.number().int().min(1).max(30).default(7),
  })
  .strict()
  .superRefine((value, context) => {
    const keys = value.sensitiveFields.map((field) => field.key);
    if (new Set(keys).size !== keys.length)
      context.addIssue({
        code: "custom",
        path: ["sensitiveFields"],
        message: "Sensitive-order questions need unique keys.",
      });
    if (value.retentionReminderDays >= value.completedRetentionDays)
      context.addIssue({
        code: "custom",
        path: ["retentionReminderDays"],
        message: "The reminder must be earlier than completed-order cleanup.",
      });
  });

export function normaliseCommerceSettings(value?: Record<string, unknown> | null) {
  const parsed = commerceSettingsSchema.safeParse({
    enabled: value?.enabled ?? DEFAULT_COMMERCE_SETTINGS.enabled,
    storeTitle: value?.storeTitle ?? DEFAULT_COMMERCE_SETTINGS.storeTitle,
    storeSubtitle:
      value?.storeSubtitle ?? DEFAULT_COMMERCE_SETTINGS.storeSubtitle,
    termsNotice: value?.termsNotice ?? DEFAULT_COMMERCE_SETTINGS.termsNotice,
    publicSiteUrl: value?.publicSiteUrl ?? DEFAULT_COMMERCE_SETTINGS.publicSiteUrl,
    sensitiveFields:
      value?.sensitiveFields ?? DEFAULT_COMMERCE_SETTINGS.sensitiveFields,
    abandonedRetentionDays:
      value?.abandonedRetentionDays ??
      DEFAULT_COMMERCE_SETTINGS.abandonedRetentionDays,
    completedRetentionEnabled:
      value?.completedRetentionEnabled ?? DEFAULT_COMMERCE_SETTINGS.completedRetentionEnabled,
    completedRetentionDays:
      value?.completedRetentionDays ?? DEFAULT_COMMERCE_SETTINGS.completedRetentionDays,
    retentionReminderDays:
      value?.retentionReminderDays ?? DEFAULT_COMMERCE_SETTINGS.retentionReminderDays,
  });
  return parsed.success ? parsed.data : { ...DEFAULT_COMMERCE_SETTINGS };
}

export const onlineOrderRequestSchema = z
  .object({
    customerName: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254),
    phone: z
      .string()
      .trim()
      .min(6)
      .max(40)
      .regex(/^[0-9+() .-]+$/),
    address: z.string().trim().min(8).max(500),
    note: z.string().trim().max(1_000).default(""),
    items: z
      .array(
        z
          .object({
            productId: objectId,
            quantity: z.coerce.number().int().min(1).max(10_000),
          })
          .strict(),
      )
      .min(1)
      .max(30),
    sensitiveAnswers: z
      .array(
        z
          .object({
            key: z.string().trim().min(2).max(40),
            value: z.string().trim().min(1).max(500),
          })
          .strict(),
      )
      .max(10)
      .default([]),
    website: z.string().max(0).default(""),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.items.map((item) => item.productId);
    if (new Set(ids).size !== ids.length)
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: "Each product can appear only once.",
      });
    const answerKeys = value.sensitiveAnswers.map((answer) => answer.key);
    if (new Set(answerKeys).size !== answerKeys.length)
      context.addIssue({
        code: "custom",
        path: ["sensitiveAnswers"],
        message: "Each sensitive-order answer can appear only once.",
      });
  });

export const publicOrderMessageSchema = z
  .object({
    action: z.literal("MESSAGE"),
    text: z.string().trim().min(1).max(2_000),
  })
  .strict();

const offerLine = z
  .object({
    productId: objectId,
    quantity: z.coerce.number().int().min(1).max(10_000),
    discountPercent: z.coerce.number().min(0).max(100),
  })
  .strict();

export const onlineOrderAdminSchema = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("ACCEPT"), id: objectId, expectedVersion: version })
    .strict(),
  z
    .object({
      action: z.literal("REJECT"),
      id: objectId,
      expectedVersion: version,
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal("MESSAGE"),
      id: objectId,
      text: z.string().trim().min(1).max(2_000),
    })
    .strict(),
  z
    .object({
      action: z.literal("SEND_OFFER"),
      id: objectId,
      expectedVersion: version,
      lines: z.array(offerLine).min(1).max(30),
      note: z.string().trim().max(500).default(""),
    })
    .strict(),
  z
    .object({
      action: z.literal("REQUEST_PAYMENT"),
      id: objectId,
      expectedVersion: version,
      methodName: z.string().trim().min(2).max(80),
      instructions: z.string().trim().min(3).max(1_000),
      paymentUrl: z.union([z.string().url().max(500), z.literal("")]).default(""),
    })
    .strict()
    .superRefine((value, context) => {
      if (value.paymentUrl && !value.paymentUrl.startsWith("https://"))
        context.addIssue({
          code: "custom",
          path: ["paymentUrl"],
          message: "Payment links must use HTTPS.",
        });
    }),
  z
    .object({
      action: z.literal("LINK_INVOICE"),
      id: objectId,
      expectedVersion: version,
      invoiceId: objectId,
    })
    .strict(),
  z
    .object({
      action: z.literal("LINK_RECEIPT"),
      id: objectId,
      expectedVersion: version,
      saleId: objectId,
    })
    .strict(),
  z
    .object({
      action: z.literal("UPDATE_SHIPPING"),
      id: objectId,
      expectedVersion: version,
      carrierCode: z.enum(SHIPPING_PROVIDER_IDS),
      carrier: z.string().trim().max(80).default(""),
      trackingReference: z
        .union([shippingTrackingReferenceSchema, z.literal("")])
        .default(""),
      status: z.enum(["PREPARING", "DISPATCHED", "IN_TRANSIT", "DELIVERED"]),
      note: z.string().trim().max(500).default(""),
    })
    .strict(),
  z
    .object({
      action: z.literal("ADD_STEP"),
      id: objectId,
      expectedVersion: version,
      label: z.string().trim().min(2).max(120),
    })
    .strict(),
  z
    .object({
      action: z.literal("SET_STEP"),
      id: objectId,
      expectedVersion: version,
      stepId: objectId,
      status: z.enum(["PENDING", "COMPLETED", "WAIVED"]),
    })
    .strict(),
  z
    .object({ action: z.literal("RESEND_EMAIL"), id: objectId })
    .strict(),
]);

export const catalogueProductSchema = z
  .object({
    id: objectId,
    onlineEnabled: z.boolean(),
    onlineDescription: z.string().trim().max(500).default(""),
    onlineImage: productImageSchema,
    sensitiveGood: z.boolean().default(false),
  })
  .strict();

export function createOrderAccessToken(id: ObjectId | string) {
  return `KKO1-${String(id)}-${randomBytes(24).toString("base64url")}`;
}

export function onlineOrderTokenContext(id: ObjectId | string) {
  return `online-order:${String(id)}:access-token:v1`;
}

export function parseOrderAccessToken(value: unknown) {
  const token = String(value || "").trim();
  const match = /^KKO1-([a-f0-9]{24})-([A-Za-z0-9_-]{32})$/i.exec(token);
  return match ? { token, id: match[1].toLowerCase() } : null;
}

export function orderAccessHash(token: string) {
  return createHash("sha256")
    .update(`online-order-access-v1:${token}`)
    .digest("hex");
}

export function validOrderAccess(expectedHash: unknown, token: string) {
  const received = orderAccessHash(token);
  const expected = String(expectedHash || "");
  return (
    /^[a-f0-9]{64}$/i.test(expected) &&
    timingSafeEqual(Buffer.from(received, "hex"), Buffer.from(expected, "hex"))
  );
}

export type OrderItemSnapshot = {
  productId: ObjectId;
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  listPrice: number;
  sensitiveGood?: boolean;
};

export function calculateOnlineOffer(
  items: OrderItemSnapshot[],
  lines: z.infer<typeof offerLine>[],
  currency: string,
) {
  const requested = new Map(lines.map((line) => [line.productId, line]));
  if (requested.size !== items.length)
    throw new Error("The offer must include every requested product once.");
  const offerItems = items.map((item) => {
    const line = requested.get(String(item.productId));
    if (!line) throw new Error("The offer product list changed. Reload and retry.");
    const subtotal = roundCurrency(item.listPrice * line.quantity, currency);
    const discount = roundCurrency(
      (subtotal * line.discountPercent) / 100,
      currency,
    );
    return {
      ...item,
      quantity: line.quantity,
      discountPercent: line.discountPercent,
      subtotal,
      discount,
      total: roundCurrency(subtotal - discount, currency),
    };
  });
  return {
    items: offerItems,
    subtotal: roundCurrency(
      offerItems.reduce((sum, item) => sum + item.subtotal, 0),
      currency,
    ),
    discount: roundCurrency(
      offerItems.reduce((sum, item) => sum + item.discount, 0),
      currency,
    ),
    total: roundCurrency(
      offerItems.reduce((sum, item) => sum + item.total, 0),
      currency,
    ),
  };
}

export function orderMessage(
  sender: "CUSTOMER" | "STAFF" | "SYSTEM",
  text: string,
  extras: Record<string, unknown> = {},
) {
  return {
    _id: new ObjectId(),
    sender,
    text,
    createdAt: new Date(),
    ...extras,
  };
}
