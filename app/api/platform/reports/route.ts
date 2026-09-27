import { z } from "zod";
import { authorize, created, fail, ok, publicError, sameOrigin } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { encryptMemberToken } from "@/lib/member-cards";
import { isPlatformAuthority, normaliseOrigin, publicReportNumber, publicReportSchema, reporterFingerprint } from "@/lib/platform-trust";

export const runtime = "nodejs";

const reviewSchema = z.object({
  reportId: z.string().uuid(),
  status: z.enum(["IN_REVIEW", "SUBSTANTIATED", "DISMISSED"]),
  note: z.string().trim().min(10).max(1000),
  version: z.coerce.number().int().positive(),
}).strict();

export async function POST(request: Request) {
  if (!isPlatformAuthority(request)) return fail("Open the platform authority reporting page to submit a report.", 404);
  try {
    let body: unknown;
    try { body = await request.json(); } catch { return fail("The request body must be valid JSON.", 400); }
    const input = publicReportSchema.safeParse(body);
    if (!input.success) return fail("Check the report details.", 422, input.error.flatten().fieldErrors);
    const domain = normaliseOrigin(input.data.domain);
    if (!domain) return fail("Enter the exact HTTPS origin of the store you used.", 422);
    if (input.data.evidenceUrls.some((value) => new URL(value).protocol !== "https:")) return fail("Evidence links must use HTTPS.", 422);
    const db = await getDb();
    const instance = await db.collection("platformInstances").findOne(input.data.instanceId
      ? { _id: input.data.instanceId as never, domain }
      : { domain });
    if (!instance) return fail("That domain is not enrolled in this managed-instance programme.", 404);
    const reporterKey = reporterFingerprint(request);
    const recentCount = await db.collection("platformReports").countDocuments({ reporterKey, createdAt: { $gte: new Date(Date.now() - 60 * 60_000) } }, { limit: 6 });
    if (recentCount >= 5) return fail("Too many reports were sent from this connection. Try again later.", 429);
    const now = new Date();
    const reportId = crypto.randomUUID();
    const reportNo = publicReportNumber();
    const [emailLocal = "", emailDomain = ""] = input.data.reporterEmail.toLowerCase().split("@");
    const reporterEmailHint = emailDomain ? `${emailLocal.slice(0, 1)}…@${emailDomain}` : "";
    await db.collection("platformReports").insertOne({
      _id: reportId,
      reportNo,
      instanceId: String(instance._id),
      domain,
      category: input.data.category,
      summary: input.data.summary,
      details: input.data.details,
      orderReference: input.data.orderReference,
      evidenceUrls: input.data.evidenceUrls,
      ...(input.data.reporterEmail ? {
        encryptedReporterEmail: encryptMemberToken(input.data.reporterEmail.toLowerCase(), `platform-report:${reportId}:email:v1`),
        reporterEmailHint,
      } : {}),
      reporterKey,
      status: "OPEN",
      reviewNote: "",
      version: 1,
      privacyVersion: "2026-09-27",
      createdAt: now,
      updatedAt: now,
    } as never);
    return created({ reportNo, status: "OPEN", message: "The report was received for human review. It does not automatically suspend a business." });
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
    const input = reviewSchema.safeParse(await request.json());
    if (!input.success) return fail("Check the report decision.", 422, input.error.flatten().fieldErrors);
    const db = await getDb();
    const now = new Date();
    const result = await db.collection("platformReports").findOneAndUpdate(
      { _id: input.data.reportId as never, version: input.data.version },
      { $set: { status: input.data.status, reviewNote: input.data.note, reviewedAt: now, reviewedBy: auth.session.id, updatedAt: now }, $inc: { version: 1 } },
      { returnDocument: "after", projection: { reporterKey: 0, encryptedReporterEmail: 0 } },
    );
    if (!result) return fail("This report changed while you were reviewing it. Refresh and try again.", 409);
    await writeAudit(db, auth.session, "platform.report_reviewed", "platformReport", input.data.reportId, { status: input.data.status, note: input.data.note, reportNo: result.reportNo });
    return ok(result);
  } catch (error) {
    return publicError(error);
  }
}
