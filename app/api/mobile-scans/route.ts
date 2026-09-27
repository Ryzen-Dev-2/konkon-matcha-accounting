import { ObjectId } from "mongodb";
import { z } from "zod";
import { authorize, blockRestrictedPlatform, created, fail, ok, publicError, sameOrigin } from "@/lib/api";
import { getDb } from "@/lib/db";
import { normaliseScanCode, scannerTokenHash } from "@/lib/scanner";
import { scannerPurposeFilter, scannerPurpose, scannerPermission, SCANNER_PURPOSES, type ScannerPurpose } from "@/lib/scanner-routing";
import { hasPermission } from "@/lib/rbac";
import type { UserRole } from "@/lib/types";
import { memberBindingScanToken, memberScanToken, receiptScanToken } from "@/lib/scan-codes";
import { encryptMemberToken, decryptMemberToken } from "@/lib/member-cards";
import { getSystemControl } from "@/lib/system-control";
import { OwnerRecoveryError, readOwnerRecoveryJson } from "@/lib/owner-recovery";

export const runtime = "nodejs";

const connectSchema = z.object({ token: z.string().min(32).max(128), action: z.literal("CONNECT") });
const scanSchema = z.object({ token: z.string().min(32).max(128), code: z.string().min(1).max(512) });
const purposeSchema = z.enum(SCANNER_PURPOSES);
const consumerIdSchema = z.string().regex(/^[A-Za-z0-9_-]{16,80}$/);
const consumeSchema = z.object({ sessionId: z.string().length(24), consumerId: consumerIdSchema, eventIds: z.array(z.string().length(24)).min(1).max(50) });

async function claimPendingEvents(db: Awaited<ReturnType<typeof getDb>>, scannerSessionId: ObjectId, consumerId: string, purpose: ScannerPurpose, bindingLeaseId?: string) {
  const route = { ...scannerPurposeFilter(purpose), ...(purpose === "MEMBER_BIND" ? { bindingLeaseId: bindingLeaseId || { $exists: false } } : {}) };
  const limit = purpose === "MEMBER_BIND" ? 1 : 50;
  const owned = await db.collection("scannerEvents").find({ scannerSessionId, consumedAt: null, claimedBy: consumerId, ...route }).sort({ createdAt: 1 }).limit(limit).toArray();
  if (owned.length) return owned;
  const claimed = [];
  for (let index = 0; index < limit; index += 1) {
    const now = new Date();
    const event = await db.collection("scannerEvents").findOneAndUpdate(
      { scannerSessionId, consumedAt: null, ...route, $and: [{ $or: [{ claimedBy: { $exists: false } }, { claimExpiresAt: { $lte: now } }] }] },
      { $set: { claimedBy: consumerId, claimedAt: now, claimExpiresAt: new Date(now.getTime() + 30_000) } },
      { sort: { createdAt: 1 }, returnDocument: "after" },
    );
    if (!event) break;
    claimed.push(event);
  }
  return claimed;
}

async function waitForPendingEvents(db: Awaited<ReturnType<typeof getDb>>, scannerSessionId: ObjectId, consumerId: string, purpose: ScannerPurpose, wait: boolean, bindingLeaseId?: string) {
  const startedAt = Date.now();
  do {
    const events = await claimPendingEvents(db, scannerSessionId, consumerId, purpose, bindingLeaseId);
    if (events.length || !wait || Date.now() - startedAt >= 3_000) return { events, waitedMs: Date.now() - startedAt };
    await new Promise((resolve) => setTimeout(resolve, 250));
  } while (true);
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("This request was blocked.", 403);
  try {
    const blocked = await blockRestrictedPlatform();
    if (blocked) return blocked;
    const body = await readOwnerRecoveryJson(request);
    const connectInput = connectSchema.safeParse(body);
    const input = scanSchema.safeParse(body);
    if (!connectInput.success && !input.success) return fail("The scanner request is invalid.", 422);
    const token = connectInput.success ? connectInput.data.token : input.success ? input.data.token : "";
    const db = await getDb();
    const control = await getSystemControl(db);
    if (control.mode !== "OPEN") return fail("The register is not accepting scans right now.", 423);
    const now = new Date();
    const session = await db.collection("scannerSessions").findOne({
      tokenHash: scannerTokenHash(token),
      revokedAt: { $exists: false },
      expiresAt: { $gt: now },
      generation: control.scannerGeneration,
    });
    if (!session) return fail("This scanner link has expired or was revoked.", 410);
    const owner = await db.collection("users").findOne({ _id: session.createdBy, active: true });
    if (!owner || owner.mustChangePassword || !hasPermission(owner.role as UserRole, scannerPermission(scannerPurpose(session.purpose))) || (session.ownerSessionVersion !== undefined && Number(session.ownerSessionVersion || 0) !== Number(owner.sessionVersion || 0))) return fail("This scanner link has expired or was revoked.", 410);
    if (session.purpose === "MEMBER_BIND" && (!ObjectId.isValid(session.bindingMemberId || "") || !await db.collection("members").findOne({ _id: new ObjectId(session.bindingMemberId), active: { $ne: false } }))) return fail("The member for this NFC reader is no longer active.", 410);
    if (connectInput.success) {
      await db.collection("scannerSessions").updateOne({ _id: session._id }, { $set: { connectedAt: now, updatedAt: now } });
      return ok({ connected: true, label: session.label, purpose: session.purpose || "POS", expiresAt: session.expiresAt });
    }
    if (!input.success) return fail("The scanner request is invalid.", 422);
    const code = normaliseScanCode(input.data.code);
    if (!code) return fail("The scanned code is invalid.", 422);
    if (session.purpose === "MEMBER_BIND" && !memberBindingScanToken(code)) return fail("This pass accepts readable NFC fingerprints only. Issued member cards cannot be reassigned here.", 422);
    const recent = await db.collection("scannerEvents").countDocuments({ scannerSessionId: session._id, createdAt: { $gt: new Date(now.getTime() - 60_000) } });
    if (recent >= 120) return fail("This scanner is sending codes too quickly. Wait a moment.", 429);
    const purpose = scannerPurpose(session.purpose);
    const eventId = new ObjectId();
    const protectedCode = Boolean(memberScanToken(code) || memberBindingScanToken(code) || receiptScanToken(code));
    const event = { _id: eventId, scannerSessionId: session._id, purpose, ...(purpose === "MEMBER_BIND" && session.bindingLeaseId ? { bindingLeaseId: session.bindingLeaseId } : {}), ...(protectedCode ? { encryptedCode: encryptMemberToken(code, `scan:${eventId.toHexString()}`) } : { code }), consumedAt: null, expiresAt: session.expiresAt, createdAt: now };
    const result = await db.collection("scannerEvents").insertOne(event);
    await db.collection("scannerSessions").updateOne({ _id: session._id }, { $set: { lastUsedAt: now, updatedAt: now } });
    return created({ eventId: result.insertedId.toHexString(), accepted: true, purpose });
  } catch (error) {
    if (error instanceof OwnerRecoveryError) return fail(error.message, error.status);
    return publicError(error);
  }
}

