import type { Db } from "mongodb";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { syncManagedPolicy, verifiedEnrollmentPolicy } from "@/lib/platform-enrollment";
import { isPlatformPolicyFresh, platformAuthorityUrl, platformRestrictionFromControl, PLATFORM_DISCLOSURE_VERSION, PLATFORM_TERMS_VERSION } from "@/lib/platform-trust";
import { getSystemControl } from "@/lib/system-control";

const CACHE_MS = 10_000;
const POLICY_REFRESH_MS = 60_000;
let nextRefreshCheckAt = 0;
let refreshInFlight: Promise<void> | null = null;

async function refreshPolicyIfDue(db: Db, enrollment: Record<string, unknown>) {
  const lastSync = enrollment.lastSyncAt instanceof Date ? enrollment.lastSyncAt.getTime() : 0;
  if (verifiedEnrollmentPolicy(enrollment) && Date.now() - lastSync <= POLICY_REFRESH_MS) return;
  try {
    await syncManagedPolicy(db, enrollment);
  } catch {
    // Keep enforcing the last verified signed policy when the authority is unreachable.
  }
}

async function currentRequestIsAuthority() {
  if (process.env.NODE_ENV !== "production" && process.env.PLATFORM_AUTHORITY_MODE === "1") return true;
  try {
    const requestHeaders = await headers();
    const host = (requestHeaders.get("host") || "").split(",")[0].trim();
    const protocol = (requestHeaders.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https")).split(",")[0].trim();
    return new URL(`${protocol}://${host}`).origin.toLowerCase() === platformAuthorityUrl();
  } catch {
    return false;
  }
}

export async function getEffectiveSystemControl(database?: Db) {
  const db = database || await getDb();
  let enrollment = await db.collection("platformEnrollments").findOne({ _id: "workspace" as never });
  if (enrollment && (Date.now() >= nextRefreshCheckAt || !verifiedEnrollmentPolicy(enrollment))) {
    refreshInFlight ||= refreshPolicyIfDue(db, enrollment).finally(() => { refreshInFlight = null; });
    await refreshInFlight;
    nextRefreshCheckAt = Date.now() + CACHE_MS;
    enrollment = await db.collection("platformEnrollments").findOne({ _id: "workspace" as never });
  }
  const control = await getSystemControl(db);
  if (await currentRequestIsAuthority()) return { ...control, platformStatus: "ACTIVE", platformReason: "Platform authority deployment." };
  if (!enrollment) return { ...control, platformStatus: "CONSENT_REQUIRED", platformReason: "The Owner must accept mandatory managed-service terms before this deployment can operate." };

  const policy = verifiedEnrollmentPolicy(enrollment);
  if (policy && ["SUSPENDED", "APPEAL", "REJECTED"].includes(policy.status)) {
    return { ...control, platformStatus: policy.status, platformReason: policy.reason, platformPolicyVersion: policy.version, platformCheckedAt: new Date(policy.issuedAt) };
  }
  if (String(enrollment.termsVersion || "") !== PLATFORM_TERMS_VERSION || String(enrollment.disclosureVersion || "") !== PLATFORM_DISCLOSURE_VERSION) {
    return { ...control, platformStatus: "CONSENT_REQUIRED", platformReason: "The Owner must accept the current managed-service terms before this deployment can operate." };
  }
  if (!policy) return { ...control, platformStatus: "VERIFICATION_REQUIRED", platformReason: "A valid signed operating policy has not been received from the platform authority." };
  if (policy.status === "ACTIVE" && !isPlatformPolicyFresh(policy)) {
    return { ...control, platformStatus: "VERIFICATION_REQUIRED", platformReason: "The signed operating lease expired before the platform authority could be reached. Access is locked until verification succeeds." };
  }
  return { ...control, platformStatus: policy.status, platformReason: policy.reason, platformPolicyVersion: policy.version, platformCheckedAt: new Date(policy.issuedAt) };
}

export async function getPlatformRestriction(database?: Db) {
  return platformRestrictionFromControl(await getEffectiveSystemControl(database));
}
