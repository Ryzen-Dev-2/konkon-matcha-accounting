import assert from "node:assert/strict";
import test from "node:test";
import {
  assessInstanceRisk,
  enrollmentSchema,
  isPlatformPolicyFresh,
  normaliseOrigin,
  platformRestrictionFromControl,
  PLATFORM_DISCLOSURE_VERSION,
  PLATFORM_TERMS_VERSION,
  signPlatformPolicy,
  verifyPlatformPolicy,
  type PlatformPolicy,
} from "../lib/platform-trust";

test("managed instance origins accept HTTPS roots and reject paths or credentials", () => {
  assert.equal(normaliseOrigin("https://Store.Example.com"), "https://store.example.com");
  assert.equal(normaliseOrigin("https://store.example.com/orders"), "");
  assert.equal(normaliseOrigin("https://user:secret@store.example.com"), "");
  assert.equal(normaliseOrigin("javascript:alert(1)"), "");
});

test("managed enrollment requires explicit current-version consent", () => {
  const base = {
    instanceId: crypto.randomUUID(), domain: "https://store.example.com", businessLabel: "Tea Store", provider: "VERCEL",
    releaseSha: "abc", appVersion: "1.0.0", termsAccepted: true, privacyAccepted: true,
    termsVersion: PLATFORM_TERMS_VERSION, disclosureVersion: PLATFORM_DISCLOSURE_VERSION,
    instanceSecret: "x".repeat(43),
  };
  assert.equal(enrollmentSchema.safeParse(base).success, true);
  assert.equal(enrollmentSchema.safeParse({ ...base, privacyAccepted: false }).success, false);
  assert.equal(enrollmentSchema.safeParse({ ...base, termsVersion: "old" }).success, false);
});

test("platform policies are signed per instance and reject tampering", () => {
  const policy: PlatformPolicy = {
    instanceId: crypto.randomUUID(), status: "ACTIVE", reason: "Approved", version: 4,
    issuedAt: new Date().toISOString(), nonce: crypto.randomUUID(), latestReleaseSha: "abc123", updateUrl: "https://example.com/update",
  };
  const secret = "s".repeat(43);
  const signature = signPlatformPolicy(policy, secret);
  assert.equal(verifyPlatformPolicy(policy, signature, secret), true);
  assert.equal(verifyPlatformPolicy({ ...policy, status: "SUSPENDED" }, signature, secret), false);
  assert.equal(verifyPlatformPolicy(policy, signature, "q".repeat(43)), false);
  assert.equal(isPlatformPolicyFresh(policy), true);
  assert.equal(isPlatformPolicyFresh({ ...policy, issuedAt: new Date(Date.now() - 16 * 60_000).toISOString() }), false);
  assert.equal(isPlatformPolicyFresh({ ...policy, issuedAt: new Date(Date.now() + 6 * 60_000).toISOString() }), false);
});

test("risk scoring highlights reports but never returns an enforcement decision", () => {
  const risk = assessInstanceRisk({ status: "ACTIVE", openReports: 4, distinctReporters: 3, releaseSha: "old", latestReleaseSha: "new", lastSeenAt: new Date() });
  assert.equal(risk.band, "HIGH");
  assert.ok(risk.signals.some(signal => signal.includes("open report")));
  assert.equal("action" in risk, false);
});

test("every non-active managed state keeps public and authenticated surfaces locked", () => {
  assert.equal(platformRestrictionFromControl({ platformStatus: "ACTIVE", platformReason: "" }), null);
  assert.deepEqual(platformRestrictionFromControl({ platformStatus: "SUSPENDED", platformReason: "Verified payment abuse." }), {
    status: "SUSPENDED", reason: "Verified payment abuse.", appealUrl: "https://konkon.valaxscrub.com/appeal", ownerAction: "APPEAL",
  });
  assert.equal(platformRestrictionFromControl({ platformStatus: "APPEAL", platformReason: "Original ban reason." })?.reason, "Original ban reason.");
  assert.equal(platformRestrictionFromControl({ platformStatus: "CONSENT_REQUIRED", platformReason: "" })?.ownerAction, "CONSENT");
  assert.equal(platformRestrictionFromControl({ platformStatus: "VERIFICATION_REQUIRED", platformReason: "" })?.ownerAction, "CONSENT");
  assert.equal(platformRestrictionFromControl({ platformStatus: "PENDING", platformReason: "" })?.ownerAction, "WAIT");
  assert.equal(platformRestrictionFromControl({ platformStatus: "REJECTED", platformReason: "" })?.ownerAction, "APPEAL");
});