export async function GET(request: Request) {
  const auth = await authorize("members.read");
  if (auth.error) return auth.error;
  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId") || "";
    const consumerId = url.searchParams.get("consumerId") || "";
    const purpose = purposeSchema.safeParse(url.searchParams.get("purpose") || "POS");
    const wait = url.searchParams.get("wait") === "1";
    if (!ObjectId.isValid(sessionId) || !consumerIdSchema.safeParse(consumerId).success || !purpose.success) return fail("Choose an active scanner link.", 422);
    if (!hasPermission(auth.session.role, scannerPermission(purpose.data))) return fail("You cannot use this scanner destination.", 403);
    const db = await getDb();
    const control = await getSystemControl(db);
    if (control.mode !== "OPEN") return fail("The register is not accepting scans right now.", 423);
    const session = await db.collection("scannerSessions").findOne({
      _id: new ObjectId(sessionId),
      createdBy: new ObjectId(auth.session.id),
      ownerSessionVersion: auth.session.sessionVersion,
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
      generation: control.scannerGeneration,
      ...scannerPurposeFilter(purpose.data),
    });
    if (!session) return fail("The scanner link is no longer active.", 410);
    if (purpose.data === "MEMBER_BIND" && session.bindingMemberId !== url.searchParams.get("memberId")) return fail("This NFC reader belongs to another member.", 409);
    if (purpose.data === "MEMBER_BIND" && session.bindingLeaseId && session.bindingLeaseId !== url.searchParams.get("bindingLeaseId")) return fail("This card binding has changed. Reload the reader.", 409);
    const { events, waitedMs } = await waitForPendingEvents(db, session._id, consumerId, purpose.data, wait, session.bindingLeaseId);
    if (purpose.data === "MEMBER_BIND" && !await db.collection("scannerSessions").findOne({ _id: session._id, purpose: "MEMBER_BIND", bindingMemberId: session.bindingMemberId, bindingLeaseId: session.bindingLeaseId || { $exists: false }, revokedAt: { $exists: false } })) return fail("This card binding has changed. Reload the reader.", 409);
    const response = ok(events.map((event) => ({ _id: event._id.toHexString(), code: event.encryptedCode ? decryptMemberToken(event.encryptedCode, `scan:${event._id.toHexString()}`) : event.code, createdAt: event.createdAt })));
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("X-Scanner-Wait-Ms", String(waitedMs));
    return response;
  } catch (error) {
    return publicError(error);
  }
}

export async function PATCH(request: Request) {
  const auth = await authorize("members.read");
  if (auth.error) return auth.error;
  if (!sameOrigin(request)) return fail("This request was blocked.", 403);
  try {
    const input = consumeSchema.safeParse(await readOwnerRecoveryJson(request));
    if (!input.success || !ObjectId.isValid(input.data?.sessionId || "") || input.data.eventIds.some((id) => !ObjectId.isValid(id))) return fail("Check the scan acknowledgements.", 422);
    const db = await getDb();
    const session = await db.collection("scannerSessions").findOne({ _id: new ObjectId(input.data.sessionId), createdBy: new ObjectId(auth.session.id) });
    if (!session) return fail("The scanner link could not be found.", 404);
    const result = await db.collection("scannerEvents").updateMany(
      { _id: { $in: input.data.eventIds.map((id) => new ObjectId(id)) }, scannerSessionId: session._id, consumedAt: null, claimedBy: input.data.consumerId },
      { $set: { consumedAt: new Date(), consumedBy: new ObjectId(auth.session.id) }, $min: { expiresAt: new Date(Date.now() + 60_000) }, $unset: { encryptedCode: "", code: "" } },
    );
    return ok({ consumed: result.modifiedCount });
  } catch (error) {
    if (error instanceof OwnerRecoveryError) return fail(error.message, error.status);
    return publicError(error);
  }
}
