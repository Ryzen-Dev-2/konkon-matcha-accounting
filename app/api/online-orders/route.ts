import { ObjectId } from "mongodb";
import { z } from "zod";
import {
  authorize,
  fail,
  ok,
  publicError,
  sameOrigin,
} from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { getAttachmentStorageConfig } from "@/lib/attachment-storage";
import { normaliseBusinessSettings } from "@/lib/business-settings";
import { getDb } from "@/lib/db";
import { serialise } from "@/lib/format";
import { readGoogleSmtp, safeGoogleSmtp } from "@/lib/google-smtp";
import { encryptMemberToken } from "@/lib/member-cards";
import { deliverOrderEmail } from "@/lib/order-email";
import {
  calculateOnlineOffer,
  catalogueProductSchema,
  createOrderAccessToken,
  normaliseCommerceSettings,
  onlineOrderAdminSchema,
  orderAccessHash,
  orderMessage,
  onlineOrderTokenContext,
} from "@/lib/online-orders";
import { resolvePublicOrigin } from "@/lib/public-origin";
import { hasPermission } from "@/lib/rbac";
import {
  findShippingProvider,
  normaliseCarrierSelection,
} from "@/lib/shipping-providers";
import { receiptAccessUrl } from "@/lib/receipt-access";

export const runtime = "nodejs";
export const maxDuration = 30;

const catalogueMutation = catalogueProductSchema
  .extend({ action: z.literal("UPDATE_CATALOGUE") })
  .strict();

function safeOrder(order: Record<string, any>) {
  const {
    publicTokenHash: _publicTokenHash,
    encryptedPublicToken: _encryptedPublicToken,
    ...safe
  } = order;
  return safe;
}

export async function GET(request: Request) {
  const auth = await authorize("commerce.read");
  if (auth.error) return auth.error;
  try {
    const db = await getDb();
    const liveId = new URL(request.url).searchParams.get("id") || "";
    if (liveId) {
      if (!ObjectId.isValid(liveId)) return fail("Choose a valid online order.", 422);
      const order = await db.collection("onlineOrders").findOne({ _id: new ObjectId(liveId) });
      if (!order) return fail("This order request no longer exists.", 404);
      const response = ok(serialise({ order: safeOrder(order) }));
      response.headers.set("Cache-Control", "private, no-store, max-age=0");
      return response;
    }
    const [
      orders,
      settings,
      businessRecord,
      smtp,
      storage,
      products,
      invoices,
      receipts,
    ] =
      await Promise.all([
        db
          .collection("onlineOrders")
          .find({})
          .sort({ updatedAt: -1 })
          .limit(200)
          .toArray(),
        db.collection("settings").findOne({ key: "commerce" }),
        db.collection("settings").findOne({ key: "business" }),
        readGoogleSmtp(db),
        getAttachmentStorageConfig(db),
        db
          .collection("products")
          .find({ active: { $ne: false } })
          .project({
            sku: 1,
            name: 1,
            category: 1,
            price: 1,
            stock: 1,
            onlineEnabled: 1,
            onlineDescription: 1,
            onlineImage: 1,
            sensitiveGood: 1,
          })
          .sort({ category: 1, name: 1 })
          .limit(500)
          .toArray(),
        db
          .collection("invoices")
          .find({ status: { $ne: "VOID" } })
          .project({
            invoiceNo: 1,
            customerName: 1,
            customerEmail: 1,
            total: 1,
            paidAmount: 1,
            status: 1,
            createdAt: 1,
          })
          .sort({ createdAt: -1 })
          .limit(100)
          .toArray(),
        db
          .collection("sales")
          .find({ status: "COMPLETED" })
          .project({
            receiptNo: 1,
            memberName: 1,
            total: 1,
            status: 1,
            createdAt: 1,
          })
          .sort({ createdAt: -1 })
          .limit(100)
          .toArray(),
      ]);
    const business = normaliseBusinessSettings(businessRecord);
    return ok(
      serialise({
        orders: orders.map((order) => safeOrder(order)),
        products,
        documents: { invoices, receipts },
        store: normaliseCommerceSettings(settings),
        smtp:
          auth.session.role === "OWNER"
            ? safeGoogleSmtp(smtp)
            : { configured: Boolean(smtp) },
        storageConfigured: Boolean(storage),
        currency: business.currency,
        locale: business.locale,
        permissions: {
          manage: hasPermission(auth.session.role, "commerce.manage"),
          owner: auth.session.role === "OWNER",
        },
      }),
    );
  } catch (error) {
    return publicError(error);
  }
}

