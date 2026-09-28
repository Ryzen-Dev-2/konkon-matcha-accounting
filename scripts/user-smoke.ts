import assert from "node:assert/strict";
import { createSessionToken, registerSessionToken, SESSION_COOKIE, sessionContextHash } from "../lib/auth";
import { getDb } from "../lib/db";
import type { UserRole } from "../lib/types";

async function main() {
const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";
const db = await getDb();
const user = await db.collection("users").findOne({ active: true, mustChangePassword: { $ne: true } }, { sort: { role: 1 } });
if (!user) throw new Error("No active workspace user is available for the user-flow smoke test.");

const userAgent = "konkon-user-smoke/1.0";
const sessionUser = {
  id: user._id.toHexString(),
  username: String(user.username),
  fullName: String(user.fullName),
  role: user.role as UserRole,
  sessionVersion: Number(user.sessionVersion || 0),
  mustChangePassword: false,
};
const token = await createSessionToken(sessionUser, { contextHash: sessionContextHash(userAgent) });
await registerSessionToken(db, sessionUser, token);
const cookie = `${SESSION_COOKIE}=${token}`;

async function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cookie", cookie);
  headers.set("accept", "application/json");
  headers.set("user-agent", userAgent);
  if (init.body) headers.set("content-type", "application/json");
  if (init.method && init.method !== "GET") {
    headers.set("origin", baseUrl);
    headers.set("host", new URL(baseUrl).host);
  }
  return fetch(`${baseUrl}${path}`, { ...init, headers, redirect: "manual" });
}

async function expectOk(path: string) {
  const response = await request(path);
  assert.equal(response.status, 200, `${path} returned ${response.status}`);
  const body = await response.json();
  assert.equal(body.ok, true, `${path} did not return an API success envelope`);
  return body.data;
}

const settings = await expectOk("/api/settings");
assert.match(settings.currency, /^[A-Z]{3}$/);
assert.ok(settings.timeZone);
await expectOk("/api/settings/history");
await expectOk("/api/locations");
await expectOk("/api/members?revision=1");
await expectOk("/api/exchange-rates");
const methods = await expectOk("/api/payment-methods");
const products = await expectOk("/api/products");
const templateData = await expectOk("/api/receipt-templates");
await expectOk("/api/scanner-sessions?purpose=POS");

const posPage = await request("/pos", { headers: { accept: "text/html" } });
assert.equal(posPage.status, 200, `POS page returned ${posPage.status}`);
assert.match(await posPage.text(), /Point of sale|COUNTER/);

const providerMethod = methods.find((method: { verificationMode?: string }) => method.verificationMode === "PROVIDER");
if (providerMethod && products[0] && templateData.templates[0]) {
  const blockedSale = await request("/api/sales", {
    method: "POST",
    body: JSON.stringify({
      clientRequestId: crypto.randomUUID(),
      memberId: null,
      paymentMethod: providerMethod.code,
      paymentReference: "UNVERIFIED-SHOULD-NOT-PASS",
      paymentIntentId: "",
      tenderCurrency: providerMethod.supportedCurrencies?.[0] || settings.currency,
      tenderedAmount: 0,
      templateId: templateData.templates[0]._id,
      items: [{ productId: products[0]._id, quantity: 1 }],
    }),
  });
  assert.equal(blockedSale.status, 422, "An unverified provider payment was not blocked before sale posting");
}

const unsignedConfirmation = await fetch(`${baseUrl}/api/payment-confirmations`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-payment-event-id": "unsigned-event-001", "x-payment-timestamp": String(Math.floor(Date.now() / 1000)) },
  body: JSON.stringify({ provider: "TNG", externalReference: "UNSIGNED-001", paymentMethodCode: "TNG", amount: 10, currency: "MYR", verificationCode: "UNSIGNED-CODE", paidAt: new Date().toISOString() }),
});
assert.equal(unsignedConfirmation.status, 401, "An unsigned payment confirmation was accepted");

console.log(JSON.stringify({
  passed: true,
  checks: 11,
  baseCurrency: settings.currency,
  timeZone: settings.timeZone,
  providerPaymentLockChecked: Boolean(providerMethod && products[0] && templateData.templates[0]),
}));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
