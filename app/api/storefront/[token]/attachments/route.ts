import { ObjectId } from "mongodb";
import { blockRestrictedPlatform, fail, ok, publicError, sameOrigin } from "@/lib/api";
import { getDb } from "@/lib/db";
import { serialise } from "@/lib/format";
import {
  parseOrderAccessToken,
  validOrderAccess,
} from "@/lib/online-orders";
import { storeOrderAttachment } from "@/lib/order-attachments";
import { ManagedStorageQuotaError } from "@/lib/storage-control";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  if (!sameOrigin(request)) return fail("This request was blocked.", 403);
  try {
    const blocked = await blockRestrictedPlatform();
    if (blocked) return blocked;
    const { token } = await context.params;
    const access = parseOrderAccessToken(token);
    if (!access)
      return fail("This private order link is invalid or no longer available.", 404);
    if (Number(request.headers.get("content-length") || 0) > 4_500_000)
      return fail("Keep each order attachment at or below 4 MB.", 413);
    const db = await getDb();
    const order = await db
      .collection("onlineOrders")
      .findOne({ _id: new ObjectId(access.id) });
    if (!order || !validOrderAccess(order.publicTokenHash, access.token))
      return fail("This private order link is invalid or no longer available.", 404);
    if (["REJECTED", "CANCELLED"].includes(String(order.status)))
      return fail("This order conversation is closed.", 409);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail("Choose a file to upload.", 422);
    const result = await storeOrderAttachment(db, order, file, "CUSTOMER");
    return ok(serialise({
      attachment: result.attachment,
      messageCount: result.updated.messageCount,
      updatedAt: result.updated.updatedAt,
    }));
  } catch (error) {
    if (error instanceof ManagedStorageQuotaError)
      return fail(error.message, 507);
    if (
      error instanceof Error &&
      /attachment|file|GitHub|repository|conversation/i.test(error.message)
    )
      return fail(error.message, 422);
    return publicError(error);
  }
}
