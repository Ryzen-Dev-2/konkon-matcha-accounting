import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import { blockRestrictedPlatform, fail, created, ok, publicError, sameOrigin } from "@/lib/api";
import { normaliseBusinessSettings } from "@/lib/business-settings";
import { getDb } from "@/lib/db";
import { makeDocumentNo } from "@/lib/format";
import { broadcastNotification } from "@/lib/notification-connectors";
import { deliverOrderEmail } from "@/lib/order-email";
import {
  normaliseCommerceSettings,
  onlineOrderRequestSchema,
  orderMessage,
  storefrontProductIdSchema,
} from "@/lib/online-orders";
import { roundCurrency } from "@/lib/international";
import { resolvePublicOrigin } from "@/lib/public-origin";

export const runtime = "nodejs";
export const maxDuration = 30;

function commerceWorkspaceUrl(request: Request, publicSiteUrl = "") {
  return `${resolvePublicOrigin(request, publicSiteUrl)}/commerce`;
}

function throttleKey(request: Request, email: string, now: Date) {
  const ip = (request.headers.get("x-forwarded-for") || "unknown")
    .split(",")[0]
    .trim();
  const hourBucket = Math.floor(now.getTime() / 3_600_000);
  return createHash("sha256")
    .update(`online-order:${ip}:${email.toLowerCase()}:${hourBucket}`)
    .digest("hex");
}

