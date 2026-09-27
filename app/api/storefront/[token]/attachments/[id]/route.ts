import { ObjectId } from "mongodb";
import { blockRestrictedPlatform, fail, publicError } from "@/lib/api";
import { attachmentContentDisposition } from "@/lib/attachment-files";
import {
  getAttachmentStorageConfig,
  getPrivateAttachment,
} from "@/lib/attachment-storage";
import { getDb } from "@/lib/db";
import { unpackLosslessPayload } from "@/lib/lossless-storage";
import {
  parseOrderAccessToken,
  validOrderAccess,
} from "@/lib/online-orders";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string; id: string }> },
) {
  try {
    const blocked = await blockRestrictedPlatform();
    if (blocked) return blocked;
    const { token, id } = await context.params;
    const access = parseOrderAccessToken(token);
    if (!access || !ObjectId.isValid(id))
      return fail("This order file is unavailable.", 404);
    const db = await getDb();
    const [order, attachment, storage] = await Promise.all([
      db.collection("onlineOrders").findOne({ _id: new ObjectId(access.id) }),
      db.collection("onlineOrderAttachments").findOne({
        _id: new ObjectId(id),
        orderId: new ObjectId(access.id),
        status: "ACTIVE",
      }),
      getAttachmentStorageConfig(db),
    ]);
    if (
      !order ||
      !attachment ||
      !storage ||
      !validOrderAccess(order.publicTokenHash, access.token)
    )
      return fail("This order file is unavailable.", 404);
    const protectedBytes = await getPrivateAttachment(
      storage,
      String(attachment.storedPath),
    );
    const bytes = unpackLosslessPayload(
      protectedBytes,
      `online-order-attachment:${id}`,
    );
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": String(attachment.mimeType || "application/octet-stream"),
        "Content-Length": String(bytes.length),
        "Content-Disposition": attachmentContentDisposition(
          attachment.originalName,
          new URL(request.url).searchParams.get("download") === "1",
        ),
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    return publicError(error);
  }
}
