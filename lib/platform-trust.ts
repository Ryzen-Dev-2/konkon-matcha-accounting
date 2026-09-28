import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { OFFICIAL_APPEAL_URL, OFFICIAL_PLATFORM_ORIGIN } from "@/lib/platform-public";

export const PLATFORM_TERMS_VERSION = "2026-09-28";
export const PLATFORM_DISCLOSURE_VERSION = "2026-09-27";
export const PLATFORM_POLICY_LEASE_MS = 15 * 60_000;
export const DEFAULT_PLATFORM_AUTHORITY = OFFICIAL_PLATFORM_ORIGIN;

export const PLATFORM_STATUSES = ["PENDING", "ACTIVE", "SUSPENDED", "APPEAL", "REJECTED"] as const;
export type PlatformStatus = (typeof PLATFORM_STATUSES)[number];

export type PlatformRestriction = {
  status: "CONSENT_REQUIRED" | "VERIFICATION_REQUIRED" | "PENDING" | "SUSPENDED" | "APPEAL" | "REJECTED";
  reason: string;
  appealUrl: typeof OFFICIAL_APPEAL_URL;
  ownerAction: "CONSENT" | "WAIT" | "APPEAL";
};

export function platformRestrictionFromControl(control: { platformStatus: string; platformReason: string }): PlatformRestriction | null {
  const status = control.platformStatus as PlatformRestriction["status"];
  if (!["CONSENT_REQUIRED", "VERIFICATION_REQUIRED", "PENDING", "SUSPENDED", "APPEAL", "REJECTED"].includes(status)) return null;
  const defaults: Record<PlatformRestriction["status"], string> = {
    CONSENT_REQUIRED: "The Owner must accept current managed-service terms before this deployment can operate.",
    VERIFICATION_REQUIRED: "This deployment has not received a valid signed operating policy from the platform authority.",
    PENDING: "This deployment is awaiting platform review and cannot operate yet.",
    SUSPENDED: "This managed deployment is locked while a platform review is in progress.",
    APPEAL: "This managed deployment remains locked while its appeal is reviewed.",
    REJECTED: "This deployment was not approved for managed operation.",
  };
  return {
    status,
    reason: control.platformReason || defaults[status],
    appealUrl: OFFICIAL_APPEAL_URL,
    ownerAction: ["SUSPENDED", "APPEAL", "REJECTED"].includes(status) ? "APPEAL" : status === "PENDING" ? "WAIT" : "CONSENT",
  };
}

export const REPORT_CATEGORIES = ["FRAUD", "IMPERSONATION", "NON_DELIVERY", "PAYMENT_ABUSE", "CONTROLLED_GOODS", "OTHER"] as const;

export const enrollmentSchema = z.object({
  instanceId: z.string().uuid(),
  domain: z.string().trim().min(4).max(240),
  businessLabel: z.string().trim().min(2).max(120),
  provider: z.enum(["VERCEL", "OTHER"]),
  releaseSha: z.string().trim().max(80).default("unknown"),
  appVersion: z.string().trim().max(40).default("unknown"),
  termsAccepted: z.literal(true),
  privacyAccepted: z.literal(true),
  termsVersion: z.literal(PLATFORM_TERMS_VERSION),
  disclosureVersion: z.literal(PLATFORM_DISCLOSURE_VERSION),
  instanceSecret: z.string().min(43).max(180),
}).strict();

export const platformActionSchema = z.object({
  instanceId: z.string().uuid(),
  action: z.enum(["APPROVE", "SUSPEND", "REOPEN", "REJECT", "REVOKE_CONSENT"]),
  reason: z.string().trim().max(500).default(""),
  version: z.coerce.number().int().positive(),
}).superRefine((value, context) => {
  if (["SUSPEND", "REJECT", "REVOKE_CONSENT"].includes(value.action) && value.reason.length < 10) {
    context.addIssue({ code: "custom", path: ["reason"], message: "Give a clear reason of at least 10 characters." });
  }
});

export const platformServiceDeleteSchema = z.object({
  instanceId: z.string().uuid(),
  reason: z.string().trim().min(10).max(500),
  confirmation: z.string().trim().min(4).max(240),
  version: z.coerce.number().int().positive(),
}).strict();

export const publicReportSchema = z.object({
  instanceId: z.string().uuid().optional(),
  domain: z.string().trim().min(4).max(240),
  category: z.enum(REPORT_CATEGORIES),
  summary: z.string().trim().min(10).max(180),
  details: z.string().trim().min(30).max(4000),
  orderReference: z.string().trim().max(100).default(""),
  reporterEmail: z.union([z.literal(""), z.string().trim().email().max(254)]).default(""),
  evidenceUrls: z.array(z.string().trim().url().max(1000)).max(3).default([]),
  privacyAccepted: z.literal(true),
}).strict();

export const appealSchema = z.object({
  instanceId: z.string().uuid(),
  message: z.string().trim().min(30).max(2000),
}).strict();

export const platformConsentSchema = z.object({
  instanceId: z.string().uuid(),
  termsAccepted: z.literal(true),
  privacyAccepted: z.literal(true),
  termsVersion: z.literal(PLATFORM_TERMS_VERSION),
  disclosureVersion: z.literal(PLATFORM_DISCLOSURE_VERSION),
}).strict();

export function platformAuthorityUrl() {
  if (process.env.NODE_ENV === "production") return DEFAULT_PLATFORM_AUTHORITY;
  return normaliseOrigin(process.env.PLATFORM_AUTHORITY_URL || DEFAULT_PLATFORM_AUTHORITY, true) || DEFAULT_PLATFORM_AUTHORITY;
}

