import { ObjectId } from "mongodb";
import { z } from "zod";
import { created, fail, ok, publicError, sameOrigin } from "@/lib/api";
import { hashPassword, isAuthConfigured, normalizeIdentity, setSession } from "@/lib/auth";
import { getDb, getMongoClient } from "@/lib/db";
import { seedWorkspace } from "@/lib/seed";
import { regionalSettingsSchema } from "@/lib/regional-settings";
import { PLATFORM_DISCLOSURE_VERSION, PLATFORM_TERMS_VERSION } from "@/lib/platform-trust";

export const runtime = "nodejs";

const setupSchema = regionalSettingsSchema.extend({
  businessName: z.string().trim().min(2).max(100),
  fullName: z.string().trim().min(2).max(100),
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9._-]+$/),
  email: z.string().trim().email().max(160),
  password: z.string().min(12).max(128)
    .regex(/[a-z]/, "Include a lowercase letter")
    .regex(/[A-Z]/, "Include an uppercase letter")
    .regex(/[0-9]/, "Include a number"),
  seedProducts: z.boolean().default(false),
  platformTermsAccepted: z.literal(true, { error: "Accept the platform terms to create this workspace." }),
  platformPrivacyAccepted: z.literal(true, { error: "Acknowledge the privacy and managed-instance disclosure." }),
}).refine(value => value.acceptedCurrencies.includes(value.currency), { path: ["acceptedCurrencies"], message: "Include the base accounting currency." });

export async function GET() {
  if (!isAuthConfigured()) {
    return fail("Authentication is not configured on this deployment.", 503);
  }
  try {
    const db = await getDb();
    const configured = Boolean(await db.collection("users").countDocuments({}, { limit: 1 }));
    return ok({ configured, registrationOpen: !configured });
  } catch (error) {
    return publicError(error);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("This request was blocked.", 403);
  let lockCreated = false;
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
    const input = setupSchema.safeParse(body);
    if (!input.success) return fail("Check the highlighted setup details.", 422, input.error.flatten().fieldErrors);
    const db = await getDb();
    if (await db.collection("users").countDocuments({}, { limit: 1 })) {
      return fail("This workspace has already been set up.", 409);
    }

    try {
      await db.collection("systemLocks").insertOne({ _id: "owner-setup" as never, createdAt: new Date() });
      lockCreated = true;
    } catch {
      return fail("Workspace setup is already in progress.", 409);
    }

    const now = new Date();
    const _id = new ObjectId();
    const user = {
      _id,
      username: input.data.username.trim(),
      usernameNormalized: normalizeIdentity(input.data.username),
      email: input.data.email.trim(),
      emailNormalized: normalizeIdentity(input.data.email),
      fullName: input.data.fullName.trim(),
      passwordHash: await hashPassword(input.data.password),
      role: "OWNER" as const,
      active: true,
      sessionVersion: 1,
      mustChangePassword: false,
      createdAt: now,
      updatedAt: now,
    };
    const client = await getMongoClient();
    const mongoSession = client.startSession();
    try {
      await mongoSession.withTransaction(async () => {
        await db.collection("users").insertOne(user, { session: mongoSession });
        await seedWorkspace(db, _id, input.data.businessName, input.data.seedProducts, mongoSession, input.data);
        await db.collection("platformAgreements").insertOne({
          _id: "workspace",
          termsVersion: PLATFORM_TERMS_VERSION,
          disclosureVersion: PLATFORM_DISCLOSURE_VERSION,
          acceptedBy: _id,
          acceptedAt: now,
        } as never, { session: mongoSession });
        await db.collection("auditLogs").insertOne({
          actorId: _id,
          actorName: user.fullName,
          actorRole: user.role,
          action: "workspace.setup",
          entityType: "workspace",
          entityId: "default",
          details: { businessName: input.data.businessName, countryCode: input.data.countryCode, currency: input.data.currency, timeZone: input.data.timeZone, seededStarterProducts: input.data.seedProducts, termsVersion: PLATFORM_TERMS_VERSION, disclosureVersion: PLATFORM_DISCLOSURE_VERSION },
          createdAt: now,
        }, { session: mongoSession });
      });
    } finally { await mongoSession.endSession(); }
    await setSession({ id: _id.toHexString(), username: user.username, fullName: user.fullName, role: user.role, sessionVersion: user.sessionVersion, mustChangePassword: false });
    return created({ redirectTo: "/dashboard" });
  } catch (error) {
    if (lockCreated) {
      try {
        const db = await getDb();
        if (!(await db.collection("users").countDocuments({}, { limit: 1 }))) {
          await db.collection("systemLocks").deleteOne({ _id: "owner-setup" as never });
        }
      } catch { /* preserve the original error */ }
    }
    return publicError(error);
  }
}
