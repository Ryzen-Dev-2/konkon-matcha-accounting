import { blockRestrictedPlatform, fail, ok, publicError } from "@/lib/api";
import { getDb } from "@/lib/db";
import { processTelegramWebhook, TelegramWebhookError } from "@/lib/notification-connectors";
import { deliverOrderEmail } from "@/lib/order-email";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 65_536) return fail("Telegram update is too large.", 413);
  try {
    const blocked = await blockRestrictedPlatform();
    if (blocked) return blocked;
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 65_536) return fail("Telegram update is too large.", 413);
    const body = JSON.parse(raw) as unknown;
    const db = await getDb();
    const result = await processTelegramWebhook(
      db,
      body,
      request.headers.get("x-telegram-bot-api-secret-token") || "",
    );
    if ("delivered" in result && result.delivered && result.orderNo) {
      let emailSent = false;
      try {
        const order = await db.collection("onlineOrders").findOne({ orderNo: result.orderNo });
        if (order) {
          const delivery = await deliverOrderEmail(
            db,
            order,
            request,
            `New reply on ${result.orderNo}`,
            "Your order team replied through its connected Telegram workspace. Open the private order chat to read and continue the conversation.",
            "MESSAGE",
          );
          emailSent = delivery.sent;
        }
      } catch {
        // A mail outage must not make Telegram retry an already recorded reply.
      }
      return ok({ ...result, emailSent });
    }
    return ok(result);
  } catch (error) {
    if (error instanceof SyntaxError) return fail("The request body must be valid JSON.", 400);
    if (error instanceof TelegramWebhookError) return fail(error.message, error.status);
    return publicError(error);
  }
}
