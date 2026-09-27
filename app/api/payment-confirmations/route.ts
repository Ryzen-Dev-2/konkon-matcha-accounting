import { z } from "zod";
import { blockRestrictedPlatform, created, fail, publicError } from "@/lib/api";
import { getDb, getMongoClient } from "@/lib/db";
import { currencyCodeSchema } from "@/lib/international";
import { PAYMENT_PROVIDERS, normaliseVerificationCode, verificationCodeHash, verifyPaymentWebhook } from "@/lib/payment-verification";

export const runtime = "nodejs";

const confirmationSchema = z.object({
  provider: z.enum(PAYMENT_PROVIDERS),
  externalReference: z.string().trim().min(4).max(100),
  paymentMethodCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,24}$/),
  amount: z.coerce.number().positive().max(100_000_000_000),
  currency: currencyCodeSchema,
  verificationCode: z.string().min(1).max(128),
  paidAt: z.coerce.date(),
});

export async function POST(request: Request) {
  try {
    const blocked = await blockRestrictedPlatform();
    if (blocked) return blocked;
    const rawBody = await request.text();
    const eventId = request.headers.get("x-payment-event-id")?.trim() || "";
    const timestamp = request.headers.get("x-payment-timestamp")?.trim() || "";
    const signature = request.headers.get("x-payment-signature")?.trim() || "";
    if (!/^[A-Za-z0-9_-]{12,100}$/.test(eventId)) return fail("The payment event identifier is invalid.", 401);
    let value: unknown;
    try { value = JSON.parse(rawBody); } catch { return fail("The payment confirmation body must be valid JSON.", 400); }
    const input = confirmationSchema.safeParse(value);
    if (!input.success) return fail("The payment confirmation is invalid.", 422, input.error.flatten().fieldErrors);
    const providerSecret = process.env[`PAYMENT_WEBHOOK_SECRET_${input.data.provider}`] || process.env.PAYMENT_WEBHOOK_SECRET || "";
    if (!verifyPaymentWebhook(rawBody, timestamp, signature, providerSecret)) return fail("The payment confirmation signature is invalid or expired.", 401);
    const code = normaliseVerificationCode(input.data.verificationCode);
    if (!code) return fail("The payment verification code is invalid.", 422);
    const db = await getDb();
    const client = await getMongoClient();
    const mongoSession = client.startSession();
    const now = new Date();
    try {
      await mongoSession.withTransaction(async () => {
        await db.collection("paymentWebhookEvents").insertOne({ eventId, provider: input.data.provider, createdAt: now }, { session: mongoSession });
        await db.collection("paymentConfirmations").insertOne({
          provider: input.data.provider,
          externalReference: input.data.externalReference,
          paymentMethodCode: input.data.paymentMethodCode,
          amount: input.data.amount,
          currency: input.data.currency,
          verificationCodeHash: verificationCodeHash(code),
          paidAt: input.data.paidAt,
          status: "CONFIRMED",
          receivedAt: now,
          createdAt: now,
        }, { session: mongoSession });
      });
    } finally { await mongoSession.endSession(); }
    return created({ accepted: true });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return fail("This payment confirmation event or code was already received.", 409);
    return publicError(error);
  }
}