export async function PATCH(request: Request) {
  const auth = await authorize("commerce.manage");
  if (auth.error) return auth.error;
  if (!sameOrigin(request)) return fail("This request was blocked.", 403);
  try {
    const body = await request.json();
    const catalogue = catalogueMutation.safeParse(body);
    const db = await getDb();
    if (catalogue.success) {
      const { id, action: _action, ...changes } = catalogue.data;
      const product = await db.collection("products").findOneAndUpdate(
        { _id: new ObjectId(id), active: { $ne: false } },
        {
          $set: {
            ...changes,
            updatedAt: new Date(),
            updatedBy: new ObjectId(auth.session.id),
          },
        },
        { returnDocument: "after" },
      );
      if (!product) return fail("The product is no longer active.", 404);
      await writeAudit(
        db,
        auth.session,
        "commerce.catalogue_update",
        "product",
        id,
        {
          onlineEnabled: changes.onlineEnabled,
          sensitiveGood: changes.sensitiveGood,
        },
      );
      return ok(serialise(product));
    }

    const parsed = onlineOrderAdminSchema.safeParse(body);
    if (!parsed.success)
      return fail(
        "Check the online-order action.",
        422,
        parsed.error.flatten().fieldErrors,
      );
    const input = parsed.data;
    const id = new ObjectId(input.id);
    const order = await db.collection("onlineOrders").findOne({ _id: id });
    if (!order) return fail("This order request no longer exists.", 404);
    const now = new Date();

    if (input.action === "MESSAGE") {
      if (["REJECTED", "CANCELLED"].includes(String(order.status)))
        return fail("This order conversation is closed.", 409);
      if (Number(order.messageCount || 0) >= 200)
        return fail("This conversation reached its message limit.", 409);
      const updated = await db.collection("onlineOrders").findOneAndUpdate(
        { _id: id, messageCount: { $lt: 200 } },
        {
          $push: {
            messages: orderMessage("STAFF", input.text, {
              staffName: auth.session.fullName,
            }) as never,
          },
          $inc: { messageCount: 1 },
          $set: { updatedAt: now },
        },
        { returnDocument: "after" },
      );
      if (!updated)
        return fail("This conversation reached its message limit.", 409);
      await writeAudit(
        db,
        auth.session,
        "commerce.message_send",
        "onlineOrder",
        input.id,
        { orderNo: order.orderNo },
      );
      const delivery = await deliverOrderEmail(
        db,
        updated,
        request,
        `New reply on ${String(updated.orderNo)}`,
        `${auth.session.fullName} replied to your private order conversation: “${input.text}”`,
        "MESSAGE",
      );
      return ok({ order: serialise(safeOrder(updated)), notification: delivery });
    }

    if (input.action === "RESEND_EMAIL") {
      if (!order.encryptedPublicToken)
        return fail("Accept the order before sending its private link.", 409);
      const delivery = await deliverOrderEmail(
        db,
        order,
        request,
        `Update for ${String(order.orderNo)}`,
        "Your order workspace has an update. Open the private link to review the latest messages and documents.",
        "UPDATE",
      );
      await writeAudit(
        db,
        auth.session,
        "commerce.email_resend",
        "onlineOrder",
        input.id,
        { sent: delivery.sent },
      );
      return ok(delivery);
    }

    if (order.version !== input.expectedVersion)
      return fail("This order changed. Reload and try again.", 409);

    if (input.action === "ACCEPT") {
      if (order.status !== "REQUESTED")
        return fail("Only a new request can be accepted.", 409);
      const token = createOrderAccessToken(id);
      const message = orderMessage(
        "SYSTEM",
        "Request accepted. Use this private conversation for the confirmed offer, payment request, documents and shipment updates.",
        { type: "STATUS" },
      );
      const updated = await db.collection("onlineOrders").findOneAndUpdate(
        { _id: id, status: "REQUESTED", version: input.expectedVersion },
        {
          $set: {
            status: "ACCEPTED",
            publicTokenHash: orderAccessHash(token),
            encryptedPublicToken: encryptMemberToken(
              token,
              onlineOrderTokenContext(input.id),
            ),
            acceptedBy: new ObjectId(auth.session.id),
            acceptedByName: auth.session.fullName,
            acceptedAt: now,
            updatedAt: now,
          },
          $push: { messages: message as never },
          $inc: { version: 1, messageCount: 1 },
        },
        { returnDocument: "after" },
      );
      if (!updated)
        return fail("This order changed. Reload and try again.", 409);
      const delivery = await deliverOrderEmail(
        db,
        updated,
        request,
        `Your order request ${String(updated.orderNo)} was accepted`,
        "Your request has been accepted. Continue in the private order chat before making any payment.",
        "ACCEPTED",
      );
      await writeAudit(
        db,
        auth.session,
        "commerce.order_accept",
        "onlineOrder",
        input.id,
        { orderNo: updated.orderNo, emailSent: delivery.sent },
      );
      return ok({
        order: serialise(safeOrder(updated)),
        notification: delivery,
      });
    }

    if (input.action === "REJECT") {
      if (order.status !== "REQUESTED")
        return fail("Only a new request can be rejected.", 409);
      const updated = await db.collection("onlineOrders").findOneAndUpdate(
        { _id: id, status: "REQUESTED", version: input.expectedVersion },
        {
          $set: {
            status: "REJECTED",
            rejectionReason: input.reason,
            rejectedByName: auth.session.fullName,
            rejectedAt: now,
            updatedAt: now,
          },
          $push: {
            messages: orderMessage("SYSTEM", `Request declined: ${input.reason}`, {
              type: "STATUS",
            }) as never,
          },
          $inc: { version: 1, messageCount: 1 },
        },
        { returnDocument: "after" },
      );
      if (!updated)
        return fail("This order changed. Reload and try again.", 409);
      await writeAudit(
        db,
        auth.session,
        "commerce.order_reject",
        "onlineOrder",
        input.id,
        { orderNo: order.orderNo, reason: input.reason },
      );
      const delivery = await deliverOrderEmail(
        db,
        updated,
        request,
        `Update for order request ${updated.orderNo}`,
        `We are unable to continue this order request. Reason: ${input.reason}. No payment was taken. You may visit the online shop to submit a new request if your requirements change.`,
        "REJECTED",
      );
      return ok({
        order: serialise(safeOrder(updated)),
        notification: delivery,
      });
    }

    if (!order.encryptedPublicToken)
      return fail("Accept the order before continuing its workflow.", 409);

    if (input.action === "SEND_OFFER") {
      if (!["ACCEPTED", "QUOTED", "AWAITING_PAYMENT"].includes(order.status))
        return fail("This order cannot receive another offer.", 409);
      const business = normaliseBusinessSettings(
        await db.collection("settings").findOne({ key: "business" }),
      );
      const offer = calculateOnlineOffer(
        order.items,
        input.lines,
        business.currency,
      );
      const liveProducts = await db
        .collection("products")
        .find({ _id: { $in: offer.items.map((item) => item.productId) } })
        .project({ stock: 1, name: 1, active: 1 })
        .toArray();
      const liveById = new Map(
        liveProducts.map((product) => [String(product._id), product]),
      );
      for (const item of offer.items) {
        const product = liveById.get(String(item.productId));
        if (!product || product.active === false || Number(product.stock || 0) < item.quantity)
          return fail(`${item.name} no longer has enough available stock.`, 409);
      }
      const updated = await db.collection("onlineOrders").findOneAndUpdate(
        { _id: id, version: input.expectedVersion },
        {
          $set: {
            status: "QUOTED",
            offer,
            subtotal: offer.subtotal,
            discount: offer.discount,
            total: offer.total,
            offerNote: input.note,
            offeredByName: auth.session.fullName,
            offeredAt: now,
            updatedAt: now,
          },
          $push: {
            messages: orderMessage(
              "SYSTEM",
              `Offer prepared: ${business.currency} ${offer.total.toFixed(2)}${input.note ? ` · ${input.note}` : ""}`,
              { type: "OFFER" },
            ) as never,
          },
          $inc: { version: 1, messageCount: 1 },
        },
        { returnDocument: "after" },
      );
      if (!updated)
        return fail("This order changed. Reload and try again.", 409);
      await writeAudit(
        db,
        auth.session,
        "commerce.offer_send",
        "onlineOrder",
        input.id,
        { orderNo: order.orderNo, total: offer.total, discount: offer.discount },
      );
      const delivery = await deliverOrderEmail(
        db,
        updated,
        request,
        `Your offer for ${String(updated.orderNo)} is ready`,
        `We prepared a reviewed offer for ${business.currency} ${offer.total.toFixed(2)}. Open the private order chat to review the items, discount and notes before payment.`,
        "OFFER",
      );
      return ok({ order: serialise(safeOrder(updated)), notification: delivery });
    }

    if (input.action === "REQUEST_PAYMENT") {
      if (!["QUOTED", "AWAITING_PAYMENT"].includes(order.status))
        return fail("Send a reviewed offer before requesting payment.", 409);
      const paymentRequest = {
        methodName: input.methodName,
        instructions: input.instructions,
        paymentUrl: input.paymentUrl,
        amount: Number(order.total),
        currency: String(order.currency),
        requestedAt: now,
        requestedByName: auth.session.fullName,
        status: "AWAITING_EXTERNAL_CONFIRMATION",
      };
      const updated = await db.collection("onlineOrders").findOneAndUpdate(
        { _id: id, version: input.expectedVersion },
        {
          $set: {
            status: "AWAITING_PAYMENT",
            paymentRequest,
            updatedAt: now,
          },
          $push: {
            messages: orderMessage(
              "SYSTEM",
              `Payment request sent for ${String(order.currency)} ${Number(order.total).toFixed(2)} via ${input.methodName}. Settlement is confirmed only after an official receipt or paid invoice is linked.`,
              { type: "PAYMENT_REQUEST" },
            ) as never,
          },
          $inc: { version: 1, messageCount: 1 },
        },
        { returnDocument: "after" },
      );
      if (!updated)
        return fail("This order changed. Reload and try again.", 409);
      const delivery = await deliverOrderEmail(
        db,
        updated,
        request,
        `Payment request for ${String(updated.orderNo)}`,
        `A payment request for ${String(updated.currency)} ${Number(updated.total).toFixed(2)} is available in your private order chat.`,
        "PAYMENT",
      );
      await writeAudit(
        db,
        auth.session,
        "commerce.payment_request",
        "onlineOrder",
        input.id,
        { orderNo: order.orderNo, amount: order.total, emailSent: delivery.sent },
      );
      return ok({
        order: serialise(safeOrder(updated)),
        notification: delivery,
      });
    }

    if (input.action === "LINK_INVOICE") {
      const invoice = await db.collection("invoices").findOne({
        _id: new ObjectId(input.invoiceId),
        status: { $ne: "VOID" },
      });
      if (!invoice) return fail("Choose an available invoice.", 404);
      if (
        String(invoice.customerEmail || "").toLowerCase() !==
        String(order.customer.email).toLowerCase()
      )
        return fail("The invoice customer email must match this order.", 409);
      const linkedInvoice = {
        id: invoice._id,
        invoiceNo: invoice.invoiceNo,
        status: invoice.status,
        total: invoice.total,
        paidAmount: Number(invoice.paidAmount || 0),
        dueDate: invoice.dueDate,
      };
      const updated = await db.collection("onlineOrders").findOneAndUpdate(
        { _id: id, version: input.expectedVersion },
        {
          $set: { linkedInvoice, updatedAt: now },
          $push: {
            messages: orderMessage(
              "SYSTEM",
              `Invoice ${String(invoice.invoiceNo)} was added to this order.`,
              { type: "INVOICE" },
            ) as never,
          },
          $inc: { version: 1, messageCount: 1 },
        },
        { returnDocument: "after" },
      );
      if (!updated)
        return fail("This order changed. Reload and try again.", 409);
      await writeAudit(
        db,
        auth.session,
        "commerce.invoice_link",
        "onlineOrder",
        input.id,
        { invoiceId: input.invoiceId, invoiceNo: invoice.invoiceNo },
      );
      const delivery = await deliverOrderEmail(
        db,
        updated,
        request,
        `Invoice for ${String(updated.orderNo)}`,
        `Invoice ${String(invoice.invoiceNo)} is now available in your private order chat.`,
        "INVOICE",
      );
      return ok({
        order: serialise(safeOrder(updated)),
        notification: delivery,
      });
    }

    if (input.action === "LINK_RECEIPT") {
      const sale = await db.collection("sales").findOne({
        _id: new ObjectId(input.saleId),
        status: "COMPLETED",
      });
      if (!sale) return fail("Choose a completed receipt.", 404);
      if (Math.abs(Number(sale.total) - Number(order.total)) > 0.000001)
        return fail("The receipt total must match the accepted order total.", 409);
      const commerce = normaliseCommerceSettings(
        await db.collection("settings").findOne({ key: "commerce" }),
      );
      const linkedReceipt = {
        id: sale._id,
        receiptNo: sale.receiptNo,
        total: sale.total,
        createdAt: sale.createdAt,
        publicUrl: receiptAccessUrl(
          sale,
          resolvePublicOrigin(request, commerce.publicSiteUrl) || request.url,
        ),
      };
      const updated = await db.collection("onlineOrders").findOneAndUpdate(
        { _id: id, version: input.expectedVersion },
        {
          $set: {
            status: "PAID",
            linkedReceipt,
            "paymentRequest.status": "CONFIRMED_BY_RECEIPT",
            paidAt: sale.createdAt || now,
            updatedAt: now,
          },
          $push: {
            messages: orderMessage(
              "SYSTEM",
              `Payment receipt ${String(sale.receiptNo)} was verified and added to this order.`,
              { type: "RECEIPT" },
            ) as never,
          },
          $inc: { version: 1, messageCount: 1 },
        },
        { returnDocument: "after" },
      );
      if (!updated)
        return fail("This order changed. Reload and try again.", 409);
      const delivery = await deliverOrderEmail(
        db,
        updated,
        request,
        `Receipt for ${String(updated.orderNo)}`,
        `Receipt ${String(sale.receiptNo)} is now available with your order and payment is recorded as confirmed.`,
        "RECEIPT",
      );
      await writeAudit(
        db,
        auth.session,
        "commerce.receipt_link",
        "onlineOrder",
        input.id,
        { saleId: input.saleId, receiptNo: sale.receiptNo, emailSent: delivery.sent },
      );
      return ok({
        order: serialise(safeOrder(updated)),
        notification: delivery,
      });
    }

    if (input.action === "UPDATE_SHIPPING") {
      if (["REQUESTED", "REJECTED", "CANCELLED"].includes(order.status))
        return fail("Accept this order before adding shipment details.", 409);
      const carrier = normaliseCarrierSelection(
        input.carrierCode,
        input.carrier,
      );
      if (carrier.carrierCode === "OTHER" && !carrier.carrier)
        return fail("Enter the manual carrier name.", 422);
      const provider = findShippingProvider(carrier.carrierCode);
      const shipping = {
        ...carrier,
        trackingReference: input.trackingReference,
        status: input.status,
        note: input.note,
        trackingUrl: provider.trackingUrl,
        updatedAt: now,
        updatedByName: auth.session.fullName,
      };
      const status =
        input.status === "DELIVERED"
          ? "COMPLETED"
          : input.status === "PREPARING"
            ? "FULFILLING"
            : "SHIPPED";
      const updated = await db.collection("onlineOrders").findOneAndUpdate(
        { _id: id, version: input.expectedVersion },
        {
          $set: {
            status,
            shipping,
            updatedAt: now,
            ...(input.status === "DELIVERED" ? { completedAt: now } : {}),
          },
          $push: {
            messages: orderMessage(
              "SYSTEM",
              `${carrier.carrier} shipment updated to ${input.status.replaceAll("_", " ")}${input.trackingReference ? ` · ${input.trackingReference}` : ""}.`,
              { type: "SHIPPING" },
            ) as never,
          },
          $inc: { version: 1, messageCount: 1 },
        },
        { returnDocument: "after" },
      );
      if (!updated)
        return fail("This order changed. Reload and try again.", 409);
      const delivery = await deliverOrderEmail(
        db,
        updated,
        request,
        `Shipment update for ${String(updated.orderNo)}`,
        `${carrier.carrier} shipment status: ${input.status.replaceAll("_", " ")}${input.trackingReference ? `. Tracking reference: ${input.trackingReference}` : ""}.`,
        "SHIPPING",
      );
      await writeAudit(
        db,
        auth.session,
        "commerce.shipping_update",
        "onlineOrder",
        input.id,
        { ...shipping, emailSent: delivery.sent },
      );
      return ok({
        order: serialise(safeOrder(updated)),
        notification: delivery,
      });
    }

    if (input.action === "ADD_STEP") {
      const step = {
        _id: new ObjectId(),
        label: input.label,
        status: "PENDING",
        createdAt: now,
        createdByName: auth.session.fullName,
      };
      const updated = await db.collection("onlineOrders").findOneAndUpdate(
        {
          _id: id,
          version: input.expectedVersion,
          "steps.19": { $exists: false },
        },
        {
          $push: { steps: step as never },
          $set: { updatedAt: now },
          $inc: { version: 1 },
        },
        { returnDocument: "after" },
      );
      if (!updated)
        return fail("This order changed or already has 20 steps.", 409);
      await writeAudit(
        db,
        auth.session,
        "commerce.step_add",
        "onlineOrder",
        input.id,
        { stepId: step._id.toHexString(), label: step.label },
      );
      return ok(serialise(safeOrder(updated)));
    }

    const steps = (Array.isArray(order.steps) ? order.steps : []).map(
      (step: Record<string, unknown>) =>
        String(step._id) === input.stepId
          ? {
              ...step,
              status: input.status,
              updatedAt: now,
              updatedByName: auth.session.fullName,
            }
          : step,
    );
    if (!steps.some((step: Record<string, unknown>) => String(step._id) === input.stepId))
      return fail("This order step was not found.", 404);
    const updated = await db.collection("onlineOrders").findOneAndUpdate(
      { _id: id, version: input.expectedVersion },
      { $set: { steps, updatedAt: now }, $inc: { version: 1 } },
      { returnDocument: "after" },
    );
    if (!updated) return fail("This order changed. Reload and try again.", 409);
    await writeAudit(
      db,
      auth.session,
      "commerce.step_update",
      "onlineOrder",
      input.id,
      { stepId: input.stepId, status: input.status },
    );
    return ok(serialise(safeOrder(updated)));
  } catch (error) {
    if (error instanceof SyntaxError)
      return fail("The request body must be valid JSON.", 400);
    if (error instanceof Error && /offer|product list/.test(error.message))
      return fail(error.message, 422);
    return publicError(error);
  }
}
