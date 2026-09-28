import { ObjectId } from "mongodb";
import { createHash } from "node:crypto";
import { z } from "zod";
import { fail, ok, publicError, sameOrigin } from "@/lib/api";
import { isAuthConfigured, normalizeIdentity, setSession, verifyPassword } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import type { UserRole } from "@/lib/types";
import { repeatedLoginFailureReview, writeOperationalReview } from "@/lib/operational-reviews";

export const runtime = "nodejs";

const loginSchema = z.object({
  identity: z.string().trim().min(3).max(160),
  password: z.string().min(1).max(128),
});

const DUMMY_HASH = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxoG2o4lspx2UuoR64mo9EsBgma";
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;

function throttleKey(request: Request, identity: string) {
  const ip = (request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  return createHash("sha256").update(`${ip}|${identity}`).digest("hex");
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("This request was blocked.", 403);
  try {
    if (!isAuthConfigured()) {
      return fail("Authentication is not configured on this deployment.", 503);
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return fail("The request body must be valid JSON.", 400);
    }
    const input = loginSchema.safeParse(body);
    if (!input.success) return fail("Enter your username or email and password.", 422);
    const db = await getDb();
    const identity = normalizeIdentity(input.data.identity);
    const key = throttleKey(request, identity);
    const throttle = await db.collection("authThrottle").findOne({ key });
    const now = new Date();
    if (throttle?.blockedUntil instanceof Date && throttle.blockedUntil > now) {
      return fail("Too many sign-in attempts. Wait 15 minutes and try again.", 429);
    }
    const user = await db.collection("users").findOne({
      $or: [{ usernameNormalized: identity }, { emailNormalized: identity }],
    });
    const valid = await verifyPassword(input.data.password, String(user?.passwordHash || DUMMY_HASH));
    if (!user || !valid || user.active !== true) {
      const windowStartedAt = throttle?.windowStartedAt instanceof Date ? throttle.windowStartedAt : now;
      const inWindow = now.getTime() - windowStartedAt.getTime() <= ATTEMPT_WINDOW_MS;
      const count = inWindow ? Number(throttle?.count || 0) + 1 : 1;
      await db.collection("authThrottle").updateOne(
        { key },
        { $set: {
          count,
          windowStartedAt: inWindow ? windowStartedAt : now,
          blockedUntil: count >= 5 ? new Date(now.getTime() + BLOCK_MS) : null,
          expiresAt: new Date(now.getTime() + ATTEMPT_WINDOW_MS + BLOCK_MS),
        } },
        { upsert: true },
      );
      if (count === 5) {
        const incidentId = createHash("sha256").update(`${key}|${windowStartedAt.toISOString()}`).digest("hex");
        try {
          await writeOperationalReview(db, repeatedLoginFailureReview(count), {
            sourceType: "authentication",
            sourceId: incidentId,
            sourceNo: `AUTH-${incidentId.slice(0, 8).toUpperCase()}`,
            occurredAt: now,
          });
        } catch (reviewError) {
          console.error("[security-review-error]", reviewError instanceof Error ? reviewError.name : "unknown");
        }
      }
      return fail("The username or password is incorrect.", 401);
    }

    const id = (user._id as ObjectId).toHexString();
    const sessionUser = {
      id,
      username: String(user.username),
      fullName: String(user.fullName),
      role: user.role as UserRole,
      sessionVersion: Number(user.sessionVersion || 0),
      mustChangePassword: Boolean(user.mustChangePassword),
    };
    await setSession(sessionUser, db);
    await db.collection("authThrottle").deleteOne({ key });
    await db.collection("users").updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
    await writeAudit(db, sessionUser, "auth.login", "user", id);
    return ok({ user: sessionUser, redirectTo: user.mustChangePassword ? "/change-password" : "/dashboard" });
  } catch (error) {
    return publicError(error);
  }
}
