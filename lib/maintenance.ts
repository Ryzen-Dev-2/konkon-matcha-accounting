import { type Db, type ObjectId } from "mongodb";
import { EXPIRING_AUDIT_ACTIONS, auditExpiry } from "./data-retention";
import { clearArchivedMember, clearArchivedUser } from "./record-deletion";
import { packDocument, unpackDocument } from "./document-storage";
import { normaliseCommerceSettings, orderMessage } from "./online-orders";
import { deliverOrderEmail } from "./order-email";

// Only temporary records are eligible for physical deletion. No ledger,
// sale/refund/payment evidence, stock movement or settings history is listed.
const expiringCollections = {
  scannerEvents: "expiresAt", scannerSessions: "expiresAt", paymentDisplaySessions: "expiresAt",
  authThrottle: "expiresAt", sensitiveLookupEvents: "expiresAt", localPaymentEvents: "expireAt",
  paymentWebhookEvents: "createdAt", auditLogs: "expiresAt", memberCards: "deletedAt",
  onlineOrderThrottle: "expiresAt",
  notificationWebhookEvents: "expiresAt",
} as const;

async function clearOnlineOrderPersonalData(db: Db, order: { _id: ObjectId }, now: Date, label: string) {
  const redacted = await db.collection("onlineOrders").updateOne(
    { _id: order._id, personalDataClearedAt: { $exists: false } },
    {
      $set: {
        customer: { name: label, email: "", phone: "", address: "" },
        note: "",
        sensitiveAnswers: [],
        steps: [],
        messages: [orderMessage("SYSTEM", "Customer contact details, attachments and conversation were cleared under the online-order retention policy.")],
        messageCount: 1,
        attachmentCount: 0,
        personalDataClearedAt: now,
        updatedAt: now,
      },
      $unset: {
        publicTokenHash: "",
        encryptedPublicToken: "",
        lastEmailError: "",
        rejectionReason: "",
        offerNote: "",
        paymentRequest: "",
        "shipping.note": "",
        "shipping.trackingReference": "",
      },
    },
    { maxTimeMS: 2500 },
  );
  if (!redacted.modifiedCount) return false;
  await db.collection("onlineOrderAttachments").updateMany(
    { orderId: order._id, status: "ACTIVE" },
    { $set: { status: "ORPHANED", expiresAt: now } },
    { maxTimeMS: 2500 },
  );
  return true;
}

