import { decryptMemberToken, encryptMemberToken } from "@/lib/member-cards";
import { assessInstanceRisk, enrollmentSchema, isPlatformAuthority, latestRelease, normaliseOrigin, observedNetworkAddress, platformActionSchema, platformInstanceSecretFingerprint, platformServiceDeleteSchema, secretsMatch, PLATFORM_DISCLOSURE_VERSION, PLATFORM_TERMS_VERSION } from "@/lib/platform-trust";
import { authorize, created, fail, ok, publicError, sameOrigin } from "@/lib/api";
import { getDb, getMongoClient } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { serialise } from "@/lib/format";

export const runtime = "nodejs";
export const maxDuration = 30;

function secretContext(instanceId: string) {
  return `platform-instance:${instanceId}:v1`;
}

export async function GET(request: Request) {
  if (!isPlatformAuthority(request)) return fail("This deployment is not the platform authority.", 404);
  const auth = await authorize("owner.control", { allowReadOnlyWrite: true });
  if (auth.error) return auth.error;
  try {
    const db = await getDb();
    const [instances, rawReports] = await Promise.all([
      db.collection("platformInstances").find({}, { projection: { encryptedSecret: 0 } }).sort({ createdAt: -1 }).limit(200).toArray(),
      db.collection("platformReports").find({}).sort({ createdAt: -1 }).limit(500).toArray(),
    ]);
    const release = latestRelease();
    const safeInstances = instances.map((instance) => {
      const linked = rawReports.filter((report) => String(report.instanceId || "") === String(instance._id) || String(report.domain || "") === String(instance.domain || ""));
      const open = linked.filter((report) => ["OPEN", "IN_REVIEW"].includes(String(report.status)));
      const substantiated = linked.filter((report) => String(report.status) === "SUBSTANTIATED");
      const distinctReporters = new Set([...open, ...substantiated].map((report) => String(report.reporterKey || report._id))).size;
      return {
        ...instance,
        risk: assessInstanceRisk({
          status: String(instance.status) as never,
          openReports: open.length,
          substantiatedReports: substantiated.length,
          distinctReporters,
          releaseSha: String(instance.releaseSha || "unknown"),
          latestReleaseSha: release.sha,
          lastSeenAt: instance.lastSeenAt instanceof Date ? instance.lastSeenAt : null,
        }),
        reportCount: linked.length,
        openReportCount: open.length,
      };
    });
    const reports = rawReports.map((report) => ({
      _id: report._id,
      reportNo: report.reportNo,
      instanceId: report.instanceId,
      domain: report.domain,
      category: report.category,
      summary: report.summary,
      details: report.details,
      orderReference: report.orderReference,
      evidenceUrls: report.evidenceUrls,
      reporterEmailHint: report.reporterEmailHint,
      status: report.status,
      reviewNote: report.reviewNote,
      version: report.version,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    }));
    return ok(serialise({ instances: safeInstances, reports, release }));
  } catch (error) {
    return publicError(error);
  }
}

