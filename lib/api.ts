import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { readSession } from "@/lib/auth";
import { hasPermission, type Permission } from "@/lib/rbac";
import { getDb } from "@/lib/db";
import type { UserRole } from "@/lib/types";
import { isWritePermission } from "@/lib/system-control";
import { getEffectiveSystemControl, getPlatformRestriction } from "@/lib/platform-restriction";

export function ok<T>(data: T, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "private, no-store, max-age=0");
  return NextResponse.json({ ok: true, data }, { status: 200, ...init, headers });
}

export function created<T>(data: T) {
  return NextResponse.json({ ok: true, data }, { status: 201, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}

export function fail(error: string, status = 400, issues?: Record<string, string[]>) {
  return NextResponse.json({ ok: false, error, ...(issues ? { issues } : {}) }, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}

export async function authorize(permission: Permission, options: { allowReadOnlyWrite?: boolean; allowPlatformRestricted?: boolean } = {}) {
  const session = await readSession();
  if (!session) return { error: fail("Your session has expired. Sign in again.", 401) } as const;
  if (!ObjectId.isValid(session.id)) return { error: fail("Your session is invalid. Sign in again.", 401) } as const;
  try {
    const db = await getDb();
    const [user, system] = await Promise.all([
      db.collection("users").findOne(
        { _id: new ObjectId(session.id), active: true },
        { projection: { role: 1, username: 1, fullName: 1, sessionVersion: 1, mustChangePassword: 1 } },
      ),
      getEffectiveSystemControl(db),
    ]);
    if (!user) return { error: fail("This account is no longer active.", 401) } as const;
    if (Number(session.sessionVersion || 0) !== Number(user.sessionVersion || 0)) {
      return { error: fail("Your access changed. Sign in again to continue.", 401) } as const;
    }
    session.role = user.role as UserRole;
    session.username = String(user.username);
    session.fullName = String(user.fullName);
    session.mustChangePassword = Boolean(user.mustChangePassword);
    if (session.mustChangePassword) {
      return { error: fail("Change your temporary password before using the workspace.", 428) } as const;
    }
    if (["SUSPENDED", "APPEAL"].includes(system.platformStatus) && !options.allowPlatformRestricted) {
      return { error: fail(`${system.platformReason || "This managed workspace is restricted while a platform review is in progress."} Owner appeal: /appeal`, 423) } as const;
    }
    if (system.mode === "CLOSED" && !["settings.read", "settings.write", "team.read", "team.write", "owner.control"].includes(permission)) {
      return { error: fail(system.reason || "This workspace is temporarily closed by the Owner.", 423) } as const;
    }
    if (system.mode === "READ_ONLY" && isWritePermission(permission) && !options.allowReadOnlyWrite) {
      return { error: fail(system.reason || "This workspace is temporarily read-only.", 423) } as const;
    }
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error(error);
    return { error: fail("The account service is temporarily unavailable.", 503) } as const;
  }
  if (!hasPermission(session.role, permission)) {
    return { error: fail("You do not have permission to perform this action.", 403) } as const;
  }
  return { session } as const;
}

export async function blockRestrictedPlatform() {
  const restriction = await getPlatformRestriction();
  return restriction ? fail(`${restriction.reason} Owner appeal: ${restriction.appealPath}`, 423) : null;
}

export function publicError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const name = error instanceof Error ? error.name : "";
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const safeMessage = message.replace(/mongodb(?:\+srv)?:\/\/[^@\s]+@/gi, "mongodb://***@").slice(0, 500);
  console.error("[request-error]", { name, code, message: safeMessage });
  if (message === "MONGODB_URI is not configured.") {
    return fail("The database is not configured on this deployment.", 503);
  }
  if (message === "MONGODB_COLLECTION_PREFIX is invalid.") {
    return fail("The database collection namespace is not configured correctly.", 503);
  }
  if (name === "MongoParseError") {
    return fail("The database connection string is invalid.", 503);
  }
  if (code === "18" || /authentication failed|bad auth/i.test(message)) {
    return fail("The database rejected its credentials.", 503);
  }
  if (code === "323") {
    return fail("The database rejected a command that is outside its Stable API compatibility settings.", 503);
  }
  if (name === "MongoServerSelectionError" || name === "MongoNetworkError") {
    return fail("The database cluster could not be reached. Check the MongoDB Atlas IP access list.", 503);
  }
  if (process.env.NODE_ENV !== "production") console.error(error);
  return fail("The request could not be completed. Please try again.", 500);
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!origin || !host) return process.env.NODE_ENV !== "production";
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