export function normaliseOrigin(value: string, allowLocal = process.env.NODE_ENV !== "production") {
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(allowLocal && local && url.protocol === "http:")) return "";
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return "";
    return url.origin.toLowerCase();
  } catch {
    return "";
  }
}

export function requestOrigin(request: Request) {
  const proto = (request.headers.get("x-forwarded-proto") || new URL(request.url).protocol.replace(":", "") || "https").split(",")[0].trim();
  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host).split(",")[0].trim();
  return normaliseOrigin(`${proto}://${host}`, true);
}

export function isPlatformAuthority(request: Request) {
  if (process.env.NODE_ENV !== "production" && process.env.PLATFORM_AUTHORITY_MODE === "1") return true;
  return requestOrigin(request) === platformAuthorityUrl();
}

export function observedNetworkAddress(request: Request) {
  const value = request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "";
  const candidate = value.split(",")[0]?.trim() || "unavailable";
  return candidate.replace(/[^a-fA-F0-9:.]/g, "").slice(0, 80) || "unavailable";
}

function signingKey(purpose: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("Platform trust signing is not configured.");
  return createHmac("sha256", secret).update(`konkon-platform-trust:${purpose}:v1`).digest();
}

export function reporterFingerprint(request: Request) {
  const address = observedNetworkAddress(request);
  return createHmac("sha256", signingKey("reporter")).update(address).digest("hex");
}

export function newInstanceSecret() {
  return randomBytes(32).toString("base64url");
}

export function platformInstanceSecretFingerprint(instanceId: string, instanceSecret: string) {
  return createHmac("sha256", instanceSecret)
    .update(`konkon-deleted-instance:${instanceId}:v1`)
    .digest("hex");
}

export type PlatformPolicy = {
  instanceId: string;
  status: PlatformStatus;
  consentRequired: boolean;
  reason: string;
  version: number;
  issuedAt: string;
  nonce: string;
  latestReleaseSha: string;
  updateUrl: string;
};

export const platformPolicySchema = z.object({
  instanceId: z.string().uuid(),
  status: z.enum(PLATFORM_STATUSES),
  consentRequired: z.boolean(),
  reason: z.string().max(500),
  version: z.number().int().positive(),
  issuedAt: z.string().datetime({ offset: true }),
  nonce: z.string().uuid(),
  latestReleaseSha: z.string().max(80),
  updateUrl: z.string().url().max(1000),
}).strict();

function policyPayload(policy: PlatformPolicy) {
  return [policy.instanceId, policy.status, policy.consentRequired ? "1" : "0", policy.reason, policy.version, policy.issuedAt, policy.nonce, policy.latestReleaseSha, policy.updateUrl].join("\n");
}

function legacyPolicyPayload(policy: PlatformPolicy) {
  return [policy.instanceId, policy.status, policy.reason, policy.version, policy.issuedAt, policy.nonce, policy.latestReleaseSha, policy.updateUrl].join("\n");
}

export function signPlatformPolicy(policy: PlatformPolicy, instanceSecret: string) {
  return createHmac("sha256", instanceSecret).update(policyPayload(policy)).digest("base64url");
}

export function signLegacyPlatformPolicy(policy: PlatformPolicy, instanceSecret: string) {
  return createHmac("sha256", instanceSecret).update(legacyPolicyPayload(policy)).digest("base64url");
}

export function verifyPlatformPolicy(policy: PlatformPolicy, signature: string, instanceSecret: string) {
  if (!platformPolicySchema.safeParse(policy).success) return false;
  const expected = Buffer.from(signPlatformPolicy(policy, instanceSecret));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function isPlatformPolicyFresh(policy: PlatformPolicy, now = Date.now()) {
  const issuedAt = Date.parse(policy.issuedAt);
  return Number.isFinite(issuedAt) && issuedAt <= now + 5 * 60_000 && now - issuedAt <= PLATFORM_POLICY_LEASE_MS;
}

export function secretsMatch(left: string, right: string) {
  const expected = Buffer.from(left);
  const actual = Buffer.from(right);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function latestRelease() {
  return {
    sha: String(process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_RELEASE_SHA || "unknown").slice(0, 80),
    appVersion: process.env.npm_package_version || "1.0.0",
    updateUrl: process.env.PLATFORM_UPDATE_URL || "https://github.com/Ryzen-hub-dev/konkon-matcha-accounting/commits/main",
  };
}

export function assessInstanceRisk(input: { status: PlatformStatus; openReports: number; substantiatedReports?: number; distinctReporters: number; releaseSha: string; latestReleaseSha: string; lastSeenAt?: Date | null }) {
  let score = Math.min(55, input.openReports * 12) + Math.min(25, input.distinctReporters * 5) + Math.min(60, (input.substantiatedReports || 0) * 30);
  const signals: string[] = [];
  if (input.openReports) signals.push(`${input.openReports} open report${input.openReports === 1 ? "" : "s"}`);
  if (input.substantiatedReports) signals.push(`${input.substantiatedReports} substantiated report${input.substantiatedReports === 1 ? "" : "s"}`);
  if (input.distinctReporters > 1) signals.push(`${input.distinctReporters} distinct reporter signals`);
  if (input.latestReleaseSha !== "unknown" && input.releaseSha !== "unknown" && input.releaseSha !== input.latestReleaseSha) {
    score += 8;
    signals.push("release differs from the authority build");
  }
  if (input.lastSeenAt && Date.now() - input.lastSeenAt.getTime() > 7 * 86_400_000) {
    score += 8;
    signals.push("instance has not checked in for seven days");
  }
  score = Math.min(100, score);
  return { score, band: score >= 70 ? "HIGH" : score >= 35 ? "REVIEW" : "LOW", signals };
}

export function publicReportNumber() {
  return `TS-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().replaceAll("-", "").slice(0, 7).toUpperCase()}`;
}
