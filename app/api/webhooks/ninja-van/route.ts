import { getDb } from "@/lib/db";
import { NinjaVanError, parseVerifiedNinjaVanWebhook } from "@/lib/ninja-van";
import { blockRestrictedPlatform } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 262_144) return new Response("Payload too large", { status: 413 });
  const signature = request.headers.get("x-ninjavan-hmac-sha256") || "";
  if (!signature) return new Response("Missing signature", { status: 401 });
  try {
    const blocked = await blockRestrictedPlatform();
    if (blocked) return blocked;
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > 262_144) return new Response("Payload too large", { status: 413 });
    const db = await getDb();
    const { event, fingerprint } = await parseVerifiedNinjaVanWebhook(db, rawBody, signature);
    const now = new Date();
    try {
      await db.collection("shippingWebhookEvents").insertOne({
        provider: "NINJA_VAN", fingerprint, trackingReference: event.tracking_id,
        merchantReference: event.shipper_order_ref_no, event: event.event || "", status: event.status,
        providerTimestamp: new Date(event.timestamp), rts: Boolean(event.is_parcel_on_rts_leg),
        receivedAt: now, expiresAt: new Date(now.getTime() + 180 * 86_400_000),
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) return new Response(null, { status: 200 });
      throw error;
    }
    const providerTimestamp = new Date(event.timestamp);
    const statusUpdate = {
      carrierStatus: event.status,
      carrierEvent: event.event || event.status,
      carrierEventAt: providerTimestamp,
      carrierWebhookReceivedAt: now,
      updatedAt: now,
      ...(/pending pickup/i.test(`${event.event || ""} ${event.status}`) ? { waybillReady: true } : {}),
    };
    await db.collection("deliveryOrders").updateOne(
      {
        carrierCode: "NINJA_VAN",
        trackingReference: event.tracking_id,
        $or: [
          { carrierEventAt: { $exists: false } },
          { carrierEventAt: { $lte: providerTimestamp } },
        ],
      },
      { $set: statusUpdate },
    );
    return new Response(null, { status: 200 });
  } catch (error) {
    if (error instanceof NinjaVanError) return new Response(error.message, { status: error.status });
    console.error("[ninja-webhook-error]", error instanceof Error ? error.message : "Unknown error");
    return new Response("Temporary processing failure", { status: 500 });
  }
}