export async function GET(request: Request) {
  try {
    const blocked = await blockRestrictedPlatform();
    if (blocked) return blocked;
    const requestedProduct = new URL(request.url).searchParams.get("product");
    const productId = requestedProduct
      ? storefrontProductIdSchema.safeParse(requestedProduct)
      : null;
    if (productId && !productId.success)
      return fail("This product is unavailable.", 404);
    const db = await getDb();
    const [businessRecord, commerceRecord, products] = await Promise.all([
      db.collection("settings").findOne({ key: "business" }),
      db.collection("settings").findOne({ key: "commerce" }),
      db
        .collection("products")
        .find({
          active: { $ne: false },
          onlineEnabled: true,
          ...(productId?.success ? { _id: new ObjectId(productId.data) } : {}),
        })
        .project({
          sku: 1,
          name: 1,
          category: 1,
          unit: 1,
          price: 1,
          stock: 1,
          onlineDescription: 1,
          onlineImage: 1,
          sensitiveGood: 1,
        })
        .sort({ category: 1, name: 1 })
        .limit(productId?.success ? 1 : 300)
        .toArray(),
    ]);
    if (productId?.success && !products.length)
      return fail("This product is unavailable.", 404);
    const business = normaliseBusinessSettings(businessRecord);
    const store = normaliseCommerceSettings(commerceRecord);
    const response = ok({
      business: {
        name: business.businessName,
        email: business.email,
        phone: business.phone,
        currency: business.currency,
        locale: business.locale,
        logoDataUrl: business.workspaceLogoDataUrl,
      },
      store,
      products: products.map((product) => ({
        _id: product._id.toHexString(),
        sku: String(product.sku),
        name: String(product.name),
        category: String(product.category),
        unit: String(product.unit),
        price: Number(product.price || 0),
        available: Math.max(0, Number(product.stock || 0)),
        onlineDescription: String(product.onlineDescription || ""),
        onlineImage: String(product.onlineImage || ""),
        sensitiveGood: product.sensitiveGood === true,
      })),
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return publicError(error);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("This request was blocked.", 403);
  try {
    const blocked = await blockRestrictedPlatform();
    if (blocked) return blocked;
    const parsed = onlineOrderRequestSchema.safeParse(await request.json());
    if (!parsed.success)
      return fail(
        "Check your order request.",
        422,
        parsed.error.flatten().fieldErrors,
      );
    const db = await getDb();
    const now = new Date();
    const key = throttleKey(request, parsed.data.email, now);
    const throttle = await db.collection("onlineOrderThrottle").findOneAndUpdate(
      { _id: key as never },
      {
        $inc: { count: 1 },
        $setOnInsert: {
          windowStartedAt: now,
          expiresAt: new Date(
            (Math.floor(now.getTime() / 3_600_000) + 3) * 3_600_000,
          ),
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    if (Number(throttle?.count || 0) > 5)
      return fail(
        "Too many order requests were sent. Wait before trying again.",
        429,
      );
    const [businessRecord, commerceRecord, products] = await Promise.all([
      db.collection("settings").findOne({ key: "business" }),
      db.collection("settings").findOne({ key: "commerce" }),
      db
        .collection("products")
        .find({
          _id: {
            $in: parsed.data.items.map(
              (item) => new ObjectId(item.productId),
            ),
          },
          active: { $ne: false },
          onlineEnabled: true,
        })
        .toArray(),
    ]);
    const business = normaliseBusinessSettings(businessRecord);
    const store = normaliseCommerceSettings(commerceRecord);
    if (!store.enabled) return fail("Online orders are currently paused.", 503);
    if (products.length !== parsed.data.items.length)
      return fail("A selected product is no longer available online.", 409);
    const byId = new Map(products.map((product) => [String(product._id), product]));
    const items = parsed.data.items.map((line) => {
      const product = byId.get(line.productId)!;
      const available = Math.max(0, Number(product.stock || 0));
      if (line.quantity > available)
        throw new Error(`${String(product.name)} has only ${available} available.`);
      const listPrice = roundCurrency(product.price, business.currency);
      return {
        productId: product._id,
        sku: String(product.sku),
        name: String(product.name),
        unit: String(product.unit),
        quantity: line.quantity,
        listPrice,
        lineTotal: roundCurrency(listPrice * line.quantity, business.currency),
        sensitiveGood: product.sensitiveGood === true,
      };
    });
    const sensitive = items.some((item) => item.sensitiveGood);
    const answerMap = new Map(
      parsed.data.sensitiveAnswers.map((answer) => [answer.key, answer.value]),
    );
    if (sensitive) {
      for (const field of store.sensitiveFields) {
        if (field.required && !answerMap.get(field.key))
          return fail(`Enter ${field.label.toLowerCase()}.`, 422);
      }
    }
    const id = new ObjectId();
    const orderNo = makeDocumentNo("WEB");
    const subtotal = roundCurrency(
      items.reduce((sum, item) => sum + item.lineTotal, 0),
      business.currency,
    );
    const messages = [
      orderMessage(
        "SYSTEM",
        "Order request received. No stock is reserved and no payment is due until a staff member confirms the request.",
        { type: "STATUS" },
      ),
      ...(parsed.data.note
        ? [orderMessage("CUSTOMER", parsed.data.note)]
        : []),
    ];
    const order = {
      _id: id,
      orderNo,
      status: "REQUESTED",
      version: 1,
      customer: {
        name: parsed.data.customerName,
        email: parsed.data.email.toLowerCase(),
        phone: parsed.data.phone,
        address: parsed.data.address,
      },
      items,
      currency: business.currency,
      subtotal,
      discount: 0,
      total: subtotal,
      sensitive,
      sensitiveAnswers: sensitive ? parsed.data.sensitiveAnswers : [],
      steps: [],
      messages,
      messageCount: messages.length,
      attachmentCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    await db.collection("onlineOrders").insertOne(order);
    const notificationResults = await Promise.allSettled([
      broadcastNotification(
        db,
        `New online order ${orderNo} from ${parsed.data.customerName}. ${items.length} product line(s), ${business.currency} ${subtotal.toFixed(2)}. Open ${commerceWorkspaceUrl(request, store.publicSiteUrl)}. Telegram operators can reply with /reply ${orderNo} your message`,
      ),
      deliverOrderEmail(
        db,
        order,
        request,
        `We received your order request ${orderNo}`,
        "Thank you — your request is safely in our review queue. No stock is reserved and no payment is due yet. Our team will email your private order link after accepting the request.",
        "RECEIVED",
      ),
    ]);
    const email = notificationResults[1]?.status === "fulfilled"
      ? notificationResults[1].value
      : { sent: false };
    return created({
      orderNo,
      status: "REQUESTED",
      emailSent: email.sent,
      message:
        email.sent
          ? "Your request was sent and a confirmation email is on the way. Staff will review it before inviting you to the private chat."
          : "Your request was sent. Staff will review it before emailing a private order-chat link.",
    });
  } catch (error) {
    if (error instanceof SyntaxError)
      return fail("The request body must be valid JSON.", 400);
    if (error instanceof Error && /available/.test(error.message))
      return fail(error.message, 409);
    return publicError(error);
  }
}