export async function POST(request: Request) {
  if (!isPlatformAuthority(request)) return fail("This deployment is not the platform authority.", 404);
  try {
    let body: unknown;
    try { body = await request.json(); } catch { return fail("The request body must be valid JSON.", 400); }
    const input = enrollmentSchema.safeParse(body);
    if (!input.success) return fail("Check the managed-instance application.", 422, input.error.flatten().fieldErrors);
    const domain = normaliseOrigin(input.data.domain);
    if (!domain) return fail("Use a public HTTPS deployment origin without a path or credentials.", 422);
    const db = await getDb();
    const sourceIp = observedNetworkAddress(request);
    const now = new Date();
    const existingByDomain = await db.collection("platformInstances").findOne({ domain, _id: { $ne: input.data.instanceId } } as never);
    if (existingByDomain) return fail("This deployment domain already belongs to another managed-instance application.", 409);
    const existing = await db.collection("platformInstances").findOne({ _id: input.data.instanceId as never });
    if (existing) {
      const storedSecret = existing.encryptedSecret
        ? decryptMemberToken(String(existing.encryptedSecret), secretContext(input.data.instanceId))
        : "";
      if (String(existing.domain || "") === domain && storedSecret && secretsMatch(storedSecret, input.data.instanceSecret)) {
        return created({ instanceId: input.data.instanceId, status: existing.status, version: existing.version });
      }
      return fail("This managed-instance identifier already exists.", 409);
    }
    const deleted = await db.collection("platformDeletedInstances").findOne({ _id: input.data.instanceId as never });
    if (deleted && (String(deleted.domain || "") !== domain
      || String(deleted.secretFingerprint || "") !== platformInstanceSecretFingerprint(input.data.instanceId, input.data.instanceSecret))) {
      return fail("This deleted managed service can be resubmitted only by its original deployment.", 409);
    }
    const instance = {
      _id: input.data.instanceId,
      domain,
      businessLabel: input.data.businessLabel,
      provider: input.data.provider,
      releaseSha: input.data.releaseSha || "unknown",
      appVersion: input.data.appVersion || "unknown",
      termsVersion: input.data.termsVersion,
      disclosureVersion: input.data.disclosureVersion,
      termsAcceptedAt: now,
      encryptedSecret: encryptMemberToken(input.data.instanceSecret, secretContext(input.data.instanceId)),
      secretLast4: input.data.instanceSecret.slice(-4),
      sourceIp,
      sourceIpNotice: "Observed server connection address; it may be a shared proxy or hosting egress address.",
      status: "PENDING",
      statusReason: "Awaiting platform Owner review.",
      version: 1,
      lastSeenAt: now,
      lastSeenIp: sourceIp,
      createdAt: now,
      updatedAt: now,
      history: [{ action: "APPLIED", reason: "Terms and limited metadata disclosure accepted by the instance Owner.", at: now, actor: "INSTANCE_OWNER" }],
    };
    await db.collection("platformInstances").insertOne(instance as never);
    return created({ instanceId: input.data.instanceId, status: "PENDING", version: 1 });
  } catch (error) {
    return publicError(error);
  }
}

export async function PATCH(request: Request) {
  if (!isPlatformAuthority(request)) return fail("This deployment is not the platform authority.", 404);
  const auth = await authorize("owner.control", { allowReadOnlyWrite: true });
  if (auth.error) return auth.error;
  if (!sameOrigin(request)) return fail("This request was blocked.", 403);
  try {
    const input = platformActionSchema.safeParse(await request.json());
    if (!input.success) return fail("Check the review action.", 422, input.error.flatten().fieldErrors);
    const db = await getDb();
    const instance = await db.collection("platformInstances").findOne({ _id: input.data.instanceId as never });
    if (!instance) return fail("Managed instance not found.", 404);
    const status = String(instance.status);
    if (input.data.action === "REVOKE_CONSENT"
      && (String(instance.termsVersion || "") !== PLATFORM_TERMS_VERSION || String(instance.disclosureVersion || "") !== PLATFORM_DISCLOSURE_VERSION)) {
      return fail("This deployment already requires renewed Owner consent.", 409);
    }
    const allowed: Record<string, string[]> = {
      APPROVE: ["PENDING", "REJECTED"],
      SUSPEND: ["ACTIVE", "APPEAL"],
      REOPEN: ["SUSPENDED", "APPEAL"],
      REJECT: ["PENDING"],
      REVOKE_CONSENT: ["PENDING", "ACTIVE", "SUSPENDED", "APPEAL", "REJECTED"],
    };
    if (!allowed[input.data.action].includes(status)) return fail(`This action is not available while the instance is ${status}.`, 409);
    const nextStatus = input.data.action === "REVOKE_CONSENT"
      ? status
      : { APPROVE: "ACTIVE", SUSPEND: "SUSPENDED", REOPEN: "ACTIVE", REJECT: "REJECTED" }[input.data.action];
    const reason = input.data.reason || (input.data.action === "APPROVE" ? "Managed instance approved." : "Suspension lifted after review.");
    const now = new Date();
    const fields = {
      status: nextStatus,
      statusReason: input.data.action === "REVOKE_CONSENT" ? String(instance.statusReason || "") : reason,
      updatedAt: now,
      reviewedAt: now,
      reviewedBy: auth.session.id,
      ...(input.data.action === "REVOKE_CONSENT" ? {
        termsVersion: "REVOKED",
        disclosureVersion: "REVOKED",
        consentRevokedAt: now,
        consentRevokedBy: auth.session.id,
        consentRevokedReason: reason,
      } : {}),
    };
    const update = await db.collection("platformInstances").updateOne(
      { _id: input.data.instanceId as never, version: input.data.version },
      {
        $set: fields,
        $inc: { version: 1 },
        $push: { history: { $each: [{ action: input.data.action, reason, at: now, actor: auth.session.fullName }], $slice: -100 } } as never,
      },
    );
    if (!update.modifiedCount) return fail("This record changed while you were reviewing it. Refresh and try again.", 409);
    await writeAudit(db, auth.session, `platform.instance_${input.data.action.toLowerCase()}`, "platformInstance", input.data.instanceId, { from: status, to: nextStatus, reason });
    return ok({ instanceId: input.data.instanceId, status: nextStatus, consentRequired: input.data.action === "REVOKE_CONSENT", reason, version: input.data.version + 1 });
  } catch (error) {
    return publicError(error);
  }
}

