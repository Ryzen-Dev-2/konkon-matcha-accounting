import { z } from "zod";
import { blockRestrictedPlatform, fail, ok, publicError, sameOrigin } from "@/lib/api";
import { getDb } from "@/lib/db";
import { paymentDisplayTokenHash } from "@/lib/payment-display";
import { getSystemControl } from "@/lib/system-control";

export const runtime = "nodejs";

const pollSchema = z.object({ token: z.string().min(32).max(128), action: z.literal("POLL") });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("This request was blocked.", 403);
  try {
    const blocked = await blockRestrictedPlatform();
    if (blocked) return blocked;
    const input = pollSchema.safeParse(await request.json());
    if (!input.success) return fail("This payment-screen request is invalid.", 422);
    const db = await getDb();
    const control = await getSystemControl(db);
    if (control.mode !== "OPEN") return fail("This register is not accepting payments right now.", 423);
    const now = new Date();
    let session = await db.collection("paymentDisplaySessions").findOne({
      tokenHash: paymentDisplayTokenHash(input.data.token), revokedAt: { $exists: false }, expiresAt: { $gt: now }, generation: control.scannerGeneration,
    });
    if (!session) return fail("This payment-screen link has expired or was revoked.", 410);
    if (session.phase === "THANK_YOU" && session.thankYouUntil instanceof Date && session.thankYouUntil <= now) {
      session = await db.collection("paymentDisplaySessions").findOneAndUpdate(
        { _id: session._id, phase: "THANK_YOU", thankYouUntil: { $lte: now } },
        {
          $set: { phase: "WELCOME", updatedAt: now },
          $unset: { paymentMethodCode: "", paymentName: "", provider: "", amount: "", currency: "", qrPayload: "", amountLocked: "", thankYouUntil: "" },
          $inc: { stateVersion: 1 },
        },
        { returnDocument: "after" },
      ) || session;
    }
    const lastSeenAt = session.lastSeenAt instanceof Date ? session.lastSeenAt : null;
    if (!lastSeenAt || now.getTime() - lastSeenAt.getTime() >= 5_000) {
      await db.collection("paymentDisplaySessions").updateOne(
        { _id: session._id },
        { $set: { connectedAt: session.connectedAt || now, lastSeenAt: now } },
      );
    }
    const response = ok({
      phase: session.phase === "PAYMENT" || session.phase === "THANK_YOU" ? session.phase : "WELCOME",
      stateVersion: Number(session.stateVersion || 1),
      paymentName: session.phase === "PAYMENT" ? String(session.paymentName || "Payment") : "",
      provider: session.phase === "PAYMENT" ? String(session.provider || "GENERIC") : "",
      amount: session.phase === "PAYMENT" ? Number(session.amount || 0) : 0,
      currency: session.phase === "PAYMENT" ? String(session.currency || "") : "",
      qrPayload: session.phase === "PAYMENT" ? String(session.qrPayload || "") : "",
      amountLocked: session.phase === "PAYMENT" && session.amountLocked === true,
      expiresAt: session.expiresAt,
    });
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  } catch (error) { return publicError(error); }
}
