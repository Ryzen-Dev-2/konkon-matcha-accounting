import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  normaliseLocalBridgePath,
  parseLocalPaymentNotification,
  verifySmsForwarderWebhook,
  type SanitizedLocalPaymentEvent,
} from "../lib/local-payment-bridge";
import { adbDiscoveryLabel, discoverAdbCommand } from "../lib/adb-discovery";

function loadLocalEnvironment(directory = process.cwd()) {
  for (const filename of [".env.local", ".env"]) {
    const path = resolve(directory, filename);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      else value = value.replace(/\s+#.*$/, "");
      process.env[match[1]] = value;
    }
  }
}

loadLocalEnvironment();

const host = "127.0.0.1";
const port = Number(process.env.LOCAL_PAYMENT_BRIDGE_PORT || 17321);
if (!Number.isInteger(port) || port < 1024 || port > 65_535) throw new Error("LOCAL_PAYMENT_BRIDGE_PORT must be between 1024 and 65535.");

const allowedOrigins = new Set((process.env.LOCAL_PAYMENT_BRIDGE_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000,https://konkon.valaxscrub.com")
  .split(",").map((value) => value.trim()).filter(Boolean));
const allowedSenders = (process.env.LOCAL_PAYMENT_ALLOWED_SENDERS || "").split(",").map((value) => value.trim()).filter(Boolean);
const pairCode = process.env.LOCAL_PAYMENT_PAIR_CODE?.trim() || String(randomInt(100_000, 1_000_000));
const webhookSecret = process.env.LOCAL_PAYMENT_WEBHOOK_SECRET?.trim() || randomBytes(24).toString("base64url");
if (webhookSecret.length < 16) throw new Error("LOCAL_PAYMENT_WEBHOOK_SECRET must contain at least 16 characters.");
const notifyMeBearer = process.env.LOCAL_PAYMENT_NOTIFY_ME_TOKEN?.trim() || webhookSecret;
const adbSerial = process.env.LOCAL_PAYMENT_ADB_SERIAL?.trim() || "";

type BridgeEvent = SanitizedLocalPaymentEvent & { sequence: number };
const events: BridgeEvent[] = [];
const browserTokens = new Set<string>();
const pairAttempts: number[] = [];
let nextSequence = 1;

function json(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

function originAllowed(request: IncomingMessage) {
  const origin = String(request.headers.origin || "");
  return Boolean(origin && allowedOrigins.has(origin));
}

function setPrivateNetworkCors(request: IncomingMessage, response: ServerResponse) {
  const origin = String(request.headers.origin || "");
  if (origin && allowedOrigins.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    response.setHeader("Access-Control-Allow-Private-Network", "true");
    response.setHeader("Vary", "Origin");
  }
}

async function readBody(request: IncomingMessage, maximumBytes = 10_000) {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += value.length;
    if (bytes > maximumBytes) throw new Error("PAYLOAD_TOO_LARGE");
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseWebhookBody(rawBody: string, contentType: string) {
  if (contentType.includes("application/json")) {
    const value = JSON.parse(rawBody) as Record<string, unknown>;
    return {
      sender: String(value.from || value.sender || ""),
      content: String(value.content || value.msg || ""),
      timestamp: String(value.timestamp || ""),
      sign: String(value.sign || ""),
      receivedAt: String(value.receive_time || value.receivedAt || ""),
    };
  }
  const value = new URLSearchParams(rawBody);
  return {
    sender: value.get("from") || value.get("sender") || "",
    content: value.get("content") || value.get("msg") || "",
    timestamp: value.get("timestamp") || "",
    sign: value.get("sign") || "",
    receivedAt: value.get("receive_time") || value.get("receivedAt") || "",
  };
}

function bearerToken(request: IncomingMessage) {
  const match = String(request.headers.authorization || "").match(/^Bearer\s+([A-Za-z0-9_-]{32,128})$/);
  return match?.[1] || "";
}

function secretEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function enqueueSanitisedPayment(value: { sender: string; content: string; timestamp: string | number; receivedAt?: string }) {
  const parsed = parseLocalPaymentNotification(value, { secret: webhookSecret, allowedSenders });
  if (!parsed.accepted) return parsed;
  const duplicate = events.find((event) => event.eventId === parsed.event.eventId || Boolean(
    parsed.event.externalReference
    && event.externalReference === parsed.event.externalReference
    && event.senderFingerprint === parsed.event.senderFingerprint
    && event.provider === parsed.event.provider
    && event.currency === parsed.event.currency
    && event.amount === parsed.event.amount
    && Math.abs(event.paidAt.getTime() - parsed.event.paidAt.getTime()) <= 60_000,
  ));
  if (duplicate) return { accepted: true as const, event: duplicate };
  const event = { ...parsed.event, sequence: nextSequence++ };
  events.push(event);
  if (events.length > 100) events.splice(0, events.length - 100);
  process.stdout.write(`[payment-listener] Accepted ${event.provider} ${event.currency} ${event.amount.toFixed(2)} as event ${event.sequence}. Raw message discarded.\n`);
  return { accepted: true as const, event };
}

function setupUsbReverse() {
  if (process.env.LOCAL_PAYMENT_SKIP_ADB === "1") return { ready: false, code: "SKIPPED", detail: "ADB setup skipped by configuration." };
  const adb = discoverAdbCommand({ scriptPath: process.argv[1] });
  const args = [...(adbSerial ? ["-s", adbSerial] : []), "reverse", `tcp:${port}`, `tcp:${port}`];
  const result = spawnSync(adb.command, args, { encoding: "utf8", windowsHide: true, timeout: 2_000 });
  if ((result.error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
    return { ready: false, code: "ADB_MISSING", detail: "ADB was not found in Android Studio, PATH, Downloads/platform-tools, the listener folder or the current workspace. Install or extract Android SDK Platform-Tools; this listener will detect it automatically." };
  }
  if (result.error) {
    return { ready: false, code: "ADB_FAILED", detail: `ADB could not start: ${result.error.message}` };
  }
  if (result.status !== 0) {
    const message = `${result.stderr || result.stdout || ""}`.trim().toLocaleLowerCase("en-US");
    if (message.includes("unauthorized")) {
      return { ready: false, code: "DEVICE_UNAUTHORIZED", detail: "The Android device has not authorised USB debugging. Unlock it and accept the RSA prompt." };
    }
    if (message.includes("no devices") || message.includes("device not found")) {
      return { ready: false, code: "NO_DEVICE", detail: "No Android debugging device was found. Enable USB debugging and use a data-capable USB cable." };
    }
    if (message.includes("more than one device")) {
      return { ready: false, code: "MULTIPLE_DEVICES", detail: "More than one Android device is connected. Set LOCAL_PAYMENT_ADB_SERIAL to the intended device serial." };
    }
    return { ready: false, code: "ADB_FAILED", detail: "ADB reverse failed. Confirm USB debugging, device authorisation and the selected device serial." };
  }
  return { ready: true, code: "READY", detail: `USB reverse active on tcp:${port} using ${adbDiscoveryLabel(adb.source)}.` };
}

let usb = setupUsbReverse();
let usbCheckedAt = Date.now();

function currentUsbStatus() {
  if (Date.now() - usbCheckedAt >= 5_000) {
    usb = setupUsbReverse();
    usbCheckedAt = Date.now();
  }
  return usb;
}

const server = createServer(async (request, response) => {
  setPrivateNetworkCors(request, response);
  const url = new URL(request.url || "/", `http://${host}:${port}`);
  const pathname = normaliseLocalBridgePath(url.pathname);

  if (request.method === "OPTIONS") {
    if (!originAllowed(request)) return json(response, 403, { ok: false, error: "This browser origin is not allowed." });
    response.statusCode = 204;
    return response.end();
  }

  if (request.method === "GET" && pathname === "/health") {
    const currentUsb = currentUsbStatus();
    return json(response, 200, {
      ok: true,
      data: {
        service: "Kōn-Kōn private payment listener",
        usbReady: currentUsb.ready,
        usbCode: currentUsb.code,
        usbDetail: currentUsb.detail,
        privacy: "Raw messages, OTPs and private content never leave this process.",
      },
    });
  }

  if (request.method === "POST" && pathname === "/sms") {
    try {
      const rawBody = await readBody(request);
      const value = parseWebhookBody(rawBody, String(request.headers["content-type"] || ""));
      if (!verifySmsForwarderWebhook(value.timestamp, value.sign, webhookSecret)) {
        return json(response, 401, { ok: false, error: "The webhook signature is invalid or expired." });
      }
      const parsed = enqueueSanitisedPayment(value);
      if (!parsed.accepted) {
        return json(response, 200, { ok: true, data: { accepted: false, reason: parsed.reason } });
      }
      return json(response, 200, { ok: true, data: { accepted: true, eventId: parsed.event.eventId } });
    } catch (error) {
      return json(response, error instanceof Error && error.message === "PAYLOAD_TOO_LARGE" ? 413 : 400, { ok: false, error: "The local payment notification could not be processed." });
    }
  }

  if (request.method === "POST" && pathname === "/notify-me") {
    try {
      const supplied = bearerToken(request);
      if (!supplied || !secretEqual(supplied, notifyMeBearer)) return json(response, 401, { ok: false, error: "The notify-me bearer token is invalid." });
      const value = JSON.parse(await readBody(request)) as Record<string, unknown>;
      const type = String(value.type || "").toLocaleUpperCase("en-US");
      if (!type.includes("SMS")) return json(response, 200, { ok: true, data: { accepted: false, reason: "NOT_PAYMENT" } });
      const rawTimestamp = value.timestamp;
      const timestamp = Number.isFinite(Number(rawTimestamp)) ? Number(rawTimestamp) : Date.parse(String(rawTimestamp || ""));
      const parsed = enqueueSanitisedPayment({
        sender: String(value.sender || ""),
        content: String(value.message || ""),
        timestamp,
        receivedAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "",
      });
      if (!parsed.accepted) return json(response, 200, { ok: true, data: { accepted: false, reason: parsed.reason } });
      return json(response, 200, { ok: true, data: { accepted: true, eventId: parsed.event.eventId } });
    } catch (error) {
      return json(response, error instanceof Error && error.message === "PAYLOAD_TOO_LARGE" ? 413 : 400, { ok: false, error: "The notify-me payment notification could not be processed." });
    }
  }

  if (request.method === "POST" && pathname === "/pair") {
    if (!originAllowed(request)) return json(response, 403, { ok: false, error: "This browser origin is not allowed." });
    const now = Date.now();
    while (pairAttempts.length && pairAttempts[0] < now - 60_000) pairAttempts.shift();
    if (pairAttempts.length >= 5) return json(response, 429, { ok: false, error: "Too many pairing attempts. Wait one minute." });
    try {
      const value = JSON.parse(await readBody(request, 1_000)) as { code?: unknown };
      if (String(value.code || "") !== pairCode) {
        pairAttempts.push(now);
        return json(response, 401, { ok: false, error: "The pairing code is incorrect." });
      }
      const token = randomBytes(32).toString("base64url");
      browserTokens.clear();
      browserTokens.add(token);
      const currentUsb = currentUsbStatus();
      return json(response, 200, { ok: true, data: { token, cursor: nextSequence - 1, usbReady: currentUsb.ready, usbCode: currentUsb.code, usbDetail: currentUsb.detail } });
    } catch {
      return json(response, 400, { ok: false, error: "The pairing request is invalid." });
    }
  }

  if (request.method === "GET" && pathname === "/events") {
    if (!originAllowed(request)) return json(response, 403, { ok: false, error: "This browser origin is not allowed." });
    const token = bearerToken(request);
    if (!token || !browserTokens.has(token)) return json(response, 401, { ok: false, error: "Pair this browser again." });
    const after = Math.max(0, Number(url.searchParams.get("after") || 0));
    const currentUsb = currentUsbStatus();
    return json(response, 200, { ok: true, data: { events: events.filter((event) => event.sequence > after).slice(0, 25), cursor: nextSequence - 1, usbReady: currentUsb.ready, usbCode: currentUsb.code, usbDetail: currentUsb.detail } });
  }

  return json(response, 404, { ok: false, error: "This local bridge endpoint does not exist." });
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    process.stderr.write([
      "",
      `Kōn-Kōn could not start because http://${host}:${port} is already in use.`,
      "A payment listener may already be running. Close its terminal before starting another copy.",
      `To keep both listeners, set LOCAL_PAYMENT_BRIDGE_PORT to another port and use that same URL in Payments (for example ${port + 1}).`,
      "No new pairing code was created.",
      "",
    ].join("\n"));
    process.exitCode = 1;
    return;
  }
  process.stderr.write(`Kōn-Kōn listener failed to start: ${error.message}\n`);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  process.stdout.write([
    "",
    "Kōn-Kōn private payment listener",
    `Listening only on http://${host}:${port}`,
    usb.detail,
    `Browser pairing code: ${pairCode}`,
    `Webhook secret: ${webhookSecret}`,
    `SmsForwarder URL after USB reverse: http://127.0.0.1:${port}/sms`,
    "SmsForwarder form: from=[from]&content=[content]&timestamp=[timestamp]&sign=[sign]&receive_time=[receive_time]",
    `notify-me URL after USB reverse: http://127.0.0.1:${port}/notify-me`,
    `notify-me Authorization header: Bearer ${notifyMeBearer}`,
    "notify-me body: {\"type\":\"<TYPE>\",\"sender\":\"<SENDER>\",\"message\":\"<MESSAGE>\",\"timestamp\":\"<TIMESTAMP>\"}",
    "Privacy rule: raw message bodies and authentication codes are never stored or exposed to the browser.",
    "",
  ].join("\n"));
});
