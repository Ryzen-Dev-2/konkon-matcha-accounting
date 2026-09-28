import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { ObjectId, type Db } from "mongodb";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { getDb } from "@/lib/db";
import type { SessionPayload, SessionUser, UserRole } from "@/lib/types";

const LEGACY_SESSION_COOKIE = "konkon_session";
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-konkon_session" : LEGACY_SESSION_COOKIE;
const SESSION_DURATION_SECONDS = 60 * 60 * 8;

type AuthSessionRecord = {
  _id: string;
  userId: string;
  sessionVersion: number;
  contextHash: string;
  createdAt: Date;
  expiresAt: Date;
};

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must contain at least 32 characters.");
  }
  return new TextEncoder().encode(secret);
}

export function isAuthConfigured() {
  return typeof process.env.AUTH_SECRET === "string" && process.env.AUTH_SECRET.length >= 32;
}

export function normalizeIdentity(value: string) {
  return value.trim().toLocaleLowerCase("en-SG");
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

function sessionPurposeKey(purpose: string) {
  return createHmac("sha256", secretKey()).update(`konkon-session:${purpose}:v2`).digest();
}

export function sessionContextHash(userAgent: string) {
  return createHmac("sha256", sessionPurposeKey("client-context"))
    .update(userAgent.trim().slice(0, 512))
    .digest("base64url");
}

export function sessionRecordId(sessionId: string) {
  return createHmac("sha256", sessionPurposeKey("registry-id"))
    .update(sessionId)
    .digest("base64url");
}

function valuesMatch(left: string, right: string) {
  const expected = Buffer.from(left);
  const actual = Buffer.from(right);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function requestContextHash() {
  try {
    const requestHeaders = await headers();
    return sessionContextHash(requestHeaders.get("user-agent") || "");
  } catch {
    return sessionContextHash("");
  }
}

export async function createSessionToken(
  user: SessionUser,
  options: { sessionId?: string; contextHash?: string } = {},
) {
  const sessionId = options.sessionId || randomUUID();
  const contextHash = options.contextHash || sessionContextHash("");
  return new SignJWT({
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    sessionVersion: Number(user.sessionVersion || 0),
    mustChangePassword: Boolean(user.mustChangePassword),
    contextHash,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT", kid: "session-v2" })
    .setSubject(user.id)
    .setJti(sessionId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(secretKey());
}

async function tokenPayload(token: string): Promise<SessionPayload | null> {
  try {
    const { payload, protectedHeader } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (protectedHeader.kid !== "session-v2" || !payload.sub || !payload.jti || !payload.username || !payload.fullName || !payload.role || !payload.contextHash) return null;
    return {
      id: payload.sub,
      sessionId: payload.jti,
      contextHash: String(payload.contextHash),
      username: String(payload.username),
      fullName: String(payload.fullName),
      role: String(payload.role) as UserRole,
      sessionVersion: Number(payload.sessionVersion || 0),
      mustChangePassword: Boolean(payload.mustChangePassword),
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

export async function registerSessionToken(db: Db, user: SessionUser, token: string) {
  const payload = await tokenPayload(token);
  if (!payload || payload.id !== user.id || !payload.exp) throw new Error("The session token could not be registered.");
  const now = new Date();
  const expiresAt = new Date(payload.exp * 1000);
  const sessions = db.collection<AuthSessionRecord>("authSessions");
  await sessions.deleteMany({
    userId: user.id,
    $or: [
      { expiresAt: { $lte: now } },
      { sessionVersion: { $ne: Number(user.sessionVersion || 0) } },
      { contextHash: payload.contextHash },
    ],
  });
  await sessions.insertOne({
    _id: sessionRecordId(payload.sessionId),
    userId: user.id,
    sessionVersion: Number(user.sessionVersion || 0),
    contextHash: payload.contextHash,
    createdAt: now,
    expiresAt,
  });
  return payload;
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge,
    priority: "high" as const,
  };
}

export async function setSession(user: SessionUser, database?: Db) {
  const contextHash = await requestContextHash();
  const token = await createSessionToken(user, { contextHash });
  await registerSessionToken(database || await getDb(), user, token);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions(SESSION_DURATION_SECONDS));
  if (SESSION_COOKIE !== LEGACY_SESSION_COOKIE) store.set(LEGACY_SESSION_COOKIE, "", cookieOptions(0));
}

export async function clearSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const payload = await tokenPayload(token);
    if (payload) {
      try { await (await getDb()).collection<AuthSessionRecord>("authSessions").deleteOne({ _id: sessionRecordId(payload.sessionId), userId: payload.id }); }
      catch { /* Clearing the browser credential must not depend on database availability. */ }
    }
  }
  store.set(SESSION_COOKIE, "", cookieOptions(0));
  if (SESSION_COOKIE !== LEGACY_SESSION_COOKIE) store.set(LEGACY_SESSION_COOKIE, "", cookieOptions(0));
}

async function readSessionInternal(): Promise<SessionPayload | null> {
  try {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const payload = await tokenPayload(token);
    if (!payload || !payload.exp || !valuesMatch(payload.contextHash, await requestContextHash())) return null;
    const now = new Date();
    const db = await getDb();
    const [registered, user] = await Promise.all([
      db.collection<AuthSessionRecord>("authSessions").findOne({
        _id: sessionRecordId(payload.sessionId),
        userId: payload.id,
        sessionVersion: Number(payload.sessionVersion || 0),
        contextHash: payload.contextHash,
        expiresAt: { $gt: now },
      }, { projection: { _id: 1 } }),
      db.collection("users").findOne({ _id: new ObjectId(payload.id), active: true }, { projection: { username: 1, fullName: 1, role: 1, sessionVersion: 1, mustChangePassword: 1 } }),
    ]);
    if (!registered || !user || Number(user.sessionVersion || 0) !== Number(payload.sessionVersion || 0)) return null;
    payload.username = String(user.username);
    payload.fullName = String(user.fullName);
    payload.role = user.role as UserRole;
    payload.mustChangePassword = Boolean(user.mustChangePassword);
    return payload;
  } catch {
    return null;
  }
}

export const readSession = cache(readSessionInternal);
