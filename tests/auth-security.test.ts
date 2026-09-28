import assert from "node:assert/strict";
import test from "node:test";
import { decodeJwt, decodeProtectedHeader } from "jose";
import { createSessionToken, sessionContextHash, sessionRecordId } from "../lib/auth";
import { sameOrigin } from "../lib/api";
import { OFFICIAL_APPEAL_URL, OFFICIAL_PLATFORM_ORIGIN, OFFICIAL_REPORT_URL } from "../lib/platform-public";

const TEST_SECRET = "test-only-auth-secret-with-at-least-32-characters";

test("session tokens carry a versioned id and a purpose-separated client context", async () => {
  const previousSecret = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = TEST_SECRET;
  try {
    const contextHash = sessionContextHash("Konkon Security Test/1.0");
    const token = await createSessionToken({
      id: "507f1f77bcf86cd799439011",
      username: "owner",
      fullName: "Workspace Owner",
      role: "OWNER",
      sessionVersion: 3,
    }, { sessionId: "test-session-id", contextHash });
    const header = decodeProtectedHeader(token);
    const payload = decodeJwt(token);
    assert.equal(header.kid, "session-v2");
    assert.equal(payload.jti, "test-session-id");
    assert.equal(payload.contextHash, contextHash);
    assert.notEqual(sessionRecordId("test-session-id"), "test-session-id");
    assert.notEqual(sessionContextHash("Another Browser/1.0"), contextHash);
  } finally {
    if (previousSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previousSecret;
  }
});

test("same-origin protection rejects protocol downgrade and foreign origins", () => {
  const secure = new Request("https://ledger.example/api/profile", {
    headers: { host: "ledger.example", origin: "https://ledger.example", "x-forwarded-proto": "https" },
  });
  const downgrade = new Request("https://ledger.example/api/profile", {
    headers: { host: "ledger.example", origin: "http://ledger.example", "x-forwarded-proto": "https" },
  });
  const foreign = new Request("https://ledger.example/api/profile", {
    headers: { host: "ledger.example", origin: "https://attacker.example", "x-forwarded-proto": "https" },
  });
  assert.equal(sameOrigin(secure), true);
  assert.equal(sameOrigin(downgrade), false);
  assert.equal(sameOrigin(foreign), false);
});

test("complaints and appeals are anchored to the fixed official platform", () => {
  assert.equal(OFFICIAL_PLATFORM_ORIGIN, "https://konkon.valaxscrub.com");
  assert.equal(OFFICIAL_APPEAL_URL, "https://konkon.valaxscrub.com/appeal");
  assert.equal(OFFICIAL_REPORT_URL, "https://konkon.valaxscrub.com/report");
});