export async function DELETE(request: Request) {
  if (!isPlatformAuthority(request)) return fail("This deployment is not the platform authority.", 404);
  const auth = await authorize("owner.control", { allowReadOnlyWrite: true });
  if (auth.error) return auth.error;
  if (!sameOrigin(request)) return fail("This request was blocked.", 403);
  try {
    let body: unknown;
    try { body = await request.json(); } catch { return fail("The request body must be valid JSON.", 400); }
    const input = platformServiceDeleteSchema.safeParse(body);
    if (!input.success) return fail("Check the managed-service deletion details.", 422, input.error.flatten().fieldErrors);
    const db = await getDb();
    const instance = await db.collection("platformInstances").findOne({ _id: input.data.instanceId as never });
    if (!instance) return fail("Managed instance not found.", 404);
    if (input.data.confirmation.toLowerCase() !== String(instance.domain || "").toLowerCase()) {
      return fail("Type the deployment domain exactly to confirm deletion.", 422, { confirmation: ["The domain does not match this managed service."] });
    }
    const now = new Date();
    const instanceSecret = instance.encryptedSecret
      ? decryptMemberToken(String(instance.encryptedSecret), secretContext(input.data.instanceId))
      : "";
    if (!instanceSecret) return fail("This managed service cannot be safely deleted because its credential is unavailable.", 409);
    const client = await getMongoClient();
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        await db.collection("platformDeletedInstances").replaceOne(
          { _id: input.data.instanceId as never },
          {
            _id: input.data.instanceId,
            domain: String(instance.domain || ""),
            businessLabel: String(instance.businessLabel || ""),
            priorStatus: String(instance.status || "PENDING"),
            priorVersion: Number(instance.version || 1),
            secretFingerprint: platformInstanceSecretFingerprint(input.data.instanceId, instanceSecret),
            deletedReason: input.data.reason,
            deletedAt: now,
            deletedBy: auth.session.id,
          } as never,
          { upsert: true, session },
        );
        const removed = await db.collection("platformInstances").deleteOne(
          { _id: input.data.instanceId as never, version: input.data.version },
          { session },
        );
        if (!removed.deletedCount) throw new Error("MANAGED_INSTANCE_VERSION_CONFLICT");
        await writeAudit(db, auth.session, "platform.instance_deleted", "platformInstance", input.data.instanceId, {
          domain: String(instance.domain || ""), priorStatus: String(instance.status || ""), reason: input.data.reason,
        }, session);
      });
    } catch (error) {
      if (error instanceof Error && error.message === "MANAGED_INSTANCE_VERSION_CONFLICT") {
        return fail("This record changed while you were deleting it. Refresh and try again.", 409);
      }
      throw error;
    } finally {
      await session.endSession();
    }
    return ok({ deleted: true, instanceId: input.data.instanceId, message: "The managed service was removed. Its deployment is locked and must submit fresh Owner consent before it can return." });
  } catch (error) {
    return publicError(error);
  }
}
