import { encryptMemberToken } from "@/lib/member-cards";
import { assessInstanceRisk, enrollmentSchema, isPlatformAuthority, latestRelease, normaliseOrigin, observedNetworkAddress, platformActionSchema } from "@/lib/platform-trust";
import { authorize, created, fail, ok, publicError, sameOrigin } from "@/lib/api";
import { getDb } from "@/lib/db";
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
    if (existing) return fail("This managed-instance identifier already exists.", 409);
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
    const allowed: Record<string, string[]> = {
      APPROVE: ["PENDING", "REJECTED"],
      SUSPEND: ["ACTIVE", "APPEAL"],
      REOPEN: ["SUSPENDED", "APPEAL"],
      REJECT: ["PENDING"],
    };
    if (!allowed[input.data.action].includes(status)) return fail(`This action is not available while the instance is ${status}.`, 409);
    const nextStatus = { APPROVE: "ACTIVE", SUSPEND: "SUSPENDED", REOPEN: "ACTIVE", REJECT: "REJECTED" }[input.data.action];
    const reason = input.data.reason || (input.data.action === "APPROVE" ? "Managed instance approved." : "Suspension lifted after review.");
    const now = new Date();
    const update = await db.collection("platformInstances").updateOne(
      { _id: input.data.instanceId as never, version: input.data.version },
      {
        $set: { status: nextStatus, statusReason: reason, updatedAt: now, reviewedAt: now, reviewedBy: auth.session.id },
        $inc: { version: 1 },
        $push: { history: { $each: [{ action: input.data.action, reason, at: now, actor: auth.session.fullName }], $slice: -100 } } as never,
      },
    );
    if (!update.modifiedCount) return fail("This record changed while you were reviewing it. Refresh and try again.", 409);
    await writeAudit(db, auth.session, `platform.instance_${input.data.action.toLowerCase()}`, "platformInstance", input.data.instanceId, { from: status, to: nextStatus, reason });
    return ok({ instanceId: input.data.instanceId, status: nextStatus, reason, version: input.data.version + 1 });
  } catch (error) {
    return publicError(error);
  }
}
