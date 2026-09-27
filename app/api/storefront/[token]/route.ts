import { ObjectId } from "mongodb";
import { blockRestrictedPlatform, fail, ok, publicError, sameOrigin } from "@/lib/api";
import { getDb } from "@/lib/db";
import { serialise } from "@/lib/format";
import { broadcastNotification } from "@/lib/notification-connectors";
import {
  orderMessage,
  parseOrderAccessToken,
  publicOrderMessageSchema,
  validOrderAccess,
} from "@/lib/online-orders";
import { resolvePublicOrigin } from "@/lib/public-origin";

export const runtime = "nodejs";
export const maxDuration = 30;

function commerceWorkspaceUrl(request: Request) {
  return `${resolvePublicOrigin(request)}/commerce`;
}

async function findOrder(tokenValue: string) {
  const parsed = parseOrderAccessToken(tokenValue);
  if (!parsed) return null;
  const db = await getDb();
  const order = await db
    .collection("onlineOrders")
    .findOne({ _id: new ObjectId(parsed.id) });
  if (!order || !validOrderAccess(order.publicTokenHash, parsed.token)) return null;
  return { db, order };
}

function publicOrder(order: Record<string, any>) {
  return {
    _id: String(order._id),
    orderNo: order.orderNo,
    status: order.status,
    version: order.version,
    customer: order.customer,
    items: order.offer?.items || order.items,
    currency: order.currency,
    subtotal: order.subtotal,
    discount: order.discount,
    total: order.total,
    offer: order.offer || null,
    offerNote: order.offerNote || "",
    paymentRequest: order.paymentRequest || null,
    linkedInvoice: order.linkedInvoice || null,
    linkedReceipt: order.linkedReceipt || null,
    shipping: order.shipping || null,
    sensitive: order.sensitive === true,
    sensitiveAnswers: order.sensitiveAnswers || [],
    steps: order.steps || [],
    messages: (order.messages || []).map((message: Record<string, unknown>) => ({
      _id: String(message._id),
      sender: message.sender,
      text: message.text,
      type: message.type || "MESSAGE",
      staffName: message.staffName || "",
      attachment: message.attachment || null,
      createdAt: message.createdAt,
    })),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const blocked = await blockRestrictedPlatform();
    if (blocked) return blocked;
    const { token } = await context.params;
    const found = await findOrder(token);
    if (!found)
      return fail("This private order link is invalid or no longer available.", 404);
    const response = ok(serialise(publicOrder(found.order)));
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (error) {
    return publicError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  if (!sameOrigin(request)) return fail("This request was blocked.", 403);
  try {
    const blocked = await blockRestrictedPlatform();
    if (blocked) return blocked;
    const { token } = await context.params;
    const found = await findOrder(token);
    if (!found)
      return fail("This private order link is invalid or no longer available.", 404);
    if (["REJECTED", "CANCELLED"].includes(String(found.order.status)))
      return fail("This order conversation is closed.", 409);
    const parsed = publicOrderMessageSchema.safeParse(await request.json());
    if (!parsed.success)
      return fail(
        "Enter a message.",
        422,
        parsed.error.flatten().fieldErrors,
      );
    const now = new Date();
    const cooldown = new Date(now.getTime() - 2_000);
    const updated = await found.db.collection("onlineOrders").findOneAndUpdate(
      {
        _id: found.order._id,
        messageCount: { $lt: 200 },
        $or: [
          { lastCustomerMessageAt: { $exists: false } },
          { lastCustomerMessageAt: { $lte: cooldown } },
        ],
      },
      {
        $push: {
          messages: orderMessage("CUSTOMER", parsed.data.text) as never,
        },
        $inc: { messageCount: 1 },
        $set: { lastCustomerMessageAt: now, updatedAt: now },
      },
      { returnDocument: "after" },
    );
    if (!updated)
      return fail(
        "Wait a moment before sending again, or the conversation is full.",
        429,
      );
    await broadcastNotification(
      found.db,
      `Customer message on ${String(updated.orderNo)}: ${parsed.data.text.slice(0, 500)}\nOpen ${commerceWorkspaceUrl(request)}. Telegram operators can reply with /reply ${String(updated.orderNo)} your message`,
    );
    return ok(serialise(publicOrder(updated)));
  } catch (error) {
    if (error instanceof SyntaxError)
      return fail("The request body must be valid JSON.", 400);
    return publicError(error);
  }
}
