import { z } from "zod";
import { authorize, fail, ok, publicError, sameOrigin } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { normaliseBusinessSettings } from "@/lib/business-settings";
import { getDb } from "@/lib/db";
import { serialise } from "@/lib/format";
import { decryptMemberToken, encryptMemberToken } from "@/lib/member-cards";
import { localPlatformSecretContext, readPlatformEnvelope, syncManagedPolicy } from "@/lib/platform-enrollment";
import {
  appealSchema,
  isPlatformAuthority,
  latestRelease,
  newInstanceSecret,
  PLATFORM_DISCLOSURE_VERSION,
  PLATFORM_TERMS_VERSION,
  platformAuthorityUrl,
  requestOrigin,
} from "@/lib/platform-trust";

export const runtime = "nodejs";
export const maxDuration = 30;

const safeEnrollmentProjection = { encryptedSecret: 0, verifiedPolicy: 0, policySignature: 0 } as const;

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ENROLL"), termsAccepted: z.literal(true), privacyAccepted: z.literal(true) }).strict(),
  z.object({ action: z.literal("CONSENT"), termsAccepted: z.literal(true), privacyAccepted: z.literal(true) }).strict(),
  z.object({ action: z.literal("SYNC") }).strict(),
  z.object({ action: z.literal("APPEAL"), message: z.string().trim().min(30).max(2000) }).strict(),
]);

export async function GET(request: Request) {
  const auth = await authorize("owner.control", { allowReadOnlyWrite: true, allowPlatformRestricted: true });
  if (auth.error) return auth.error;
  try {
    const db = await getDb();
    if (isPlatformAuthority(request)) return ok({ authority: true, release: latestRelease() });
    let enrollment = await db.collection("platformEnrollments").findOne({ _id: "workspace" as never }, { projection: safeEnrollmentProjection });
    let syncError = "";
    if (enrollment && !enrollment.serviceDeletedAt) {
      try {
        await syncManagedPolicy(db, { ...enrollment, encryptedSecret: (await db.collection("platformEnrollments").findOne({ _id: "workspace" as never }, { projection: { encryptedSecret: 1 } }))?.encryptedSecret });
        enrollment = await db.collection("platformEnrollments").findOne({ _id: "workspace" as never }, { projection: safeEnrollmentProjection });
      } catch (error) {
        syncError = error instanceof Error ? error.message : "Could not refresh the signed platform policy.";
        enrollment = await db.collection("platformEnrollments").findOne({ _id: "workspace" as never }, { projection: safeEnrollmentProjection });
      }
    }
    return ok(serialise({
      authority: false,
      enrollment,
      syncError,
      localRelease: latestRelease(),
      authorityUrl: platformAuthorityUrl(),
      termsVersion: PLATFORM_TERMS_VERSION,
      disclosureVersion: PLATFORM_DISCLOSURE_VERSION,
      disclosure: [
        "Deployment origin and business display name",
        "Hosting provider, application version and release identifier",
        "Observed server connection IP, which may be a shared proxy or hosting egress address",
        "Policy check-in time, review status and appeal messages",
      ],
      neverCollected: ["Customer or member records", "Orders, receipts or invoices", "Accounting, payroll or inventory data", "Staff passwords or session cookies"],
    }));
  } catch (error) {
    return publicError(error);
  }
}

