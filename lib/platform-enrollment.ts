import type { Db } from "mongodb";
import { decryptMemberToken } from "@/lib/member-cards";
import { verifyPlatformPolicy, type PlatformPolicy } from "@/lib/platform-trust";

export function localPlatformSecretContext(instanceId: string) {
  return `platform-enrollment:${instanceId}:secret:v1`;
}

export async function readPlatformEnvelope(response: Response) {
  const body = await response.json().catch(() => null) as { ok?: boolean; data?: unknown; error?: string } | null;
  if (!response.ok || body?.ok !== true) throw new Error(body?.error || `Platform authority returned ${response.status}.`);
  return body.data;
}

export async function syncManagedPolicy(db: Db, enrollment: Record<string, unknown>) {
  const instanceId = String(enrollment.instanceId || "");
  const secret = decryptMemberToken(String(enrollment.encryptedSecret || ""), localPlatformSecretContext(instanceId));
  const response = await fetch(`${String(enrollment.authorityUrl)}/api/platform/policy?instanceId=${encodeURIComponent(instanceId)}`, {
    headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const payload = await readPlatformEnvelope(response) as { policy?: PlatformPolicy; signature?: string };
  if (!payload?.policy || !payload.signature || payload.policy.instanceId !== instanceId || !verifyPlatformPolicy(payload.policy, payload.signature, secret)) {
    throw new Error("The platform authority returned an invalid signed policy.");
  }
  const issuedAt = new Date(payload.policy.issuedAt);
  if (!Number.isFinite(issuedAt.getTime()) || Math.abs(Date.now() - issuedAt.getTime()) > 5 * 60_000) throw new Error("The signed policy is stale.");
  const now = new Date();
  await Promise.all([
    db.collection("platformEnrollments").updateOne(
      { _id: "workspace" as never, instanceId },
      { $set: { status: payload.policy.status, statusReason: payload.policy.reason, policyVersion: payload.policy.version, latestReleaseSha: payload.policy.latestReleaseSha, updateUrl: payload.policy.updateUrl, lastSyncAt: now, updatedAt: now }, $inc: { version: 1 } },
    ),
    db.collection("systemControls").updateOne(
      { _id: "workspace" as never },
      { $set: { platformStatus: payload.policy.status, platformReason: payload.policy.reason, platformPolicyVersion: payload.policy.version, platformCheckedAt: now }, $setOnInsert: { mode: "OPEN", reason: "", reopenAt: null, scannerGeneration: 1, createdAt: now } },
      { upsert: true },
    ),
  ]);
  return payload.policy;
}
