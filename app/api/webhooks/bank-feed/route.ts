import { ObjectId } from "mongodb";
import { createHash } from "node:crypto";
import { blockRestrictedPlatform, fail, ok, publicError } from "@/lib/api";
import {
  bankFeedPayloadSchema,
  normaliseBankFeedEvent,
  verifyBankFeedSignature,
} from "@/lib/bank-connections";
import { getDb } from "@/lib/db";
import { decryptMemberToken } from "@/lib/member-cards";

export const runtime = "nodejs";
export const maxDuration = 30;
const secretContext = (id: string) => `bank-feed:${id}:webhook-secret:v1`;

export async function POST(request: Request) {
  try {
    const blocked = await blockRestrictedPlatform();
    if (blocked) return blocked;
    const connectionId = request.headers.get("x-konkon-bank-connection") || "";
    const timestamp = request.headers.get("x-konkon-bank-timestamp") || "";
    const signature = request.headers.get("x-konkon-bank-signature") || "";
    if (!ObjectId.isValid(connectionId))
      return fail("The bank connection reference is invalid.", 401);
    if (Number(request.headers.get("content-length") || 0) > 262_144)
      return fail("The bank feed payload is too large.", 413);
    const raw = await request.text();
    if (!raw || Buffer.byteLength(raw) > 262_144)
      return fail("The bank feed payload is invalid.", 413);
    const db = await getDb();
    const connection = await db
      .collection("bankConnections")
      .findOne({ _id: new ObjectId(connectionId), active: true });
    if (!connection?.encryptedWebhookSecret)
      return fail("The bank connection is unavailable.", 401);
    const secret = decryptMemberToken(
      String(connection.encryptedWebhookSecret),
      secretContext(connectionId),
    );
    if (!verifyBankFeedSignature(secret, timestamp, raw, signature))
      return fail("The bank feed signature is invalid or expired.", 401);
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return fail("The bank feed body must be valid JSON.", 400);
    }
    const parsed = bankFeedPayloadSchema.safeParse(json);
    if (!parsed.success)
      return fail(
        "Check the bank feed events.",
        422,
        parsed.error.flatten().fieldErrors,
      );
    let events;
    try {
      events = parsed.data.events.map((event) =>
        normaliseBankFeedEvent(event, String(connection.currency)),
      );
    } catch (error) {
      return fail(
        error instanceof Error ? error.message : "Check the bank feed amounts.",
        422,
      );
    }
    const receivedAt = new Date();
    const writes = events.map((event) => {
      const _id = new ObjectId(
        createHash("sha256")
          .update(`${connectionId}:${event.eventId}`)
          .digest("hex")
          .slice(0, 24),
      );
      return {
        updateOne: {
          filter: { _id },
          update: {
            $setOnInsert: {
              _id,
              ...event,
              connectionId: connection._id,
              connectionName: connection.name,
              provider: connection.provider,
              accountCode: connection.accountCode,
              accountName: connection.accountName,
              status: "UNREVIEWED",
              receivedAt,
            },
          },
          upsert: true,
        },
      };
    });
    const result = await db
      .collection("bankFeedTransactions")
      .bulkWrite(writes, { ordered: false });
    await db.collection("bankConnections").updateOne(
      { _id: connection._id },
      {
        $set: {
          status: "CONNECTED",
          lastReceivedAt: receivedAt,
          updatedAt: receivedAt,
        },
        $inc: { receivedEventCount: result.upsertedCount },
      },
    );
    return ok(
      {
        accepted: events.length,
        inserted: result.upsertedCount,
        duplicates: events.length - result.upsertedCount,
      },
      { status: 202 },
    );
  } catch (error) {
    return publicError(error);
  }
}