export async function POST(request: Request) {
  const auth = await authorize("owner.control", { allowReadOnlyWrite: true, allowPlatformRestricted: true });
  if (auth.error) return auth.error;
  if (!sameOrigin(request)) return fail("This request was blocked.", 403);
  if (isPlatformAuthority(request)) return fail("The platform authority cannot enroll itself as a managed clone.", 409);
  try {
    const input = actionSchema.safeParse(await request.json());
    if (!input.success) return fail("Check the managed-instance request.", 422, input.error.flatten().fieldErrors);
    const db = await getDb();
    const existing = await db.collection("platformEnrollments").findOne({ _id: "workspace" as never });

    if (input.data.action === "ENROLL") {
      if (existing) return fail("This workspace has already applied for managed-instance status.", 409);
      const domain = requestOrigin(request);
      if (!domain || (!domain.startsWith("https://") && process.env.NODE_ENV === "production")) return fail("Managed enrollment requires a public HTTPS deployment domain.", 422);
      const settings = normaliseBusinessSettings(await db.collection("settings").findOne({ key: "business" }));
      const instanceId = crypto.randomUUID();
      const secret = newInstanceSecret();
      const authorityUrl = platformAuthorityUrl();
      const release = latestRelease();
      const provider = process.env.VERCEL ? "VERCEL" : "OTHER";
      const response = await fetch(`${authorityUrl}/api/platform/instances`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          instanceId,
          domain,
          businessLabel: settings.businessName,
          provider,
          releaseSha: release.sha,
          appVersion: release.appVersion,
          termsAccepted: true,
          privacyAccepted: true,
          termsVersion: PLATFORM_TERMS_VERSION,
          disclosureVersion: PLATFORM_DISCLOSURE_VERSION,
          instanceSecret: secret,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const authority = await readPlatformEnvelope(response) as { status?: string; version?: number };
      const now = new Date();
      const enrollment = {
        _id: "workspace",
        instanceId,
        authorityUrl,
        domain,
        provider,
        releaseSha: release.sha,
        appVersion: release.appVersion,
        encryptedSecret: encryptMemberToken(secret, localPlatformSecretContext(instanceId)),
        termsVersion: PLATFORM_TERMS_VERSION,
        disclosureVersion: PLATFORM_DISCLOSURE_VERSION,
        termsAcceptedAt: now,
        termsAcceptedBy: auth.session.id,
        status: authority.status || "PENDING",
        statusReason: "Awaiting platform Owner review.",
        policyVersion: authority.version || 1,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      await db.collection("platformEnrollments").insertOne(enrollment as never);
      try { await syncManagedPolicy(db, enrollment); }
      catch { /* The signed status check retries while the deployment stays locked. */ }
      await writeAudit(db, auth.session, "platform.enrollment_submitted", "workspace", "default", { instanceId, domain, authorityUrl, termsVersion: PLATFORM_TERMS_VERSION, disclosureVersion: PLATFORM_DISCLOSURE_VERSION });
      return ok({ status: "PENDING", message: "Mandatory managed-service consent was recorded. This deployment stays locked until platform Owner approval." });
    }

    if (!existing) return fail("This workspace is not enrolled in managed-instance supervision.", 404);
    const instanceId = String(existing.instanceId);
    const secret = decryptMemberToken(String(existing.encryptedSecret), localPlatformSecretContext(instanceId));
    if (input.data.action === "CONSENT") {
      if (existing.serviceDeletedAt) {
        const domain = requestOrigin(request);
        if (!domain || (!domain.startsWith("https://") && process.env.NODE_ENV === "production")) return fail("Managed enrollment requires a public HTTPS deployment domain.", 422);
        const settings = normaliseBusinessSettings(await db.collection("settings").findOne({ key: "business" }));
        const release = latestRelease();
        const provider = process.env.VERCEL ? "VERCEL" : "OTHER";
        const authorityUrl = platformAuthorityUrl();
        const response = await fetch(`${authorityUrl}/api/platform/instances`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            instanceId,
            domain,
            businessLabel: settings.businessName,
            provider,
            releaseSha: release.sha,
            appVersion: release.appVersion,
            termsAccepted: true,
            privacyAccepted: true,
            termsVersion: PLATFORM_TERMS_VERSION,
            disclosureVersion: PLATFORM_DISCLOSURE_VERSION,
            instanceSecret: secret,
          }),
          signal: AbortSignal.timeout(15_000),
        });
        const authority = await readPlatformEnvelope(response) as { status?: string; version?: number };
        const now = new Date();
        await db.collection("platformEnrollments").updateOne(
          { _id: "workspace" as never, instanceId },
          {
            $set: {
              authorityUrl, domain, provider, releaseSha: release.sha, appVersion: release.appVersion,
              termsVersion: PLATFORM_TERMS_VERSION, disclosureVersion: PLATFORM_DISCLOSURE_VERSION,
              termsAcceptedAt: now, termsAcceptedBy: auth.session.id, consentRequired: false,
              status: authority.status || "PENDING", statusReason: "Awaiting renewed platform Owner review.",
              policyVersion: authority.version || 1, updatedAt: now,
            },
            $unset: { serviceDeletedAt: "", verifiedPolicy: "", policySignature: "", lastSyncAt: "" },
            $inc: { version: 1 },
          },
        );
        await writeAudit(db, auth.session, "platform.enrollment_resubmitted", "workspace", "default", { instanceId, domain, authorityUrl, termsVersion: PLATFORM_TERMS_VERSION, disclosureVersion: PLATFORM_DISCLOSURE_VERSION });
        const refreshed = await db.collection("platformEnrollments").findOne({ _id: "workspace" as never });
        const policy = refreshed ? await syncManagedPolicy(db, refreshed) : null;
        return ok({ status: policy?.status || "PENDING", message: "Fresh Owner consent was submitted. This deployment remains locked until the platform Owner approves the renewed application." });
      }
      const response = await fetch(`${platformAuthorityUrl()}/api/platform/policy`, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          action: "CONSENT",
          instanceId,
          termsAccepted: true,
          privacyAccepted: true,
          termsVersion: PLATFORM_TERMS_VERSION,
          disclosureVersion: PLATFORM_DISCLOSURE_VERSION,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      await readPlatformEnvelope(response);
      const now = new Date();
      await db.collection("platformEnrollments").updateOne(
        { _id: "workspace" as never, instanceId },
        { $set: { termsVersion: PLATFORM_TERMS_VERSION, disclosureVersion: PLATFORM_DISCLOSURE_VERSION, termsAcceptedAt: now, termsAcceptedBy: auth.session.id, updatedAt: now }, $inc: { version: 1 } },
      );
      await writeAudit(db, auth.session, "platform.consent_renewed", "workspace", "default", { instanceId, termsVersion: PLATFORM_TERMS_VERSION, disclosureVersion: PLATFORM_DISCLOSURE_VERSION });
      const refreshed = await db.collection("platformEnrollments").findOne({ _id: "workspace" as never });
      const policy = refreshed ? await syncManagedPolicy(db, refreshed) : null;
      return ok({ status: policy?.status || "PENDING", message: "Current mandatory managed-service terms were accepted. Signed status verification has been refreshed." });
    }
    if (input.data.action === "APPEAL") {
      const appeal = appealSchema.parse({ instanceId, message: input.data.message });
      const response = await fetch(`${platformAuthorityUrl()}/api/platform/policy`, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action: "APPEAL", ...appeal }),
        signal: AbortSignal.timeout(15_000),
      });
      const result = await readPlatformEnvelope(response);
      await writeAudit(db, auth.session, "platform.appeal_submitted", "workspace", "default", { instanceId });
      await syncManagedPolicy(db, existing);
      return ok(result);
    }
    const policy = await syncManagedPolicy(db, existing);
    return ok({ status: policy.status, reason: policy.reason, version: policy.version });
  } catch (error) {
    return publicError(error);
  }
}
