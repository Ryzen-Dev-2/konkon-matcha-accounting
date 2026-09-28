import type { Db } from "mongodb";
import { decryptMemberToken } from "@/lib/member-cards";
import { platformAuthorityUrl, platformPolicySchema, verifyPlatformPolicy, type PlatformPolicy } from "@/lib/platform-trust";

export function localPlatformSecretContext(instanceId: string) {
  return `platform-enrollment:${instanceId}:secret:v1`;
}

export async function readPlatformEnvelope(response: Response) {
  const body = await response.json().catch(() => null) as { ok?: boolean; data?: unknown; error?: string } | null;
  if (!response.ok || body?.ok !== true) throw new Error(body?.error || `Platform authority returned ${response.status}.`);
  return body.data;
}

export function verifiedEnrollmentPolicy(enrollment: Record<string, unknown>): PlatformPolicy | null {
  try {
    const instanceId = String(enrollment.instanceId || "");
    const policy = enrollment.verifiedPolicy as PlatformPolicy | undefined;
    const signature = String(enrollment.policySignature || "");
    if (!instanceId || !policy || policy.instanceId !== instanceId || !signature) return null;
    const secret = decryptMemberToken(String(enrollment.encryptedSecret || ""), localPlatformSecretContext(instanceId));
    return verifyPlatformPolicy(policy, signature, secret) ? policy : null;
  } catch {
    return null;
  }
}

export async function syncManagedPolicy(db: Db, enrollment: Record<string, unknown>) {
  const instanceId = String(enrollment.instanceId || "");
  const secret = decryptMemberToken(String(enrollment.encryptedSecret || ""), localPlatformSecretContext(instanceId));
  const authorityUrl = platformAuthorityUrl();
  const response = await fetch(`${authorityUrl}/api/platform/policy?instanceId=${encodeURIComponent(instanceId)}`, {
    headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const payload = await readPlatformEnvelope(response) as { policy?: unknown; signature?: unknown };
  const policy = platformPolicySchema.safeParse(payload?.policy);
  const signature = typeof payload?.signature === "string" ? payload.signature : "";
  if (!policy.success || !signature || policy.data.instanceId !== instanceId || !verifyPlatformPolicy(policy.data, signature, secret)) {
    throw new Error("The platform authority returned an invalid signed policy.");
  }
  const issuedAt = new Date(policy.data.issuedAt);
  if (!Number.isFinite(issuedAt.getTime()) || Math.abs(Date.now() - issuedAt.getTime()) > 5 * 60_000) throw new Error("The signed policy is stale.");
  const now = new Date();
  await Promise.all([
    db.collection("platformEnrollments").updateOne(
      { _id: "workspace" as never, instanceId },
      { $set: { authorityUrl, status: policy.data.status, statusReason: policy.data.reason, policyVersion: policy.data.version, verifiedPolicy: policy.data, policySignature: signature, latestReleaseSha: policy.data.latestReleaseSha, updateUrl: policy.data.updateUrl, lastSyncAt: now, updatedAt: now }, $inc: { version: 1 } },
    ),
    db.collection("systemControls").updateOne(
      { _id: "workspace" as never },
      { $set: { platformStatus: policy.data.status, platformReason: policy.data.reason, platformPolicyVersion: policy.data.version, platformCheckedAt: now }, $setOnInsert: { mode: "OPEN", reason: "", reopenAt: null, scannerGeneration: 1, createdAt: now } },
      { upsert: true },
    ),
  ]);
  return policy.data;
}