export async function maintainData(db: Db, dryRun = true, now = new Date()) {
  const deadline = Date.now() + 20_000;
  const summary = { dryRun, expiredRecords: 0, clearedProfiles: 0, remindedOnlineOrders: 0, clearedOnlineOrders: 0, expiringLogs: 0, packedDocuments: 0, savedBytes: 0, invalidDocuments: 0, budgetReached: false };
  for (const [name, field] of Object.entries(expiringCollections)) {
    if (Date.now() >= deadline) { summary.budgetReached = true; return summary; }
    const days = name === "memberCards" ? 90 : name === "paymentWebhookEvents" ? 30 : 0;
    const cutoff = new Date(now.getTime() - days * 86_400_000);
    const filter = { [field]: { $type: "date", $lte: cutoff }, ...(name === "memberCards" ? { status: "DELETED" } : name === "auditLogs" ? { action: { $in: EXPIRING_AUDIT_ACTIONS } } : {}) };
    const rows = await db.collection(name).find(filter, { projection: { _id: 1 }, maxTimeMS: 2500 }).limit(100).toArray();
    summary.expiredRecords += dryRun ? rows.length : rows.length ? (await db.collection(name).deleteMany({ ...filter, _id: { $in: rows.map(row => row._id) } }, { maxTimeMS: 2500 })).deletedCount : 0;
  }
  for (const name of ["members", "users"] as const) {
    const rows = await db.collection(name).find({ active: false, archivedAt: { $exists: true }, personalDataClearedAt: { $exists: false }, ...(name === "users" ? { role: { $ne: "OWNER" } } : {}) }, { projection: { _id: 1 }, maxTimeMS: 2500 }).limit(25).toArray();
    for (const row of rows) {
      if (Date.now() >= deadline) { summary.budgetReached = true; return summary; }
      if (dryRun || await (name === "members" ? clearArchivedMember(db, row._id, now) : clearArchivedUser(db, row._id, now))) summary.clearedProfiles++;
    }
  }
  if (Date.now() < deadline) {
    const commerce = normaliseCommerceSettings(
      await db.collection("settings").findOne({ key: "commerce" }),
    );
    const cutoff = new Date(
      now.getTime() - commerce.abandonedRetentionDays * 86_400_000,
    );
    const abandoned = await db
      .collection("onlineOrders")
      .find(
        {
          status: { $in: ["REQUESTED", "REJECTED", "CANCELLED"] },
          updatedAt: { $type: "date", $lte: cutoff },
          personalDataClearedAt: { $exists: false },
          linkedInvoice: { $exists: false },
          linkedReceipt: { $exists: false },
        },
        { projection: { _id: 1 }, maxTimeMS: 2500 },
      )
      .limit(25)
      .toArray();
    for (const order of abandoned) {
      if (Date.now() >= deadline) {
        summary.budgetReached = true;
        return summary;
      }
      if (!dryRun && !await clearOnlineOrderPersonalData(db, order, now, "Expired customer request")) continue;
      summary.clearedOnlineOrders++;
    }
    if (commerce.completedRetentionEnabled && Date.now() < deadline) {
      const reminderCutoff = new Date(now.getTime() - (commerce.completedRetentionDays - commerce.retentionReminderDays) * 86_400_000);
      const reminders = await db.collection("onlineOrders").find({
        status: "COMPLETED",
        personalDataClearedAt: { $exists: false },
        retentionReminderSentAt: { $exists: false },
        $or: [
          { completedAt: { $type: "date", $lte: reminderCutoff } },
          { completedAt: { $exists: false }, updatedAt: { $type: "date", $lte: reminderCutoff } },
        ],
      }, { maxTimeMS: 2500 }).sort({ completedAt: 1, updatedAt: 1 }).limit(3).toArray();
      if (dryRun) {
        summary.remindedOnlineOrders += reminders.length;
      } else {
        const reminded = await Promise.all(reminders.map(async (order) => {
          try {
            const anchor = order.completedAt instanceof Date ? order.completedAt : order.updatedAt instanceof Date ? order.updatedAt : now;
            const policyDate = anchor.getTime() + commerce.completedRetentionDays * 86_400_000;
            const cleanupAt = new Date(Math.max(policyDate, now.getTime() + commerce.retentionReminderDays * 86_400_000));
            const delivery = await deliverOrderEmail(
              db,
              order,
              undefined,
              `Your completed order workspace closes on ${cleanupAt.toISOString().slice(0, 10)}`,
              `Your delivery is complete. On ${cleanupAt.toISOString().slice(0, 10)}, we will remove the private chat, contact details and uploaded chat files to protect your privacy and control storage. Required accounting documents and audit evidence will remain protected.`,
              "RETENTION",
            );
            if (!delivery.sent) return false;
            const updated = await db.collection("onlineOrders").updateOne(
              { _id: order._id, retentionReminderSentAt: { $exists: false } },
              { $set: { retentionReminderSentAt: now, scheduledCleanupAt: cleanupAt } },
              { maxTimeMS: 2500 },
            );
            return updated.modifiedCount > 0;
          } catch {
            return false;
          }
        }));
        summary.remindedOnlineOrders += reminded.filter(Boolean).length;
      }
      if (Date.now() >= deadline) { summary.budgetReached = true; return summary; }
      const completed = await db.collection("onlineOrders").find({
        status: "COMPLETED",
        scheduledCleanupAt: { $type: "date", $lte: now },
        retentionReminderSentAt: { $type: "date" },
        personalDataClearedAt: { $exists: false },
      }, { projection: { _id: 1 }, maxTimeMS: 2500 }).limit(25).toArray();
      for (const order of completed) {
        if (Date.now() >= deadline) { summary.budgetReached = true; return summary; }
        if (!dryRun && !await clearOnlineOrderPersonalData(db, order, now, "Completed online order")) continue;
        summary.clearedOnlineOrders++;
      }
    }
  }
  const logs = await db.collection("auditLogs").find({ action: { $in: EXPIRING_AUDIT_ACTIONS }, expiresAt: { $exists: false }, createdAt: { $type: "date" } }, { projection: { action: 1, createdAt: 1 }, maxTimeMS: 2500 }).limit(100).toArray();
  for (const log of logs) {
    if (Date.now() >= deadline) { summary.budgetReached = true; return summary; }
    if (!dryRun) await db.collection("auditLogs").updateOne({ _id: log._id, action: log.action, expiresAt: { $exists: false } }, { $set: { expiresAt: auditExpiry(log.action, log.createdAt) } });
    summary.expiringLogs++;
  }
  const documents = await db.collection("eInvoices").find({ contentEncoding: { $exists: false } }, { projection: { encryptedContent: 1, sha256: 1 }, maxTimeMS: 2500 }).limit(25).toArray();
  for (const document of documents) {
    if (Date.now() >= deadline) { summary.budgetReached = true; return summary; }
    let packed: ReturnType<typeof packDocument>;
    try {
      const context = `einvoice:${document._id.toHexString()}`;
      const content = unpackDocument({ encryptedContent: document.encryptedContent, sha256: document.sha256 }, context);
      packed = packDocument(content, context);
      // Verify the exact original bytes/hash before replacing encrypted storage.
      if (unpackDocument({ ...packed, sha256: document.sha256 }, context) !== content) throw new Error("Round-trip mismatch");
    } catch { summary.invalidDocuments++; continue; }
    const saved = Buffer.byteLength(document.encryptedContent) - Buffer.byteLength(packed.encryptedContent);
    const changed = dryRun || (await db.collection("eInvoices").updateOne({ _id: document._id, encryptedContent: document.encryptedContent, contentEncoding: { $exists: false } }, { $set: packed }, { maxTimeMS: 2500 })).matchedCount;
    if (changed) { summary.packedDocuments++; summary.savedBytes += Math.max(0, saved); }
  }
  return summary;
}
